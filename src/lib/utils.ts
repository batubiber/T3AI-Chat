import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Truncation limits (easy to adjust)
export const TRUNCATE_LIMITS = {
  FILE_NAME_LIST: 25,      // Sağ panel dar, daha kısa
  FILE_NAME_TOAST: 50,
  CONVERSATION_TITLE: 16,  // Sidebar dar, butonlara yer bırak
  PROJECT_NAME_CARD: 35,   // Proje kartları için
  PROJECT_NAME_DIALOG: 40, // Dialog içindeki proje adı
} as const;

/**
 * Truncate text by character count with ellipsis.
 * For UI display only - original text preserved in data.
 */
export function truncateByChars(text: string | null | undefined, maxChars: number): string {
  if (!text) return "";
  if (maxChars <= 3) return text.length > maxChars ? "..." : text;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 3) + "...";
}
