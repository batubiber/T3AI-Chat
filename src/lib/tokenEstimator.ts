/**
 * Token Estimator - Optimize edilmiş token sayacı
 * 
 * Türkçe ve İngilizce metinler için optimize edilmiş karakter bazlı token tahmini.
 * Kod blokları için ayrı hesaplama yapılır (kod genellikle daha az token/karakter).
 */

// Token hesaplama sabitleri
const CHARS_PER_TOKEN_TEXT = 3.5; // Türkçe/İngilizce metin için
const CHARS_PER_TOKEN_CODE = 4.0; // Kod blokları için
const CODE_BLOCK_REGEX = /```[\s\S]*?```/g;

/**
 * Metin için tahmini token sayısını hesaplar
 * @param text - Token sayısı hesaplanacak metin
 * @returns Tahmini token sayısı
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  
  // Kod bloklarını ayır
  const codeBlocks = text.match(CODE_BLOCK_REGEX);
  const codeLength = codeBlocks 
    ? codeBlocks.reduce((sum: number, block: string) => sum + block.length, 0) 
    : 0;
  const textLength = text.length - codeLength;
  
  // Kod: ~4 karakter/token, Metin: ~3.5 karakter/token
  const textTokens = Math.ceil(textLength / CHARS_PER_TOKEN_TEXT);
  const codeTokens = Math.ceil(codeLength / CHARS_PER_TOKEN_CODE);
  
  return textTokens + codeTokens;
}

/**
 * Resim için tahmini token sayısını hesaplar
 * OpenAI/Qwen vision modelleri için yaklaşık değerler
 * @param imageCount - Resim sayısı
 * @param detail - Resim detay seviyesi ('low' | 'high' | 'auto')
 * @returns Tahmini token sayısı
 */
export function estimateImageTokens(imageCount: number, detail: 'low' | 'high' | 'auto' = 'auto'): number {
  if (imageCount === 0) return 0;
  
  // Low detail: ~85 tokens, High detail: ~765 tokens, Auto: ~500 tokens (ortalama)
  const tokensPerImage = detail === 'low' ? 85 : detail === 'high' ? 765 : 500;
  return imageCount * tokensPerImage;
}

/**
 * Mesaj dizisi için toplam token sayısını hesaplar (resimler dahil)
 * @param messages - Token sayısı hesaplanacak mesajlar
 * @returns Toplam tahmini token sayısı
 */
export function estimateMessagesTokens(messages: Array<{ role: string; content: string; images?: string[] }>): number {
  return messages.reduce((total, msg) => {
    // Her mesaj için ~4 token overhead (role, formatting vs.)
    const overhead = 4;
    const textTokens = estimateTokens(msg.content);
    const imageTokens = msg.images?.length ? estimateImageTokens(msg.images.length) : 0;
    return total + textTokens + imageTokens + overhead;
  }, 0);
}

/**
 * Token sayısını okunabilir formata çevirir
 * @param tokens - Token sayısı
 * @returns Okunabilir format (örn: "1.2k", "500")
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return tokens.toString();
}
