/**
 * Modelin İÇ KİMLİĞİ ile SUNUCUNUN SERVİS ETTİĞİ ADI ayırır.
 *
 * NEDEN GEREKLİ: `gemma-4-31b` bizim için yalnız tel üstündeki bir ad değil,
 * aynı zamanda KALICI bir kimlik — `localStorage`'daki seçili model ve
 * Dexie'de her mesajın `modelId` alanı bu değeri tutuyor. vLLM tarafındaki
 * `--served-model-name` ise bizden bağımsız değişiyor: 2026-09-01'de aynı
 * süreç `gemma4-31b` (tiresiz) ve `baska-model` adlarıyla servis edilmeye
 * başlandı, uygulamanın gönderdiği `gemma-4-31b` ise artık tanınmadığı için
 * her sohbet isteği 404 döndü.
 *
 * İç kimliği değiştirmek geçmiş sohbetlerin model etiketini bozardı; o yüzden
 * yalnız tel adını çözüyoruz. Çözüm REAKTİF: mutlu yolda hiçbir ek istek yok,
 * yalnız 404 geldiğinde `/v1/models` sorulup ad öğreniliyor ve saklanıyor.
 * Ad ileride eski hâline dönerse mekanizma kendini aynı yoldan onarır.
 */
import { resolveChatApiUrl } from './modelConfig';
import { iptaliKontrolEt, istekOmru } from './harness/iptal';

const ONBELLEK_ONEKI = 't3ai.sunucu-model-adi.';

/** Sekme ömrü boyunca geçerli kopya; localStorage kapalıysa tek dayanak. */
const bellek = new Map<string, string>();

/** Aynı model için paralel iki çözümleme isteği atılmasın. */
const ucustakiler = new Map<string, Promise<string | null>>();

function depodanOku(modelId: string): string | null {
  try {
    return localStorage.getItem(ONBELLEK_ONEKI + modelId);
  } catch {
    return null; // localStorage kapalı (gizli sekme / katı çerez ayarı)
  }
}

function depoyaYaz(modelId: string, ad: string): void {
  try {
    localStorage.setItem(ONBELLEK_ONEKI + modelId, ad);
  } catch {
    // Yazılamadıysa bellek kopyası bu sekme için yeterli
  }
}

/**
 * Karşılaştırma için adı sadeleştirir: `gemma-4-31b` ile `gemma4-31b` aynı
 * dizgeye iner.
 *
 * `toLocaleLowerCase('tr')` BİLEREK kullanılmadı. Model adları ASCII
 * tanımlayıcı; Türkçe kuralında büyük "I" → "ı" olur ve alttaki süzgeç onu
 * atarak içinde "AI" geçen her adı bozardı. Yerel duyarlı küçültme kullanıcı
 * METNİ içindir, kimlik için değil.
 */
function sadelestir(ad: string): string {
  return ad.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * `/v1/models` yanıtından kullanılacak adı seçer. Saf fonksiyon — test edilir.
 *
 * Sıra: tam eşleşme → sadeleştirilmiş eşleşme → listedeki ilk taban model.
 * Üçüncü basamak güvenli, çünkü TEK bir vLLM portu aynı modelin takma adlarını
 * listeler; hangisini seçersek seçelim istek aynı ağırlıklara gider. Yalnız
 * LoRA adaptörleri farklı davranır, onlar `parent` alanıyla ayırt edilip
 * eleniyor.
 */
export function modelAdiSec(veri: unknown, istenenId: string): string | null {
  const liste = (veri as { data?: unknown } | null)?.data;
  if (!Array.isArray(liste)) return null;

  const adaylar = liste
    .filter(
      (k): k is { id: string; parent?: unknown } =>
        !!k && typeof (k as { id?: unknown }).id === 'string' && (k as { id: string }).id.trim() !== '',
    )
    .map((k) => ({ id: k.id, adaptor: k.parent != null }));
  if (adaylar.length === 0) return null;

  const tam = adaylar.find((a) => a.id === istenenId);
  if (tam) return tam.id;

  const hedef = sadelestir(istenenId);
  const yakin = adaylar.find((a) => sadelestir(a.id) === hedef);
  if (yakin) return yakin.id;

  const taban = adaylar.filter((a) => !a.adaptor);
  return (taban[0] ?? adaylar[0]).id;
}

/**
 * O anda kullanılacak ad: çözülmüş bir ad varsa o, yoksa yapılandırmadaki id.
 *
 * Eşzamanlı (senkron) — istek kurulumunu beklemeye sokmuyor.
 */
export function sunucuModelAdi(modelId: string): string {
  const bellekte = bellek.get(modelId);
  if (bellekte) return bellekte;
  const saklanan = depodanOku(modelId);
  if (saklanan) {
    bellek.set(modelId, saklanan);
    return saklanan;
  }
  return modelId;
}

/**
 * Modelin liste ucu. Yalnız `/v1/chat/completions` ile biten adreslerde var:
 * edge fonksiyonları ve backend'e düşen `/api/chat` yolunun böyle bir ucu yok,
 * onlarda keşif denenmiyor.
 */
function modelListesiUrl(modelId: string): string | null {
  const sohbetUrl = resolveChatApiUrl(modelId);
  if (!sohbetUrl.endsWith('/v1/chat/completions')) return null;
  return sohbetUrl.replace(/\/v1\/chat\/completions$/, '/v1/models');
}

/**
 * Sunucuya sorup gerçek adı öğrenir ve saklar. YENİ bir ad bulunduysa onu,
 * bulunamadıysa (ya da zaten kullandığımız ad çıktıysa) `null` döner.
 *
 * `/v1/models` oturum başlığından muaf — `sessionHeader.ts` bunu açıkça
 * belirtiyor — bu yüzden başlıksız sorgulanıyor.
 */
export async function modelAdiniCoz(modelId: string, signal?: AbortSignal): Promise<string | null> {
  iptaliKontrolEt(signal);
  const ucustaki = ucustakiler.get(modelId);
  // Bir sohbetin iptali başka bir sohbetin keşfini iptal etmesin.
  if (!signal && ucustaki) return ucustaki;

  const is = (async (): Promise<string | null> => {
    const url = modelListesiUrl(modelId);
    if (!url) return null;
    let veri: unknown;
    const omur = istekOmru(signal, 10000);
    try {
      const yanit = await fetch(url, { headers: { Accept: 'application/json' }, signal: omur.signal });
      if (!yanit.ok) return null;
      veri = await yanit.json();
      iptaliKontrolEt(omur.signal);
    } catch {
      iptaliKontrolEt(signal);
      return null; // ağ hatası: kurtarma yolunun kendisi turu düşürmesin
    } finally {
      omur.temizle();
    }
    const secilen = modelAdiSec(veri, modelId);
    if (!secilen || secilen === sunucuModelAdi(modelId)) return null;
    bellek.set(modelId, secilen);
    depoyaYaz(modelId, secilen);
    return secilen;
  })();

  if (!signal) ucustakiler.set(modelId, is);
  try {
    return await is;
  } finally {
    if (ucustakiler.get(modelId) === is) ucustakiler.delete(modelId);
  }
}

/** Saklanan adı siler. Testler ve elle sıfırlama için. */
export function modelAdiniUnut(modelId?: string): void {
  if (modelId) {
    bellek.delete(modelId);
    try {
      localStorage.removeItem(ONBELLEK_ONEKI + modelId);
    } catch {
      // silinemedi — bellek kopyası zaten gitti
    }
    return;
  }
  bellek.clear();
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(ONBELLEK_ONEKI))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // localStorage yok
  }
}
