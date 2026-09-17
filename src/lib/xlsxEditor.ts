/**
 * XLSX cerrahi düzenleme — hücre değeri değiştirme.
 *
 * DOCX/PPTX motoru buraya YETMEZ. Onlar aynı yapıyı paylaşıyordu (paragraf içinde
 * metin run'ları, tek fark etiket adı), o yüzden ooxmlEdit ikisine de yetti.
 * XLSX'te iki yapısal tuzak var, ikisi de ölçüldü:
 *
 * 1) METİN HÜCREDE DEĞİL, ORTAK TABLODA. Metin hücreleri `t="s"` ve <v> içinde
 *    xl/sharedStrings.xml'e bir İNDEKS tutar. Aynı metni kullanan hücreler AYNI
 *    girdiyi paylaşır. Ölçüm: A2 ve A4 tek <si>'yi kullanıyorken o girdiyi
 *    değiştirmek İKİSİNİ de değiştiriyor. "Sadece 4. satırı düzelt" sessizce 2.
 *    satırı da bozardı.
 *    Çözüm: mevcut girdiye DOKUNMA, sona YENİ bir <si> ekle, yalnız hedef
 *    hücrenin <v>'sini yeni indekse yönlendir.
 *
 * 2) FORMÜL ÖNBELLEĞİ BAYATLIYOR. Excel <f> yanına son hesaplanan değeri de
 *    yazar. Ölçüm: A1=3→5 yapıldığında B1 (=A1*10) hâlâ 30 okuyor.
 *    Çözüm: dokunulan sayfadaki TÜM formül önbellekleri silinir +
 *    workbook'a fullCalcOnLoad. Bağımlılık analizi YAPILMAZ — hangi formülün
 *    neye baktığını çözmek (aralıklar, sayfa-ötesi, adlandırılmış aralıklar)
 *    sessizce yanlış olabilir. Fazla silmek zararsız, eksik silmek yalan söyler.
 *
 * XML API KISITI: testler Node'da @xmldom/xmldom ile koşar; `.children` ve
 * `querySelector` YOKTUR (ooxmlEdit'teki aynı kısıt).
 */
import JSZip from 'jszip';
import { XmlParse, domXmlParse } from './parsedFile';
import { elementChildren } from './ooxmlEdit';

export interface XlsxEdit {
  /** Dosya genelinde sürekli akan hücre indeksi */
  paragraph: number;
  /** Yoksa hücrenin TAMAMI `replace` olur; varsa hücre metninde kısmi değişim */
  find?: string;
  replace: string;
  reason?: string;
}

interface SheetPart {
  path: string;
  name: string;
  doc: Document;
}

/** Açılmış çalışma kitabı — motorun tüm giriş noktaları bunu alır. */
export interface LoadedWorkbook {
  sheets: SheetPart[];
  /** xl/sharedStrings.xml — dosyada yoksa null (SheetJS satır-içi yazabiliyor) */
  sst: { path: string; doc: Document } | null;
  workbook: { path: string; doc: Document };
}

export interface EditableCell {
  /** Sürekli indeks — model bunu kullanır */
  index: number;
  sheet: string;
  sheetIdx: number;
  /** Hücre adresi, ör. "B2" */
  ref: string;
  text: string;
  /** Sayısal hücre mi — yazma kuralı buna göre değişir */
  numeric: boolean;
}

const local = (el: Element) => el.nodeName.replace(/^[^:]+:/, '');

/**
 * Elemanı BELGENİN KÖK AD ALANINDA üretir.
 *
 * NEDEN createElement DEĞİL — kullanıcıya giden bir hata oldu: `createElement`
 * ad alanı `null` olan bir eleman üretiyor. Tarayıcının XMLSerializer'ı,
 * standart gereği, varsayılan ad alanı bildiren bir ebeveynin içindeki
 * ad-alansız elemanı `xmlns=""` ile yazmak ZORUNDA. Yani `<v xmlns="">25</v>`
 * çıkıyor, Excel `v`'yi spreadsheetml ad alanında aradığı için bulamıyor ve
 * HÜCRE BOŞ görünüyor.
 *
 * Testler bunu göremedi: @xmldom/xmldom iki durumda da `<v>25</v>` yazıyor.
 * O yüzden testler artık çıktıya değil, `namespaceURI`'ye bakıyor —
 * serileştiriciden bağımsız olan tek özellik bu.
 */
