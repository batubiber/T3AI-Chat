/**
 * RAG Service - Coordinates chunking, embedding, and retrieval
 * Main entry point for RAG operations
 */

import { localDb, generateId, type LocalChunk, type LocalProjectFile } from './localDb';
import { chunkFile, derivePageNumbers, type TextChunk } from './textChunker';
import { estimateTokens } from './tokenEstimator';
import { getEmbedding, getEmbeddingsInBatches, checkEmbeddingServiceHealth, type EmbeddingProgress } from './embeddingService';
import { searchHybrid, selectWithMmr, deleteChunksByDocumentId, type SearchResult } from './vectorSearch';
import { isHybridOff } from './lexicalSearch';
import { classifyQuery, getRetrievalParams } from './queryClassifier';
import { compressChunk } from './contextualCompressor';
import { formatChunkHeader } from './htmlTable';
import { citEtiketi, type CodeLanguage } from './codeLanguages';
import {
  bumpCorpusVersion,
  bumpAllCorpusVersions,
  getCorpusVersionKey,
  normalizeQueryKey,
  getCachedRagContext,
  setCachedRagContext,
} from './retrievalCache';

export interface IndexingResult {
  success: boolean;
  chunksCreated: number;
  error?: string;
}

export interface IndexingProgress {
  fileId: string;
  fileName: string;
  phase: 'chunking' | 'embedding' | 'storing';
  current: number;
  total: number;
}

/**
 * Kullanıcıya gösterilen kaynak künyesi.
 *
 * `pageNumber` chunk metadata'sında zaten vardı ama buraya konmuyordu; kullanıcı
 * pasajı belgede bulabilsin diye eklendi.
 *
 * `retrieval` ayrı bir alan: eskiden konuşma-yedeği yolu score=0 yazıyordu ve
 * bu "alaka %0" gibi okunabilirdi. Yedek yol SIRALAMA yapmıyor, skoru yok —
 * bunu skoru sıfırlamak yerine açıkça söylemek gerekiyor.
 */
export interface RagSource {
  fileName: string;
  chunkIndex: number;
  /** Kod dosyalarında satır aralığı — künyede "sat.120-180" olarak görünür */
  startLine?: number;
  endLine?: number;
  /** Anlamsal aramada benzerlik skoru; 'conversation' yolunda anlamsız */
  score: number;
  pageNumber?: number;
  retrieval: 'search' | 'conversation';
}

export interface RagContext {
  content: string;
  sources: RagSource[];
  tokensEstimate: number;
}

/**
 * Parçanın KOD alanlarını kayda taşır.
 *
 * Metadata elle kopyalanıyordu ve satır aralığı/dil sessizce düşüyordu: parça
 * doğru bölünse bile alıntıda satır numarası çıkmıyor, modele giden blok
 * çitlenmiyordu. İki kayıt yolunda da aynı yardımcı kullanılıyor.
 */
function kodAlanlari(m: TextChunk['metadata']) {
  return {
    ...(m.startLine !== undefined ? { startLine: m.startLine, endLine: m.endLine } : {}),
    ...(m.language ? { language: m.language } : {}),
    ...(m.symbol ? { symbol: m.symbol } : {}),
  };
}

/**
 * Bağlama giden parçayı biçimler.
 *
 * Kod parçası markdown kod çitiyle sarılıyor ve dil etiketi yazılıyor: model
 * bunun Rust mı C mi olduğunu bilsin, cevabındaki kod bloğu da doğru renklensin.
 * Başlık da satır aralıklı ("dosya.py:120-180") — model kullanıcıya doğrudan
 * işe yarar bir adres verebilsin.
 */
function kodBloguBicimle(metadata: LocalChunk['metadata'], icerik: string): string {
  const baslik = formatChunkHeader(metadata?.fileName, metadata?.pageNumber, {
    startLine: metadata?.startLine,
    endLine: metadata?.endLine,
  });
  const dil = metadata?.language;
  if (!dil) return `${baslik}\n${icerik}`;
  return `${baslik}\n\`\`\`${citEtiketi(dil as CodeLanguage)}\n${icerik}\n\`\`\``;
}

/**
 * Simple hash for chunk content deduplication (djb2 algorithm)
 */
function hashContent(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) & 0xffffffff;
  }
  return hash.toString(36);
}

