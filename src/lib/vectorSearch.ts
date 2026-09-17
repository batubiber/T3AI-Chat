/**
 * Vector Search - Cosine similarity search on IndexedDB vectors
 * Includes MMR (Maximal Marginal Relevance) for diversity
 */

import { localDb, type LocalChunk } from './localDb';
import { bumpCorpusVersion, getCorpusVersionKey } from './retrievalCache';
import { tokenizeTr, getLexicalIndex, hybridRank, isHybridOff } from './lexicalSearch';

export interface SearchResult {
  chunk: LocalChunk;
  score: number;
}

export interface SearchOptions {
  topK?: number;
  threshold?: number;
  projectId?: string;
  conversationId?: string;
  useMmr?: boolean;
  mmrLambda?: number;
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  
  if (denominator === 0) {
    return 0;
  }
  
  return dotProduct / denominator;
}

/**
 * Calculate Euclidean distance between two vectors
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }
  
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  
  return Math.sqrt(sum);
}

/**
 * Get chunks using indexed queries when possible (avoids loading all chunks into memory)
 */
async function loadScopedChunks(projectId?: string, conversationId?: string): Promise<LocalChunk[]> {
  if (projectId && conversationId) {
    return localDb.chunks.where('projectId').equals(projectId)
      .filter(c => c.conversationId === conversationId && c.embedding !== undefined && c.embedding.length > 0)
      .toArray();
  }
  if (projectId) {
    return localDb.chunks.where('projectId').equals(projectId)
      .filter(c => c.embedding !== undefined && c.embedding.length > 0)
      .toArray();
  }
  if (conversationId) {
    return localDb.chunks.where('conversationId').equals(conversationId)
      .filter(c => c.embedding !== undefined && c.embedding.length > 0)
      .toArray();
  }
  return localDb.chunks
    .filter(c => c.embedding !== undefined && c.embedding.length > 0)
    .toArray();
}

/**
 * Search for similar chunks using cosine similarity
 */
export async function searchSimilar(
  queryEmbedding: number[],
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const {
    topK = 5,
    threshold = 0.5,
    projectId,
    conversationId,
    useMmr = false,
    mmrLambda = 0.7,
  } = options;

  const chunks = await loadScopedChunks(projectId, conversationId);

  if (chunks.length === 0) {
    return [];
  }
  
  // Calculate similarity scores.
  // Boyut-uyumsuz vektörü ATLA (aksi halde cosineSimilarity throw eder ve tek bozuk
  // vektör TÜM aramayı çökertir → RAG sessizce kapanırdı). Model değişiminde güvenli.
  const scoredChunks: SearchResult[] = chunks
    .filter(chunk => chunk.embedding!.length === queryEmbedding.length)
    .map(chunk => ({
      chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding!),
    }))
    .filter(result => result.score >= threshold);
  
  // Sort by score descending
  scoredChunks.sort((a, b) => b.score - a.score);
  
  // Apply MMR if requested
  if (useMmr && scoredChunks.length > topK) {
    return selectWithMmr(scoredChunks, queryEmbedding, topK, mmrLambda);
  }
  
  // Return top K results
  return scoredChunks.slice(0, topK);
}

/**
 * Hibrit arama: dense (cosine) + lexical (BM25) bacakları RRF ile birleştirir.
 * - Kill-switch (rag-hybrid-off=1) veya boş sorgu metni → saf dense (v2.1.22 birebir)
 * - queryEmbedding null (embedding degrade) → lexical-only
 * - Skorlar 0..1 normalize (bkz. spec: MMR ölçek uyumu)
 */
