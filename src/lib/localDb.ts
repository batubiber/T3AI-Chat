import type { RagSource } from './ragService';
import type { TurBilgisi } from './turBilgisi';
import Dexie, { type EntityTable } from 'dexie';
import type { DisaGirdi, Hazir } from './projeAktarma';
import { bumpAllCorpusVersions } from './retrievalCache';

// Database interfaces
export interface LocalProject {
  id: string;
  name: string;
  description?: string;
  instructions?: string;  // System prompt - her sohbete eklenir
  memory?: string;        // Proje bağlamı/notları
  createdAt: Date;
  updatedAt: Date;
}

export interface LocalProjectFile {
  id: string;
  projectId: string;
  name: string;
  content: string;        // Dosya içeriği (text olarak)
  mimeType: string;
  size: number;
  createdAt: Date;
}

export interface LocalConversation {
  id: string;
  title: string;
  projectId?: string;     // Proje bağlantısı (opsiyonel)
  createdAt: Date;
  updatedAt: Date;
  /** Konuşma özeti (token-based context management için) */
  summary?: string;
  /** Özet için kullanılan token sayısı */
  summaryTokens?: number;
  /** Son özetleme tarihi */
  lastSummarizedAt?: Date;
  /** Özete dahil edilen (baştan itibaren) mesaj sayısı — re-summarization sınırı */
  summarizedCount?: number;
  /** Fork edildiği orijinal conversation ID */
  forkedFromConversationId?: string;
  /** Fork noktası mesaj ID */
  forkedAtMessageId?: string;
  /** Favori mi? */
  isFavorite?: boolean;
}

export interface LocalMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  rawContent?: string;
  images?: string[];
  createdAt: Date;
  /** Fork bilgisi - orijinal mesaj ID'si */
  forkedFrom?: string;
  /** Mesajı oluşturan model ID'si */
  modelId?: string;
  /** Belge düzenleme artifact'i — varsa mesajda kart gösterilir */
  artifactId?: string;
  /** RAG'in bu cevap için kullandığı belge parçaları. İndekslenmiyor: yalnız
   *  mesajla birlikte okunuyor, sorgulanmıyor → şema sürümü artmıyor. */
  sources?: RagSource[];
  /** Yanıt uzunluk sınırına takılıp yarım kaldı mı (finish_reason: length). */
  kesildi?: boolean;
  /** Modelin proje hafızasına eklemeyi önerdiği bilgi; kullanıcı karar verene
   *  kadar duruyor, karardan sonra siliniyor. */
  hafizaOnerisi?: string;
  /** Geri sarma ile bırakıldı: görünmüyor ve modele gönderilmiyor, ama
   *  SİLİNMİYOR — geri alınabilsin diye kayıtta duruyor. */
  geriSarildi?: boolean;
  /** Bu turda modele NE GİTTİĞİNİN kaydı — kaç mesaj, ne kısaltıldı, özet
   *  devrede miydi. İndekslenmiyor: yalnız mesajla okunuyor → şema sürümü
   *  artmıyor. Tamamen yerel, hiçbir yere gönderilmiyor. */
  turBilgisi?: TurBilgisi;
}

export interface LocalDocument {
  id: string;
  name: string;
  content: string;
  createdAt: Date;
}

export interface LocalChunk {
  id: string;
  documentId: string;
  projectId?: string;       // Proje bazlı filtreleme için
  conversationId?: string;  // Sohbet bazlı RAG için
  content: string;
  embedding?: number[];     // Vektör (1024 dim)
  metadata?: {
    fileName?: string;
    pageNumber?: number;
    chunkIndex?: number;
    contentHash?: string;
    /** Kod dosyalarında satır aralığı (1-tabanlı, dahil). İNDEKSLENMİYOR:
     *  yalnız chunk ile birlikte okunuyor → şema sürümü artmıyor. */
    startLine?: number;
    endLine?: number;
    /** Kod dili — bağlama giden blok bu etiketle çitleniyor */
    language?: string;
    /** İçinde bulunduğu bildirimin adı */
    symbol?: string;
  };
  createdAt: Date;
}

export interface LocalUsageLog {
  id: string;
  weekStart: string; // YYYY-MM-DD format (Monday of the week)
  userIdentifier: string; // Browser fingerprint or random ID
  model: string;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
  createdAt: Date;
}

