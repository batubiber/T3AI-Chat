import type { TurButcesi } from './turButcesi';
/** Kullanıcı iptali, istek zaman aşımı ve kaynak temizliği ortak olsun. */
export function iptaliKontrolEt(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('İşlem durduruldu', 'AbortError');
}

export function istekOmru(parent: AbortSignal | undefined, sureMs: number) {
  const controller = new AbortController();
  const iptal = () => controller.abort(parent?.reason ?? new DOMException('İşlem durduruldu', 'AbortError'));
  if (parent?.aborted) iptal();
  else parent?.addEventListener('abort', iptal, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('İstek zaman aşımına uğradı', 'TimeoutError')), sureMs);
  return {
    signal: controller.signal,
    temizle() {
      clearTimeout(timer);
      parent?.removeEventListener('abort', iptal);
    },
  };
}

/** Bir belge işi boyunca kimlikler değişmez; panel seçimi bunları belirlemez. */
export interface BelgeIslemi {
  runId: string;
  sohbetId: string;
  modelId: string;
  signal: AbortSignal;
  butce?: TurButcesi;
}
