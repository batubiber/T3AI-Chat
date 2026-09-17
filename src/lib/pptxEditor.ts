/**
 * PPTX cerrahi düzenleme — DOCX motorunun sunum karşılığı.
 *
 * Yapı aynı: paragraf (<a:p>) içinde metin run'ları (<a:t>). Run-bölme mantığı
 * ooxmlEdit'te ortak; burada yalnız PPTX'e özgü olan var.
 *
 * DOCX'TEN TEK GERÇEK FARK: sunum tek dosya değil. Her slayt ayrı bir
 * ppt/slides/slideN.xml. Bu yüzden paragraf indeksi TÜM SUNUM boyunca sürekli
 * akıyor (slayt 1'in son paragrafından sonra slayt 2'nin ilki gelir) ve
 * uygulama sırasında hangi indeksin hangi dosyaya düştüğü izleniyor.
 *
 * Slayt SIRASI sldIdLst'ten okunuyor (pptxParser.resolveSlideOrder): deck
 * yeniden sıralandığında dosya adları değişmiyor, slide3.xml ilk slayt olabilir.
 */
import JSZip from 'jszip';
import { XmlParse, domXmlParse } from './parsedFile';
import { resolveSlideOrder } from './pptxParser';
import {
  countOccurrences,
  paragraphTextOf,
  replaceInParagraphTagged,
  replaceParagraphTextTagged,
} from './ooxmlEdit';

/** PPTX'te metin düğümü etiketi */
const A_TEXT = 'a:t';

export interface PptxEdit {
  /** Sunum genelinde sürekli akan paragraf indeksi */
  paragraph: number;
  /** Yoksa paragrafın TAMAMI `replace` ile değiştirilir (eşleşme aranmaz) */
  find?: string;
  replace: string;
  reason?: string;
}

export interface EditableSlideParagraph {
  /** Sunum genelinde sürekli indeks — model bunu kullanır */
  index: number;
  /** Kaçıncı slayt (1-tabanlı) — panelde gösterilir */
  slide: number;
  text: string;
}

/** <a:p> paragrafları, doküman sırasında. Belge VEYA eleman altında arar
 *  (şekil/hücre içinde de kullanılıyor). */
export function slideParagraphs(scope: Document | Element): Element[] {
  const ps = scope.getElementsByTagName('a:p');
  const out: Element[] = [];
  for (let i = 0; i < ps.length; i++) out.push(ps[i]);
  return out;
}

/** Sunumun tüm slaytlarını sırayla açar. */
export async function loadSlides(
  zip: JSZip,
  xmlParse: XmlParse,
): Promise<{ path: string; doc: Document }[]> {
  const readText = async (p: string) => {
    const f = zip.file(p);
    return f ? f.async('string') : null;
  };
  const presXml = await readText('ppt/presentation.xml');
  const presRels = await readText('ppt/_rels/presentation.xml.rels');

  let paths: string[] = [];
  if (presXml && presRels) {
    try {
      paths = resolveSlideOrder(presXml, presRels, xmlParse);
    } catch {
      paths = [];
    }
  }
  if (paths.length === 0) {
    // Sayısal sıralama — sözlük sırası slide10'u slide2'den öne alırdı
    paths = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort(
        (a, b) =>
          Number(a.match(/slide(\d+)\.xml$/)![1]) - Number(b.match(/slide(\d+)\.xml$/)![1]),
      );
  }

  const out: { path: string; doc: Document }[] = [];
  for (const path of paths) {
    const xml = await readText(path);
    if (!xml) continue;
    try {
      out.push({ path, doc: xmlParse(xml) });
    } catch {
      /* bozuk slayt atlanır, sunum düşmez */
    }
  }
  return out;
}

/**
 * Modele verilecek düzenlenebilir paragraflar. İndeks TÜM SUNUM boyunca sürekli;
 * metinsiz paragraflar listeye girmez ama indeks kaydırılmaz.
 */
export function extractEditableSlideParagraphs(
  slides: { doc: Document }[],
): EditableSlideParagraph[] {
  const out: EditableSlideParagraph[] = [];
  let index = 0;
  slides.forEach((s, si) => {
    for (const p of slideParagraphs(s.doc)) {
      const text = paragraphTextOf(p, A_TEXT);
      if (text.trim().length > 0) out.push({ index, slide: si + 1, text });
      index++;
    }
  });
  return out;
}

/** Modele verilecek numaralı metin — slayt bilgisi bağlam için yazılır. */
export function formatSlidesForModel(paras: EditableSlideParagraph[]): string {
  const lines: string[] = [];
  let lastSlide = -1;
  for (const p of paras) {
    if (p.slide !== lastSlide) {
      lines.push(`--- Slayt ${p.slide} ---`);
      lastSlide = p.slide;
    }
    lines.push(`[${p.index}] ${p.text}`);
  }
  return lines.join('\n');
}