export interface EmbeddingCacheEntry {
  key: string; // `${modelNamespace}|${hashAlgo}:${hash}` - content-addressed, model-namespaced
  embedding: Float32Array;
  dim: number;
  createdAt: number; // epoch ms
  lastUsedAt: number; // epoch ms (LRU eviction index)
}

// Dexie database class
/**
 * Belge düzenleme artifact'i — sohbeti tekrar açınca panel geri gelsin.
 *
 * SONUÇ dosyası saklanır, orijinal DEĞİL (kullanıcı kararı): indirme her zaman
 * çalışır ve tek kopya yeter. Bedeli, sonradan kabul/reddet seçiminin
 * değiştirilememesi — orijinal elde olmadığı için yeniden uygulanamaz.
 *
 * editedBlob YOKSA yazma kotaya takılmıştır; önizleme ve liste yine durur,
 * yalnız indirme için dosyanın yeniden eklenmesi gerekir.
 */
export interface LocalDocxArtifact {
  id: string;
  conversationId: string;
  fileName: string;
  /** Kullanıcının verdiği talimat */
  instruction: string;
  /** Düzenlenmiş .docx — kota hatasında undefined kalır */
  editedBlob?: Blob;
  /** Panelde gösterilecek render edilmiş HTML (işaretli) */
  previewHtml: string;
  /** Uygulanan değişiklik sayısı */
  editCount: number;
  createdAt: Date;
}

class LocalChatDB extends Dexie {
  projects!: EntityTable<LocalProject, 'id'>;
  projectFiles!: EntityTable<LocalProjectFile, 'id'>;
  conversations!: EntityTable<LocalConversation, 'id'>;
  messages!: EntityTable<LocalMessage, 'id'>;
  documents!: EntityTable<LocalDocument, 'id'>;
  chunks!: EntityTable<LocalChunk, 'id'>;
  usageLogs!: EntityTable<LocalUsageLog, 'id'>;
  embeddingCache!: EntityTable<EmbeddingCacheEntry, 'key'>;
  docxArtifacts!: EntityTable<LocalDocxArtifact, 'id'>;

  constructor() {
    super('T3AIChatDB');
    
    this.version(1).stores({
      conversations: 'id, createdAt, updatedAt',
      messages: 'id, conversationId, createdAt',
      documents: 'id, createdAt',
      chunks: 'id, documentId, createdAt',
    });

    this.version(2).stores({
      projects: 'id, createdAt, updatedAt',
      projectFiles: 'id, projectId, createdAt',
      conversations: 'id, projectId, createdAt, updatedAt',
      messages: 'id, conversationId, createdAt',
      documents: 'id, createdAt',
      chunks: 'id, documentId, createdAt',
    });

    this.version(3).stores({
      projects: 'id, createdAt, updatedAt',
      projectFiles: 'id, projectId, createdAt',
      conversations: 'id, projectId, createdAt, updatedAt',
      messages: 'id, conversationId, createdAt',
      documents: 'id, createdAt',
      chunks: 'id, documentId, createdAt',
      usageLogs: 'id, weekStart, userIdentifier, createdAt',
    });

    // Version 4: Add projectId and conversationId indexes to chunks for RAG
    this.version(4).stores({
      projects: 'id, createdAt, updatedAt',
      projectFiles: 'id, projectId, createdAt',
      conversations: 'id, projectId, createdAt, updatedAt',
      messages: 'id, conversationId, createdAt',
      documents: 'id, createdAt',
      chunks: 'id, documentId, projectId, conversationId, createdAt',
      usageLogs: 'id, weekStart, userIdentifier, createdAt',
    });

    // Version 5: Persistent embedding cache (content-hash keyed, model-namespaced)
    this.version(5).stores({
      projects: 'id, createdAt, updatedAt',
      projectFiles: 'id, projectId, createdAt',
      conversations: 'id, projectId, createdAt, updatedAt',
      messages: 'id, conversationId, createdAt',
      documents: 'id, createdAt',
      chunks: 'id, documentId, projectId, conversationId, createdAt',
      usageLogs: 'id, weekStart, userIdentifier, createdAt',
      embeddingCache: 'key, lastUsedAt',
    });

    // Version 6: Belge düzenleme artifact'leri (sohbet kapanınca kaybolmasın)
    this.version(6).stores({
      projects: 'id, createdAt, updatedAt',
      projectFiles: 'id, projectId, createdAt',
      conversations: 'id, projectId, createdAt, updatedAt',
      messages: 'id, conversationId, createdAt',
      documents: 'id, createdAt',
      chunks: 'id, documentId, projectId, conversationId, createdAt',
      usageLogs: 'id, weekStart, userIdentifier, createdAt',
      embeddingCache: 'key, lastUsedAt',
      docxArtifacts: 'id, conversationId, createdAt',
    });
  }
}