function makeEl(doc: Document, name: string): Element {
  const ns = doc.documentElement?.namespaceURI ?? null;
  return ns ? doc.createElementNS(ns, name) : doc.createElement(name);
}

/** Bir düğümün altındaki tüm <t> metinleri (zengin metin run'ları dahil). */
function tText(el: Element): string {
  const ts = el.getElementsByTagName('t');
  let out = '';
  for (let i = 0; i < ts.length; i++) out += ts[i].textContent || '';
  return out;
}

/** İlk eşleşen çocuk eleman (yerel ada göre). */
function child(el: Element, name: string): Element | null {
  for (const c of elementChildren(el)) if (local(c) === name) return c;
  return null;
}

// ---------------------------------------------------------------------------
// Açma
// ---------------------------------------------------------------------------

/**
 * Sayfaları workbook SIRASINA göre açar.
 *
 * Dosya adları sıra vermez: sayfalar yeniden sıralandığında adlar değişmiyor,
 * sheet3.xml ilk sayfa olabilir. PPTX'teki slayt sırası sorununun aynısı.
 */
export async function loadWorkbook(zip: JSZip, xmlParse: XmlParse): Promise<LoadedWorkbook> {
  const readText = async (p: string) => {
    const f = zip.file(p);
    return f ? f.async('string') : null;
  };

  const wbXml = await readText('xl/workbook.xml');
  if (!wbXml) throw new Error('Geçerli bir Excel dosyası değil.');
  const wbDoc = xmlParse(wbXml);

  const relsXml = await readText('xl/_rels/workbook.xml.rels');
  const relTarget = new Map<string, string>();
  if (relsXml) {
    const relsDoc = xmlParse(relsXml);
    const rels = relsDoc.getElementsByTagName('Relationship');
    for (let i = 0; i < rels.length; i++) {
      const id = rels[i].getAttribute('Id');
      const target = rels[i].getAttribute('Target');
      if (id && target) relTarget.set(id, target);
    }
  }

  const sheets: SheetPart[] = [];
  const sheetEls = wbDoc.getElementsByTagName('sheet');
  for (let i = 0; i < sheetEls.length; i++) {
    const name = sheetEls[i].getAttribute('name') || `Sayfa${i + 1}`;
    // r:id niteliği — xmldom'da getAttribute('r:id') qualified adla çalışır
    const rid = sheetEls[i].getAttribute('r:id') || sheetEls[i].getAttribute('id');
    const target = rid ? relTarget.get(rid) : undefined;
    // Target xl/ dizinine göreli: "worksheets/sheet1.xml"
    const path = target
      ? `xl/${target.replace(/^\.?\//, '')}`
      : `xl/worksheets/sheet${i + 1}.xml`;
    const xml = await readText(path);
    if (!xml) continue;
    try {
      sheets.push({ path, name, doc: xmlParse(xml) });
    } catch {
      /* bozuk sayfa atlanır, dosya düşmez */
    }
  }

  const sstXml = await readText('xl/sharedStrings.xml');
  return {
    sheets,
    sst: sstXml ? { path: 'xl/sharedStrings.xml', doc: xmlParse(sstXml) } : null,
    workbook: { path: 'xl/workbook.xml', doc: wbDoc },
  };
}

/** Ortak dizge tablosundaki <si> girdileri. */
function sstItems(wb: LoadedWorkbook): Element[] {
  if (!wb.sst) return [];
  const root = wb.sst.doc.getElementsByTagName('sst')[0];
  if (!root) return [];
  return elementChildren(root).filter((e) => local(e) === 'si');
}

// ---------------------------------------------------------------------------
// Hücre okuma
// ---------------------------------------------------------------------------

/** Sayfanın <c> hücreleri, doküman sırasında. */
function sheetCells(doc: Document): Element[] {
  const cs = doc.getElementsByTagName('c');
  const out: Element[] = [];
  for (let i = 0; i < cs.length; i++) out.push(cs[i]);
  return out;
}

/** Hücrede formül var mı — formül hücreleri düzenlenmez. */
function isFormula(c: Element): boolean {
  return child(c, 'f') !== null;
}