/** Sürekli indeksi (slayt, paragraf) çiftine çevirir. */
function locate(
  slides: { doc: Document }[],
  index: number,
): { slideIdx: number; p: Element } | null {
  let base = 0;
  for (let si = 0; si < slides.length; si++) {
    const ps = slideParagraphs(slides[si].doc);
    if (index < base + ps.length) return { slideIdx: si, p: ps[index - base] };
    base += ps.length;
  }
  return null;
}

export type PptxRejectionReason = 'paragraf-yok' | 'bulunamadi';

export interface PptxRejection {
  edit: PptxEdit;
  reason: PptxRejectionReason;
  message: string;
  /** Kaçıncı slayt (1-tabanlı). 'paragraf-yok' reddinde bilinmez, o yüzden
   *  isteğe bağlı — sürekli indeksi slayt sanıp göstermek yanlış olurdu. */
  slide?: number;
}

export interface PptxAcceptedEdit {
  edit: PptxEdit;
  before: string;
  after: string;
  occurrences: number;
  wholeParagraph: boolean;
  /** Kaçıncı slayt (1-tabanlı) — panelde gösterilir */
  slide: number;
}

const MESSAGES: Record<PptxRejectionReason, string> = {
  'paragraf-yok': 'Sunumda bu numarada bir paragraf yok.',
  bulunamadi: 'Aranan metin bu paragrafta bulunamadı.',
};

/** Düzenlemeleri UYGULAMADAN doğrular. */
export function validateSlideEdits(
  slides: { doc: Document }[],
  edits: PptxEdit[],
): { accepted: PptxAcceptedEdit[]; rejected: PptxRejection[] } {
  const accepted: PptxAcceptedEdit[] = [];
  const rejected: PptxRejection[] = [];

  for (const edit of edits) {
    const found = locate(slides, edit.paragraph);
    if (!found) {
      rejected.push({ edit, reason: 'paragraf-yok', message: MESSAGES['paragraf-yok'] });
      continue;
    }
    const current = paragraphTextOf(found.p, A_TEXT);

    // find YOK → paragrafın tamamı yazılır, eşleşme aranmaz
    if (!edit.find) {
      accepted.push({
        edit,
        before: current,
        after: edit.replace,
        occurrences: 1,
        wholeParagraph: true,
        slide: found.slideIdx + 1,
      });
      continue;
    }

    const hits = countOccurrences(current, edit.find);
    if (hits === 0) {
      rejected.push({
        edit,
        reason: 'bulunamadi',
        message: MESSAGES.bulunamadi,
        slide: found.slideIdx + 1,
      });
      continue;
    }
    accepted.push({
      edit,
      before: edit.find,
      after: edit.replace,
      occurrences: hits,
      wholeParagraph: false,
      slide: found.slideIdx + 1,
    });
  }

  return { accepted, rejected };
}

export interface PptxApplyResult {
  blob: Blob;
  applied: PptxEdit[];
  /** Uygulanamayanlar — sessizce düşmesin diye raporlanır */
  failed: PptxEdit[];
}

/**
 * Düzenlemeleri uygulayıp YENİ bir .pptx üretir. Orijinal buffer değişmez.
 * Yalnız DEĞİŞEN slayt dosyaları yeniden yazılır; diğer part'lar (medya,
 * grafik, tema, slide master) dokunulmadan kalır.
 */
export async function applySlideEdits(
  buf: ArrayBuffer,
  edits: PptxEdit[],
  xmlParse: XmlParse = domXmlParse,
  serialize: (doc: Document) => string = (doc) => new XMLSerializer().serializeToString(doc),
): Promise<PptxApplyResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    throw new Error('Sunum dosyası okunamadı veya şifre korumalı.');
  }

  const slides = await loadSlides(zip, xmlParse);
  if (slides.length === 0) throw new Error('Geçerli bir PowerPoint sunumu değil.');

  const applied: PptxEdit[] = [];
  const failed: PptxEdit[] = [];
  const touched = new Set<number>();

  for (const edit of edits) {
    const found = locate(slides, edit.paragraph);
    // Sonuç YOK SAYILMAZ — düşen düzenleme raporlanır (DOCX'te bu sessizdi ve
    // kullanıcı kabul ettiği değişikliği dosyada bulamıyordu)
    const ok = found
      ? edit.find
        ? replaceInParagraphTagged(found.p, A_TEXT, edit.find, edit.replace)
        : replaceParagraphTextTagged(found.p, A_TEXT, edit.replace)
      : false;
    if (ok && found) {
      applied.push(edit);
      touched.add(found.slideIdx);
    } else {
      failed.push(edit);
    }
  }

  for (const si of touched) zip.file(slides[si].path, serialize(slides[si].doc));

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
  return { blob, applied, failed };
}
