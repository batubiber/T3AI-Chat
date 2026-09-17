/**
 * File Parser - Extracts text content from various file formats
 * Supports: txt, md, json, csv, docx, pdf, xlsx, pptx
 */

import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';
import { KOD_UZANTILARI, kodDosyasiMi, dosyaDili, DIL_ADI } from './codeLanguages';
import { htmlTableToMarkdown } from './htmlTable';
import { OCR_MIN_TEXT_CHARS, isOcrOff, isOcrAvailable, ocrImage, ocrImages, injectOcrResults, isOcrableImageType, collectTableImageIndices } from './ocrService';
import { ParsedFile, readFileAsArrayBuffer } from './parsedFile';
import { parsePptxFile } from './pptxParser';

// Geriye dönük uyumluluk: ParsedFile'ı buradan import eden kod kırılmasın
export type { ParsedFile };


// Configure PDF.js worker - use local bundled worker for offline support
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

// Supported file extensions
export const SUPPORTED_TEXT_EXTENSIONS = ['txt', 'md', 'markdown', 'json', 'csv', 'xml', 'yaml', 'yml', 'log'];
export const SUPPORTED_DOCX_EXTENSIONS = ['docx'];
export const SUPPORTED_PDF_EXTENSIONS = ['pdf'];
export const SUPPORTED_XLSX_EXTENSIONS = ['xlsx'];
export const SUPPORTED_PPTX_EXTENSIONS = ['pptx'];
/** Kod dosyaları — düz metin gibi okunur, parçalama codeChunker'da ayrışır */
export const SUPPORTED_CODE_EXTENSIONS = KOD_UZANTILARI;
export const SUPPORTED_EXTENSIONS = [
  ...SUPPORTED_TEXT_EXTENSIONS,
  ...SUPPORTED_DOCX_EXTENSIONS,
  ...SUPPORTED_PDF_EXTENSIONS,
  ...SUPPORTED_XLSX_EXTENSIONS,
  ...SUPPORTED_PPTX_EXTENSIONS,
  ...SUPPORTED_CODE_EXTENSIONS,
];

/**
 * Check if file is supported
 */
export function isFileSupported(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return SUPPORTED_EXTENSIONS.includes(ext);
}

/**
 * Check if file is a DOCX file
 */
export function isDocxFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return SUPPORTED_DOCX_EXTENSIONS.includes(ext);
}

/**
 * Check if file is a PDF file
 */
export function isPdfFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return SUPPORTED_PDF_EXTENSIONS.includes(ext);
}

/**
 * Check if file is a plain text file
 */
/** Kod dosyası mı — arayüz etiketi ve simge için */
export function isCodeFile(fileName: string): boolean {
  return kodDosyasiMi(fileName);
}

export function isTextFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  // Kod dosyaları da düz metin olarak OKUNUR; ayrışma parçalamada
  return SUPPORTED_TEXT_EXTENSIONS.includes(ext) || SUPPORTED_CODE_EXTENSIONS.includes(ext);
}

/**
 * Check if file is an XLSX file
 */
export function isXlsxFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return SUPPORTED_XLSX_EXTENSIONS.includes(ext);
}

/**
 * Check if file is a PPTX file
 */
export function isPptxFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return SUPPORTED_PPTX_EXTENSIONS.includes(ext);
}

/**
 * Eski ikili PowerPoint formatı (97-2003). Tarayıcıda parse EDİLEMEZ — genel
 * "desteklenmeyen format" mesajı kullanıcıyı çıkmaza sokuyor, bu yüzden ayrı
 * tanınıp yönlendirici mesaj veriliyor.
 */
export function isLegacyPptFile(fileName: string): boolean {
  return (fileName.split('.').pop()?.toLowerCase() || '') === 'ppt';
}

/**
 * Bazı Excel dosyaları hatalı/dar bir worksheet boyutu ('!ref') yazar; bu durumda
 * XLSX.utils.sheet_to_json yalnızca o aralığı (ör. sadece ilk satırı) okur ve geri
 * kalan satırlar kaybolur. Aralığı gerçek hücre adreslerinden yeniden hesaplayıp
 * mevcut '!ref' ile birleştirerek (asla daraltmadan) tüm satırların okunmasını sağlarız.
 */