// Singleton instance
export const localDb = new LocalChatDB();

// Helper functions
export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Project operations
export const projectDbOperations = {
  async getAllProjects(): Promise<LocalProject[]> {
    return await localDb.projects
      .orderBy('updatedAt')
      .reverse()
      .toArray();
  },

  async getProject(id: string): Promise<LocalProject | undefined> {
    return await localDb.projects.get(id);
  },

  async createProject(name: string, description?: string): Promise<LocalProject> {
    const now = new Date();
    const project: LocalProject = {
      id: generateId(),
      name,
      description,
      createdAt: now,
      updatedAt: now,
    };
    await localDb.projects.add(project);
    return project;
  },

  async updateProject(id: string, updates: Partial<Omit<LocalProject, 'id' | 'createdAt'>>): Promise<void> {
    await localDb.projects.update(id, { ...updates, updatedAt: new Date() });
  },

  async deleteProject(id: string): Promise<void> {
    await localDb.transaction('rw', [localDb.projects, localDb.projectFiles, localDb.conversations, localDb.messages, localDb.chunks], async () => {
      // Delete project files
      await localDb.projectFiles.where('projectId').equals(id).delete();
      // Delete project conversations and their messages (+ RAG chunk'ları — sızıntı fix)
      const conversations = await localDb.conversations.where('projectId').equals(id).toArray();
      for (const conv of conversations) {
        await localDb.messages.where('conversationId').equals(conv.id).delete();
        await localDb.chunks.where('conversationId').equals(conv.id).delete();
      }
      await localDb.chunks.where('projectId').equals(id).delete();
      await localDb.conversations.where('projectId').equals(id).delete();
      // Delete project
      await localDb.projects.delete(id);
    });
  },

  // Project Files
  async getProjectFiles(projectId: string): Promise<LocalProjectFile[]> {
    return await localDb.projectFiles
      .where('projectId')
      .equals(projectId)
      .toArray();
  },

  async addProjectFile(projectId: string, name: string, content: string, mimeType: string, size: number): Promise<LocalProjectFile> {
    const file: LocalProjectFile = {
      id: generateId(),
      projectId,
      name,
      content,
      mimeType,
      size,
      createdAt: new Date(),
    };
    await localDb.projectFiles.add(file);
    await localDb.projects.update(projectId, { updatedAt: new Date() });
    return file;
  },

  async deleteProjectFile(id: string, projectId: string): Promise<void> {
    await localDb.projectFiles.delete(id);
    await localDb.projects.update(projectId, { updatedAt: new Date() });
  },

  // Project Conversations
  async getProjectConversations(projectId: string): Promise<LocalConversation[]> {
    return await localDb.conversations
      .where('projectId')
      .equals(projectId)
      .reverse()
      .sortBy('updatedAt');
  },
};

