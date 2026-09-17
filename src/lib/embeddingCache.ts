/**
 * Embedding Cache - LRU cache for query embeddings
 * Avoids redundant API calls for repeated/similar queries
 *
 * Memory: ~400KB at capacity (100 entries * 1024 floats * 4 bytes)
 */

const CACHE_MAX_SIZE = 100;

const cache = new Map<string, number[]>();

function normalizeKey(text: string): string {
  return text.trim().toLowerCase();
}

export function getCachedEmbedding(text: string): number[] | null {
  const key = normalizeKey(text);
  const cached = cache.get(key);
  if (cached) {
    // Move to end for LRU refresh
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  return null;
}

export function setCachedEmbedding(text: string, embedding: number[]): void {
  const key = normalizeKey(text);
  if (cache.size >= CACHE_MAX_SIZE) {
    // Evict oldest entry (first key in Map)
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) {
      cache.delete(firstKey);
    }
  }
  cache.set(key, embedding);
}

export function clearEmbeddingCache(): void {
  cache.clear();
}

export function getEmbeddingCacheStats(): { size: number; maxSize: number } {
  return { size: cache.size, maxSize: CACHE_MAX_SIZE };
}
