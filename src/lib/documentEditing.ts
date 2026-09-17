/**
 * Belge düzenleme yönlendiricisi — DOCX, PPTX, XLSX ve PDF'i tek arayüz
 * altında toplar.
 *
 * Neden: panel ve context'in formatı bilmesi gerekmiyor. Formata göre dallanma
 * buraya toplanmasa, aynı `if (docx) … else …` üç ayrı yerde tekrarlanır ve
 * üçüncü format eklenince üçü de düzenlenir.
 *
 * Yeni format eklemek = burada bir `loadX` yazmak; çağıranlar değişmez.
 */
import JSZip from 'jszip';
import { XmlParse, domXmlParse } from './parsedFile';
import { isDocxFile, isPptxFile, isXlsxFile, isPdfFile } from './fileParser';

import { extractEditableParagraphs, formatForModel, allParagraphs } from './docxEditableText';
import { validateEdits, applyEdits } from './docxEditor';
import { renderDocxPreview } from './docxPreview';

import {
  loadSlides,
  extractEditableSlideParagraphs,
  formatSlidesForModel,
  validateSlideEdits,
  applySlideEdits,
} from './pptxEditor';
import { renderPptxPreview } from './pptxPreview';

import {
  loadWorkbook,
  extractEditableCells,
  formatCellsForModel,
  validateCellEdits,
  applyCellEdits,
} from './xlsxEditor';
import { renderXlsxPreview } from './xlsxPreview';

// PDF sürücüsü mupdf'i KENDİ İÇİNDE tembel yüklüyor; buradaki statik
// import 10 MB WASM'ı ana pakete çekmiyor.
import { loadPdf } from './pdfEditor';

export type EditableFormat = 'docx' | 'pptx' | 'xlsx' | 'pdf';

/** Model çıktısının ortak biçimi — iki formatta da aynı. */
export interface DocumentEdit {
  paragraph: number;
  /** Yoksa paragrafın tamamı yazılır (eşleşme aranmaz) */
  find?: string;
  replace: string;
  reason?: string;
}

/** Doğrulamayı geçmiş düzenleme + panelin göstereceği karşılaştırma. */
export interface AcceptedDocumentEdit {
  edit: DocumentEdit;
  before: string;
  after: string;
  occurrences: number;
  wholeParagraph: boolean;
  /**
   * Panelde gösterilecek YER etiketi — PPTX "Slayt 3", XLSX "Ocak!B2",
   * DOCX'te yok (panel "Paragraf N"e düşer).
   *
   * Önce `slide?: number` idi; XLSX'in göstereceği şey sayı değil ve aynı işi
   * yapan iki alan tutmak çürür.
   */
  locationLabel?: string;
}

export interface DocumentEditRejection {
  edit: DocumentEdit;
  message: string;
  /** Yer etiketi; bilinmiyorsa yok */
  locationLabel?: string;
}

/**
 * Önizlemede işaretlenecek birim.
 *
 * İki bilgi birlikte taşınıyor çünkü formatlar farklı şeye bakıyor: DOCX/PPTX
 * değişen METNİ arayıp işaretliyor, XLSX doğrudan HÜCRE ADRESİNİ kullanıyor.
 * Çağıran ikisini de verir, hangisinin kullanıldığını bilmez.
 */
export interface ChangedUnit {
  text: string;
  locationLabel?: string;
}

/** Açılmış, düzenlemeye hazır belge. Formata özgü her şey burada kapalı. */
export interface LoadedDocument {
  format: EditableFormat;
  /** Modele gidecek numaralı metin */
  numberedText: string;
  /** Panelde gösterilen birim sayısı */
  unitCount: number;
  validate(edits: DocumentEdit[]): {
    accepted: AcceptedDocumentEdit[];
    rejected: DocumentEditRejection[];
  };
  apply(edits: DocumentEdit[]): Promise<{ blob: Blob; appliedCount: number; failedCount: number }>;
  renderPreview(buf: ArrayBuffer, changed: ChangedUnit[]): Promise<string>;
}

/** Dosya adından düzenlenebilir format; desteklenmiyorsa null. */
export function detectEditableFormat(fileName: string): EditableFormat | null {
  if (isDocxFile(fileName)) return 'docx';
  if (isPptxFile(fileName)) return 'pptx';
  if (isXlsxFile(fileName)) return 'xlsx';
  if (isPdfFile(fileName)) return 'pdf';
  return null;
}

