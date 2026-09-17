/**
 * PPTX önizlemesi — panelde düzenlenmiş sunumu göstermek için.
 *
 * DOCX'te mammoth vardı; PPTX için karşılığı yok, slaytlar buradan render
 * ediliyor. Amaç sunumu birebir taklit etmek DEĞİL (konum, tema, animasyon
 * yok); kullanıcının değişikliği bağlamında görmesi ve neyi indireceğini
 * bilmesi.
 *
 * Şekil metinleri sırayla, tablolar gerçek tablo olarak çıkıyor.
 */
import JSZip from 'jszip';
import { XmlParse, domXmlParse } from './parsedFile';
import { loadSlides, slideParagraphs } from './pptxEditor';
import { elementChildren, paragraphTextOf } from './ooxmlEdit';
import { escapeHtmlText, markChanges } from './docxPreview';

const A_TEXT = 'a:t';

const local = (el: Element) => el.nodeName.replace(/^[^:]+:/, '');

/** <a:tbl> → HTML tablo */
function tableHtml(tbl: Element): string {
  const rows: string[] = [];
  const trs = tbl.getElementsByTagName('a:tr');
  for (let i = 0; i < trs.length; i++) {
    const cells: string[] = [];
    for (const tc of elementChildren(trs[i])) {
      if (local(tc) !== 'tc') continue;
      const text = slideParagraphs(tc)
        .map((p) => paragraphTextOf(p, A_TEXT))
        .join(' ')
        .trim();
      cells.push(`<td>${escapeHtmlText(text)}</td>`);
    }
    if (cells.length) rows.push(`<tr>${cells.join('')}</tr>`);
  }
  return rows.length ? `<table>${rows.join('')}</table>` : '';
}

/** Bir slaydın gövdesini HTML'e çevirir (şekil sırasında, tablolar dahil). */
function slideHtml(doc: Document): string {
  const trees = doc.getElementsByTagName('p:spTree');
  if (trees.length === 0) return '';
  const blocks: string[] = [];

  const walk = (node: Element) => {
    for (const child of elementChildren(node)) {
      switch (local(child)) {
        case 'sp': {
          const lines = slideParagraphs(child)
            .map((p) => paragraphTextOf(p, A_TEXT).trim())
            .filter(Boolean);
          if (lines.length) {
            blocks.push(lines.map((l) => `<p>${escapeHtmlText(l)}</p>`).join(''));
          }
          break;
        }
        case 'grpSp':
          walk(child);
          break;
        case 'graphicFrame': {
          const tbls = child.getElementsByTagName('a:tbl');
          if (tbls.length > 0) {
            const t = tableHtml(tbls[0]);
            if (t) blocks.push(t);
          }
          break;
        }
        default:
          break;
      }
    }
  };
  walk(trees[0]);
  return blocks.join('');
}

/**
 * Düzenlenmiş sunumu HTML'e çevirir ve değişen metinleri işaretler.
 * Her slayt kendi bloğunda, başlığıyla.
 */
export async function renderPptxPreview(
  buf: ArrayBuffer,
  changed: string[] = [],
  xmlParse: XmlParse = domXmlParse,
): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const slides = await loadSlides(zip, xmlParse);
  const parts = slides.map(
    (s, i) =>
      `<section class="t3ai-slayt"><h3>Slayt ${i + 1}</h3>${slideHtml(s.doc) || '<p><em>(metin yok)</em></p>'}</section>`,
  );
  return markChanges(parts.join(''), changed);
}
