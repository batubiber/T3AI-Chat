/**
 * Persistent Embedding Cache - IndexedDB-backed, content-hash keyed
 *
 * Aynı metin (chunk veya sorgu) bir daha embed edilmez: anahtar,
 * embedding modeli adı + metnin SHA-256 hash'i. Model değişince eski
 * namespace purge edilir; içerik değişince anahtar zaten değişir.
 *
 * Cache hatası embedding akışını asla bozmaz: tüm operasyonlar
 * try/catch'li, tekrarlayan hatada katman seans boyunca devre dışı kalır.
 *
 * Depolama: Float32Array (1024 float ≈ 4KB/kayıt, 5000 kayıt ≈ 20MB)
 */

import { localDb, EmbeddingCacheEntry } from './localDb';

const MAX_ENTRIES = 5000;
const TRIM_TO = 4500;
const LAST_USED_REFRESH_MS = 60 * 60 * 1000; // hit'lerde lastUsedAt en fazla saatte bir yazılır

const CACHE_DEBUG =
  typeof localStorage !== 'undefined' && localStorage.getItem('rag-cache-debug') === '1';

let disabled = false;
let trimChecked = false;

const stats = { dbHits: 0, misses: 0, writes: 0 };

function debugLog(...args: unknown[]): void {
  if (CACHE_DEBUG) console.debug('[rag-cache]', ...args);
}

function disableCache(error: unknown): void {
  if (!disabled) {
    disabled = true;
    console.warn('Persistent embedding cache disabled for this session:', error);
  }
}

// djb2 + sdbm kombinasyonu: crypto.subtle olmayan (plain-HTTP) ortamlar için ~64-bit fallback
function fallbackHash(text: string): string {
  let djb2 = 5381;
  let sdbm = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    djb2 = ((djb2 << 5) + djb2 + c) | 0;
    sdbm = (c + (sdbm << 6) + (sdbm << 16) - sdbm) | 0;
  }
  return `${(djb2 >>> 0).toString(16)}-${(sdbm >>> 0).toString(16)}-${text.length.toString(16)}`;
}

/**
 * Metni cache anahtarının hash kısmına çevirir.
 * Önek algoritmayı ayırır (s: sha256, f: fallback) - iki algoritma asla çapraz eşleşmez.
 */
export async function hashText(text: string): Promise<string> {
  const normalized = text.trim();
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `s:${hex}`;
  }
  return `f:${fallbackHash(normalized)}`;
}

function buildKey(namespace: string, hash: string): string {
  return `${namespace}|${hash}`;
}

async function trimIfNeeded(): Promise<void> {
  const count = await localDb.embeddingCache.count();
  if (count <= MAX_ENTRIES) return;
  const excessKeys = await localDb.embeddingCache
    .orderBy('lastUsedAt')
    .limit(count - TRIM_TO)
    .primaryKeys();
  await localDb.embeddingCache.bulkDelete(excessKeys);
  debugLog(`emb trim: ${excessKeys.length} entries evicted (LRU)`);
}

/**
 * Toplu cache sorgusu - sıra korunur, miss'ler null döner.
 */
export async function getCachedEmbeddingsBulk(
  namespace: string,
  texts: string[]
): Promise<(number[] | null)[]> {
  if (disabled || texts.length === 0) return texts.map(() => null);
  try {
    const hashes = await Promise.all(texts.map(hashText));
    const keys = hashes.map((h) => buildKey(namespace, h));
    const entries = await localDb.embeddingCache.bulkGet(keys);

    const now = Date.now();
    const toRefresh: EmbeddingCacheEntry[] = [];
    const results = entries.map((entry) => {
      if (!entry) {
        stats.misses++;
        return null;
      }
      stats.dbHits++;
      if (now - entry.lastUsedAt > LAST_USED_REFRESH_MS) {
        toRefresh.push({ ...entry, lastUsedAt: now });
      }
      return Array.from(entry.embedding);
    });

    if (toRefresh.length > 0) {
      await localDb.embeddingCache.bulkPut(toRefresh);
    }

    const hits = results.filter((r) => r !== null).length;
    if (hits > 0 || texts.length > 1) {
      debugLog(`emb lookup: ${hits}/${texts.length} db hits`);
    }
    return results;
  } catch (error) {
    disableCache(error);
    return texts.map(() => null);
  }
}

/**
 * Toplu cache yazımı - eksik veya boyutu uyumsuz embedding asla yazılmaz.
 */
export async function putCachedEmbeddingsBulk(
  namespace: string,
  texts: string[],
  embeddings: number[][],
  expectedDim?: number
): Promise<void> {
  if (disabled || texts.length === 0) return;
  try {
    const now = Date.now();
    const entries: EmbeddingCacheEntry[] = [];
    for (let i = 0; i < texts.length; i++) {
      const embedding = embeddings[i];
      if (!Array.isArray(embedding) || embedding.length === 0) continue;
      if (expectedDim && embedding.length !== expectedDim) continue;
      entries.push({
        key: buildKey(namespace, await hashText(texts[i])),
        embedding: new Float32Array(embedding),
        dim: embedding.length,
        createdAt: now,
        lastUsedAt: now,
      });
    }
    if (entries.length === 0) return;

    try {
      await localDb.embeddingCache.bulkPut(entries);
    } catch (error) {
      // Quota dolduysa agresif trim + tek retry
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        const count = await localDb.embeddingCache.count();
        const halfKeys = await localDb.embeddingCache
          .orderBy('lastUsedAt')
          .limit(Math.ceil(count / 2))
          .primaryKeys();
        await localDb.embeddingCache.bulkDelete(halfKeys);
        await localDb.embeddingCache.bulkPut(entries);
      } else {
        throw error;
      }
    }

    stats.writes += entries.length;
    debugLog(`emb write: ${entries.length} entries`);

    if (!trimChecked) trimChecked = true;
    await trimIfNeeded();
  } catch (error) {
    disableCache(error);
  }
}

/**
 * Model değişimi invalidasyonu: verilen namespace dışındaki tüm kayıtları siler.
 */
export async function purgeOtherNamespaces(namespace: string): Promise<number> {
  if (disabled) return 0;
  try {
    const prefix = `${namespace}|`;
    const staleKeys = (await localDb.embeddingCache.toCollection().primaryKeys()).filter(
      (key) => !key.startsWith(prefix)
    );
    if (staleKeys.length > 0) {
      await localDb.embeddingCache.bulkDelete(staleKeys);
      console.log(`Embedding cache: ${staleKeys.length} kayıt purge edildi (model değişimi: ${namespace})`);
    }
    return staleKeys.length;
  } catch (error) {
    disableCache(error);
    return 0;
  }
}

export function getPersistentEmbeddingCacheStats(): {
  dbHits: number;
  misses: number;
  writes: number;
  disabled: boolean;
} {
  return { ...stats, disabled };
}

declare global {
  interface Window {
    __ragCacheStats?: Record<string, () => unknown>;
  }
}

// Test/debug erişimi: konsolda __ragCacheStats.embedding()
if (typeof window !== 'undefined') {
  window.__ragCacheStats = {
    ...window.__ragCacheStats,
    embedding: getPersistentEmbeddingCacheStats,
  };
}
