/**
 * Query Classifier - Adapts RAG retrieval strategy based on query type
 * Turkish-aware patterns for conversational, factual, comparison, code, and exploratory queries
 */

export type QueryType =
  | 'factual'        // Precise retrieval: "A320 kanat acikligi nedir?"
  | 'comparison'     // Needs multiple related chunks: "A320 ile B737 arasindaki fark"
  | 'conversational' // No retrieval needed: "Merhaba, nasilsin?"
  | 'code'           // Prioritize code chunks: "API endpoint kodu"
  | 'exploratory';   // Default broad search: "GUNES ENERJISI hakkinda bilgi ver"

export interface RetrievalParams {
  topK: number;
  threshold: number;
  mmrLambda: number;
  skipRetrieval: boolean;
}

// Turkish factual question patterns
const FACTUAL_PATTERNS = [
  /\b(nedir|nelerdir|kaçtır|kaç\s?(tane|adet)|ne\s?kadar|ne\s?zaman|nerede|kimdir|hangisi(dir)?)\b/i,
  /\b(özellikleri|teknik\s?özellikleri|spesifikasyonları|kapasitesi|hızı|ağırlığı|uzunluğu|yüksekliği|menzili|irtifası)\b/i,
  /\b(kaç\s?(km|m|kg|ton|knot|ft|metre))\b/i,
];

// Comparison patterns
const COMPARISON_PATTERNS = [
  /\b(fark[ıi]?|karşılaştır|arasındaki|vs\.?|versus|hangisi.*daha|mı.*mı|mi.*mi|mu.*mu|mü.*mü)\b/i,
  /\b(ile.*arasında|ve.*karşılaştır|ve.*fark)\b/i,
  /\b(avantaj|dezavantaj|üstünlük|compared?\s?to)\b/i,
];

