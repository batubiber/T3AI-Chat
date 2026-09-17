/**
 * Harmony Response Format Parser
 *
 * Handles OpenAI Harmony format tokens used by gpt-oss-120b model.
 *
 * Harmony Token Reference:
 * - <|start|>     : Message start
 * - <|end|>       : Message end
 * - <|message|>   : Content start
 * - <|channel|>   : Channel specifier (analysis/commentary = thinking, final = visible answer)
 * - <|return|>    : Stop token (generation complete)
 * - <|call|>      : Stop token (tool call)
 *
 * Channel Types:
 * - analysis: Chain-of-thought reasoning (should be hidden from user)
 * - commentary: Intermediate commentary (should be hidden from user)
 * - final: Final answer (shown to user)
 */

export interface HarmonyChannels {
  analysis: string;     // reasoning/thinking content
  commentary: string;   // intermediate commentary (hidden from user)
  final: string;        // visible answer content
  raw: string;          // original content
}

// Pre-compiled regex for performance
const HARMONY_TAG_REGEX = /<\|(?:start|end|message|channel|return|call)\|>/;
const HARMONY_CHANNEL_REGEX = /<\|channel\|>(analysis|commentary|final)/g;
const HARMONY_ANALYSIS_BLOCK_REGEX = /<\|channel\|>analysis<\|message\|>([\s\S]*?)(?=<\|channel\|>|<\|end\|>|<\|return\|>|$)/g;
const HARMONY_COMMENTARY_BLOCK_REGEX = /<\|channel\|>commentary<\|message\|>([\s\S]*?)(?=<\|channel\|>|<\|end\|>|<\|return\|>|$)/g;
const HARMONY_FINAL_BLOCK_REGEX = /<\|channel\|>final<\|message\|>([\s\S]*?)(?=<\|channel\|>|<\|end\|>|<\|return\|>|$)/g;

// Clean tags regex - removes all Harmony special tokens
const HARMONY_CLEAN_REGEX = /<\|(?:start|end|message|channel|return|call)\|>(?:analysis|commentary|final|assistant|user|system)?/g;

/**
 * Detects if content contains Harmony format tokens
 */
export function hasHarmonyTags(content: string): boolean {
  return HARMONY_TAG_REGEX.test(content);
}

/**
 * Extracts channels from Harmony formatted content
 * Separates analysis (thinking) from final (visible) content
 */
export function extractHarmonyChannels(content: string): HarmonyChannels {
  // Fast path: no Harmony tags
  if (!hasHarmonyTags(content)) {
    return {
      analysis: '',
      commentary: '',
      final: content,
      raw: content,
    };
  }

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

  // Trim trailing newlines
  analysisContent = analysisContent.trim();
  commentaryContent = commentaryContent.trim();
  finalContent = finalContent.trim();

  // If no explicit channels found, try to clean the content
  // This handles partial/incomplete Harmony responses
  if (!finalContent && !analysisContent && !commentaryContent) {
    finalContent = cleanHarmonyOutput(content);
  }

  return {
    analysis: analysisContent,
    commentary: commentaryContent,
    final: finalContent,
    raw: content,
  };
}

/**
 * Removes all Harmony special tokens from content
 * Used for cleaning output that doesn't have explicit channel markers
 */
export function cleanHarmonyOutput(content: string): string {
  // Fast path: no Harmony tags
  if (!hasHarmonyTags(content)) {
    return content.trim();
  }

  // Remove all Harmony tokens and role markers
  let cleaned = content.replace(HARMONY_CLEAN_REGEX, '');

  // Clean up any double spaces or newlines created by removal
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/  +/g, ' ');

  return cleaned.trim();
}

/**
 * Checks if content indicates the model is still in analysis/thinking phase
 * Returns true if we're inside an analysis or commentary channel without a final channel yet
 */
export function isInAnalysisPhase(content: string): boolean {
  if (!hasHarmonyTags(content)) {
    return false;
  }

  const hasAnalysis = content.includes('<|channel|>analysis');
  const hasCommentary = content.includes('<|channel|>commentary');
  const hasFinal = content.includes('<|channel|>final');

  // In analysis phase if we have analysis or commentary but no final yet
  return (hasAnalysis || hasCommentary) && !hasFinal;
}

/**
 * Checks if the Harmony response is complete
 * (has return or call stop token)
 */
export function isHarmonyComplete(content: string): boolean {
  return content.includes('<|return|>') || content.includes('<|call|>');
}

/**
 * Extracts visible content from Harmony format for streaming display
 * Prioritizes final channel, falls back to cleaned content
 */
export function getHarmonyVisibleContent(content: string): string {
  const channels = extractHarmonyChannels(content);
  return channels.final || cleanHarmonyOutput(content);
}

/**
 * Gets reasoning/thinking content from Harmony format (analysis + commentary)
 */
export function getHarmonyReasoningContent(content: string): string {
  const channels = extractHarmonyChannels(content);
  // Combine analysis and commentary as both are "reasoning" content
  const reasoning = [channels.analysis, channels.commentary].filter(Boolean).join('\n\n');
  return reasoning;
}
