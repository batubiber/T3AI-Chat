/**
 * Filter think content from reasoning model outputs
 * Supports multiple formats:
 * - Standard <think>...</think> blocks (o3, o4-mini)
 * - Harmony format <|channel|>analysis and <|channel|>commentary blocks (gpt-oss-120b)
 *
 * PERFORMANCE OPTIMIZED: Pre-compiled regex, early returns
 */

export interface ThinkFilterResult {
  visibleContent: string;
  isThinking: boolean;
  thinkContent: string;
}

// Pre-compiled regex at module level for performance

// Standard <think> tag patterns
const THINK_BLOCK_REGEX = /<think>([\s\S]*?)<\/think>/g;
const CLOSE_THINK_REGEX = /<\/think>/g;
const TRAILING_THINK_REGEX = /<think>[\s\S]*$/g;

// Harmony format patterns
const HARMONY_TAG_REGEX = /<\|(?:start|end|message|channel|return|call)\|>/;
const HARMONY_ANALYSIS_BLOCK_REGEX = /<\|channel\|>analysis<\|message\|>([\s\S]*?)(?=<\|channel\|>|<\|end\|>|<\|return\|>|$)/g;
const HARMONY_COMMENTARY_BLOCK_REGEX = /<\|channel\|>commentary<\|message\|>([\s\S]*?)(?=<\|channel\|>|<\|end\|>|<\|return\|>|$)/g;
const HARMONY_FINAL_BLOCK_REGEX = /<\|channel\|>final<\|message\|>([\s\S]*?)(?=<\|channel\|>|<\|end\|>|<\|return\|>|$)/g;
const HARMONY_CLEAN_REGEX = /<\|(?:start|end|message|channel|return|call)\|>(?:analysis|commentary|final|assistant|user|system)?/g;

/**
 * Checks if content contains Harmony format tokens
 */
function hasHarmonyTags(content: string): boolean {
  return HARMONY_TAG_REGEX.test(content);
}

/**
 * Filters Harmony format content
 * Extracts analysis/commentary (thinking) and final (visible) channels
 */
function filterHarmonyContent(content: string): ThinkFilterResult {
  let analysisContent = '';
  let commentaryContent = '';
  let finalContent = '';

  // Extract analysis channel content (reasoning/thinking)
  const analysisMatches = content.matchAll(HARMONY_ANALYSIS_BLOCK_REGEX);
  for (const match of analysisMatches) {
    if (match[1]) {
      analysisContent += match[1].trim() + '\n';
    }
  }

  // Extract commentary channel content (intermediate commentary - hidden from user)
  const commentaryMatches = content.matchAll(HARMONY_COMMENTARY_BLOCK_REGEX);
  for (const match of commentaryMatches) {
    if (match[1]) {
      commentaryContent += match[1].trim() + '\n';
    }
  }

  // Extract final channel content (visible answer)
  const finalMatches = content.matchAll(HARMONY_FINAL_BLOCK_REGEX);
  for (const match of finalMatches) {
    if (match[1]) {
      finalContent += match[1].trim() + '\n';
    }
  }

  analysisContent = analysisContent.trim();
  commentaryContent = commentaryContent.trim();
  finalContent = finalContent.trim();

  // If no explicit final channel, clean all Harmony tokens
  if (!finalContent) {
    finalContent = content.replace(HARMONY_CLEAN_REGEX, '').replace(/\n{3,}/g, '\n\n').trim();
  }

  // Check if still in analysis/commentary phase (has analysis or commentary but no final yet)
  const hasAnalysis = content.includes('<|channel|>analysis');
  const hasCommentary = content.includes('<|channel|>commentary');
  const hasFinal = content.includes('<|channel|>final');
  const isThinking = (hasAnalysis || hasCommentary) && !hasFinal;

  // Combine analysis and commentary as both are "thinking" content
  const thinkContent = [analysisContent, commentaryContent].filter(Boolean).join('\n\n');

  return {
    visibleContent: finalContent,
    isThinking,
    thinkContent,
  };
}

