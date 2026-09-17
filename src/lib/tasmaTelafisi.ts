/**
 * Bağlam taşmasında tek seferlik telafi.
 *
 * Bugüne kadar taşmayı yalnız ÖNLÜYORDUK: backend max_tokens'ı kırpıyor,
 * pencere kayıyor, `butceyeSigdir` tavana zorluyor. Önleme yanılabiliyor —
 * token tahmini karakter/3.5 ve Türkçe bundan belirgin kötü tokenize oluyor;
 * RAG bir seferde beklenenden büyük bir parça döndürebiliyor. Yanıldığında tur
 * genel bir hatayla ölüyor ve kullanıcı ne olduğunu anlamıyordu.
 *
 * "Dive into Claude Code" (arXiv 2604.14228, §4.4) aynı sorunu üç kademeyle
 * çözüyor: önce bağlam çökertme, sonra tepkisel sıkıştırma, ancak ondan sonra
 * hata. Buradaki tek kademe onun en basit hâli: tavanı daralt, bir kez daha
 * dene, sonra pes et.
 */

/** Telafi denemesinde tavanın çarpılacağı oran. */
export const TELAFI_ORANI = 0.6;

/**
 * Telafi denemesinde tavan bu değerin altına inmiyor.
 *
 * Çok küçük tavan sistem promptunu bile kesip modele boş bağlam gönderirdi:
 * taşmayı çözer ama cevabı işe yaramaz hale getirir.
 */
export const EN_AZ_TELAFI_TAVANI = 4000;

/** Kaynağın söylediği hata bağlam taşması mı? */
const TASMA_IZLERI = [
  'context length',
  'context_length_exceeded',
  'maximum context',
  'prompt is too long',
  'too many tokens',
  'reduce the length',
];

/**
 * Yalnız METNE bakıyor, HTTP durumuna değil: 400 bizde girdi doğrulama
 * (guardrail) için de kullanılıyor ve bazı vekiller taşmayı 500'e sarıyor.
 * Yanlış tanıma, isteği ikinci kez göndermek ve kullanıcıya yanlış gerekçe
 * söylemek demek olurdu.
 */
export function baglamTasmasiMi(hataMetni: string | null | undefined): boolean {
  if (!hataMetni) return false;
  const k = hataMetni.toLowerCase();
  return TASMA_IZLERI.some((iz) => k.includes(iz));
}

/** Telafi denemesinin tavanı. */
export function telafiTavani(tavan: number): number {
  return Math.max(EN_AZ_TELAFI_TAVANI, Math.floor(tavan * TELAFI_ORANI));
}

/**
 * Hata GÖVDESİNİN tamamında taşma izi arar.
 *
 * Tek bir alana bakmak yetmiyor, çünkü aynı taşma üç ayrı biçimde geliyor:
 *
 *   backend vekili : { error: "AI servisi hatası", details: "<vLLM metni>" }
 *   doğrudan vLLM  : { error: { message: "<metin>", type: "..." } }
 *   sade           : { error: "context_length_exceeded" }
 *
 * İlk sürüm yalnız `error` ve `message` alanlarına bakıyordu; taşma metni
 * backend'de `details` içinde olduğu için telafi GERÇEK dağıtımda hiç
 * tetiklenmezdi. Gövdeyi bütün olarak taramak bu kırılganlığı kaldırıyor;
 * aranan ifadeler yeterince özgün olduğu için yanlış eşleşme riski düşük.
 */
export function govdedeTasmaVarMi(govde: unknown): boolean {
  if (!govde) return false;
  let metin: string;
  try {
    metin = typeof govde === 'string' ? govde : JSON.stringify(govde);
  } catch {
    return false; // döngüsel gövde — telafi denemektense normal hata yolu
  }
  return baglamTasmasiMi(metin);
}