function expandSheetRange(sheet: XLSX.WorkSheet): void {
  const cells = Object.keys(sheet).filter((k) => !k.startsWith('!'));
  if (cells.length === 0) return;
  let minR = Infinity, minC = Infinity, maxR = -1, maxC = -1;
  for (const addr of cells) {
    const { r, c } = XLSX.utils.decode_cell(addr);
    if (r < minR) minR = r;
    if (c < minC) minC = c;
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }
  if (sheet['!ref']) {
    const ex = XLSX.utils.decode_range(sheet['!ref']);
    minR = Math.min(minR, ex.s.r); minC = Math.min(minC, ex.s.c);
    maxR = Math.max(maxR, ex.e.r); maxC = Math.max(maxC, ex.e.c);
  }
  sheet['!ref'] = XLSX.utils.encode_range({ s: { r: minR, c: minC }, e: { r: maxR, c: maxC } });
}

/**
 * Parse XLSX file and extract content as Markdown tables (one per sheet)
 */
export async function parseXlsxFile(file: File, onProgress?: (current: number, total: number) => void): Promise<ParsedFile> {
  try {
    onProgress?.(0, 3);
    const arrayBuffer = await readFileAsArrayBuffer(file);
    onProgress?.(1, 3);
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    onProgress?.(2, 3);

    const parts: string[] = [];
    let totalRows = 0;

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      // Hatalı/dar '!ref' yüzünden satır kaybını önle (tüm hücreleri kapsayacak şekilde düzelt)
      expandSheetRange(sheet);
      const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        blankrows: false,
        defval: '',
      }) as string[][];

      if (!rows || rows.length === 0) continue;

      const maxCols = Math.max(...rows.map(r => r.length));
      const norm = rows.map(r => {
        const copy = [...r];
        while (copy.length < maxCols) copy.push('');
        return copy.map(c => String(c ?? '').replace(/\n/g, ' ').replace(/\t/g, ' ').trim());
      });
      const markdownRows = norm.map(r => r.map(c => c.replace(/\|/g, '\\|')));

      const lines: string[] = [];
      lines.push(`## ${sheetName}`);
      lines.push('');
      lines.push('| ' + markdownRows[0].join(' | ') + ' |');
      lines.push('| ' + markdownRows[0].map(() => '---').join(' | ') + ' |');
      for (let i = 1; i < markdownRows.length; i++) {
        lines.push('| ' + markdownRows[i].join(' | ') + ' |');
      }
      lines.push('');
      lines.push('TSV biçimi:');
      lines.push('```tsv');
      lines.push(...norm.map(r => r.join('\t')));
      lines.push('```');
      parts.push(lines.join('\n'));
      totalRows += norm.length;
    }

    if (parts.length === 0) {
      throw new Error('Excel dosyası boş veya okunabilir veri içermiyor');
    }

    const content = parts.join('\n\n');
    const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
    onProgress?.(3, 3);

    return {
      content,
      metadata: {
        pageCount: workbook.SheetNames.length,
        wordCount,
        format: 'xlsx',
      },
    };
  } catch (error) {
    console.error('Error parsing XLSX file:', error);
    throw new Error(`Excel dosyası okunamadı: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
  }
}


/**
 * Parse PDF file and extract text content
 */
export async function parsePdfFile(
  file: File,
  onProgress?: (current: number, total: number) => void,
): Promise<ParsedFile> {
  try {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const pageCount = pdf.numPages;
    const textParts: string[] = [];
    onProgress?.(0, pageCount);

    const ocrAllowed = !isOcrOff() && await isOcrAvailable();
    let ocrPages = 0;
    let unreadablePages = 0;

    // Extract text from each page
    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      let pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');

      // Taranmış-sayfa tetiği: metin katmanı yok/çok kısa → sayfayı render edip OCR'a gönder.
      // Fail-open: OCR kapalı/başarısızsa sayfa bugünkü gibi (boş) kalır, doküman DÜŞMEZ.
      if (pageText.trim().length < OCR_MIN_TEXT_CHARS) {
        if (ocrAllowed) {
          try {
            const viewport = page.getViewport({ scale: 2 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              await page.render({ canvasContext: ctx, viewport }).promise;
              const ocrText = await ocrImage(canvas.toDataURL('image/jpeg', 0.85));
              // Canvas belleğini erken bırak (uzun taramalarda ~8MB/sayfa birikir)
              canvas.width = 0;
              canvas.height = 0;
              if (ocrText && ocrText.trim().length > 0) {
                pageText = ocrText;
                ocrPages++;
              } else if (pageText.trim().length === 0) {
                unreadablePages++;
              }
            }
          } catch {
            if (pageText.trim().length === 0) unreadablePages++;
          }
        } else if (pageText.trim().length === 0) {
          unreadablePages++;
        }
      }

      if (pageText.trim()) {
        textParts.push(`--- Sayfa ${i} ---\n${pageText}`);
      }
      onProgress?.(i, pageCount);
    }

    const content = textParts.join('\n\n');
    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;

    const warnings: string[] = [];
    if (unreadablePages > 0) {
      warnings.push(
        ocrAllowed
          ? `${unreadablePages} sayfadan metin çıkarılamadı (OCR sonuç vermedi).`
          : `${unreadablePages} sayfa taranmış görünüyor; OCR servisi şu an kullanılamıyor — metin çıkarılamadı.`
      );
    }

    return {
      content,
      metadata: {
        pageCount,
        wordCount,
        format: 'pdf',
        ...(warnings.length > 0 ? { warnings } : {}),
        ...(ocrPages > 0 ? { ocrPages } : {}),
      },
    };
  } catch (error) {
    console.error('Error parsing PDF file:', error);
    const msg = error instanceof Error ? error.message : 'Bilinmeyen hata';
    if (msg.includes('Promise.withResolvers')) {
      throw new Error(
        'PDF okuma için tarayıcınız çok eski. Lütfen Chrome/Edge 119+, Firefox 121+ veya Safari 17.4+ sürümüne güncelleyin.'
      );
    }
    if (/password|encrypted/i.test(msg)) {
      throw new Error('PDF şifre korumalı. Şifresiz bir kopya yükleyin.');
    }
    if (/Invalid PDF|InvalidPDFException/i.test(msg)) {
      throw new Error('Geçersiz veya bozuk PDF dosyası.');
    }
    throw new Error(`PDF okunamadı: ${msg}`);
  }
}

/**
 * Convert HTML to plain text with table support
 */
export function htmlToTextWithTables(html: string): string {
  let result = html;
  
  // Extract and convert tables first
  const tableMatches = result.match(/<table[^>]*>[\s\S]*?<\/table>/gi) || [];
  
  for (const tableHtml of tableMatches) {
    const markdownTable = htmlTableToMarkdown(tableHtml);
    result = result.replace(tableHtml, '\n\n' + markdownTable + '\n\n');
  }

  // DOCX gömülü görselleri: mammoth'un işaretlediği img'ler metin placeholder'ına çevrilir
  // NOT: açı ayracı (<>) İÇERMEYEN şema kullanılır — aksi halde birkaç satır altındaki
  // genel tag-temizliği (<[^>]+>) placeholder'ı "tag" sanıp yutar ve `>>` çöpü bırakır.
  result = result.replace(/<img[^>]*src="OCR_IMG_(\d+)"[^>]*\/?>/gi, '\n%%OCR_IMG_$1%%\n');

  // Convert paragraphs and line breaks
  result = result
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<h[1-6][^>]*>/gi, '\n\n');
  
  // Strip remaining HTML tags
  result = result.replace(/<[^>]+>/g, '');
  
  // Decode HTML entities
  result = result
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  
  // Clean up whitespace
  result = result
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  return result;
}

/**
 * Parse DOCX file and extract text content with table support
 */
export async function parseDocxFile(file: File): Promise<ParsedFile> {
  try {
    const arrayBuffer = await readFileAsArrayBuffer(file);

    // Görselleri topla: her görsel data-URL olarak diziye girer, HTML'de
    // OCR_IMG_k işaretli hafif bir <img> bırakılır (base64 HTML'e gömülmez).
    const images: string[] = [];
    const result = await mammoth.convertToHtml(
      { arrayBuffer },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          // Desteklenmeyen format (EMF/WMF vb.): images'e GİRMEZ, placeholder
          // üretilmez → indeks hizası bozulmaz, OCR'a gitmez, sahte uyarı olmaz.
          if (!isOcrableImageType(image.contentType)) {
            console.debug('DOCX görseli atlandı (desteklenmeyen format):', image.contentType);
            return { src: '' };
          }
          const b64 = await image.read('base64');
          const idx = images.length;
          images.push(`data:${image.contentType};base64,${b64}`);
          return { src: `OCR_IMG_${idx}` };
        }),
      }
    );
    const html = result.value;

    let content = htmlToTextWithTables(html);

    // OCR: fail-open — servis yoksa placeholder'lar boşla değiştirilir (görsel düşer, v2.1.23 davranışı)
    // injectOcrResults sadece görsel varsa çağrılır: görselsiz DOCX, v2.1.23 çıktısıyla birebir kalır.
    const warnings: string[] = [];
    if (images.length > 0) {
      if (!isOcrOff() && (await isOcrAvailable())) {
        // Tablo hücresindeki görsellerin sonucu metne ulaşamaz — OCR'a hiç gönderme
        const skip = collectTableImageIndices(html);
        const ocrTexts = await ocrImages(images.map((img, i) => (skip.has(i) ? null : img)));
        content = injectOcrResults(content, ocrTexts);
        const failed = ocrTexts.filter((t, i) => t === null && !skip.has(i)).length;
        if (failed > 0) warnings.push(`${failed} görselden metin çıkarılamadı.`);
      } else {
        content = injectOcrResults(content, images.map(() => null));
        warnings.push(`Dokümanda ${images.length} görsel var; OCR servisi kullanılamadığı için metinleri dahil edilemedi.`);
      }
    }
    content = content.trim();

    const wordCount = content.split(/\s+/).filter((word) => word.length > 0).length;

    if (result.messages.length > 0) {
      // type 'error' olanlar gerçek sorun → warn; geri kalanı (warning/info) beklenen dönüşüm notu → debug
      const errorMessages = result.messages.filter((m) => m.type === 'error');
      const otherMessages = result.messages.filter((m) => m.type !== 'error');
      if (errorMessages.length > 0) console.warn('DOCX dönüştürme hataları:', errorMessages);
      if (otherMessages.length > 0) console.debug('DOCX dönüştürme notları:', otherMessages);
    }

    return {
      content,
      metadata: {
        wordCount,
        format: 'docx',
        ...(warnings.length > 0 ? { warnings } : {}),
      },
    };
  } catch (error) {
    console.error('Error parsing DOCX file:', error);
    throw new Error(`DOCX dosyası okunamadı: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
  }
}

