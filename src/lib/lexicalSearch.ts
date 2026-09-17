/**
 * Lexical Search — client-side BM25 bacağı için saf fonksiyonlar.
 * Türkçe tokenizasyon + Okapi BM25 + RRF füzyonu + versiyonlu indeks cache.
 * Dense (bge-m3) bacağın çözemediği kimlik/kod/sayı sorgularını hedefler.
 */

// ASCII-fold: sorgu "gunes" ↔ doküman "GÜNEŞ" eşleşsin diye iki taraf da katlanır.
const FOLD_MAP: Record<string, string> = {
  'ş': 's', 'ğ': 'g', 'ı': 'i', 'ç': 'c', 'ö': 'o', 'ü': 'u',
  'â': 'a', 'î': 'i', 'û': 'u',
};
const FOLD_RE = /[şğıçöüâîû]/g;

const katla = (s: string) => s.replace(FOLD_RE, (ch) => FOLD_MAP[ch]);

/**
 * Türkçe tokenizasyon.
 *
 * TİRE AYIRICI DEĞİL. Eskiden öyleydi ve varyant kodları çöküyordu:
 * 'VEGA-2' → ['vega'], 'VEGA-1' → ['vega'] — İKİSİ AYNI. Sözcüksel bacak bu
 * iki belgeyi hiçbir sorguda ayıramıyordu. Ölçüldü: 8 varyant vakasının
 * 4'ünde doğru belgeyi üste koyuyordu, yani ikili seçimde tam şans oranı.
 *
 * Artık üç token birden üretiliyor: bütün ('vega2'), parçalar ('vega', '2').
 * Ayrımı asıl BÜTÜN sağlıyor — nadir olduğu için IDF'i yüksek ve ayırt edici.
 * Tek başına '2' çok yaygın, tek başına yetmezdi.
 *
 * Kısa parça ancak RAKAM içeriyorsa korunuyor: 'vega-2'nin '2'si varyantı
 * ayıran işaret; 'f-16'nın 'f'si ise gürültü.
 */
export function tokenizeTr(text: string): string[] {
  const lowered = text.toLocaleLowerCase('tr-TR');
  // Apostrof ve tire AYIRICI DEĞİL: "ankara'nın" eki kesilebilsin, "vega-2"
  // bütün olarak da ele alınabilsin diye ikisi de kaba bölmeden muaf.
  const rough = lowered.split(/[^\p{L}\p{N}'’-]+/u);
  const out: string[] = [];
  for (const raw of rough) {
    // Apostrof kesme: ankara'nın → ankara (Türkçe özel-ad ekleri kesme işaretiyle gelir)
    const cut = raw.split(/['’]/)[0];
    if (!cut) continue;
    const parcalar = cut.split('-').filter(Boolean);

    if (parcalar.length > 1) {
      const butun = katla(parcalar.join(''));
      if (butun.length >= 2) out.push(butun);
    }
    for (const parca of parcalar) {
      const folded = katla(parca);
      if (folded.length >= 2 || /\d/.test(folded)) out.push(folded);
    }
  }
  return out;
}

export interface LexicalIndex {
  docTokens: Map<string, string[]>;  // chunkId → token dizisi
  df: Map<string, number>;           // token → kaç dokümanda geçiyor
  avgdl: number;                     // ortalama doküman uzunluğu (token)
  docCount: number;
}

// Okapi BM25 standart sabitleri
const BM25_K1 = 1.5;
const BM25_B = 0.75;

export function buildLexicalIndex(docs: Array<{ id: string; content: string }>): LexicalIndex {
  const docTokens = new Map<string, string[]>();
  const df = new Map<string, number>();
  let totalLen = 0;
  for (const doc of docs) {
    const tokens = tokenizeTr(doc.content);
    docTokens.set(doc.id, tokens);
    totalLen += tokens.length;
    for (const t of new Set(tokens)) {
      df.set(t, (df.get(t) ?? 0) + 1);
    }
  }
  return {
    docTokens,
    df,
    avgdl: docs.length > 0 ? totalLen / docs.length : 0,
    docCount: docs.length,
  };
}

export function scoreBm25(index: LexicalIndex, queryTokens: string[]): Map<string, number> {
  const scores = new Map<string, number>();
  if (queryTokens.length === 0 || index.docCount === 0) return scores;

  // Sorguda aynı token tekrarı skoru şişirmesin
  const uniqueQuery = [...new Set(queryTokens)];
  const idf = new Map<string, number>();
  for (const t of uniqueQuery) {
    const dfT = index.df.get(t);
    if (!dfT) continue; // korpusta yok → katkısı yok
    idf.set(t, Math.log(1 + (index.docCount - dfT + 0.5) / (dfT + 0.5)));
  }
  if (idf.size === 0) return scores;

  for (const [docId, tokens] of index.docTokens) {
    const dl = tokens.length;
    if (dl === 0) continue;
    // Terim frekansları (yalnız sorgu terimleri için)
    let score = 0;
    for (const [t, idfT] of idf) {
      let tf = 0;
      for (const tok of tokens) if (tok === t) tf++;
      if (tf === 0) continue;
      score += idfT * (tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * dl / index.avgdl));
    }
    if (score > 0) scores.set(docId, score);
  }
  return scores;
}

// Versiyonlu indeks cache'i: anahtar `${scopeKey}|${versionKey}` — korpus bump'ı
// (retrievalCache.getCorpusVersionKey) anahtarı değiştirir, indeks otomatik tazelenir.
const INDEX_CACHE_MAX = 4;
const indexCache = new Map<string, LexicalIndex>();

export function getLexicalIndex(cacheKey: string, docs: Array<{ id: string; content: string }>): LexicalIndex {
  const cached = indexCache.get(cacheKey);
  if (cached) {
    // LRU tazeleme: sona taşı
    indexCache.delete(cacheKey);
    indexCache.set(cacheKey, cached);
    return cached;
  }
  const index = buildLexicalIndex(docs);
  if (indexCache.size >= INDEX_CACHE_MAX) {
    const oldest = indexCache.keys().next().value;
    if (oldest !== undefined) indexCache.delete(oldest);
  }
  indexCache.set(cacheKey, index);
  return index;
}

// Reciprocal Rank Fusion: score(d) = Σ 1/(k + rank). k=60 literatür standardı.
export function fuseRrf(rankedLists: string[][], k = 60): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of rankedLists) {
    list.forEach((id, i) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i + 1));
    });
  }
  return scores;
}