type CellKind = 'sayi' | 'ortak-dizge' | 'satir-ici' | 'desteklenmeyen';

function cellKind(c: Element): CellKind {
  const t = c.getAttribute('t');
  if (!t || t === 'n') return 'sayi';
  if (t === 's') return 'ortak-dizge';
  if (t === 'inlineStr') return 'satir-ici';
  return 'desteklenmeyen'; // str (formül sonucu), b, e, d
}

/** Hücrenin görünen metni. */
function cellText(c: Element, items: Element[]): string {
  switch (cellKind(c)) {
    case 'ortak-dizge': {
      const v = child(c, 'v');
      const idx = Number(v?.textContent ?? '');
      const si = Number.isInteger(idx) ? items[idx] : undefined;
      return si ? tText(si) : '';
    }
    case 'satir-ici': {
      const is = child(c, 'is');
      return is ? tText(is) : '';
    }
    default: {
      const v = child(c, 'v');
      return v?.textContent ?? '';
    }
  }
}

/**
 * Modele verilecek düzenlenebilir hücreler.
 *
 * İndeks TÜM DOSYA boyunca sürekli akar ve HER <c> için artar — formül veya
 * desteklenmeyen tür listeye girmese bile. Böylece model o indekse bir düzenleme
 * yazarsa doğrulama onu bulup "düzenlenemez" diye reddeder; indeks kaymadığı için
 * yanlışlıkla komşu hücreye uygulanmaz. (PPTX'te metinsiz paragrafların davranışı.)
 */
export function extractEditableCells(wb: LoadedWorkbook): EditableCell[] {
  const items = sstItems(wb);
  const out: EditableCell[] = [];
  let index = 0;
  wb.sheets.forEach((s, si) => {
    for (const c of sheetCells(s.doc)) {
      const kind = cellKind(c);
      const skip = isFormula(c) || kind === 'desteklenmeyen';
      if (!skip) {
        const text = cellText(c, items);
        if (text.trim().length > 0) {
          out.push({
            index,
            sheet: s.name,
            sheetIdx: si,
            ref: c.getAttribute('r') || '',
            text,
            numeric: kind === 'sayi',
          });
        }
      }
      index++;
    }
  });
  return out;
}

/** Modele verilecek numaralı metin. Adres BAĞLAM içindir; doğrulama indekse göre. */
export function formatCellsForModel(cells: EditableCell[]): string {
  const lines: string[] = [];
  let lastSheet = '';
  for (const c of cells) {
    if (c.sheet !== lastSheet) {
      lines.push(`--- Sayfa: ${c.sheet} ---`);
      lastSheet = c.sheet;
    }
    lines.push(`[${c.index}] ${c.ref} = ${c.text}`);
  }
  return lines.join('\n');
}

