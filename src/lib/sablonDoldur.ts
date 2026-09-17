import { TurSiniri, type TurButcesi } from './harness/turButcesi';
/**
 * Şablon doldurma: `{{...}}` yer tutucularını bulur ve model değerlerini
 * düzenlemelere genişletir.
 *
 * TASARIM KARARI — modelden ADRES değil DEĞER isteriz. `DocumentEdit` birim
 * bazında adresleniyor; 40 alanlı bir şablonda modelin tekrarları saymasını
 * beklemek bir geçişin sessizce kaçması demek. Tarama ve genişletme kodda,
 * yalnız değer üretimi modelde.
 */

import type { DocumentEdit } from './documentEditing';
import { resolveGateModelId } from './modelConfig';
import { modelUcunaGonder } from './modelIstegi';
import { sessionHeaders } from './sessionHeader';
import { kullanimBildir } from './kullanimBildir';
import { istekOmru, iptaliKontrolEt } from './harness/iptal';

/** Bir yer tutucunun belgede geçtiği tek bir yer. */
export interface Gecis {
  /** Birim numarası — `DocumentEdit.paragraph` ile aynı numaralandırma. */
  birim: number;
  /**
   * Şablondaki HAM metin (`{{ad}}` ya da `{{ ad }}`).
   *
   * `ad` yerine bu kullanılmak zorunda: `find` olarak kırpılmış adı verirsek
   * `{{ ad }}` yazan bir şablonda eşleşme olmaz ve alan sessizce boş kalır.
   */
  hamMetin: string;
}

export interface YerTutucu {
  /** `{{ }}` içindeki kırpılmış ad — farklı yazımları tek alanda birleştirir. */
  ad: string;
  gecisler: Gecis[];
}

/** `[12] metin` — üç formatın numaralı çıktısı da bu biçimde. */
const BIRIM_SATIRI = /^\[(\d+)\]\s?(.*)$/;

/** `{{...}}`; içerik `}` içeremez, böylece en yakın kapanışta durur. */
const YER_TUTUCU = /\{\{([^}]*)\}\}/g;

export function yerTutuculariBul(numaraliMetin: string): YerTutucu[] {
  // Map: ilk görülme sırasını korumak için (nesne anahtar sırası sayısal
  // adlarda değişebilir, Map'te değişmez).
  const bulunan = new Map<string, YerTutucu>();
  // Aynı birimde aynı yazımın ikinci kez sayılmasını engeller.
  const gorulen = new Set<string>();

  for (const satir of numaraliMetin.split('\n')) {
    const eslesme = BIRIM_SATIRI.exec(satir);
    if (!eslesme) continue;               // "--- Slayt 2 ---" gibi başlıklar
    const birim = Number(eslesme[1]);
    const metin = eslesme[2];

    for (const m of metin.matchAll(YER_TUTUCU)) {
      const ad = m[1].trim();
      if (!ad) continue;                  // "{{}}" ve "{{   }}"
      const hamMetin = m[0];
      const anahtar = `${birim} ${hamMetin}`;
      if (gorulen.has(anahtar)) continue;
      gorulen.add(anahtar);

      const mevcut = bulunan.get(ad);
      if (mevcut) mevcut.gecisler.push({ birim, hamMetin });
      else bulunan.set(ad, { ad, gecisler: [{ birim, hamMetin }] });
    }
  }

  return [...bulunan.values()];
}

/**
 * Model değerlerini düzenlemelere genişletir: her GEÇİŞ için bir `DocumentEdit`.
 *
 * Değeri olmayan ya da boş olan alan atlanır — yer tutucu belgede görünür kalır
 * ve kullanıcı neyin doldurulmadığını görür. Boşaltmak, sessizce bilgi kaybıdır.
 */
export function degerleriDuzenlemeyeCevir(
  yerTutucular: YerTutucu[],
  degerler: Record<string, string>,
): DocumentEdit[] {
  const duzenlemeler: DocumentEdit[] = [];
  for (const yt of yerTutucular) {
    const deger = degerler[yt.ad];
    if (typeof deger !== 'string' || !deger.trim()) continue;
    for (const g of yt.gecisler) {
      duzenlemeler.push({
        paragraph: g.birim,
        find: g.hamMetin,
        replace: deger,
        reason: yt.ad,
      });
    }
  }
  return duzenlemeler;
}

const ZAMAN_ASIMI_MS = 60000;

/**
 * Araç yanıtından değer eşlemesini çıkarır. SAF: ağ yok, testte doğrudan
 * çağrılabiliyor (`belgeUretimKapisi.araciCoz` ile aynı ayrım).
 */