// Conversation operations
export const localDbOperations = {
  // Conversations
  async getAllConversations(): Promise<LocalConversation[]> {
    return await localDb.conversations
      .orderBy('updatedAt')
      .reverse()
      .toArray();
  },

  async getConversationsWithoutProject(): Promise<LocalConversation[]> {
    const all = await localDb.conversations.orderBy('updatedAt').reverse().toArray();
    return all.filter(c => !c.projectId);
  },

  async createConversation(title: string, projectId?: string): Promise<LocalConversation> {
    const now = new Date();
    const conversation: LocalConversation = {
      id: generateId(),
      title,
      projectId,
      createdAt: now,
      updatedAt: now,
    };
    await localDb.conversations.add(conversation);
    if (projectId) {
      await localDb.projects.update(projectId, { updatedAt: now });
    }
    return conversation;
  },

  async updateConversationTitle(id: string, title: string): Promise<void> {
    await localDb.conversations.update(id, { title, updatedAt: new Date() });
  },

  async updateConversationTimestamp(id: string): Promise<void> {
    await localDb.conversations.update(id, { updatedAt: new Date() });
  },

  async toggleFavorite(id: string): Promise<boolean> {
    const conv = await localDb.conversations.get(id);
    if (!conv) return false;
    const newFavoriteStatus = !conv.isFavorite;
    await localDb.conversations.update(id, { isFavorite: newFavoriteStatus, updatedAt: new Date() });
    return newFavoriteStatus;
  },

  async getFavoriteConversations(): Promise<LocalConversation[]> {
    const all = await localDb.conversations.orderBy('updatedAt').reverse().toArray();
    return all.filter(c => c.isFavorite);
  },

  async updateConversationSummary(id: string, summary: string, summaryTokens: number, summarizedCount?: number): Promise<void> {
    await localDb.conversations.update(id, {
      summary,
      summaryTokens,
      ...(typeof summarizedCount === 'number' ? { summarizedCount } : {}),
      lastSummarizedAt: new Date(),
      updatedAt: new Date()
    });
  },

  async getConversationSummary(id: string): Promise<{ summary?: string; summaryTokens?: number; summarizedCount?: number } | null> {
    const conv = await localDb.conversations.get(id);
    if (!conv) return null;
    return { summary: conv.summary, summaryTokens: conv.summaryTokens, summarizedCount: conv.summarizedCount };
  },

  async getConversation(id: string): Promise<LocalConversation | undefined> {
    return await localDb.conversations.get(id);
  },

  async deleteConversation(id: string): Promise<void> {
    await localDb.transaction(
      'rw',
      [localDb.conversations, localDb.messages, localDb.chunks, localDb.docxArtifacts],
      async () => {
        await localDb.messages.where('conversationId').equals(id).delete();
        await localDb.chunks.where('conversationId').equals(id).delete(); // RAG chunk sızıntısı fix
        // Artifact'ler dosya saklıyor; silinmezse yetim kayıt olarak kota yer
        await localDb.docxArtifacts.where('conversationId').equals(id).delete();
        await localDb.conversations.delete(id);
      },
    );
  },

  async clearAllConversations(): Promise<void> {
    await localDb.transaction(
      'rw',
      [localDb.conversations, localDb.messages, localDb.chunks, localDb.docxArtifacts],
      async () => {
        await localDb.docxArtifacts.clear();
        await localDb.messages.clear();
        // Sadece conversation-scoped chunk'ları sil (proje/döküman chunk'larına dokunma)
        await localDb.chunks.filter((c) => c.conversationId !== undefined).delete();
        await localDb.conversations.clear();
      },
    );
  },

  // Messages
  async getMessagesByConversation(conversationId: string): Promise<LocalMessage[]> {
    return await localDb.messages
      .where('conversationId')
      .equals(conversationId)
      .sortBy('createdAt');
  },

  /** DİKKAT: konumsal parametreler sınırına geldi. Bir tane daha eklenecekse
   *  imza nesneye çevrilmeli. */
  async addMessage(conversationId: string, role: 'user' | 'assistant', content: string, rawContent?: string, images?: string[], modelId?: string, artifactId?: string, sources?: RagSource[]): Promise<LocalMessage> {
    const message: LocalMessage = {
      id: generateId(),
      conversationId,
      role,
      content,
      rawContent,
      images,
      modelId,
      ...(artifactId ? { artifactId } : {}),
      ...(sources && sources.length > 0 ? { sources } : {}),
      createdAt: new Date(),
    };
    await localDb.messages.add(message);
    await this.updateConversationTimestamp(conversationId);
    return message;
  },

  /**
   * Mesajı "yarım kaldı" diye işaretler.
   *
   * addMessage'a dokuzuncu bir konumsal parametre eklemek yerine ayrı işlem:
   * imza zaten sekiz parametreye ulaşmış, dokuzuncusu çağrı yerlerinde
   * okunamaz hale getirirdi.
   */
  async mesajlariGeriSar(idler: string[]): Promise<void> {
    await localDb.transaction('rw', localDb.messages, async () => {
      for (const id of idler) await localDb.messages.update(id, { geriSarildi: true });
    });
  },

  async geriSarmayiGeriAl(idler: string[]): Promise<void> {
    await localDb.transaction('rw', localDb.messages, async () => {
      for (const id of idler) await localDb.messages.update(id, { geriSarildi: undefined });
    });
  },

  async mesajaHafizaOnerisiYaz(id: string, oneri: string): Promise<void> {
    await localDb.messages.update(id, { hafizaOnerisi: oneri });
  },

  /** Turun bağlam kaydını mesaja iliştirir. */
  async mesajaTurBilgisiYaz(id: string, bilgi: TurBilgisi): Promise<void> {
    await localDb.messages.update(id, { turBilgisi: bilgi });
  },

  /** Kullanıcı karar verdi (ekledi ya da yoksaydı): öneri artık gösterilmemeli. */
  async mesajHafizaOnerisiniTemizle(id: string): Promise<void> {
    await localDb.messages.update(id, { hafizaOnerisi: undefined });
  },

  async mesajiKesikIsaretle(id: string): Promise<void> {
    await localDb.messages.update(id, { kesildi: true });
  },

  async updateMessage(id: string, content: string, rawContent?: string): Promise<void> {
    const updateData: Partial<LocalMessage> = { content };
    if (rawContent !== undefined) {
      updateData.rawContent = rawContent;
    }
    await localDb.messages.update(id, updateData);
  },

  async deleteLastMessages(conversationId: string, count: number): Promise<void> {
    const messages = await this.getMessagesByConversation(conversationId);
    const idsToDelete = messages.slice(-count).map(m => m.id);
    await localDb.messages.bulkDelete(idsToDelete);
  },

  async deleteMessage(id: string): Promise<void> {
    await localDb.messages.delete(id);
  },

  /**
   * Fork a conversation from a specific message
   * Creates a new conversation with messages up to and including the fork point
   */
  async forkConversation(
    originalConversationId: string,
    forkAtMessageId: string,
    projectId?: string
  ): Promise<LocalConversation> {
    const originalConv = await localDb.conversations.get(originalConversationId);
    if (!originalConv) {
      throw new Error("Original conversation not found");
    }

    // Get all messages up to and including the fork point
    const allMessages = await this.getMessagesByConversation(originalConversationId);
    const forkIndex = allMessages.findIndex(m => m.id === forkAtMessageId);
    
    if (forkIndex === -1) {
      throw new Error("Fork message not found");
    }

    // Include messages up to and including the fork point
    const messagesToCopy = allMessages.slice(0, forkIndex + 1);

    // Create new conversation
    const now = new Date();
    const newConversation: LocalConversation = {
      id: generateId(),
      title: `${originalConv.title} (dal)`,
      projectId: projectId || originalConv.projectId,
      createdAt: now,
      updatedAt: now,
      forkedFromConversationId: originalConversationId,
      forkedAtMessageId: forkAtMessageId,
    };

    await localDb.conversations.add(newConversation);

    // Copy messages to new conversation
    for (const msg of messagesToCopy) {
      const newMessage: LocalMessage = {
        id: generateId(),
        conversationId: newConversation.id,
        role: msg.role,
        content: msg.content,
        rawContent: msg.rawContent,
        createdAt: new Date(msg.createdAt),
        forkedFrom: msg.id,
      };
      await localDb.messages.add(newMessage);
    }

    return newConversation;
  },

  // Documents (for future RAG)
  async addDocument(name: string, content: string): Promise<LocalDocument> {
    const doc: LocalDocument = {
      id: generateId(),
      name,
      content,
      createdAt: new Date(),
    };
    await localDb.documents.add(doc);
    return doc;
  },

  async getAllDocuments(): Promise<LocalDocument[]> {
    return await localDb.documents.toArray();
  },

  async deleteDocument(id: string): Promise<void> {
    await localDb.transaction('rw', [localDb.documents, localDb.chunks], async () => {
      await localDb.chunks.where('documentId').equals(id).delete();
      await localDb.documents.delete(id);
    });
  },

  // Chunks (for future RAG)
  async addChunk(documentId: string, content: string, embedding?: number[]): Promise<LocalChunk> {
    const chunk: LocalChunk = {
      id: generateId(),
      documentId,
      content,
      embedding,
      createdAt: new Date(),
    };
    await localDb.chunks.add(chunk);
    return chunk;
  },

  async getChunksByDocument(documentId: string): Promise<LocalChunk[]> {
    return await localDb.chunks.where('documentId').equals(documentId).toArray();
  },

  async getAllChunks(): Promise<LocalChunk[]> {
    return await localDb.chunks.toArray();
  },

  // Export all data as JSON
  /**
   * Bir projenin dışa aktarılabilir verisini toplar.
   *
   * `documents` tablosunda projectId ALANI YOK; projenin belgelerine ancak
   * chunk'lar üzerinden ulaşılıyor. Bu yüzden belge listesi chunk'lardan
   * türetiliyor.
   */
  async projeVerisiniTopla(
    projectId: string,
    secenekler: { sohbetler: boolean; indeks: boolean },
  ): Promise<DisaGirdi | null> {
    const proje = await localDb.projects.get(projectId);
    if (!proje) return null;

    const dosyalar = await localDb.projectFiles.where('projectId').equals(projectId).toArray();

    let sohbetler: LocalConversation[] | undefined;
    let mesajlar: LocalMessage[] | undefined;
    if (secenekler.sohbetler) {
      sohbetler = await localDb.conversations.where('projectId').equals(projectId).toArray();
      const idler = sohbetler.map((s) => s.id);
      mesajlar = idler.length
        ? await localDb.messages.where('conversationId').anyOf(idler).toArray()
        : [];
    }

    let belgeler: LocalDocument[] | undefined;
    let parcalar: LocalChunk[] | undefined;
    if (secenekler.indeks) {
      parcalar = await localDb.chunks.where('projectId').equals(projectId).toArray();
      const belgeIdleri = [...new Set(parcalar.map((p) => p.documentId))];
      belgeler = belgeIdleri.length
        ? (await localDb.documents.bulkGet(belgeIdleri)).filter((b): b is LocalDocument => !!b)
        : [];
    }

    return { proje, dosyalar, sohbetler, mesajlar, belgeler, parcalar };
  },

  /**
   * Hazırlanmış kayıt kümesini YENİ proje olarak yazar.
   *
   * Tek işlem: yarım yazılmış bir proje kalmaz. Var olan hiçbir kayda
   * dokunulmuyor — id'ler zaten projeAktarma'da yenilenmiş durumda.
   */
  async projeyiIceAktar(hazir: Hazir): Promise<string> {
    await localDb.transaction(
      'rw',
      [localDb.projects, localDb.projectFiles, localDb.conversations,
        localDb.messages, localDb.documents, localDb.chunks],
      async () => {
        await localDb.projects.add(hazir.proje);
        if (hazir.dosyalar.length) await localDb.projectFiles.bulkAdd(hazir.dosyalar);
        if (hazir.sohbetler.length) await localDb.conversations.bulkAdd(hazir.sohbetler);
        if (hazir.mesajlar.length) await localDb.messages.bulkAdd(hazir.mesajlar);
        if (hazir.belgeler.length) await localDb.documents.bulkAdd(hazir.belgeler);
        if (hazir.parcalar.length) await localDb.chunks.bulkAdd(hazir.parcalar);
      },
    );
    return hazir.proje.id;
  },

  async exportAllData(): Promise<{
    projects: LocalProject[];
    projectFiles: LocalProjectFile[];
    conversations: LocalConversation[];
    messages: LocalMessage[];
    documents: LocalDocument[];
    chunks: LocalChunk[];
  }> {
    const [projects, projectFiles, conversations, messages, documents, chunks] = await Promise.all([
      localDb.projects.toArray(),
      localDb.projectFiles.toArray(),
      localDb.conversations.toArray(),
      localDb.messages.toArray(),
      localDb.documents.toArray(),
      localDb.chunks.toArray(),
    ]);
    return { projects, projectFiles, conversations, messages, documents, chunks };
  },

  // Import data from JSON
  async importData(data: {
    projects?: LocalProject[];
    projectFiles?: LocalProjectFile[];
    conversations: LocalConversation[];
    messages: LocalMessage[];
    documents?: LocalDocument[];
    chunks?: LocalChunk[];
  }): Promise<void> {
    await localDb.transaction('rw', [localDb.projects, localDb.projectFiles, localDb.conversations, localDb.messages, localDb.documents, localDb.chunks], async () => {
      // Clear existing data
      await localDb.projects.clear();
      await localDb.projectFiles.clear();
      await localDb.conversations.clear();
      await localDb.messages.clear();
      await localDb.documents.clear();
      await localDb.chunks.clear();
      
      // Import new data
      if (data.projects) await localDb.projects.bulkAdd(data.projects);
      if (data.projectFiles) await localDb.projectFiles.bulkAdd(data.projectFiles);
      await localDb.conversations.bulkAdd(data.conversations);
      await localDb.messages.bulkAdd(data.messages);
      if (data.documents) await localDb.documents.bulkAdd(data.documents);
      if (data.chunks) await localDb.chunks.bulkAdd(data.chunks);
    });
    // Chunk korpusu tamamen değişti - retrieval cache'i invalidate et
    bumpAllCorpusVersions();
  },
};

