/**
 * Retrieval Cache - buildContextFromSearch sonuçları için in-memory cache
 *
 * Aynı sorgu aynı seansta tekrar sorulunca vektör taraması + MMR +
 * sıkıştırma atlanır. Seans-scoped (kalıcı değil): kalıcılık, kalıcı
 * corpus-version defterciği gerektirir - küçük self-hosted app için değmez.
 *
 * Invalidasyon: corpus versiyonu cache anahtarının parçası. Bir scope'un
 * chunk'ları değişince (doküman ekleme/silme, reindex, import) versiyon
 * bump edilir; eski anahtarlar bir daha eşleşmez, TTL/LRU ile düşer.
 *
 * Bilinçli olarak runtime import YOK (type-only import compile'da silinir)
 * - localDb.ts dahil her yerden döngüsüz import edilebilir.
 */

import type { RagContext } from './ragService';

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 50;

const CACHE_DEBUG =
  typeof localStorage !== 'undefined' && localStorage.getItem('rag-cache-debug') === '1';

function debugLog(...args: unknown[]): void {
  if (CACHE_DEBUG) console.debug('[rag-cache]', ...args);
}

// --- Corpus versiyonlama (in-memory) ---
// Scope anahtarları: 'project:<id>' | 'conv:<id>'

const corpusVersions = new Map<string, number>();
let globalEpoch = 0;

const stats = { hits: 0, misses: 0, bumps: 0 };

export function bumpCorpusVersion(scope: string): void {
  corpusVersions.set(scope, (corpusVersions.get(scope) ?? 0) + 1);
  stats.bumps++;
  debugLog(`corpus bump: ${scope} -> v${corpusVersions.get(scope)}`);
}

export function bumpAllCorpusVersions(): void {
  globalEpoch++;
  cache.clear();
  stats.bumps++;
  debugLog(`corpus bump: ALL (epoch ${globalEpoch})`);
}

export function getCorpusVersionKey(projectId?: string, conversationId?: string): string {
  const projectVersion = projectId ? (corpusVersions.get(`project:${projectId}`) ?? 0) : 0;
  const convVersion = conversationId ? (corpusVersions.get(`conv:${conversationId}`) ?? 0) : 0;
  return `${globalEpoch}.${projectVersion}.${convVersion}`;
}

// --- Cache ---

interface CacheEntry {
  value: RagContext;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Sorguyu cache anahtarı için normalize eder. Noktalama SOYULMAZ
 * (apostrof ekleri ve soru işareti gerçek anlam taşır); tr-TR locale
 * ile İ→i / I→ı doğru katlanır.
 */
export function normalizeQueryKey(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
}

export function getCachedRagContext(key: string): RagContext | null {
  const entry = cache.get(key);
  if (!entry) {
    stats.misses++;
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    stats.misses++;
    debugLog('retrieval expired:', key.slice(0, 60));
    return null;
  }
  // LRU refresh: sona taşı
  cache.delete(key);
  cache.set(key, entry);
  stats.hits++;
  debugLog('retrieval HIT:', key.slice(0, 60));
  // Çağıran cache'teki nesneyi bozamasın
  return structuredClone(entry.value);
}

export function setCachedRagContext(key: string, value: RagContext): void {
  if (cache.size >= MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
  cache.set(key, { value: structuredClone(value), expiresAt: Date.now() + TTL_MS });
  debugLog('retrieval set:', key.slice(0, 60));
}

export function getRetrievalCacheStats(): {
  hits: number;
  misses: number;
  size: number;
  bumps: number;
} {
  return { ...stats, size: cache.size };
}

declare global {
  interface Window {
    __ragCacheStats?: Record<string, () => unknown>;
  }
}

// Test/debug erişimi: konsolda __ragCacheStats.retrieval()
if (typeof window !== 'undefined') {
  window.__ragCacheStats = {
    ...window.__ragCacheStats,
    retrieval: getRetrievalCacheStats,
  };
}
