/**
 * Context Manager - Token-Based Adaptive Summary
 * 
 * Chat history'i token bütçesine göre dinamik olarak yönetir.
 * Eski mesajları özetleyerek context window'u verimli kullanır.
 */

import { estimateTokens, estimateMessagesTokens } from './tokenEstimator';
import { getModelContextWindow } from './modelConfig';

// Varsayılan konfigürasyon (32K context window)
export const CONTEXT_CONFIG = {
  MAX_CONTEXT_TOKENS: 26624,      // 32K - 4K output - 2K safety
  SUMMARY_BUDGET: 2500,           // Özet için ayrılan token bütçesi
  SAFE_BUFFER: 2048,              // Güvenlik marjı
  EFFECTIVE_BUDGET: 22076,        // 26624 - 2500 - 2048
  SUMMARY_TRIGGER: 18000,         // 18K aşıldığında özet oluştur
  MIN_MESSAGES_TO_KEEP: 6,        // Her zaman son 6 mesajı tut
};

/**
 * Context window boyutuna göre konfigürasyon üretir.
 * Küçük modeller (≤64K) ve büyük modeller (>64K) için farklı oranlar kullanır.
 */
function buildContextConfig(contextWindow: number): typeof CONTEXT_CONFIG {
  if (contextWindow <= 65536) {
    // 32K-64K: mevcut varsayılan değerler
    const outputReserve = 4096;
    const safeBuffer = 2048;
    const maxContextTokens = contextWindow - outputReserve - safeBuffer;
    const summaryBudget = 2500;
    return {
      MAX_CONTEXT_TOKENS: maxContextTokens,
      SUMMARY_BUDGET: summaryBudget,
      SAFE_BUFFER: safeBuffer,
      EFFECTIVE_BUDGET: maxContextTokens - summaryBudget - safeBuffer,
      SUMMARY_TRIGGER: Math.floor(maxContextTokens * 0.68),
      MIN_MESSAGES_TO_KEEP: 6,
    };
  }

  // >64K: büyük context modelleri
  if (contextWindow <= 131072) {
    const outputReserve = 12288;
    const safeBuffer = 4096;
    const maxContextTokens = contextWindow - outputReserve - safeBuffer;
    const summaryBudget = 2500;
    return {
      MAX_CONTEXT_TOKENS: maxContextTokens,
      SUMMARY_BUDGET: summaryBudget,
      SAFE_BUFFER: safeBuffer,
      EFFECTIVE_BUDGET: maxContextTokens - summaryBudget - safeBuffer,
      SUMMARY_TRIGGER: Math.floor(maxContextTokens * 0.78),
      MIN_MESSAGES_TO_KEEP: 12,
    };
  }

  // >131K: Çok büyük context modelleri (262K+ kodlama odaklı)
  // Kod blokları çok yer kaplar, output reserve yüksek tutulur
  const outputReserve = 16384;   // 16K - kodlama çıktıları uzun olabilir
  const safeBuffer = 8192;       // 8K - kod context'inde güvenlik marjı
  const maxContextTokens = contextWindow - outputReserve - safeBuffer;
  const summaryBudget = 6000;    // Kod konuşmaları için geniş özet (backend max_tokens: 4096)
  return {
    MAX_CONTEXT_TOKENS: maxContextTokens,
    SUMMARY_BUDGET: summaryBudget,
    SAFE_BUFFER: safeBuffer,
    EFFECTIVE_BUDGET: maxContextTokens - summaryBudget - safeBuffer,
    SUMMARY_TRIGGER: Math.floor(maxContextTokens * 0.85), // 85% - daha geç özetle, kod bağlamı önemli
    MIN_MESSAGES_TO_KEEP: 20,    // Kod konuşmalarında daha fazla geçmiş tut
  };
}