// Helper: Get Sunday of the current week (for weekly aggregation - Sunday to Saturday)
const getWeekStart = (date: Date): string => {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, ...
  const diff = d.getDate() - day; // Go back to Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
};

// Usage log operations
export const usageLogOperations = {
  async getWeeklyStats(): Promise<{
    weekStart: string;
    totalRequests: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    uniqueUsers: number;
  }[]> {
    const logs = await localDb.usageLogs.toArray();
    
    // Group by week
    const weeklyMap = new Map<string, {
      requests: number;
      inputTokens: number;
      outputTokens: number;
      users: Set<string>;
    }>();
    
    for (const log of logs) {
      const existing = weeklyMap.get(log.weekStart) || {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        users: new Set<string>(),
      };
      
      existing.requests += log.requestCount;
      existing.inputTokens += log.inputTokens;
      existing.outputTokens += log.outputTokens;
      existing.users.add(log.userIdentifier);
      
      weeklyMap.set(log.weekStart, existing);
    }
    
    // Convert to array and sort by week descending
    return Array.from(weeklyMap.entries())
      .map(([weekStart, data]) => ({
        weekStart,
        totalRequests: data.requests,
        totalInputTokens: data.inputTokens,
        totalOutputTokens: data.outputTokens,
        uniqueUsers: data.users.size,
      }))
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  },

  async getAllLogs(): Promise<LocalUsageLog[]> {
    return await localDb.usageLogs.orderBy('createdAt').reverse().toArray();
  },

  async clearOldLogs(weeksToKeep: number = 12): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - (weeksToKeep * 7));
    const cutoffWeek = getWeekStart(cutoffDate);
    
    await localDb.usageLogs.where('weekStart').below(cutoffWeek).delete();
  },

