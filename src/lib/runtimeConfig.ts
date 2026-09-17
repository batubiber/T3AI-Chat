/**
 * Runtime Config - backend'in .env'inden gelen ayarlar
 *
 * VITE_ değişkenleri build anında bundle'a gömülür; deployment'ta .env
 * değiştirmek frontend'i etkilemez. Bu modül, sistem promptu gibi ayarları
 * /api/config'ten runtime'da çekerek sunucu .env'ini otoriter kaynak yapar.
 * Backend'e ulaşılamazsa build'e gömülü değerlere geri düşülür.
 */

const API_URL = import.meta.env.VITE_API_URL || "/api";

interface RuntimeConfig {
  systemPromptBase: string | null;
}

let runtimeConfig: RuntimeConfig | null = null;

export async function loadRuntimeConfig(): Promise<void> {
  try {
    const response = await fetch(`${API_URL}/config`);
    if (!response.ok) return;
    const data = await response.json();
    runtimeConfig = {
      systemPromptBase:
        typeof data.systemPromptBase === 'string' && data.systemPromptBase.trim()
          ? data.systemPromptBase
          : null,
    };
  } catch {
    // Backend erişilemez - build'e gömülü varsayılanlar kullanılır
  }
}

/** Sunucu .env'inden gelen sistem promptu; yüklenmediyse/yoksa null. */
export function getRuntimeSystemPromptBase(): string | null {
  return runtimeConfig?.systemPromptBase ?? null;
}
