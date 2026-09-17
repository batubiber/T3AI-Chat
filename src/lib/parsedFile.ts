/**
 * Parser'ların paylaştığı tip ve yardımcılar.
 * fileParser ↔ pptxParser döngüsel import'unu önlemek için ayrı modül.
 */

export interface ParsedFile {
  content: string;
  metadata?: {
    pageCount?: number;
    wordCount?: number;
    format?: string;
    warnings?: string[];   // kullanıcıya gösterilecek uyarılar (ör. OCR kapalıyken taranmış doküman)
    ocrPages?: number;     // OCR ile metne çevrilen sayfa sayısı
  };
}

/** XML metnini Document'a çevirir. Tarayıcıda DOMParser, testte @xmldom/xmldom
 *  enjekte edilir (Node'da global DOMParser yoktur). */
export type XmlParse = (xml: string) => Document;

export const domXmlParse: XmlParse = (xml) =>
  new DOMParser().parseFromString(xml, 'application/xml');

export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    // Zaman aşımı dosya boyutuyla ölçeklenir: sabit 30sn, büyük sunumlarda
    // yavaş diskte tetiklenip boyutla ilgisi olmayan bir hata mesajı veriyordu.
    // Taban 30sn + MB başına 200ms (500MB → ~130sn).
    const timeoutMs = 30000 + Math.ceil(file.size / (1024 * 1024)) * 200;
    const timeoutId = setTimeout(() => {
      reader.abort();
      reject(new Error(`Dosya okuma zaman aşımına uğradı (${(file.size / 1024 / 1024).toFixed(0)}MB)`));
    }, timeoutMs);

    reader.onload = () => {
      clearTimeout(timeoutId);
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
        return;
      }
      reject(new Error('Dosya ikili veri olarak okunamadı'));
    };
    reader.onerror = () => {
      clearTimeout(timeoutId);
      reject(reader.error ?? new Error('Dosya okunamadı'));
    };
    reader.onabort = () => clearTimeout(timeoutId);
    reader.readAsArrayBuffer(file);
  });
}