/** Kill-switch: '1' ise lexical bacak atlanır → birebir v2.1.22 dense davranışı. */
export function isHybridOff(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('rag-hybrid-off') === '1';
  } catch {
    return false;
  }
}

interface RankableChunk {
  id: string;
  content: string;
  embedding?: number[] | null;
}
export interface HybridRankResult<C extends RankableChunk> {
  chunk: C;
  score: number;
}

// cosineSimilarity'yi vectorSearch'ten import etmek döngü yaratır (vectorSearch bu
// modülü import edecek) → küçük yerel kopya (saf, 10 satır).
function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  const den = Math.sqrt(na) * Math.sqrt(nb);
  return den === 0 ? 0 : dot / den;
}

/**
 * Hibrit sıralamanın SAF çekirdeği: dense + BM25 bacaklarını RRF ile birleştirir.
 * Skorlar 0..1 normalize edilir (downstream MMR cosine-ölçekli relevance bekler).
 * Lexical eşleşme yoksa HAM dense skorlarıyla döner (v2.1.22 davranışı birebir).
 */
export function hybridRank<C extends RankableChunk>(
  chunks: C[],
  queryEmbedding: number[] | null,
  queryTokens: string[],
  index: LexicalIndex,
  opts: { topK: number; threshold: number },
): HybridRankResult<C>[] {
  const { topK, threshold } = opts;
  if (topK <= 0) return [];

  const denseRanked: HybridRankResult<C>[] = queryEmbedding
    ? chunks
        .filter(c => c.embedding && c.embedding.length === queryEmbedding.length)
        .map(c => ({ chunk: c, score: cosine(queryEmbedding, c.embedding!) }))
        .filter(r => r.score >= threshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
    : [];

  const bm25 = scoreBm25(index, queryTokens);
  const lexicalRanked: HybridRankResult<C>[] = chunks
    .map(c => ({ chunk: c, score: bm25.get(c.id) ?? 0 }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  // Lexical bacak boşsa ham dense skorları korunur — birebir eski davranış.
  if (lexicalRanked.length === 0) return denseRanked;

  const byId = new Map<string, C>();
  for (const r of [...denseRanked, ...lexicalRanked]) byId.set(r.chunk.id, r.chunk);

  const rrf = fuseRrf([
    denseRanked.map(r => r.chunk.id),
    lexicalRanked.map(r => r.chunk.id),
  ]);
  const entries = [...rrf.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK);
  const maxScore = entries.length > 0 ? entries[0][1] : 1;
  // Max'a normalizasyon: en iyi aday 1.0 → MMR'ın λ*relevans terimi anlamlı kalır.
  return entries.map(([id, s]) => ({ chunk: byId.get(id)!, score: s / maxScore }));
}