// Code-related patterns
const CODE_PATTERNS = [
  /\b(kod|fonksiyon|function|class|import|export|const|let|var|interface|type|api|endpoint|component|hook|module)\b/i,
  /\b(implementasyon|implementation|code|script|program|algoritma|algorithm)\b/i,
  /```/,
];

/**
 * Sohbet kalıpları — selamlama, teşekkür ve ONAY/DEVAM bağlaçları.
 *
 * Bu liste iki işe birden yarıyor: bir mesajın YALNIZCA bunlardan mı ibaret
 * olduğunu anlamak, ve gerçek sorunun önündeki bağlacı soymak.
 */
const SOHBET_KALIPLARI = [
  'merhaba', 'selam', 'hey', 'naber', 'nasılsın', 'nasilsin',
  'teşekkür ederim', 'teşekkürler', 'teşekkür', 'sağ ol', 'sağol',
  'günaydın', 'iyi geceler', 'iyi akşamlar', 'hoşça kal', 'görüşürüz',
  'bye', 'hi', 'hello', 'thanks', 'thank you',
  'evet', 'hayır', 'tamamdır', 'tamam', 'okey', 'ok',
  'anladım', 'peki', 'olur', 'güzel', 'harika', 'süper',
];

/**
 * Türkçe'ye uygun kelime sonu.
 *
 * `\b` BURADA YETMİYOR: JS'te kelime sınırı ASCII tabanlı, Türkçe harfler
 * (ı ğ ü ş ö ç) kelime karakteri sayılmıyor. `\bpeki\b` bu yüzden
 * "pekiştirme" ile de eşleşirdi. Bunun yerine "arkasından Türkçe harf ya da
 * rakam GELMESİN" diyoruz.
 */
const SON_SINIR = '(?![a-zçğıöşü0-9])';

const kacir = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Baştaki sohbet bağlacını ve ardındaki noktalamayı soyan desen. */
const SOYMA_DESENI = new RegExp(
  '^(?:' +
    [...SOHBET_KALIPLARI].sort((a, b) => b.length - a.length).map(kacir).join('|') +
    ')' + SON_SINIR + '[\\s,.!?…]*',
);

/**
 * Baştaki sohbet bağlaçlarını soyar: "Peki, menzili kaç km?" → "menzili kaç km?"
 *
 * NEDEN: Türkçe'de gerçek sorular çok sık bir onay/devam bağlacıyla başlıyor.
 * Eskiden bu mesajlar SOHBET sayılıp arama tamamen kapatılıyordu ve model
 * belgeyi hiç görmeden cevap veriyordu — sessiz yanlış cevap. Ölçüldü: bu
 * biçimdeki 12 gerçek belge sorusunun 12'sinde arama kapanıyordu.
 *
 * Yineleme sınırlı: "tamam peki teşekkürler" gibi zincirler de soyuluyor.
 */
function sohbetOneklerindenSoy(metin: string): string {
  let s = metin;
  for (let i = 0; i < 5; i++) {
    const yeni = s.replace(SOYMA_DESENI, '');
    if (yeni === s) break;
    s = yeni;
  }
  return s.replace(/^[\s,.!?…]+/, '').trim();
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(text));
}

/**
 * Sorgu tipini belirler.
 *
 * TASARIM KARARI — belirsizlikte ARAMAYI AÇIK BIRAK. Fazladan arama yapmanın
 * bedeli bir gömme çağrısı ve biraz gecikme; eşik alakasız parçayı zaten
 * eliyor. Aramayı gereksiz KAPATMANIN bedeli ise modelin belgeyi hiç
 * görmeden, hata vermeden yanlış cevap vermesi. Takas simetrik değil.
 */
export function classifyQuery(query: string): QueryType {
  // tr-TR lowercase: /i bayrağı Türkçe İ→i katlamasını yapmaz; "MENZİLİ" gibi
  // büyük harfli sorgular aksi halde desenlere takılmaz ve yanlış sınıflanır.
  const qTr = query.trim().toLocaleLowerCase('tr-TR');
  // tr-TR "I"→"ı" yaptığı için BÜYÜK harf Latin token'ları (API, IMPORT, FUNCTION)
  // desenlere takılmaz; düz lowercase'i de dene → ikisinin OR'u (Türkçe + Latin tutar).
  const qPlain = query.trim().toLowerCase();

  const kalanTr = sohbetOneklerindenSoy(qTr);
  const kalanPlain = sohbetOneklerindenSoy(qPlain);

  // Bağlaçlar soyulunca geriye bir şey kalmadıysa mesaj gerçekten sohbet.
  if (kalanTr.length === 0 && kalanPlain.length === 0) {
    return 'conversational';
  }

  // Sınıflandırma SOYULMUŞ metin üzerinde: "Peki menzili kaç km?" artık
  // "menzili kaç km?" olarak değerlendiriliyor ve factual'a düşüyor.
  const hits = (patterns: RegExp[]) => matchesAny(kalanTr, patterns) || matchesAny(kalanPlain, patterns);

  if (hits(COMPARISON_PATTERNS)) {
    return 'comparison';
  }
  if (hits(FACTUAL_PATTERNS)) {
    return 'factual';
  }
  if (hits(CODE_PATTERNS)) {
    return 'code';
  }
  return 'exploratory';
}

export function getRetrievalParams(queryType: QueryType): RetrievalParams {
  switch (queryType) {
    case 'conversational':
      return { topK: 0, threshold: 1.0, mmrLambda: 0.7, skipRetrieval: true };
    /* topK DEĞERLERİ ÖLÇÜMLE YÜKSELTİLDİ (2026-09-07).
       Eski değerlerle bağlam bütçesinin yalnız %15'i kullanılıyordu: 8.000
       token ayrılmış, ortalama 1.200 gidiyordu. Erişim değerlendirmesinde
       (35 belge / 108 vaka) isabet %93'te takılıyordu ve kaçan vakaların
       çoğunda doğru parça havuzdaydı, sadece kesime giremiyordu.

       Dirsek noktasında duruldu. Daha da yükseltmek (topK 20) isabeti %99'a
       çıkarıyor ama parça sayısını 27'ye, gürültüyü %87'ye taşıyor —
       ölçtüğümüz şey ERİŞİM, cevap kalitesi değil. Modele 24 alakasız parça
       okutmanın bedelini bu metrik göstermiyor, o yüzden metriğe aşırı
       uydurmaktan kaçınıldı. */
    case 'factual':
      // High precision: fewer results but stricter threshold, less diversity
      return { topK: 6, threshold: 0.45, mmrLambda: 0.9, skipRetrieval: false };
    case 'comparison':
      // High diversity: more results, moderate threshold, maximize diversity
      return { topK: 12, threshold: 0.45, mmrLambda: 0.5, skipRetrieval: false };
    case 'code':
      return { topK: 8, threshold: 0.5, mmrLambda: 0.8, skipRetrieval: false };
    case 'exploratory':
    default:
      return { topK: 10, threshold: 0.40, mmrLambda: 0.7, skipRetrieval: false };
  }
}