/** Sürekli indeksi (sayfa, hücre) çiftine çevirir. */
function locate(
  wb: LoadedWorkbook,
  index: number,
): { sheetIdx: number; c: Element } | null {
  let base = 0;
  for (let si = 0; si < wb.sheets.length; si++) {
    const cs = sheetCells(wb.sheets[si].doc);
    if (index < base + cs.length) return { sheetIdx: si, c: cs[index - base] };
    base += cs.length;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Doğrulama
// ---------------------------------------------------------------------------

export type XlsxRejectionReason =
  | 'hucre-yok'
  | 'formul'
  | 'tur-desteklenmiyor'
  | 'bulunamadi'
  | 'bos-hucre';

export interface XlsxRejection {
  edit: XlsxEdit;
  reason: XlsxRejectionReason;
  message: string;
  /** "Ocak!B2" — bilinmiyorsa yok */
  locationLabel?: string;
}

export interface XlsxAcceptedEdit {
  edit: XlsxEdit;
  before: string;
  after: string;
  occurrences: number;
  wholeParagraph: boolean;
  locationLabel: string;
}

const MESSAGES: Record<XlsxRejectionReason, string> = {
  'hucre-yok': 'Dosyada bu numarada bir hücre yok.',
  formul: 'Formül hücresi düzenlenemez.',
  'tur-desteklenmiyor': 'Bu hücre türü (tarih/boolean/hata) düzenlenemez.',
  bulunamadi: 'Aranan metin bu hücrede bulunamadı.',
  'bos-hucre': 'Boş hücreye yazma desteklenmiyor.',
};

/** Yeni hücre metni: find varsa kısmi, yoksa tamamı. */
function nextText(current: string, edit: XlsxEdit): string {
  if (!edit.find) return edit.replace;
  return current.split(edit.find).join(edit.replace);
}

function countOf(haystack: string, needle: string): number {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

/** Düzenlemeleri UYGULAMADAN doğrular. */
export function validateCellEdits(
  wb: LoadedWorkbook,
  edits: XlsxEdit[],
): { accepted: XlsxAcceptedEdit[]; rejected: XlsxRejection[] } {
  const items = sstItems(wb);
  const accepted: XlsxAcceptedEdit[] = [];
  const rejected: XlsxRejection[] = [];

  for (const edit of edits) {
    const found = locate(wb, edit.paragraph);
    if (!found) {
      rejected.push({ edit, reason: 'hucre-yok', message: MESSAGES['hucre-yok'] });
      continue;
    }
    const label = `${wb.sheets[found.sheetIdx].name}!${found.c.getAttribute('r') || '?'}`;

    if (isFormula(found.c)) {
      rejected.push({ edit, reason: 'formul', message: MESSAGES.formul, locationLabel: label });
      continue;
    }
    if (cellKind(found.c) === 'desteklenmeyen') {
      rejected.push({
        edit,
        reason: 'tur-desteklenmiyor',
        message: MESSAGES['tur-desteklenmiyor'],
        locationLabel: label,
      });
      continue;
    }

    const current = cellText(found.c, items);
    if (current.trim().length === 0) {
      rejected.push({
        edit,
        reason: 'bos-hucre',
        message: MESSAGES['bos-hucre'],
        locationLabel: label,
      });
      continue;
    }

    if (edit.find) {
      const hits = countOf(current, edit.find);
      if (hits === 0) {
        rejected.push({
          edit,
          reason: 'bulunamadi',
          message: MESSAGES.bulunamadi,
          locationLabel: label,
        });
        continue;
      }
      accepted.push({
        edit,
        before: current,
        after: nextText(current, edit),
        occurrences: hits,
        wholeParagraph: false,
        locationLabel: label,
      });
      continue;
    }

    accepted.push({
      edit,
      before: current,
      after: edit.replace,
      occurrences: 1,
      wholeParagraph: true,
      locationLabel: label,
    });
  }

  return { accepted, rejected };
}

// ---------------------------------------------------------------------------
// Yazma
// ---------------------------------------------------------------------------

/** Sayı gibi mi görünüyor — sayısal hücre sayısal kalsın diye. */
function looksNumeric(s: string): boolean {
  const t = s.trim();
  if (t.length === 0) return false;
  return Number.isFinite(Number(t));
}

/**
 * Ortak dizge tablosuna YENİ girdi ekler ve indeksini döndürür.
 *
 * Mevcut girdiye asla dokunulmaz: aynı <si>'yi paylaşan diğer hücreler
 * etkilenmesin (bu motorun var olma sebebi).
 *
 * `createElement` (NS'siz) bilerek: <sst> zaten varsayılan ad alanını
 * bildirdiği için serileştirmede fazladan xmlns çıkmıyor ve yeniden
 * ayrıştırıldığında girdi doğru ad alanına düşüyor. Test bunu round-trip
 * ile doğruluyor.
 */
function appendSharedString(wb: LoadedWorkbook, text: string): number | null {
  if (!wb.sst) return null;
  const root = wb.sst.doc.getElementsByTagName('sst')[0];
  if (!root) return null;

  const before = sstItems(wb).length;
  const si = makeEl(wb.sst.doc, 'si');
  const t = makeEl(wb.sst.doc, 't');
  t.textContent = text;
  if (text !== text.trim()) t.setAttribute('xml:space', 'preserve');
  si.appendChild(t);
  root.appendChild(si);

  // count/uniqueCount bayat kalsa da okunuyordu (ölçüldü) ama gerçek Excel'in
  // toleransı test edilemedi — güncellemek bedava.
  const total = String(before + 1);
  if (root.getAttribute('count') !== null) root.setAttribute('count', total);
  if (root.getAttribute('uniqueCount') !== null) root.setAttribute('uniqueCount', total);
  return before;
}

/** Hücrenin tüm çocuklarını siler (yeni içerik yazılacak). */
function clearCell(c: Element) {
  for (const ch of elementChildren(c)) c.removeChild(ch);
}

function setNumeric(c: Element, doc: Document, value: string): boolean {
  clearCell(c);
  c.removeAttribute('t');
  const v = makeEl(doc, 'v');
  v.textContent = value.trim();
  c.appendChild(v);
  return true;
}

function setSharedString(
  c: Element,
  doc: Document,
  wb: LoadedWorkbook,
  value: string,
): boolean {
  const idx = appendSharedString(wb, value);
  if (idx === null) {
    // sharedStrings.xml YOK — satır-içi dizgeye düş. Bu dosyalarda (ör. SheetJS
    // üretimi) ortak tablo hiç kullanılmıyor, inlineStr geçerli bir alternatif.
    clearCell(c);
    c.setAttribute('t', 'inlineStr');
    const is = makeEl(doc, 'is');
    const t = makeEl(doc, 't');
    t.textContent = value;
    if (value !== value.trim()) t.setAttribute('xml:space', 'preserve');
    is.appendChild(t);
    c.appendChild(is);
    return true;
  }
  clearCell(c);
  c.setAttribute('t', 's');
  const v = makeEl(doc, 'v');
  v.textContent = String(idx);
  c.appendChild(v);
  return true;
}

function setInlineString(c: Element, doc: Document, value: string): boolean {
  clearCell(c);
  c.setAttribute('t', 'inlineStr');
  const is = makeEl(doc, 'is');
  const t = makeEl(doc, 't');
  t.textContent = value;
  if (value !== value.trim()) t.setAttribute('xml:space', 'preserve');
  is.appendChild(t);
  c.appendChild(is);
  return true;
}

/**
 * Dokunulan sayfadaki TÜM formül önbelleklerini siler.
 *
 * Bağımlılık analizi yok — gerekçe dosya başındaki not. Fazla silmenin bedeli
 * Excel'in yeniden hesaplaması; eksik silmenin bedeli kullanıcıya yanlış sayı
 * göstermek.
 */
function dropFormulaCaches(doc: Document): number {
  let n = 0;
  for (const c of sheetCells(doc)) {
    if (!isFormula(c)) continue;
    const v = child(c, 'v');
    if (v) {
      c.removeChild(v);
      n++;
    }
  }
  return n;
}

/**
 * Workbook'a fullCalcOnLoad koyar — Excel açılışta her şeyi yeniden hesaplar.
 *
 * DİKKAT: <calcPr> şema sırasında <sheets>/<definedNames>'den SONRA gelir.
 * Yanlış yere konursa Excel dosyayı "onarmak" isteyebilir; bu ortamda gerçek
 * Excel ile test edilemiyor, o yüzden mevcut düğüm varsa yalnız niteliği
 * güncelliyoruz ve yoksa <workbook>'un SONUNA ekliyoruz (sıranın en güvenli
 * ucu).
 */
function setFullCalcOnLoad(doc: Document): void {
  const root = doc.getElementsByTagName('workbook')[0];
  if (!root) return;
  const existing = elementChildren(root).find((e) => local(e) === 'calcPr');
  if (existing) {
    existing.setAttribute('fullCalcOnLoad', '1');
    return;
  }
  const calcPr = makeEl(doc, 'calcPr');
  calcPr.setAttribute('fullCalcOnLoad', '1');
  root.appendChild(calcPr);
}

export interface XlsxApplyResult {
  blob: Blob;
  applied: XlsxEdit[];
  /** Uygulanamayanlar — sessizce düşmesin diye raporlanır */
  failed: XlsxEdit[];
  /** Önbelleği silinen formül hücresi sayısı — panel uyarısı için */
  formulasInvalidated: number;
}

/**
 * Düzenlemeleri uygulayıp YENİ bir .xlsx üretir. Orijinal buffer değişmez.
 * Yalnız DEĞİŞEN sayfa dosyaları (+ gerekirse sharedStrings/workbook) yeniden
 * yazılır; styles, theme, grafikler, pivot tanımları dokunulmadan kalır.
 */
export async function applyCellEdits(
  buf: ArrayBuffer,
  edits: XlsxEdit[],
  xmlParse: XmlParse = domXmlParse,
  serialize: (doc: Document) => string = (doc) => new XMLSerializer().serializeToString(doc),
): Promise<XlsxApplyResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    throw new Error('Excel dosyası okunamadı veya şifre korumalı.');
  }

  const wb = await loadWorkbook(zip, xmlParse);
  if (wb.sheets.length === 0) throw new Error('Geçerli bir Excel dosyası değil.');

  const items = sstItems(wb);
  const applied: XlsxEdit[] = [];
  const failed: XlsxEdit[] = [];
  const touched = new Set<number>();
  let sstChanged = false;

  for (const edit of edits) {
    const found = locate(wb, edit.paragraph);
    if (!found || isFormula(found.c) || cellKind(found.c) === 'desteklenmeyen') {
      failed.push(edit);
      continue;
    }
    const doc = wb.sheets[found.sheetIdx].doc;
    const current = cellText(found.c, items);
    if (current.trim().length === 0) {
      failed.push(edit);
      continue;
    }
    if (edit.find && countOf(current, edit.find) === 0) {
      failed.push(edit);
      continue;
    }

    const value = nextText(current, edit);
    const kind = cellKind(found.c);
    let ok = false;
    if (kind === 'sayi') {
      // Sayısal hücreye sayı gelirse sayısal KALIR (yoksa SUM bozulur);
      // sayı değilse dizgeye döner
      ok = looksNumeric(value)
        ? setNumeric(found.c, doc, value)
        : setSharedString(found.c, doc, wb, value);
      if (ok && !looksNumeric(value)) sstChanged = true;
    } else if (kind === 'ortak-dizge') {
      ok = setSharedString(found.c, doc, wb, value);
      if (ok) sstChanged = true;
    } else {
      ok = setInlineString(found.c, doc, value);
    }

    if (ok) {
      applied.push(edit);
      touched.add(found.sheetIdx);
    } else {
      failed.push(edit);
    }
  }

  let formulasInvalidated = 0;
  for (const si of touched) {
    formulasInvalidated += dropFormulaCaches(wb.sheets[si].doc);
    zip.file(wb.sheets[si].path, serialize(wb.sheets[si].doc));
  }
  if (touched.size > 0) {
    setFullCalcOnLoad(wb.workbook.doc);
    zip.file(wb.workbook.path, serialize(wb.workbook.doc));
  }
  if (sstChanged && wb.sst) {
    zip.file(wb.sst.path, serialize(wb.sst.doc));
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  return { blob, applied, failed, formulasInvalidated };
}

// ---------------------------------------------------------------------------
// Önizleme için tablo verisi
// ---------------------------------------------------------------------------

/** "B12" → {col: 1, row: 11} (0-tabanlı). Adres bozuksa null. */
export function parseRef(ref: string): { col: number; row: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(ref.trim().toUpperCase());
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, row: Number(m[2]) - 1 };
}

export interface SheetGridCell {
  text: string;
  /** Formül hücresi — önizlemede formülün kendisi gösterilir */
  formula?: string;
  ref: string;
}

export interface SheetGrid {
  name: string;
  rows: (SheetGridCell | null)[][];
}

/** Önizlemenin çizeceği ızgara. Boş hücreler null. */
export function buildSheetGrids(wb: LoadedWorkbook): SheetGrid[] {
  const items = sstItems(wb);
  return wb.sheets.map((s) => {
    const cells: { pos: { col: number; row: number }; cell: SheetGridCell }[] = [];
    let maxRow = -1;
    let maxCol = -1;
    for (const c of sheetCells(s.doc)) {
      const ref = c.getAttribute('r') || '';
      const pos = parseRef(ref);
      if (!pos) continue;
      const f = child(c, 'f');
      cells.push({
        pos,
        cell: {
          ref,
          text: f ? '' : cellText(c, items),
          ...(f ? { formula: `=${f.textContent || ''}` } : {}),
        },
      });
      if (pos.row > maxRow) maxRow = pos.row;
      if (pos.col > maxCol) maxCol = pos.col;
    }
    const rows: (SheetGridCell | null)[][] = Array.from({ length: maxRow + 1 }, () =>
      Array.from({ length: maxCol + 1 }, () => null),
    );
    for (const { pos, cell } of cells) rows[pos.row][pos.col] = cell;
    return { name: s.name, rows };
  });
}