// .env override (test/ince ayar): VITE_SUMMARY_TRIGGER = mutlak token sayısı.
// Tanımlıysa özetleme (compact) bu token sayısı aşılınca tetiklenir. Tetiğin
// GERÇEKTEN çalışması için pencere bütçesi (EFFECTIVE_BUDGET) de aynı değere
// çekilir; aksi halde mesajlar tetik dolmadan pencereden düşer ve eşik anlamsız
// kalır. Değer modelin gerçek bütçesini aşamaz (Math.min). Tanımsız/0 ise etkisi yok.
const SUMMARY_TRIGGER_OVERRIDE = parseInt(import.meta.env.VITE_SUMMARY_TRIGGER ?? "", 10);

function applySummaryTriggerOverride(config: typeof CONTEXT_CONFIG): typeof CONTEXT_CONFIG {
  if (!Number.isFinite(SUMMARY_TRIGGER_OVERRIDE) || SUMMARY_TRIGGER_OVERRIDE <= 0) return config;
  const trigger = Math.min(config.EFFECTIVE_BUDGET, SUMMARY_TRIGGER_OVERRIDE);
  return { ...config, SUMMARY_TRIGGER: trigger, EFFECTIVE_BUDGET: trigger };
}

/**
 * Model ID'ye göre uygun context konfigürasyonunu döndürür.
 * Context window bilgisini modelConfig.ts'ten alır.
 * VITE_SUMMARY_TRIGGER tanımlıysa eşik/pencere onunla ezilir (bkz. yukarı).
 */
export function getContextConfig(modelId?: string): typeof CONTEXT_CONFIG {
  if (!modelId) return applySummaryTriggerOverride(CONTEXT_CONFIG);
  const contextWindow = getModelContextWindow(modelId);
  if (contextWindow === 32768) return applySummaryTriggerOverride(CONTEXT_CONFIG); // Varsayılan
  return applySummaryTriggerOverride(buildContextConfig(contextWindow));
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  rawContent?: string;
  images?: string[];
}

export interface ContextSelectionResult {
  /** Modele gönderilecek mesajlar */
  messages: Array<{ role: string; content: string }>;
  /** Özetlenmesi gereken mesajlar (varsa) */
  messagesToSummarize: Message[] | null;
  /** Toplam kullanılan token sayısı */
  tokensUsed: number;
  /** Özet gerekli mi? */
  needsSummary: boolean;
  /** Atlanan mesaj sayısı */
  skippedMessages: number;
  /** Özetleme sonrası yeni özet sınırı (baştan itibaren kaç mesaj özetlendi) */
  newSummarizedCount: number;
}

/**
 * Token bütçesine göre context'e dahil edilecek mesajları seçer
 * @param messages - Tüm konuşma mesajları
 * @param existingSummary - Mevcut özet (varsa)
 * @returns Context seçim sonucu
 */
export function selectMessagesForContext(
  messages: Message[],
  existingSummary?: string,
  modelId?: string,
  summarizedCount: number = 0
): ContextSelectionResult {
  const config = getContextConfig(modelId);
  if (messages.length === 0) {
    return {
      messages: [],
      messagesToSummarize: null,
      tokensUsed: 0,
      needsSummary: false,
      skippedMessages: 0,
      newSummarizedCount: summarizedCount,
    };
  }

  const summaryTokens = existingSummary ? estimateTokens(existingSummary) : 0;
  const availableBudget = config.EFFECTIVE_BUDGET - summaryTokens;

  // Pencereyi sondan başa doğru token bütçesine göre seç.
  // windowStart = context'e dahil edilen en eski mesajın indeksi.
  let windowStart = messages.length;
  let tokensUsed = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(messages[i].content) + 4; // +4 overhead
    if (tokensUsed + msgTokens > availableBudget) break;
    tokensUsed += msgTokens;
    windowStart = i;
  }

  // Her zaman en az MIN_MESSAGES_TO_KEEP son mesajı tut (bütçeyi aşsa bile).
  const minStart = Math.max(0, messages.length - config.MIN_MESSAGES_TO_KEEP);
  if (windowStart > minStart) {
    windowStart = minStart;
    tokensUsed = estimateMessagesTokens(
      messages.slice(windowStart).map(m => ({ role: m.role, content: m.content }))
    );
  }

  const skippedMessages = windowStart; // pencere dışında kalan mesaj sayısı

  // Özet gerekli mi? Pencere dışında, henüz ÖZETLENMEMİŞ mesaj varsa tetikle.
  // Bu sayede özet sadece bir kez değil, sohbet büyüdükçe tekrar tekrar güncellenir.
  const totalTokensWithoutSummary = estimateMessagesTokens(
    messages.map(m => ({ role: m.role, content: m.content }))
  );
  const needsSummary =
    windowStart > summarizedCount &&
    totalTokensWithoutSummary > config.SUMMARY_TRIGGER;

  // Sadece YENİ düşen mesajları özetle (özet sınırı ile pencere başı arası);
  // mevcut özetle birleştirilir, böylece her seferinde tüm geçmiş yeniden işlenmez.
  const messagesToSummarize = needsSummary
    ? messages.slice(summarizedCount, windowStart)
    : null;
  const newSummarizedCount = needsSummary ? windowStart : summarizedCount;

  // Context mesajları: (özet varsa) başa ekle + pencere.
  const resultMessages: Array<{ role: string; content: string }> = messages
    .slice(windowStart)
    .map(m => ({ role: m.role, content: m.content }));
  let finalTokens = tokensUsed;
  if (existingSummary) {
    resultMessages.unshift({
      role: 'assistant',
      content: `[Konuşma Özeti]\n${existingSummary}\n\n[Devam eden konuşma:]`,
    });
    finalTokens += summaryTokens;
  }

  return {
    messages: resultMessages,
    messagesToSummarize,
    tokensUsed: finalTokens,
    needsSummary,
    skippedMessages,
    newSummarizedCount,
  };
}