/**
 * Parse text file and extract content
 */
export async function parseTextFile(file: File): Promise<ParsedFile> {
  try {
    const content = await file.text();
    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
    
    return {
      content,
      metadata: {
        wordCount,
        format: file.name.split('.').pop()?.toLowerCase() || 'txt',
      },
    };
  } catch (error) {
    console.error('Error parsing text file:', error);
    throw new Error(`Dosya okunamadı: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
  }
}

/**
 * Parse any supported file and extract text content
 */
export async function parseFile(
  file: File,
  onProgress?: (current: number, total: number) => void,
): Promise<ParsedFile> {
  const fileName = file.name.toLowerCase();

  if (isPdfFile(fileName)) {
    return parsePdfFile(file, onProgress);
  }

  if (isDocxFile(fileName)) {
    return parseDocxFile(file);
  }

  if (isXlsxFile(fileName)) {
    return parseXlsxFile(file, onProgress);
  }

  if (isPptxFile(fileName)) {
    return parsePptxFile(file, onProgress);
  }

  if (isLegacyPptFile(fileName)) {
    throw new Error(
      'PowerPoint 97-2003 (.ppt) desteklenmiyor — dosyayı .pptx olarak kaydedip tekrar deneyin.',
    );
  }

  if (isTextFile(fileName)) {
    return parseTextFile(file);
  }

  throw new Error(`Desteklenmeyen dosya formatı: ${file.name}`);
}

/**
 * Get file type description for display
 */
export function getFileTypeDescription(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  
  const typeMap: Record<string, string> = {
    txt: 'Metin Dosyası',
    md: 'Markdown',
    markdown: 'Markdown',
    json: 'JSON',
    csv: 'CSV',
    xml: 'XML',
    yaml: 'YAML',
    yml: 'YAML',
    log: 'Log Dosyası',
    docx: 'Word Belgesi',
    pdf: 'PDF Belgesi',
    xlsx: 'Excel Tablosu',
    pptx: 'PowerPoint Sunumu',
    ppt: 'PowerPoint 97-2003',
  };

  // Kod dosyaları tek tek yazılmıyor; dil adı codeLanguages'tan geliyor ki
  // yeni bir dil eklenince burası unutulmasın
  const dil = dosyaDili(fileName);
  if (dil) return `${DIL_ADI[dil]} kodu`;
  
  return typeMap[ext] || 'Dosya';
}


/**
 * Get accepted file types string for file input
 */
export function getAcceptedFileTypes(): string {
  return SUPPORTED_EXTENSIONS.map(ext => `.${ext}`).join(',');
}