export async function searchHybrid(
  queryEmbedding: number[] | null,
  queryText: string,
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const { topK = 5, threshold = 0.5, projectId, conversationId } = options;
  if (topK <= 0) return [];

  const chunks = await loadScopedChunks(projectId, conversationId);
  if (chunks.length === 0) return [];

  const hybridOff = isHybridOff() || !queryText.trim();
  if (hybridOff) {
    // Saf dense — searchSimilar'ın skorlama yolu birebir (MMR'sız; MMR downstream'de)
    if (!queryEmbedding) return [];
    return chunks
      .filter(c => c.embedding!.length === queryEmbedding.length)
      .map(c => ({ chunk: c, score: cosineSimilarity(queryEmbedding, c.embedding!) }))
      .filter(r => r.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  const scopeKey = projectId ? `project:${projectId}` : `conv:${conversationId}`;
  const versionKey = getCorpusVersionKey(projectId, conversationId);
  const index = getLexicalIndex(`${scopeKey}|${versionKey}`, chunks);
  const queryTokens = tokenizeTr(queryText);

  const results = hybridRank(chunks, queryEmbedding, queryTokens, index, { topK, threshold });

  if (typeof localStorage !== 'undefined' && localStorage.getItem('rag-hybrid-debug') === '1') {
    console.table(results.map(r => ({
      file: r.chunk.metadata?.fileName,
      chunk: r.chunk.metadata?.chunkIndex,
      score: r.score.toFixed(3),
      preview: r.chunk.content.slice(0, 60),
    })));
  }
  return results;
}

/**
 * Maximal Marginal Relevance selection
 * Balances relevance to query with diversity among results.
 * Exported: ragService birleşik (proje+sohbet) aday havuzu üzerinde TEK
 * MMR seçimi yapar — per-scope MMR + raw-score re-sort çeşitliliği bozuyordu.
 */
export function selectWithMmr(
  candidates: SearchResult[],
  queryEmbedding: number[],
  k: number,
  lambda: number
): SearchResult[] {
  const selected: SearchResult[] = [];
  const remaining = [...candidates];
  
  // Select the most relevant document first
  if (remaining.length > 0) {
    selected.push(remaining.shift()!);
  }
  
  // Select remaining documents using MMR
  while (selected.length < k && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      
      // Calculate max similarity to already selected documents
      let maxSimToSelected = 0;
      for (const sel of selected) {
        const sim = cosineSimilarity(candidate.chunk.embedding!, sel.chunk.embedding!);
        maxSimToSelected = Math.max(maxSimToSelected, sim);
      }
      
      // MMR score: λ * relevance - (1 - λ) * max_similarity_to_selected
      const mmrScore = lambda * candidate.score - (1 - lambda) * maxSimToSelected;
      
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }
    
    selected.push(remaining.splice(bestIdx, 1)[0]);
  }
  
  return selected;
}

/**
 * Search for chunks by document ID
 */
export async function getChunksByDocumentId(documentId: string): Promise<LocalChunk[]> {
  return await localDb.chunks
    .where('documentId')
    .equals(documentId)
    .toArray();
}

/**
 * Search for chunks by project ID
 */
export async function getChunksByProjectId(projectId: string): Promise<LocalChunk[]> {
  return await localDb.chunks
    .where('projectId')
    .equals(projectId)
    .toArray();
}

/**
 * Delete all chunks for a document
 */
export async function deleteChunksByDocumentId(documentId: string): Promise<number> {
  // Silmeden önce scope'u öğren ki retrieval cache doğru invalidate edilsin
  const sample = await localDb.chunks
    .where('documentId')
    .equals(documentId)
    .first();
  const deleted = await localDb.chunks
    .where('documentId')
    .equals(documentId)
    .delete();
  if (deleted > 0 && sample) {
    if (sample.projectId) bumpCorpusVersion(`project:${sample.projectId}`);
    if (sample.conversationId) bumpCorpusVersion(`conv:${sample.conversationId}`);
  }
  return deleted;
}

/**
 * Delete all chunks for a project
 */
export async function deleteChunksByProjectId(projectId: string): Promise<number> {
  const deleted = await localDb.chunks
    .where('projectId')
    .equals(projectId)
    .delete();
  if (deleted > 0) {
    bumpCorpusVersion(`project:${projectId}`);
  }
  return deleted;
}

/**
 * Get statistics about indexed chunks
 */
export async function getChunkStats(): Promise<{
  totalChunks: number;
  chunksWithEmbeddings: number;
  chunksByProject: Record<string, number>;
}> {
  const allChunks = await localDb.chunks.toArray();
  
  const chunksWithEmbeddings = allChunks.filter(
    c => c.embedding !== undefined && c.embedding.length > 0
  ).length;
  
  const chunksByProject: Record<string, number> = {};
  for (const chunk of allChunks) {
    if (chunk.projectId) {
      chunksByProject[chunk.projectId] = (chunksByProject[chunk.projectId] || 0) + 1;
    }
  }
  
  return {
    totalChunks: allChunks.length,
    chunksWithEmbeddings,
    chunksByProject,
  };
}
