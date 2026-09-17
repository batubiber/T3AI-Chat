/**
 * Converts LaTeX delimiters from \(...\) and \[...\] format
 * to $...$ and $$...$$ format for remark-math compatibility
 */
export function convertMathDelimiters(content: string): string {
  let result = content;
  
  // Convert display math: \[...\] to $$...$$
  // In JS replacement: $$ = literal $, $1 = capture group
  // So $$...$$ requires: $$$$ + $1 + $$$$
  result = result.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$');
  
  // Convert inline math: \(...\) to $...$
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');
  
  return result;
}