async getTotalStats(): Promise<{
    totalRequests: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    uniqueUsers: number;
    firstLogDate: Date | null;
    lastLogDate: Date | null;
  }> {
    const logs = await localDb.usageLogs.toArray();
    
    if (logs.length === 0) {
      return {
        totalRequests: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        uniqueUsers: 0,
        firstLogDate: null,
        lastLogDate: null,
      };
    }
    
    const users = new Set<string>();
    let totalRequests = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let firstLogDate: Date | null = null;
    let lastLogDate: Date | null = null;
    
    for (const log of logs) {
      totalRequests += log.requestCount;
      totalInputTokens += log.inputTokens;
      totalOutputTokens += log.outputTokens;
      users.add(log.userIdentifier);
      
      const logDate = new Date(log.createdAt);
      if (!firstLogDate || logDate < firstLogDate) {
        firstLogDate = logDate;
      }
      if (!lastLogDate || logDate > lastLogDate) {
        lastLogDate = logDate;
      }
    }
    
    return {
      totalRequests,
      totalInputTokens,
      totalOutputTokens,
      uniqueUsers: users.size,
      firstLogDate,
      lastLogDate,
    };
  },

  async exportUsageLogs(): Promise<{
    logs: LocalUsageLog[];
    weeklyStats: {
      weekStart: string;
      totalRequests: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      uniqueUsers: number;
    }[];
    totalStats: {
      totalRequests: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      uniqueUsers: number;
      firstLogDate: string | null;
      lastLogDate: string | null;
    };
    exportedAt: string;
  }> {
    const logs = await this.getAllLogs();
    const weeklyStats = await this.getWeeklyStats();
    const totalStats = await this.getTotalStats();
    return {
      logs,
      weeklyStats,
      totalStats: {
        ...totalStats,
        firstLogDate: totalStats.firstLogDate?.toISOString() || null,
        lastLogDate: totalStats.lastLogDate?.toISOString() || null,
      },
      exportedAt: new Date().toISOString(),
    };
  },

  async importUsageLogs(data: { logs: LocalUsageLog[] }): Promise<number> {
    if (!data.logs || !Array.isArray(data.logs)) {
      throw new Error("Geçersiz veri formatı");
    }
    
    // Add logs (avoiding duplicates by checking ID)
    const existingIds = new Set((await this.getAllLogs()).map(l => l.id));
    const newLogs = data.logs.filter(l => !existingIds.has(l.id));
    
    for (const log of newLogs) {
      await localDb.usageLogs.add({
        ...log,
        createdAt: new Date(log.createdAt),
      });
    }
    
    return newLogs.length;
  },
};

