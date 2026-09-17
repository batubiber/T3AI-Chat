/**
 * Kullanım satırını merkezî loga yazdırır.
 *
 * nginx `/kullanim-kayit` ucunda bu başlıkları tek satır olarak yazıp 204
 * dönüyor; upstream yok, kod yok.
 *
 * `sendBeacon` KULLANILMADI: özel başlık gönderemiyor. `keepalive: true` aynı
 * güvenceyi veriyor.
 *
 * SADECE İKİ BAŞLIK gider. Mesaj içeriği, kullanıcı kimliği ve oturum anahtarı
 * bu uca ASLA çıkmaz — testteki gizlilik bekçisi bunu koruyor.
 */
import { KAYIT_YOLU } from './kullanimLog';

/**
 * Bu dağıtımın adı. Aynı kod tabanı birden çok kurulumda çalışıyor; her biri
 * kendini ayrı etiketleyebilsin diye env'den geliyor.
 */
export const UYGULAMA_ADI: string = import.meta.env.VITE_UYGULAMA_ADI || 't3ai';

/** Boru işareti log satırını bölerdi. */
function temizle(s: string): string {
  return s.replace(/[|\r\n]/g, '_');
}

export function kullanimBildir(model: string): void {
  try {
    void fetch(KAYIT_YOLU, {
      method: 'POST',
      keepalive: true,
      headers: {
        'X-Uygulama': temizle(UYGULAMA_ADI),
        'X-Model': temizle(model),
      },
    }).catch(() => {
      // YENİDEN DENENMİYOR: kayıp bir satır raporda küçük bir eksiklik;
      // kuyruk tutup tekrar denemek kazandırdığından fazla karmaşıklık
    });
  } catch {
    // fetch hiç yoksa sohbet akışı etkilenmesin
  }
}

/**
 * Harness olayları — kurtarma yollarının canlıda çalışıp çalışmadığını görmek.
 *
 * Üç kurtarma yolu gönderdik (kesilme tespiti, taşma telafisi, yedek model) ve
 * hiçbirinin gerçekte tetiklenip tetiklenmediğine dair görüşümüz yoktu.
 * "Dive into Claude Code" (arXiv 2604.14228, §13.1) bunu gözlemlenebilirlik
 * boşluğu diye adlandırıyor: telemetri değerli çünkü tekrar kullanılabilir bir
 * teste ya da somut bir değişiklik talebine dönüşüyor.
 *
 * NGINX BİÇİMİNE DOKUNULMADI. Log biçimi üç alanlı (`zaman|uygulama|model`) ve
 * dördüncü alan eklemek ayrı bir nginx dağıtımı demek; log dizini eksik
 * kalırsa nginx hiç başlamıyor, yani küçük bir kazanç için siteyi düşürme
 * riski. Bunun yerine var olan UYGULAMA alanı ayırıcı olarak kullanılıyor:
 * olaylar `t3ai-harness` adıyla düşüyor, model sayımları temiz kalıyor.
 * Grafana'da uygulama adına göre süzmek yeterli.
 *
 * SEYREK OLAYLAR: yalnız kurtarma yolları sayılıyor. Çökertme ve özetleme
 * bilerek dışarıda — ikisi de sık çalışıyor ve tur başına fazladan bir istek
 * çıkarmaya değmiyor.
 */

/** Sayılabilecek olayların TAMAMI. Kapalı küme: serbest metin geçemez. */
export const HARNESS_OLAYLARI = [
  'yanit-kesildi',
  'tasma-telafisi',
  'yedek-model',
  /* Sunucudaki `--served-model-name` bizim yapılandırmamızdan ayrıştı ve
     istek çözülen adla yenilendi. Sayılması önemli: kullanıcıya görünmeyen
     bir onarım, ama altta yatan uyumsuzluğun operasyonda düzeltilmesi
     gerekiyor — sayaç artıyorsa haberimiz olsun. */
  'model-adi-degisti',
] as const;

export type HarnessOlayi = (typeof HARNESS_OLAYLARI)[number];

/**
 * Kapalı küme yalnız tipte değil ÇALIŞMA ZAMANINDA da denetleniyor: serbest
 * metne izin verilseydi bir gün oraya mesaj içeriği koyan bir çağrı sızabilir
 * ve merkezî log gizlilik kuralını sessizce çiğnerdi.
 */
export function harnessOlayiBildir(olay: HarnessOlayi): void {
  if (!(HARNESS_OLAYLARI as readonly string[]).includes(olay)) return;
  try {
    void fetch(KAYIT_YOLU, {
      method: 'POST',
      keepalive: true,
      headers: {
        'X-Uygulama': temizle(`${UYGULAMA_ADI}-harness`),
        'X-Model': olay,
      },
    }).catch(() => {
      // Kayıp bir satır raporda küçük bir eksiklik; sohbeti etkilemesin.
    });
  } catch {
    // fetch hiç yoksa sohbet akışı etkilenmesin
  }
}