// Default settings
const DEFAULT_MAX_CONTEXT_TOKENS = 12000;
// Scope başına ham aday sayısı çarpanı (fetch_k): nihai seçim topK*2'ye iner,
// MMR'ın seçecek alternatifi olsun diye havuz bunun üstünde tutulur.
const CANDIDATE_MULTIPLIER = 4;

/**
 * Index a project file - chunk it, get embeddings, store in IndexedDB
 */
export async function indexDocument(
  projectId: string,
  file: LocalProjectFile,
  onProgress?: (progress: IndexingProgress) => void
): Promise<IndexingResult> {
  try {
    // Check if embedding service is available
    const health = await checkEmbeddingServiceHealth();
    if (!health.available) {
      return {
        success: false,
        chunksCreated: 0,
        error: `Embedding servisi kullanılamıyor: ${health.error}`,
      };
    }
    
    // Phase 1: Chunking
    onProgress?.({
      fileId: file.id,
      fileName: file.name,
      phase: 'chunking',
      current: 0,
      total: 1,
    });

    const chunks = chunkFile(file.name, file.content);
    const pageNumbers = derivePageNumbers(chunks);

    if (chunks.length === 0) {
      await deleteChunksByDocumentId(file.id);
      return {
        success: true,
        chunksCreated: 0,
      };
    }

    // Compute content hashes for deduplication
    const chunkHashes = chunks.map(c => hashContent(c.content));

    // Load existing chunks for this project to check for duplicates
    const existingChunks = await localDb.chunks
      .where('projectId')
      .equals(projectId)
      .filter(c => c.documentId !== file.id && c.metadata?.contentHash !== undefined)
      .toArray();

    const existingHashSet = new Set(
      existingChunks.map(c => c.metadata!.contentHash!)
    );

    // Identify which chunks are new (not duplicated in other documents)
    const newChunkIndices: number[] = [];
    const duplicateChunkIndices: number[] = [];
    for (let i = 0; i < chunks.length; i++) {
      if (existingHashSet.has(chunkHashes[i])) {
        duplicateChunkIndices.push(i);
      } else {
        newChunkIndices.push(i);
      }
    }

    // Delete existing chunks for this document (re-index scenario)
    await deleteChunksByDocumentId(file.id);

    // Phase 2: Get embeddings only for new (non-duplicate) chunks
    const textsToEmbed = newChunkIndices.map(i => chunks[i].content);

    let newEmbeddings: number[][] = [];
    if (textsToEmbed.length > 0) {
      newEmbeddings = await getEmbeddingsInBatches(textsToEmbed, {
        batchSize: 10,
        onProgress: (embeddingProgress) => {
          onProgress?.({
            fileId: file.id,
            fileName: file.name,
            phase: 'embedding',
            current: embeddingProgress.current,
            total: embeddingProgress.total,
          });
        },
      });
    }

    // Phase 3: Store chunks with embeddings
    onProgress?.({
      fileId: file.id,
      fileName: file.name,
      phase: 'storing',
      current: 0,
      total: chunks.length,
    });

    // Build embedding map for new chunks
    const embeddingMap = new Map<number, number[]>();
    newChunkIndices.forEach((chunkIdx, embIdx) => {
      embeddingMap.set(chunkIdx, newEmbeddings[embIdx]);
    });

    // For duplicate chunks, reuse embedding from existing chunk
    for (const dupIdx of duplicateChunkIndices) {
      const matchingChunk = existingChunks.find(
        c => c.metadata?.contentHash === chunkHashes[dupIdx]
      );
      if (matchingChunk?.embedding) {
        embeddingMap.set(dupIdx, matchingChunk.embedding);
      }
    }

    const chunkRecords: LocalChunk[] = chunks
      .map((chunk, index) => {
        const embedding = embeddingMap.get(index);
        if (!embedding) return null;
        return {
          id: generateId(),
          documentId: file.id,
          projectId,
          content: chunk.content,
          embedding,
          metadata: {
            fileName: file.name,
            chunkIndex: chunk.metadata.chunkIndex,
            ...(pageNumbers[index] !== undefined ? { pageNumber: pageNumbers[index] } : {}),
            ...kodAlanlari(chunk.metadata),
            contentHash: chunkHashes[index],
          },
          createdAt: new Date(),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null) as LocalChunk[];

    await localDb.chunks.bulkAdd(chunkRecords);
    bumpCorpusVersion(`project:${projectId}`);

    onProgress?.({
      fileId: file.id,
      fileName: file.name,
      phase: 'storing',
      current: chunks.length,
      total: chunks.length,
    });

    if (duplicateChunkIndices.length > 0) {
      console.log(`RAG dedup: skipped embedding for ${duplicateChunkIndices.length}/${chunks.length} duplicate chunks in ${file.name}`);
    }

    return {
      success: true,
      chunksCreated: chunkRecords.length,
    };
  } catch (error) {
    console.error('Error indexing document:', error);
    return {
      success: false,
      chunksCreated: 0,
      error: error instanceof Error ? error.message : 'Bilinmeyen hata',
    };
  }
}

/**
 * Index a document attached to a chat conversation (session-scoped).
 * Chunks are stored with conversationId so they're isolated to that chat
 * and cleaned up when the conversation is deleted.
 */
export async function indexConversationDocument(
  conversationId: string,
  fileName: string,
  content: string,
  onProgress?: (progress: IndexingProgress) => void
): Promise<IndexingResult & { documentId?: string }> {
  const documentId = generateId();
  try {
    const health = await checkEmbeddingServiceHealth();
    if (!health.available) {
      return {
        success: false,
        chunksCreated: 0,
        error: `Embedding servisi kullanılamıyor: ${health.error}`,
      };
    }

    onProgress?.({ fileId: documentId, fileName, phase: 'chunking', current: 0, total: 1 });

    const chunks = chunkFile(fileName, content);
    const pageNumbers = derivePageNumbers(chunks);
    if (chunks.length === 0) {
      return { success: true, chunksCreated: 0, documentId };
    }

    const embeddings = await getEmbeddingsInBatches(
      chunks.map(c => c.content),
      {
        batchSize: 10,
        onProgress: (p) => onProgress?.({
          fileId: documentId,
          fileName,
          phase: 'embedding',
          current: p.current,
          total: p.total,
        }),
      }
    );

    const records: LocalChunk[] = chunks.map((chunk, i) => ({
      id: generateId(),
      documentId,
      conversationId,
      content: chunk.content,
      embedding: embeddings[i],
      metadata: {
        fileName,
        chunkIndex: chunk.metadata.chunkIndex,
        ...(pageNumbers[i] !== undefined ? { pageNumber: pageNumbers[i] } : {}),
        ...kodAlanlari(chunk.metadata),
      },
      createdAt: new Date(),
    }));

    await localDb.chunks.bulkAdd(records);
    bumpCorpusVersion(`conv:${conversationId}`);
    onProgress?.({ fileId: documentId, fileName, phase: 'storing', current: chunks.length, total: chunks.length });

    return { success: true, chunksCreated: records.length, documentId };
  } catch (error) {
    console.error('Error indexing conversation document:', error);
    return {
      success: false,
      chunksCreated: 0,
      error: error instanceof Error ? error.message : 'Bilinmeyen hata',
      documentId,
    };
  }
}


/**
 * Index all files in a project
 */
export async function indexProjectFiles(
  projectId: string,
  files: LocalProjectFile[],
  onProgress?: (fileIndex: number, totalFiles: number, progress: IndexingProgress) => void
): Promise<{ successful: number; failed: number; errors: string[] }> {
  let successful = 0;
  let failed = 0;
  const errors: string[] = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    const result = await indexDocument(projectId, file, (progress) => {
      onProgress?.(i, files.length, progress);
    });
    
    if (result.success) {
      successful++;
    } else {
      failed++;
      if (result.error) {
        errors.push(`${file.name}: ${result.error}`);
      }
    }
  }
  
  return { successful, failed, errors };
}

/**
 * Build context from search results for LLM
 */
export async function buildContextFromSearch(
  query: string,
  projectId: string,
  options?: {
    maxTokens?: number;
    topK?: number;
    threshold?: number;
    skipDocumentSearch?: boolean;
    conversationId?: string;
  }
): Promise<RagContext | null> {
  const maxTokens = options?.maxTokens || DEFAULT_MAX_CONTEXT_TOKENS;
  const conversationId = options?.conversationId;
  // If we have a conversation-scoped doc to search, never skip doc search.
  const skipDocumentSearch = conversationId ? false : (options?.skipDocumentSearch ?? false);

  // Classify query and get adaptive retrieval parameters
  const queryType = classifyQuery(query);
  const adaptiveParams = getRetrievalParams(queryType);

  // Çağıran doküman aramasını açıkça kapattıysa aranacak korpus yok
  // (sistem bilgi bankası kaldırıldı).
  if (skipDocumentSearch) {
    return null;
  }

  // Skip retrieval entirely for conversational queries (greetings, thanks, etc.)
  // AMA sohbete eklenmiş doküman varsa atlanmaz: "tamam özetle" + ekli PDF
  // önceden görünmez kalıyordu. Karar ucuz index-only count ile verilir.
  if (adaptiveParams.skipRetrieval) {
    const convChunkCount = conversationId
      ? await localDb.chunks.where('conversationId').equals(conversationId).count()
      : 0;
    if (convChunkCount === 0) {
      return null;
    }
  }

  // Use adaptive params as defaults, but allow explicit overrides from caller
  const topK = options?.topK ?? adaptiveParams.topK;
  const threshold = options?.threshold ?? adaptiveParams.threshold;
  const mmrLambda = adaptiveParams.mmrLambda;

  // Retrieval cache: anahtar, sonucu etkileyen her şeyi içerir (çözülmüş
  // parametreler + scope + corpus versiyonu). Corpus değişince versiyon
  // bump edilir ve eski anahtarlar bir daha eşleşmez.
  const versionKeyAtStart = getCorpusVersionKey(projectId || undefined, conversationId);
  const hybridEnabled = !isHybridOff();
  const cacheKey =
    `${normalizeQueryKey(query)}|p:${projectId || '-'}|c:${conversationId || '-'}` +
    `|k${topK}|t${threshold}|mt${maxTokens}|l${mmrLambda}|h${hybridEnabled ? 1 : 0}|v${versionKeyAtStart}`;
  const cachedResult = getCachedRagContext(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }
  // Eşzamanlı indeksleme yarışına karşı: set'ten önce versiyon tekrar kontrol edilir
  const cacheResultIfFresh = (result: RagContext): RagContext => {
    if (getCorpusVersionKey(projectId || undefined, conversationId) === versionKeyAtStart) {
      setCachedRagContext(cacheKey, result);
    }
    return result;
  };

  try {
    const sources: RagContext['sources'] = [];
    const contextParts: string[] = [];
    let currentTokens = 0;

    // topK=0 (conversational + ekli doküman): semantic search TASARIM GEREĞİ
    // devre dışı — embedding'e hiç gitmeden doğrudan fallback'e düşülür.
    const searchEnabled = topK > 0;

    // Query embedding 4sn deadline ile: embedding yavaş/erişilemezse RAG'i BEKLEMEDEN geç
    // (fail-open) — sohbet mesajı asla embedding retry'ına takılmaz.
    const queryEmbedding: number[] | null = searchEnabled
      ? await Promise.race([
          getEmbedding(query),
          new Promise<number[] | null>((resolve) => setTimeout(() => resolve(null), 4000)),
        ]).catch(() => null)
      : null;

    // Degrade: arama İSTENDİ ama embedding deadline'da gelmedi. topK=0 yolu
    // degrade DEĞİLDİR (bilinçli atlama) — marker basılmaz, sonuç cache'lenir.
    const embeddingDegraded = searchEnabled && !queryEmbedding;

    // Fail-open: embedding 4sn deadline'ında gelmediyse deadline'sız İKİNCİ
    // denemeye GİRME (eskiden mesaj ~12sn daha bloklanıyordu). Semantic search
    // atlanır; sohbete ekli doküman varsa aşağıdaki fallback yine devreye girer.
    let results: SearchResult[] = [];
    if (searchEnabled) {
      // Sohbet scope'u ÖNCE aranır: dedup ilk görüleni tutar (bkz. v2.1.21 notu).
      // queryEmbedding null olabilir → searchHybrid lexical-only çalışır (degrade
      // modu artık kör değil: kelime eşleşmesiyle arama yapılır).
      const searches: Promise<SearchResult[]>[] = [];
      if (conversationId) {
        searches.push(searchHybrid(queryEmbedding, query, {
          conversationId,
          topK: topK * CANDIDATE_MULTIPLIER,
          threshold,
        }));
      }
      if (projectId) {
        searches.push(searchHybrid(queryEmbedding, query, {
          projectId,
          topK: topK * CANDIDATE_MULTIPLIER,
          threshold,
        }));
      }
      const merged = (await Promise.all(searches)).flat();

      // Aynı dosya hem projede hem sohbette indeksliyse exact-dup ayıkla.
      // Anahtar tüm adaylar için İÇERİĞİN KENDİSİ: sohbet chunk'larında
      // contentHash yok, karışık anahtar (hash vs içerik) cross-scope dup'ı
      // yakalayamazdı. Aday sayısı sınırlı → string-key maliyeti önemsiz.
      const seenContents = new Set<string>();
      const candidates = merged.filter(r => {
        if (seenContents.has(r.chunk.content)) return false;
        seenContents.add(r.chunk.content);
        return true;
      });
      candidates.sort((a, b) => b.score - a.score);

      // Havuz (≤ topK*4/scope) nihai k'dan (topK*2) büyük tutulur ki MMR tek
      // scope'lu yaygın durumda da GERÇEKTEN seçim yapabilsin. k=topK*2:
      // mevcut etkin genişlik korunuyor (bütçe döngüsü zaten keser); topK
      // kontratına indirme, chunk-boyutu/topK tuning işiyle birlikte yapılmalı.
      results = candidates.length > topK * 2
        ? selectWithMmr(candidates, queryEmbedding, topK * 2, mmrLambda)
        : candidates;
    }

    /* SIKIŞTIRMA ARTIK KOŞULLU. Eskiden her parça koşulsuz `compressChunk`'tan
       geçiyor, sonra bütçe kontrol ediliyordu: doğru parçayı buluyor, cevabı
       içinden kırpıp atıyorduk — üstelik bütçenin çoğu boş dururken.
       Ölçüldü: 108 vakanın 2'sinde hedef parça GETİRİLDİĞİ HÂLDE beklenen
       bilgi bağlama girmiyordu, bütçenin %62'si kullanılmamışken.

       `break` yerine `continue`: sığmayan tek bir büyük parça sıradaki küçük
       ve alakalı parçaları da düşürüyordu. */
    for (const result of results) {
      const tamMetin = result.chunk.content;
      let metin = tamMetin;
      let chunkTokens = estimateTokens(metin);

      if (currentTokens + chunkTokens > maxTokens) {
        // Bütçe daraldı: ancak ŞİMDİ sıkıştır ve yeniden dene.
        metin = compressChunk(tamMetin, query);
        chunkTokens = estimateTokens(metin);
        if (currentTokens + chunkTokens > maxTokens) {
          continue;
        }
      }

      contextParts.push(kodBloguBicimle(result.chunk.metadata, metin));

      sources.push({
        fileName: result.chunk.metadata?.fileName || 'Bilinmeyen dosya',
        chunkIndex: result.chunk.metadata?.chunkIndex || 0,
        score: result.score,
        ...(result.chunk.metadata?.pageNumber ? { pageNumber: result.chunk.metadata.pageNumber } : {}),
        ...(result.chunk.metadata?.startLine !== undefined
          ? { startLine: result.chunk.metadata.startLine, endLine: result.chunk.metadata.endLine }
          : {}),
        retrieval: 'search',
      });

      currentTokens += chunkTokens;
    }

    // Conversation-attached documents should be visible to the model even when
    // semantic search misses (common with XLSX/table questions and short labels).
    if (conversationId && !results.some(result => result.chunk.conversationId === conversationId)) {
      const conversationChunks = await localDb.chunks
        .where('conversationId')
        .equals(conversationId)
        .toArray();
      conversationChunks.sort((a, b) => (a.metadata?.chunkIndex || 0) - (b.metadata?.chunkIndex || 0));

      for (const chunk of conversationChunks) {
        const chunkTokens = estimateTokens(chunk.content);
        if (currentTokens + chunkTokens > maxTokens) break;

        contextParts.push(kodBloguBicimle(chunk.metadata, chunk.content));
        sources.push({
          fileName: chunk.metadata?.fileName || 'Bilinmeyen dosya',
          chunkIndex: chunk.metadata?.chunkIndex || 0,
          score: 0,
          ...(chunk.metadata?.pageNumber ? { pageNumber: chunk.metadata.pageNumber } : {}),
          ...(chunk.metadata?.startLine !== undefined
            ? { startLine: chunk.metadata.startLine, endLine: chunk.metadata.endLine }
            : {}),
          retrieval: 'conversation',
        });
        currentTokens += chunkTokens;
      }
    }

    // Degrade modda (embedding deadline aşıldı) model bağlamın eksik olabileceğini
    // bilsin. Kill-switch açıkken lexical arama da ÇALIŞMADI — metin ona göre seçilir
    // (v2.1.22 metniyle birebir kalır).
    if (embeddingDegraded && contextParts.length > 0) {
      contextParts.push(hybridEnabled
        ? '(Not: anlamsal arama şu an kullanılamadı; yalnızca kelime eşleşmesiyle arama yapıldı. Sonuçlar eksik olabilir.)'
        : '(Not: semantik arama şu an kullanılamadı; yalnızca sohbete eklenmiş dokümanın içeriği dahil edildi, proje dosyaları aranamadı.)');
    }

    if (contextParts.length === 0) {
      return null;
    }

    const finalResult: RagContext = {
      content: contextParts.join('\n\n---\n\n'),
      sources,
      tokensEstimate: currentTokens,
    };
    // Degrade (embedding gelmedi) kurulan sonucu CACHE'LEME — 10 dk boyunca
    // sağlıklı semantic search sonuçlarının yerine geçmesin. topK=0 yolu
    // degrade değildir ve normal cache'lenir (corpus bump'ı invalidate eder).
    return embeddingDegraded ? finalResult : cacheResultIfFresh(finalResult);
  } catch (error) {
    console.error('Error building RAG context:', error);
    return null;
  }
}

/**
 * Get chunk count for a project
 */
export async function getProjectChunkCount(projectId: string): Promise<number> {
  const chunks = await localDb.chunks
    .filter(c => c.projectId === projectId)
    .count();
  return chunks;
}

/**
 * Get chunk count for a specific document
 */
export async function getDocumentChunkCount(documentId: string): Promise<number> {
  return await localDb.chunks
    .where('documentId')
    .equals(documentId)
    .count();
}

/**
 * RAG uygunluğu — NON-BLOCKING.
 * Cache'lenmiş durumu ANINDA döner; bayatsa arka planda (await'siz) tazeler.
 * Böylece hiçbir mesaj /api/embed/health'i BEKLEMEZ (eskiden her mesajda await
 * ediliyordu → embedding down'ken ~2sn gecikme). Firewall açılınca ≤15sn'de RAG döner.
 */
let ragHealthCached = false;
let ragLastProbeAt = 0;
let ragProbeInFlight = false;
const RAG_PROBE_TTL_MS = 15000;

function refreshRagHealthInBackground(): void {
  if (ragProbeInFlight) return;
  if (Date.now() - ragLastProbeAt < RAG_PROBE_TTL_MS) return; // taze → tekrar çekme
  ragProbeInFlight = true;
  checkEmbeddingServiceHealth()
    .then((h) => { ragHealthCached = h.available; })
    .catch(() => { ragHealthCached = false; })
    .finally(() => { ragLastProbeAt = Date.now(); ragProbeInFlight = false; });
}

export async function isRagAvailable(): Promise<boolean> {
  refreshRagHealthInBackground(); // bayatsa arka planda tazele — AWAIT YOK
  return ragHealthCached;         // cache'i ANINDA dön (0 gecikme)
}

/** Uygulama açılışında çağrılır: health probe'unu erkenden ateşler ki ilk mesaj
 *  (özellikle döküman yükleyip sorunca) cache ısınmış olsun ve RAG'i atlamasın. */
export function primeRagHealth(): void {
  refreshRagHealthInBackground();
}

/**
 * Cleanup orphaned chunks - chunks whose documentId no longer exists in projectFiles
 * Should be called once on app startup
 */
export async function cleanupOrphanedChunks(): Promise<number> {
  try {
    const allChunks = await localDb.chunks.toArray();
    if (allChunks.length === 0) return 0;

    // Sistem bilgi bankası kaldırıldı: eski '__system_knowledge__' chunk'larının
    // documentId'si projectFiles'ta olmadığından burada otomatik süpürülürler.
    const userChunks = allChunks.filter(c => !c.conversationId);

    const allFileIds = new Set(
      (await localDb.projectFiles.toArray()).map(f => f.id)
    );

    const orphanedIds = userChunks
      .filter(c => c.documentId && !allFileIds.has(c.documentId))
      .map(c => c.id);

    if (orphanedIds.length > 0) {
      await localDb.chunks.bulkDelete(orphanedIds);
      bumpAllCorpusVersions();
      console.log(`🧹 Cleaned up ${orphanedIds.length} orphaned chunks`);
    }

    return orphanedIds.length;
  } catch (error) {
    console.error('Error cleaning up orphaned chunks:', error);
    return 0;
  }
}

/**
 * Get RAG service status
 */
export async function getRagStatus(): Promise<{
  available: boolean;
  model?: string;
  dimension?: number;
  error?: string;
}> {
  return await checkEmbeddingServiceHealth();
}