/**
 * Summarization için prompt oluşturur - Genel amaçlı
 * @param existingSummary - Mevcut özet (varsa)
 * @param messages - Özetlenecek mesajlar
 * @returns Summarization prompt'u
 */
export function buildSummaryPrompt(
  existingSummary: string | undefined,
  messages: Message[]
): string {
  const messagesText = messages
    .map(m => {
      const imageNote = m.images?.length ? ` [${m.images.length} resim eklendi]` : '';
      return `${m.role === 'user' ? 'Kullanıcı' : 'Asistan'}: ${m.content}${imageNote}`;
    })
    .join('\n\n---\n\n');
  
  return `Sen bir konuşma özetleyicisisin. Aşağıdaki konuşmayı özetle.

TEMEL KURALLAR:
1. KONU: Ana tartışma konusunu veya soruları belirt
2. BAĞLAM: Kullanıcının amacını ve ihtiyaçlarını koru
3. ÖNEMLİ BİLGİLER: Paylaşılan gerçekler, veriler, isimler ve rakamları koru
4. KARARLAR: Varılan sonuçları ve alınan kararları belirt
5. AÇIK KONULAR: Henüz çözülmemiş sorular veya devam eden tartışmaları not et
6. TERCİHLER: Kullanıcının belirttiği tercihleri ve kısıtlamaları hatırla
7. GÖRSELLER: Resimlerin varlığını ve içeriklerini (açıklandıysa) not et

KONUYA GÖRE EKLE:
- Kod/Teknik: Dosya isimleri, kullanılan teknolojiler, yapılan değişiklikler
- Araştırma: Kaynaklar, bulgular, karşılaştırmalar
- Yazı/İçerik: Ton, hedef kitle, stil tercihleri
- Planlama: Hedefler, zaman çizelgesi, adımlar

FORMAT:
## Konuşma Özeti
**Ana Konu:** [1 cümle]

**Önemli Noktalar:**
- [nokta 1]
- [nokta 2]
- [nokta 3]

**Bağlam ve Tercihler:**
[kullanıcının tercihleri, kısıtlamalar, özel durumlar]

**Açık Konular:** (varsa)
[devam eden tartışmalar veya çözülmemiş sorular]

Maksimum 350 kelime. Türkçe yaz. Konuşmanın doğasına göre uygun detayları koru.

${existingSummary ? `MEVCUT ÖZET (bunu güncelle/genişlet):\n${existingSummary}\n\n` : ''}

ÖZETLENMESİ GEREKEN KONUŞMA:
${messagesText}

ÖZET:`;
}
