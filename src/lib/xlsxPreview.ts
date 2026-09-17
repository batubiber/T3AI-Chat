/**
 * XLSX önizlemesi — panelde düzenlenmiş çalışma kitabını göstermek için.
 *
 * DOCX/PPTX'te değişen yerler METİN EŞLEŞTİRMESİYLE işaretleniyor (markChanges)
 * ve o yol "aynı metin belgede başka yerde de var" sorununu yaşıyor — üç tur
 * düzeltme almıştı. XLSX'te bu sorun HİÇ doğmuyor: hangi HÜCRENİN değiştiğini
 * adresiyle biliyoruz, doğrudan onu işaretliyoruz.
 *
 * Amaç Excel'i taklit etmek değil (biçim, renk, kolon genişliği yok);
 * kullanıcının değişikliği tablo bağlamında görmesi.
 */
import JSZip from 'jszip';
import { XmlParse, domXmlParse } from './parsedFile';
import { loadWorkbook, buildSheetGrids } from './xlsxEditor';
import { escapeHtmlText } from './docxPreview';

/** 0 → A, 25 → Z, 26 → AA */
export function colName(i: number): string {
  let n = i + 1;
  let out = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * Düzenlenmiş kitabı HTML'e çevirir ve değişen HÜCRELERİ işaretler.
 *
 * @param changedLabels "Ocak!B2" biçiminde adresler — metin değil, adres
 */
export async function renderXlsxPreview(
  buf: ArrayBuffer,
  changedLabels: string[] = [],
  xmlParse: XmlParse = domXmlParse,
): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const wb = await loadWorkbook(zip, xmlParse);
  const grids = buildSheetGrids(wb);
  const changed = new Set(changedLabels);

  const parts = grids.map((g) => {
    const colCount = g.rows.reduce((m, r) => Math.max(m, r.length), 0);
    if (colCount === 0 || g.rows.length === 0) {
      return `<section class="t3ai-xlsx-sayfa"><h3>${escapeHtmlText(g.name)}</h3><p><em>(boş sayfa)</em></p></section>`;
    }

    const head =
      '<tr><th class="t3ai-xlsx-kose"></th>' +
      Array.from({ length: colCount }, (_, i) => `<th>${colName(i)}</th>`).join('') +
      '</tr>';

    const body = g.rows
      .map((row, ri) => {
        const cells = Array.from({ length: colCount }, (_, ci) => {
          const cell = row[ci];
          if (!cell) return '<td></td>';
          if (cell.formula !== undefined) {
            // Önbelleği sildiğimiz için değer YOK; boş göstermek hata gibi
            // durur, formülün kendisini göster
            return `<td class="t3ai-xlsx-formul">${escapeHtmlText(cell.formula)}</td>`;
          }
          const text = escapeHtmlText(cell.text);
          const isChanged = changed.has(`${g.name}!${cell.ref}`);
          return `<td>${isChanged ? `<mark>${text}</mark>` : text}</td>`;
        }).join('');
        return `<tr><th class="t3ai-xlsx-satir">${ri + 1}</th>${cells}</tr>`;
      })
      .join('');

    const hasFormula = g.rows.some((r) => r.some((c) => c?.formula !== undefined));
    const note = hasFormula
      ? '<p class="t3ai-xlsx-not">Formül değerleri Excel dosyayı açtığında yeniden hesaplanacak.</p>'
      : '';

    return (
      `<section class="t3ai-xlsx-sayfa"><h3>${escapeHtmlText(g.name)}</h3>` +
      `<div class="t3ai-xlsx-kaydir"><table class="t3ai-xlsx-tablo">${head}${body}</table></div>${note}</section>`
    );
  });

  return parts.join('');
}
