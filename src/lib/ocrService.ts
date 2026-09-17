/**
 * OCR Service — Unlimited-OCR istemci katmanı.
 * Taranmış PDF sayfaları ve DOCX gömülü görselleri backend /api/ocr proxy'si
 * üzerinden metne çevrilir. Tamamen fail-open: OCR yoksa sistem v2.1.23 gibi davranır.
 */
import { htmlTableToMarkdown } from './htmlTable';

// Taranmış-sayfa eşiği: sayfa metni bundan kısaysa sayfa görüntü-ağırlıklı sayılır
export const OCR_MIN_TEXT_CHARS = 50;

/**
 * Ham OCR çıktısını indekslenebilir metne çevirir:
 * - <|det|>tip [koordinatlar]<|/det|> bloklarını söker (metin bloktan SONRA gelir)
 * - kalan tüm <|...|> özel token'larını söker
 * - HTML <table>'ları markdown pipe tablosuna çevirir (chunker tablo koruması pipe tanır)
 * - kalan HTML tag'lerini temizler, boşlukları normalize eder
 */
export function cleanOcrOutput(raw: string): string {
  if (!raw) return '';
  let text = raw.replace(/<\|det\|>[\s\S]*?<\|\/det\|>/g, '');
  // Kapanmamış/kesik det bloğu (üretim yarıda kesilmiş olabilir) — satır sonuna kadar sök
  text = text.replace(/<\|det\|>[^\n]*/g, '');
  text = text.replace(/<\|[^|<>]*\|>/g, '');
  const tables = text.match(/<table[\s\S]*?<\/table>/gi) || [];
  for (const t of tables) {
    text = text.replace(t, () => '\n\n' + htmlTableToMarkdown(t) + '\n\n');
  }
  text = text.replace(/<[^>]+>/g, '');
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const API_URL = import.meta.env.VITE_API_URL || '/api';
const OCR_TIMEOUT_MS = 60000;
export const OCR_CONCURRENCY = 2; // GPU'yu ve komşu modeli boğmamak için
const OCR_PROBE_TTL_MS = 15000;

/** Kill-switch: '1' ise OCR yolu tamamen atlanır → birebir v2.1.23 davranışı. */
export function isOcrOff(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('rag-ocr-off') === '1';
  } catch {
    return false;
  }
}

// Health cache — ragService.isRagAvailable deseninin aynısı (non-blocking, TTL'li)
let ocrHealthCached = false;
let ocrLastProbeAt = 0;
let ocrProbeInFlight = false;

function refreshOcrHealthInBackground(): void {
  if (isOcrOff()) return; // kill-switch açıkken probe da atılmaz
  if (ocrProbeInFlight) return;
  if (Date.now() - ocrLastProbeAt < OCR_PROBE_TTL_MS) return;
  ocrProbeInFlight = true;
  fetch(`${API_URL}/ocr/health`)
    .then((r) => r.json())
    .then((h) => { ocrHealthCached = !!h.available; })
    .catch(() => { ocrHealthCached = false; })
    .finally(() => { ocrLastProbeAt = Date.now(); ocrProbeInFlight = false; });
}

export async function isOcrAvailable(): Promise<boolean> {
  if (isOcrOff()) return false;
  refreshOcrHealthInBackground(); // bayatsa arka planda tazele — AWAIT YOK
  return ocrHealthCached;
}

/** Uygulama açılışında çağrılır: ilk doküman yüklemede cache ısınmış olsun. */
export function primeOcrHealth(): void {
  refreshOcrHealthInBackground();
}

/** Tek görseli OCR'lar. Her hata yolunda null döner (fail-open) — doküman düşmez. */
export async function ocrImage(dataUrl: string): Promise<string | null> {
  if (isOcrOff()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);
  try {
    const resp = await fetch(`${API_URL}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl }),
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return typeof data.text === 'string' ? cleanOcrOutput(data.text) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Genel amaçlı sınırlı-eşzamanlı map — sonuç sırası girdi sırasıdır. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

/** DOCX görselleri için: eşzamanlılık 2 ile sıralı-sonuçlu OCR.
 *  null öğeler (skip edilen görseller) OCR'a gitmeden null olarak geçer. */
export function ocrImages(dataUrls: (string | null)[]): Promise<(string | null)[]> {
  return mapWithConcurrency(dataUrls, (u) => (u === null ? Promise.resolve(null) : ocrImage(u)), OCR_CONCURRENCY);
}

/** Tablo hücresindeki görsellerin indeksleri: htmlTableToMarkdown hücre içi
 *  tag'leri sildiği için bu görsellerin placeholder'ı asla metne ulaşmaz —
 *  OCR'a göndermek boşa round-trip. Bu set OCR aşamasında atlanır. */
export function collectTableImageIndices(html: string): Set<number> {
  const out = new Set<number>();
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  for (const t of tables) {
    for (const m of t.matchAll(/src="OCR_IMG_(\d+)"/gi)) {
      out.add(Number(m[1]));
    }
  }
  return out;
}

/**
 * DOCX görsel placeholder'larını (%%OCR_IMG_k%%) OCR sonuçlarıyla değiştirir.
 * Metin çıkmayan görseller sessizce düşer (v2.1.23'teki gibi — ama artık denendi).
 * NOT: placeholder açı ayracı (<>) içermez — htmlToTextWithTables'daki genel
 * HTML tag temizliğinden (<[^>]+>) kaçabilmesi için (bkz. fileParser.ts).
 */
export function injectOcrResults(text: string, ocrTexts: (string | null)[]): string {
  return text
    .replace(/%%OCR_IMG_(\d+)%%/g, (_m, n) => {
      const t = ocrTexts[Number(n)];
      return t && t.trim() ? `\n[Görsel ${Number(n) + 1} — OCR]\n${t.trim()}\n` : '';
    })
    .replace(/\n{3,}/g, '\n\n');
}

/** OCR'a gönderilebilir raster formatlar — EMF/WMF gibi Office vektör
 *  formatları model tarafından okunamaz, boşa gidip sahte uyarı üretir. */
export const OCR_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/webp'];

export function isOcrableImageType(contentType: string | undefined): boolean {
  return !!contentType && OCR_IMAGE_TYPES.includes(contentType.toLowerCase());
}