/** ChatInput'un kullanıcı mesajının başına eklediği ek listesi işareti.
 *  ChatContext bu satırı okuyup düzenlenebilir dosya var mı diye bakar —
 *  metin iki yerde ayrı ayrı yazılırsa biri değiştiğinde sessizce kopar. */
export const ATTACHMENT_MARKER = '📎 Eklenen dokümanlar:';

/**
 * Mesaja iliştirilmiş DÜZENLENEBİLİR dosya adları.
 * Yalnız uygulamanın kendi yazdığı ek satırına bakar; kullanıcı cümlesinin
 * içinde geçen ".docx" kelimesi tetiklemez.
 */
export function editableAttachmentsIn(messageText: string): string[] {
  const line = messageText.split('\n').find((l) => l.includes(ATTACHMENT_MARKER));
  if (!line) return [];
  return line
    .slice(line.indexOf(ATTACHMENT_MARKER) + ATTACHMENT_MARKER.length)
    .replace(/\*+$/, '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && detectEditableFormat(s));
}

/**
 * Sohbet modeline verilen not — düzenlenebilir belge ekliyken.
 *
 * "Artifact üretebilirsin" DEMEZ, çünkü üretemez: düzenleme paneli mesajı
 * sohbete gelmeden yakalar ve modelin böyle bir aracı yoktur. Öyle denseydi
 * model yapamadığı şeyi vaat ederdi.
 *
 * Çözdüğü asıl sorun: tetikleme "bu bir soru" dediğinde mesaj sohbete düşüyor
 * ve model belgeyi cevabın içine baştan yazıyor — kullanıcının indiremediği,
 * biçimi kaybolmuş bir metin yığını çıkıyor. Bunun yerine devretmesi söyleniyor.
 */
export function documentEditHandoffHint(fileNames: string[]): string {
  return (
    `KULLANICI DÜZENLENEBİLİR BİR BELGE EKLEDİ: ${fileNames.join(', ')}.\n` +
    `Bu uygulamada belge düzenleme işini ayrı bir düzenleme paneli yapar; sen ` +
    `düzenlenmiş dosya üretemezsin. Kullanıcı belgenin içeriğinin ` +
    `DEĞİŞTİRİLMESİNİ istiyorsa belgeyi cevabının içinde yeniden YAZMA — ne ` +
    `istediğini tek ve net bir cümleyle yazmasını söyle (ör. "yazım hatalarını ` +
    `düzelt"), panel kendiliğinden açılır ve düzenlenmiş dosyayı oradan indirir. ` +
    `Belge hakkında soru sorulduğunda ise normal şekilde cevap ver.`
  );
}

/** Kullanıcıya gösterilecek format adı (mesajlarda ve prompt'ta). */
export function formatLabel(format: EditableFormat): string {
  if (format === 'docx') return 'Word belgesi';
  if (format === 'pptx') return 'PowerPoint sunumu';
  // pdf AÇIKÇA yazılmalı: son satır koşulsuz döndüğü için yeni format
  // sessizce "Excel tablosu" olurdu ve tsc uyarmazdı.
  if (format === 'pdf') return 'PDF belgesi';
  return 'Excel tablosu';
}

/** Modele verilecek birim adı — "paragraf" iki formatta da doğru. */
export function unitLabel(format: EditableFormat): string {
  if (format === 'docx') return 'paragraf';
  if (format === 'pptx') return 'slayt paragrafı';
  // Aynı sessiz bozulma burada da var: PDF'in birimi satır, "hücre" değil.
  if (format === 'pdf') return 'satır';
  return 'hücre';
}

export interface ApplyOutcome {
  blob: Blob;
  applied: DocumentEdit[];
  failed: DocumentEdit[];
}

/**
 * PDF dalı ayrı bir fonksiyon, çünkü sürücünün `apply`'ı SAYI döndürüyor,
 * `ApplyOutcome` ise düzenleme LİSTESİ istiyor.
 *
 * Hangi düzenlemenin tutacağını `validate` söylüyor ve sürücüye yalnız onlar
 * veriliyor: sığmayan metin böylece dosyaya hiç girmiyor. Sürücü buna rağmen
 * bir düzenlemeyi düşürürse (aranan metin sayfada bulunamazsa) sayı eksik
 * geliyor; listenin sonundakiler başarısız sayılıyor, böylece panelin
 * gösterdiği `uygulanan/toplam` oranı doğru kalıyor.
 */
async function applyPdfEdits(buf: ArrayBuffer, edits: DocumentEdit[]): Promise<ApplyOutcome> {
  const belge = await loadPdf(buf);
  const { accepted, rejected } = belge.validate(edits);
  const kabul = accepted.map((a) => a.edit);
  const sonuc = await belge.apply(kabul);
  return {
    blob: sonuc.blob,
    applied: kabul.slice(0, sonuc.appliedCount),
    failed: [...kabul.slice(sonuc.appliedCount), ...rejected.map((r) => r.edit)],
  };
}

/**
 * Formata göre düzenlemeleri uygular. TEK dağıtım noktası.
 *
 * `LoadedDocument` tutmaya gerek yok: iki motor da buffer'ı baştan okuyor,
 * dolayısıyla bu çağrı kendi kendine yeter ve tekrar tekrar çağrılabilir
 * (panel, kullanıcı her kutucuk işaretlediğinde önizlemeyi yeniden üretiyor).
 */
export async function applyDocumentEdits(
  buf: ArrayBuffer,
  fileName: string,
  edits: DocumentEdit[],
  // Testler Node'da koşuyor; orada global DOMParser/XMLSerializer yok
  xmlParse: XmlParse = domXmlParse,
  serialize?: (doc: Document) => string,
): Promise<ApplyOutcome> {
  const format = detectEditableFormat(fileName);
  const ser = serialize ?? ((doc: Document) => new XMLSerializer().serializeToString(doc));
  if (format === 'docx') return applyEdits(buf, edits, xmlParse, ser);
  if (format === 'pptx') return applySlideEdits(buf, edits, xmlParse, ser);
  if (format === 'xlsx') return applyCellEdits(buf, edits, xmlParse, ser);
  // ZORUNLU: panel indirmeyi ve önizleme yenilemeyi bu bağımsız fonksiyondan
  // geçiriyor; dal eksik olsa testler geçer ama arayüz "desteklenmiyor" der.
  if (format === 'pdf') return applyPdfEdits(buf, edits);
  throw new Error('Bu dosya türünde düzenleme desteklenmiyor.');
}

/** Formata göre önizleme HTML'i. Dağıtım yine tek yerde. */
export async function renderDocumentPreview(
  buf: ArrayBuffer,
  fileName: string,
  changed: ChangedUnit[] = [],
  xmlParse: XmlParse = domXmlParse,
): Promise<string> {
  const format = detectEditableFormat(fileName);
  // Her format kendine gerekeni alır: metin mi, adres mi
  if (format === 'docx') return renderDocxPreview(buf, changed.map((c) => c.text));
  if (format === 'pptx') return renderPptxPreview(buf, changed.map((c) => c.text), xmlParse);
  if (format === 'xlsx') {
    const refs = changed.map((c) => c.locationLabel).filter((l): l is string => !!l);
    return renderXlsxPreview(buf, refs, xmlParse);
  }
  if (format === 'pdf') {
    // Sürücü sayfaları kendi basıyor; hangilerini basacağını `changed`
    // içindeki yer etiketinden ("Sayfa N") çıkarıyor.
    const belge = await loadPdf(buf);
    return belge.renderPreview(buf, changed);
  }
  throw new Error('Bu dosya türünde önizleme desteklenmiyor.');
}

async function loadDocx(buf: ArrayBuffer, xmlParse: XmlParse): Promise<LoadedDocument> {
  const zip = await JSZip.loadAsync(buf);
  const part = zip.file('word/document.xml');
  if (!part) throw new Error('Geçerli bir Word belgesi değil.');
  const doc = xmlParse(await part.async('string'));

  const paras = extractEditableParagraphs(doc);
  if (paras.length === 0) throw new Error('Belgede düzenlenebilir metin bulunamadı.');

  return {
    format: 'docx',
    numberedText: formatForModel(paras),
    unitCount: allParagraphs(doc).length,
    validate(edits) {
      const { accepted, rejected } = validateEdits(doc, edits);
      return {
        accepted: accepted.map((a) => ({ ...a, edit: a.edit as DocumentEdit })),
        rejected: rejected.map((r) => ({ edit: r.edit as DocumentEdit, message: r.message })),
      };
    },
    async apply(edits) {
      const r = await applyEdits(buf, edits);
      return { blob: r.blob, appliedCount: r.applied.length, failedCount: r.failed.length };
    },
    renderPreview: (b, changed) => renderDocxPreview(b, changed.map((c) => c.text)),
  };
}

async function loadPptx(buf: ArrayBuffer, xmlParse: XmlParse): Promise<LoadedDocument> {
  const zip = await JSZip.loadAsync(buf);
  const slides = await loadSlides(zip, xmlParse);
  if (slides.length === 0) throw new Error('Geçerli bir PowerPoint sunumu değil.');

  const paras = extractEditableSlideParagraphs(slides);
  if (paras.length === 0) throw new Error('Sunumda düzenlenebilir metin bulunamadı.');

  return {
    format: 'pptx',
    numberedText: formatSlidesForModel(paras),
    unitCount: paras.length,
    validate(edits) {
      const { accepted, rejected } = validateSlideEdits(slides, edits);
      return {
        accepted: accepted.map(({ slide, ...a }) => ({
          ...a,
          edit: a.edit as DocumentEdit,
          locationLabel: `Slayt ${slide}`,
        })),
        rejected: rejected.map((r) => ({
          edit: r.edit as DocumentEdit,
          message: r.message,
          ...(r.slide ? { locationLabel: `Slayt ${r.slide}` } : {}),
        })),
      };
    },
    async apply(edits) {
      const r = await applySlideEdits(buf, edits);
      return { blob: r.blob, appliedCount: r.applied.length, failedCount: r.failed.length };
    },
    renderPreview: (b, changed) => renderPptxPreview(b, changed.map((c) => c.text)),
  };
}

async function loadXlsx(buf: ArrayBuffer, xmlParse: XmlParse): Promise<LoadedDocument> {
  const zip = await JSZip.loadAsync(buf);
  const wb = await loadWorkbook(zip, xmlParse);
  if (wb.sheets.length === 0) throw new Error('Geçerli bir Excel dosyası değil.');

  const cells = extractEditableCells(wb);
  if (cells.length === 0) throw new Error('Tabloda düzenlenebilir hücre bulunamadı.');

  return {
    format: 'xlsx',
    numberedText: formatCellsForModel(cells),
    unitCount: cells.length,
    validate(edits) {
      const { accepted, rejected } = validateCellEdits(wb, edits);
      return {
        accepted: accepted.map((a) => ({ ...a, edit: a.edit as DocumentEdit })),
        rejected: rejected.map((r) => ({
          edit: r.edit as DocumentEdit,
          message: r.message,
          ...(r.locationLabel ? { locationLabel: r.locationLabel } : {}),
        })),
      };
    },
    async apply(edits) {
      const r = await applyCellEdits(buf, edits);
      return { blob: r.blob, appliedCount: r.applied.length, failedCount: r.failed.length };
    },
    renderPreview: (b, changed) =>
      renderXlsxPreview(
        b,
        changed.map((c) => c.locationLabel).filter((l): l is string => !!l),
      ),
  };
}

/**
 * Dosyayı açar ve düzenlemeye hazır hâle getirir.
 *
 * DİKKAT: validate/apply, AÇILDIĞI ANDAKİ belge üzerinde çalışır. PPTX'te
 * slaytlar bir kez parse edilip tutulur; aynı LoadedDocument'i iki kez
 * uygulamak için kullanma, her tur yeniden yükle.
 */
export async function loadEditableDocument(
  buf: ArrayBuffer,
  fileName: string,
  xmlParse: XmlParse = domXmlParse,
): Promise<LoadedDocument> {
  const format = detectEditableFormat(fileName);
  if (format === 'docx') return loadDocx(buf, xmlParse);
  if (format === 'pptx') return loadPptx(buf, xmlParse);
  if (format === 'xlsx') return loadXlsx(buf, xmlParse);
  if (format === 'pdf') return loadPdf(buf);
  throw new Error('Bu dosya türünde düzenleme desteklenmiyor.');
}
