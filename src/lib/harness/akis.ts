import { iptaliKontrolEt } from './iptal';

export interface ModelAkisOlayi {
  choices?: Array<{
    delta?: {
      content?: string;
      reasoning_content?: string;
      reasoning?: string;
      reasoning_details?: Array<{ text?: string }>;
      tool_calls?: unknown[];
    };
    finish_reason?: string | null;
  }>;
  usage?: unknown;
}

/** Ağ parçaları, UTF-8 karakterleri ve SSE olayları aynı sınırlarda bitmez. */
export async function* modelAkisiniOku(
  body: ReadableStream<Uint8Array>, signal?: AbortSignal,
): AsyncGenerator<ModelAkisOlayi> {
  iptaliKontrolEt(signal);
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let kalan = '';
  let veriler: string[] = [];
  let bitti = false;
  let sonIsaret = false;
  let eof = false;
  const iptal = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', iptal, { once: true });

  function olay(): ModelAkisOlayi | null {
    if (!veriler.length) return null;
    const metin = veriler.join('\n');
    veriler = [];
    if (metin.trim() === '[DONE]') { bitti = true; sonIsaret = true; return null; }
    let veri: ModelAkisOlayi & { error?: unknown };
    try { veri = JSON.parse(metin); }
    catch { throw new Error('Model akışında geçersiz JSON olayı alındı.'); }
    if (!veri || typeof veri !== 'object' || Array.isArray(veri) || veri.error) {
      throw new Error('Model akışı hata bildirdi.');
    }
    if (veri.choices?.some((c) => c.finish_reason != null)) bitti = true;
    return veri;
  }

  try {
    for (;;) {
      iptaliKontrolEt(signal);
      const { done, value } = await reader.read();
      iptaliKontrolEt(signal);
      eof = done;
      kalan += done ? decoder.decode() : decoder.decode(value, { stream: true });
      // CRLF ağ sınırından bölünse bile sondaki CR bir sonraki okumayı bekler.
      const satirlar = kalan.split(/\r\n|\n|\r(?!$)/);
      kalan = satirlar.pop() ?? '';
      if (done) { satirlar.push(kalan.replace(/\r$/, ''), ''); kalan = ''; }
      for (const satir of satirlar) {
        if (satir === '') {
          const veri = olay();
          if (veri) yield veri;
          if (sonIsaret) return;
        } else if (satir === 'data' || satir.startsWith('data:')) {
          veriler.push(satir.slice(5).replace(/^ /, ''));
        }
      }
      if (done) break;
    }
    if (!bitti) throw new Error('Model akışı tamamlanma işareti gelmeden kesildi.');
  } finally {
    signal?.removeEventListener('abort', iptal);
    if (!eof) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
