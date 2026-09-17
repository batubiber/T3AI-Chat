/**
 * Contextual Compressor - Extracts only relevant sentences from retrieved chunks
 * Reduces token waste by 30-50% while preserving answer-bearing content.
 *
 * Works for any language (Turkish, English, etc.) and any document type.
 */

// Turkish and English stop words to ignore when scoring
const STOP_WORDS = new Set([
  // Turkish
  'bir', 'bu', 'da', 'de', 've', 'ile', 'için', 'gibi', 'olan', 'olarak',
  'den', 'dan', 'nin', 'nın', 'nun', 'nün', 'dir', 'dır', 'dır', 'tır',
  'ise', 'kadar', 'daha', 'çok', 'var', 'yok',
  // English
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'and', 'or', 'but',
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as',
]);

/**
 * Split text into sentences, handling Turkish and English punctuation.
 * Preserves list items and short lines as individual units.
 */
function splitIntoSentences(text: string): string[] {
  const lines = text.split('\n');
  const sentences: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    // Keep list items, headings, and table rows as atomic units
    if (/^[-*•]/.test(trimmed) || /^\|.*\|$/.test(trimmed) || /^#{1,4}\s/.test(trimmed)) {
      sentences.push(trimmed);
      continue;
    }

    // Split on sentence-ending punctuation followed by space or end-of-string
    const parts = trimmed.split(/(?<=[.!?:;])\s+/);
    for (const part of parts) {
      const p = part.trim();
      if (p.length > 0) {
        sentences.push(p);
      }
    }
  }

  return sentences;
}

/**
 * Extract meaningful terms from text (lowercased, filtered by length and stop words)
 */
function extractTerms(text: string): Set<string> {
  return new Set(
    text
      .toLocaleLowerCase('tr-TR') // classifier ile tutarlı + "İ"→temiz "i" (default toLowerCase "i̇" combining verir)
      .split(/[\s,.;:!?()[\]{}"'`\-/|]+/)
      .filter(t => t.length > 2 && !STOP_WORDS.has(t))
  );
}

/**
 * Detect tabular chunks (TSV / Markdown table / spreadsheet rows).
 * Tablolarda her satır ayrı bir "cümle" gibi görünür; cümle-bazlı sıkıştırma,
 * query terimleriyle örtüşmeyen (ör. saf sayısal) satırları atıp tabloyu ilk
 * satıra indirir. Bu yüzden tablo chunk'ları sıkıştırılmamalıdır.
 */
function isTabularChunk(text: string): boolean {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 3) return false;
  const tableLines = lines.filter(l => l.includes('\t') || /^\|.*\|$/.test(l)).length;
  return tableLines >= Math.max(2, Math.floor(lines.length * 0.5));
}

/**
 * Compress a chunk by keeping only sentences relevant to the query.
 * Returns the original chunk if compression wouldn't meaningfully reduce size.
 */
export function compressChunk(chunk: string, query: string): string {
  // Tabloları olduğu gibi koru — satır bazlı sıkıştırma tablo verisini bozar.
  if (isTabularChunk(chunk)) return chunk;

  const sentences = splitIntoSentences(chunk);

  // Don't compress if chunk is already small (3 or fewer sentences)
  if (sentences.length <= 3) return chunk;

  const queryTerms = extractTerms(query);

  // Score each sentence by term overlap
  const scored = sentences.map((sentence, index) => {
    const sentenceTerms = extractTerms(sentence);
    let overlap = 0;
    for (const term of sentenceTerms) {
      // Exact match or prefix match (handles Turkish suffixes)
      for (const queryTerm of queryTerms) {
        if (term === queryTerm || term.startsWith(queryTerm) || queryTerm.startsWith(term)) {
          overlap++;
          break;
        }
      }
    }
    return { sentence, score: overlap, index };
  });

  // Select sentences with overlap > 0 plus their immediate neighbors for context
  const keepIndices = new Set<number>();
  for (const { score, index } of scored) {
    if (score > 0) {
      keepIndices.add(Math.max(0, index - 1));
      keepIndices.add(index);
      keepIndices.add(Math.min(sentences.length - 1, index + 1));
    }
  }

  // If no term overlap, trust the vector similarity and return original
  if (keepIndices.size === 0) return chunk;

  // Also always keep the first sentence (often topic/intro) and heading context
  keepIndices.add(0);

  // Build compressed text
  const compressed = Array.from(keepIndices)
    .sort((a, b) => a - b)
    .map(i => sentences[i])
    .join('\n');

  // Only use compressed version if it's meaningfully shorter (at least 20% reduction)
  return compressed.length < chunk.length * 0.8 ? compressed : chunk;
}