export function degerleriCoz(data: unknown): Record<string, string> {
  if (!data || typeof data !== 'object') return {};
  const cagri = (data as {
    choices?: { message?: { tool_calls?: { function?: { name?: string; arguments?: string } }[] } }[];
  }).choices?.[0]?.message?.tool_calls?.[0];
  if (!cagri || cagri.function?.name !== 'sablon_doldur') return {};

  try {
    const arg = JSON.parse(cagri.function.arguments || '{}');
    const ham = arg?.degerler;
    if (!ham || typeof ham !== 'object') return {};
    const temiz: Record<string, string> = {};
    // Model sayı/null üretebiliyor; DocumentEdit.replace dize olmak zorunda.
    for (const [k, v] of Object.entries(ham)) if (typeof v === 'string') temiz[k] = v;
    return temiz;
  } catch {
    return {};   // bozuk argüman: alan doldurulmaz, belge bozulmaz
  }
}

const sablonPromptu = (adlar: string[]) =>
  'Sana bir belge şablonundaki alan adları ve kullanıcının talebi veriliyor. ' +
  'Her alan için uygun değeri üret ve sablon_doldur aracını çağır.\n\n' +
  `ALANLAR: ${adlar.join(', ')}\n\n` +
  'KURALLAR: Değerler kısa ve doğrudan olsun — açıklama yazma. ' +
  'Talepten çıkaramadığın bir alanı BOŞ BIRAK, UYDURMA. ' +
  'Tarih istenen alanlarda gün.ay.yıl biçimini kullan.';

async function degerSor(
  modelId: string,
  adlar: string[],
  talimat: string,
  conversationId?: string,
  signal?: AbortSignal,
  butce?: TurButcesi,
): Promise<{ durum: 'ok'; degerler: Record<string, string> } | { durum: 'hata'; neden: string }> {
  iptaliKontrolEt(signal);
  const omur = istekOmru(signal, ZAMAN_ASIMI_MS);
  try {
    kullanimBildir(modelId);
    const yanit = await modelUcunaGonder(
      modelId,
      {
        messages: [
          { role: 'system', content: sablonPromptu(adlar) },
          { role: 'user', content: `TALEP: ${talimat}` },
        ],
        temperature: 0,
        max_tokens: 1000,
        stream: false,
        chat_template_kwargs: { enable_thinking: false },
        tools: [{
          type: 'function',
          function: {
            name: 'sablon_doldur',
            description: 'Şablondaki alanlara değer yazmak için çağrılır.',
            parameters: {
              type: 'object',
              properties: {
                degerler: {
                  type: 'object',
                  description: 'Alan adı → değer eşlemesi. Bilinmeyen alanı hiç yazma.',
                },
              },
              required: ['degerler'],
            },
          },
        }],
      },
      { headers: sessionHeaders(conversationId), signal: omur.signal, butce },
    );
    // 400 en olası "bu vLLM'de araç çağırma açık değil" sinyali — ikinci şansı hak eder
    if (!yanit.ok) return { durum: 'hata', neden: `HTTP ${yanit.status}` };
    const veri = await yanit.json();
    iptaliKontrolEt(omur.signal);
    return { durum: 'ok', degerler: degerleriCoz(veri) };
  } catch (err) {
    iptaliKontrolEt(signal);
    if (err instanceof TurSiniri) throw err;
    return { durum: 'hata', neden: err instanceof Error ? err.name : 'bilinmeyen' };
  } finally {
    omur.temizle();
  }
}

/**
 * Alan adlarını modele verip değerleri alır.
 *
 * Belge METNİ gönderilmiyor — yalnız alan adları. Şablon uzun olabilir ve
 * model değer üretmek için gövdeyi okumak zorunda değil.
 *
 * Kapı modeli düşerse seçili modele İKİNCİ ŞANS verilir. Bu şart: belge
 * üretmede eksikliği yüzünden özellik canlıda sessizce hiç çalışmadı.
 */
export async function sablonDegerleriIste(
  adlar: string[],
  talimat: string,
  modelId: string,
  conversationId?: string,
  signal?: AbortSignal,
  butce?: TurButcesi,
): Promise<Record<string, string>> {
  if (adlar.length === 0) return {};

  const kapiId = resolveGateModelId(modelId);
  const ilk = await degerSor(kapiId, adlar, talimat, conversationId, signal, butce);
  if (ilk.durum === 'ok') {
    console.debug('[sablon] değer sayısı:', Object.keys(ilk.degerler).length, 'model:', kapiId);
    return ilk.degerler;
  }

  console.debug('[sablon] kapı düştü:', kapiId, ilk.neden, '→', modelId);
  if (kapiId !== modelId) {
    const yedek = await degerSor(modelId, adlar, talimat, conversationId, signal, butce);
    if (yedek.durum === 'ok') return yedek.degerler;
  }
  throw new Error(ilk.neden);   // çağıran kullanıcıya toast gösterecek
}
