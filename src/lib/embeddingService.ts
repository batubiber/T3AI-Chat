/**
 * Embedding Service - Fetches embeddings from server
 * Handles batch processing and retry logic
 */

import { getCachedEmbedding, setCachedEmbedding } from './embeddingCache';
import {
  getCachedEmbeddingsBulk,
  putCachedEmbeddingsBulk,
  purgeOtherNamespaces,
} from './persistentEmbeddingCache';

// API URL for embedding endpoint
const API_URL = import.meta.env.VITE_API_URL || "/api";

// Kalıcı cache namespace'i = embedding model adı (/api/embed/health'ten).
// Health ulaşılamazsa null döner ve kalıcı katman bypass edilir - namespace asla tahmin edilmez.
let namespacePromise: Promise<{ model: string; dimension?: number } | null> | null = null;

function resolveEmbeddingNamespace(): Promise<{ model: string; dimension?: number } | null> {
  if (!namespacePromise) {
    namespacePromise = checkEmbeddingServiceHealth().then((health) => {
      if (health.available && health.model) {
        // Model değişimi invalidasyonu - fire-and-forget
        purgeOtherNamespaces(health.model).catch(() => {});
        return { model: health.model, dimension: health.dimension };
      }
      // Başarısız çözümü memoize etme - sonraki çağrıda tekrar dene
      namespacePromise = null;
      return null;
    });
  }
  return namespacePromise;
}

export interface EmbeddingResult {
  embedding: number[];
  text: string;
}

export interface EmbeddingBatchResult {
  embeddings: number[][];
  texts: string[];
}

export interface EmbeddingProgress {
  current: number;
  total: number;
  phase: 'chunking' | 'embedding' | 'storing';
}

// Default batch size for embedding requests
const DEFAULT_BATCH_SIZE = 10;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Get embeddings for a single text (with LRU cache)
 * Katmanlama: in-memory LRU → kalıcı cache (IndexedDB) → network
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const cached = getCachedEmbedding(text);
  if (cached) {
    return cached;
  }

  const namespace = await resolveEmbeddingNamespace();
  if (namespace) {
    const [dbHit] = await getCachedEmbeddingsBulk(namespace.model, [text]);
    if (dbHit) {
      setCachedEmbedding(text, dbHit);
      return dbHit;
    }
  }

  const result = await getEmbeddings([text]);
  const embedding = result[0];
  setCachedEmbedding(text, embedding);
  if (namespace) {
    await putCachedEmbeddingsBulk(namespace.model, [text], [embedding], namespace.dimension);
  }
  return embedding;
}

/**
 * Get embeddings for multiple texts (batch)
 */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }
  
  let lastError: Error | null = null;
  const startedAt = Date.now();
  const PER_REQUEST_MS = 8000;   // istek başına timeout — embedding takılırsa çabuk vazgeç
  const TOTAL_BUDGET_MS = 12000; // toplam retry bütçesi — down'ken ~48sn asılı kalma

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (Date.now() - startedAt > TOTAL_BUDGET_MS) break; // bütçe aşıldı → daha fazla deneme
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PER_REQUEST_MS);
    try {
      const response = await fetch(`${API_URL}/embed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ texts }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        const err = new Error(errorData.error || `HTTP ${response.status}`);
        // 4xx kalıcı hata (hatalı istek) → retry etme, bütçeyi harcama
        if (response.status >= 400 && response.status < 500) {
          (err as { permanent?: boolean }).permanent = true;
        }
        throw err;
      }

      const data = await response.json();

      if (!data.embeddings || !Array.isArray(data.embeddings)) {
        throw new Error('Invalid embedding response format');
      }

      // Batch hizalama savunması: yanıt uzunluğu istekle eşleşmeli, aksi halde
      // embeddings[i] ↔ texts[i] kayar ve chunk'lar yanlış vektörle sessizce cache'lenir.
      if (data.embeddings.length !== texts.length) {
        throw new Error(`Embedding count mismatch: got ${data.embeddings.length}, expected ${texts.length}`);
      }

      return data.embeddings;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`Embedding attempt ${attempt + 1}/${MAX_RETRIES} failed:`, lastError.message);
      if ((lastError as { permanent?: boolean }).permanent) break; // kalıcı hata → tekrar deneme yok
      if (attempt < MAX_RETRIES - 1 && Date.now() - startedAt < TOTAL_BUDGET_MS) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error('Failed to get embeddings after retries');
}

/**
 * Process texts in batches with progress callback
 * Önce kalıcı cache'e toplu bakılır; sadece miss'ler /api/embed'e gönderilir.
 */
export async function getEmbeddingsInBatches(
  texts: string[],
  options?: {
    batchSize?: number;
    onProgress?: (progress: EmbeddingProgress) => void;
  }
): Promise<number[][]> {
  const batchSize = options?.batchSize || DEFAULT_BATCH_SIZE;
  const onProgress = options?.onProgress;

  if (texts.length === 0) {
    return [];
  }

  const namespace = await resolveEmbeddingNamespace();
  const cachedResults = namespace
    ? await getCachedEmbeddingsBulk(namespace.model, texts)
    : texts.map(() => null);

  const results: number[][] = new Array(texts.length);
  const missIndices: number[] = [];
  cachedResults.forEach((embedding, i) => {
    if (embedding) {
      results[i] = embedding;
    } else {
      missIndices.push(i);
    }
  });

  const cachedCount = texts.length - missIndices.length;
  let fetchedCount = 0;

  onProgress?.({
    current: cachedCount,
    total: texts.length,
    phase: 'embedding',
  });

  for (let i = 0; i < missIndices.length; i += batchSize) {
    const batchIndices = missIndices.slice(i, i + batchSize);
    const batchTexts = batchIndices.map((idx) => texts[idx]);

    const embeddings = await getEmbeddings(batchTexts);
    batchIndices.forEach((idx, j) => {
      results[idx] = embeddings[j];
    });

    if (namespace) {
      await putCachedEmbeddingsBulk(namespace.model, batchTexts, embeddings, namespace.dimension);
    }

    fetchedCount += batchTexts.length;
    onProgress?.({
      current: cachedCount + fetchedCount,
      total: texts.length,
      phase: 'embedding',
    });

    // Small delay between batches to avoid overwhelming the server
    if (i + batchSize < missIndices.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return results;
}

/**
 * Check if embedding service is available
 */
export async function checkEmbeddingServiceHealth(): Promise<{
  available: boolean;
  model?: string;
  dimension?: number;
  error?: string;
}> {
  // Kısa timeout + fail-open: embedding servisi ulaşılamıyorsa (ör. firewall) chat'i
  // bekletme — hızlıca available:false dön, RAG atlanır, sohbet gecikmesiz devam eder.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(`${API_URL}/embed/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    if (!response.ok) {
      return { available: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return {
      available: true,
      model: data.model,
      dimension: data.dimension,
    };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Get embedding dimension from the service
 */
export async function getEmbeddingDimension(): Promise<number> {
  const health = await checkEmbeddingServiceHealth();
  if (health.available && health.dimension) {
    return health.dimension;
  }
  // Default to 1024 for most models (mxbai-embed-large, bge-m3, etc.)
  return 1024;
}