// Gemma 4 channel format: <|channel>thought\n[reasoning]<channel|>[final answer].
// vLLM --reasoning-parser gemma4 normalde reasoning'i reasoning_content'e ayırır; ama bilinen
// bug'larda bu token'lar içeriğe SIZARSA burada defansif olarak temizlenir.
// Harmony'nin <|channel|> (pipe-bracket-pipe) formatından FARKLI: <|channel> / <channel|>.
const GEMMA_THOUGHT_BLOCK_REGEX = /<\|channel>thought([\s\S]*?)<channel\|>/g;
const GEMMA_CLEAN_REGEX = /<\|channel>(?:thought)?|<channel\|>/g;

function hasGemmaChannels(content: string): boolean {
  return content.includes('<|channel>') || content.includes('<channel|>');
}

function filterGemmaContent(content: string): ThinkFilterResult {
  let thinkContent = '';
  for (const match of content.matchAll(GEMMA_THOUGHT_BLOCK_REGEX)) {
    if (match[1]) thinkContent += match[1].trim() + '\n';
  }
  const visibleContent = content
    .replace(GEMMA_THOUGHT_BLOCK_REGEX, '')
    .replace(GEMMA_CLEAN_REGEX, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const isThinking = content.includes('<|channel>thought') && !content.includes('<channel|>');
  return { visibleContent, isThinking, thinkContent: thinkContent.trim() };
}

/**
 * Filters out thinking content from AI responses
 * Supports <think>...</think>, Harmony (gpt-oss) and Gemma-4 channel formats
 * Returns visible content, thinking status, and extracted think content
 */
export function filterThinkContent(content: string): ThinkFilterResult {
  // FAST PATH: Check for Harmony format first (gpt-oss-120b)
  if (hasHarmonyTags(content)) {
    return filterHarmonyContent(content);
  }

  // Gemma-4 channel format (defensive — normalde reasoning_content'e ayrılır)
  if (hasGemmaChannels(content)) {
    return filterGemmaContent(content);
  }

  /* FAST PATH: hiç etiket yoksa işlem yapma.
   *
   * KAPANIŞ etiketi de kontrol edilmek ZORUNDA: yalnız '<think>' aranıyordu ve
   * GLM'de akıl yürütme ayrı alandan (reasoning_content) geldiği için görünen
   * içerikte açılış etiketi hiç bulunmuyor, artakalan '</think>' ise olduğu
   * gibi kullanıcıya gidiyordu. Etiket cevabın ilk satırına yapışınca tablo
   * başlığı '|' ile başlamıyor, markdown tabloyu göremiyor ve her şey tek
   * paragraf oluyordu. */
  if (!content.includes('<think>') && !content.includes('</think>')) {
    return {
      visibleContent: content.trim(),
      isThinking: false,
      thinkContent: '',
    };
  }

  // Check if we're currently inside an unclosed think block
  const hasCloseThink = content.includes('</think>');
  const isThinking = !hasCloseThink;

  // Extract all think blocks
  const thinkMatches = content.match(THINK_BLOCK_REGEX);
  const thinkContent = thinkMatches ? thinkMatches.join('') : '';

  // Remove all complete think blocks
  let visibleContent = content.replace(THINK_BLOCK_REGEX, '');

  // If we're currently thinking, remove the partial think block
  if (isThinking) {
    const openThinkIndex = visibleContent.lastIndexOf('<think>');
    if (openThinkIndex !== -1) {
      visibleContent = visibleContent.substring(0, openThinkIndex);
    }
  }

  // Remove orphaned </think> tags (closing tag without opening)
  visibleContent = visibleContent.replace(CLOSE_THINK_REGEX, '');

  // Remove orphaned <think> tags at the end (opening tag without closing)
  visibleContent = visibleContent.replace(TRAILING_THINK_REGEX, '');

  return {
    visibleContent: visibleContent.trim(),
    isThinking,
    thinkContent,
  };
}