// ---------------------------------------------------------------------------
// Belge düzenleme artifact'leri
// ---------------------------------------------------------------------------

/**
 * Üzerinde DEVAM EDİLEBİLİR en son artifact'i seçer.
 *
 * Dexie'den ayrı bir saf fonksiyon: kural test edilebilir olsun. Kural, dosyası
 * OLMAYAN artifact'in hiç seçilmemesi — kotaya takılıp metadata'sı kaydedilmiş
 * bir kayıt seçilirse kullanıcı "devam et" dediğinde elde kaynak olmaz.
 */
export function pickLatestUsableArtifact(
  list: LocalDocxArtifact[],
): LocalDocxArtifact | undefined {
  return list
    .filter((a) => !!a.editedBlob)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
}

export const artifactOperations = {
  /**
   * Artifact'i kaydeder. Dosya yazımı KOTAYA takılırsa dosyasız kaydeder —
   * artifact tamamen kaybolmasın ve daha da önemlisi aynı IndexedDB'deki RAG
   * gömüleri bozulmasın. Geri dönen `blobSaved` ile arayüz kullanıcıya
   * indirmenin çalışmayacağını söyleyebilir.
   */
  async save(a: Omit<LocalDocxArtifact, 'createdAt'>): Promise<{ id: string; blobSaved: boolean }> {
    const record: LocalDocxArtifact = { ...a, createdAt: new Date() };
    try {
      await localDb.docxArtifacts.put(record);
      return { id: a.id, blobSaved: !!a.editedBlob };
    } catch (err) {
      // QuotaExceededError ve benzeri: dosyayı at, geri kalanı sakla
      console.warn('Artifact dosyası kaydedilemedi, metadata ile kaydediliyor:', err);
      try {
        await localDb.docxArtifacts.put({ ...record, editedBlob: undefined });
        return { id: a.id, blobSaved: false };
      } catch (err2) {
        console.error('Artifact hiç kaydedilemedi:', err2);
        return { id: a.id, blobSaved: false };
      }
    }
  },

  async get(id: string): Promise<LocalDocxArtifact | undefined> {
    return localDb.docxArtifacts.get(id);
  },

  async listByConversation(conversationId: string): Promise<LocalDocxArtifact[]> {
    return localDb.docxArtifacts.where('conversationId').equals(conversationId).toArray();
  },

  /**
   * Sohbetin EN SON artifact'i — dosyası saklanmış olanlar arasından.
   *
   * Neden dosyası olan şart: bu, "belgeyi yeniden eklemeden üzerinde devam et"
   * akışının kaynağı. Dosyası kotaya takılıp kaydedilmemiş bir artifact'ten
   * devam edilemez, o yüzden hiç seçilmez.
   */
  async latestByConversation(conversationId: string): Promise<LocalDocxArtifact | undefined> {
    const all = await localDb.docxArtifacts
      .where('conversationId')
      .equals(conversationId)
      .toArray();
    return pickLatestUsableArtifact(all);
  },

  /** Sohbet silinince artifact'leri de sil — yoksa yetim kayıt birikir. */
  async deleteByConversation(conversationId: string): Promise<void> {
    await localDb.docxArtifacts.where('conversationId').equals(conversationId).delete();
  },
};
