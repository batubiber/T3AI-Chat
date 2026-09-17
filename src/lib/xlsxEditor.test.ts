import { describe, it, expect } from 'vitest';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import {
  loadWorkbook,
  extractEditableCells,
  formatCellsForModel,
  validateCellEdits,
  applyCellEdits,
  parseRef,
  buildSheetGrids,
} from './xlsxEditor';

const xmlParse = (xml: string) =>
  new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document;
const serialize = (doc: Document) =>
  new XMLSerializer().serializeToString(doc as unknown as Node);

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

interface SheetSpec {
  name: string;
  /** Ham <row> içerikleri */
  rows: string;
}

/**
 * Minimal ama GERÇEKÇİ bir .xlsx: workbook + rels + sayfa(lar) + isteğe bağlı
 * ortak dizge tablosu. Gerçek Excel dosyalarının kullandığı t="s" + <v>indeks
 * düzenini taklit ediyor — motorun asıl sınavı bu.
 */
async function buildBook(
  sheets: SheetSpec[],
  sharedStrings?: string[],
  extraParts: Record<string, string> = {},
): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0"?><workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets>${sheets
      .map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('')}</sheets></workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join('')}</Relationships>`,
  );
  sheets.forEach((s, i) => {
    zip.file(
      `xl/worksheets/sheet${i + 1}.xml`,
      `<?xml version="1.0"?><worksheet xmlns="${MAIN}"><sheetData>${s.rows}</sheetData></worksheet>`,
    );
  });
  if (sharedStrings) {
    zip.file(
      'xl/sharedStrings.xml',
      `<?xml version="1.0"?><sst xmlns="${MAIN}" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">${sharedStrings
        .map((t) => `<si><t>${t}</t></si>`)
        .join('')}</sst>`,
    );
  }
  for (const [path, content] of Object.entries(extraParts)) zip.file(path, content);
  return zip.generateAsync({ type: 'arraybuffer' });
}

/** t="s" hücresi — <v> ortak tabloya indeks */
const sc = (ref: string, idx: number) => `<c r="${ref}" t="s"><v>${idx}</v></c>`;
/** sayısal hücre */
const nc = (ref: string, val: string | number) => `<c r="${ref}"><v>${val}</v></c>`;
/** formül hücresi — Excel gibi önbellek <v> ile */
const fc = (ref: string, f: string, cached: string) =>
  `<c r="${ref}"><f>${f}</f><v>${cached}</v></c>`;
const row = (r: number, cells: string) => `<row r="${r}">${cells}</row>`;

async function open(buf: ArrayBuffer) {
  return loadWorkbook(await JSZip.loadAsync(buf), xmlParse);
}

/** Sonuç dosyasını tekrar açıp bir hücrenin metnini oku */
async function readCell(buf: ArrayBuffer, sheet: string, ref: string): Promise<string> {
  const wb = await open(buf);
  const cells = extractEditableCells(wb);
  return cells.find((c) => c.sheet === sheet && c.ref === ref)?.text ?? '';
}

async function partText(buf: ArrayBuffer, path: string): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const f = zip.file(path);
  return f ? f.async('string') : '';
}

// ---------------------------------------------------------------------------

describe('loadWorkbook', () => {
  it('sayfa sırasını workbook <sheets>\'ten okur, dosya adından değil', async () => {
    // Gerçek dosyalarda sheet1.xml ikinci sayfa olabilir; rels eşlemesi belirler
    const zip = new JSZip();
    zip.file(
      'xl/workbook.xml',
      `<?xml version="1.0"?><workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="Subat" sheetId="1" r:id="rIdB"/><sheet name="Ocak" sheetId="2" r:id="rIdA"/></sheets></workbook>`,
    );
    zip.file(
      'xl/_rels/workbook.xml.rels',
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdA" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rIdB" Type="${REL}/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`,
    );
    zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0"?><worksheet xmlns="${MAIN}"><sheetData/></worksheet>`);
    zip.file('xl/worksheets/sheet2.xml', `<?xml version="1.0"?><worksheet xmlns="${MAIN}"><sheetData/></worksheet>`);
    const wb = await open(await zip.generateAsync({ type: 'arraybuffer' }));

    expect(wb.sheets.map((s) => s.name)).toEqual(['Subat', 'Ocak']);
    expect(wb.sheets[0].path).toBe('xl/worksheets/sheet2.xml'); // Subat → sheet2
  });

  it('workbook.xml yoksa açık hata verir', async () => {
    const z = new JSZip();
    z.file('docProps/app.xml', '<x/>');
    await expect(open(await z.generateAsync({ type: 'arraybuffer' }))).rejects.toThrow(
      /Geçerli bir Excel/,
    );
  });
});

describe('extractEditableCells', () => {
  it('ortak dizge ve sayı hücrelerini okur', async () => {
    const buf = await buildBook(
      [{ name: 'Ocak', rows: row(1, sc('A1', 0) + nc('B1', 3)) }],
      ['Kalem'],
    );
    const cells = extractEditableCells(await open(buf));

    expect(cells.map((c) => [c.ref, c.text, c.numeric])).toEqual([
      ['A1', 'Kalem', false],
      ['B1', '3', true],
    ]);
  });

  it('formül hücresi listeye GİRMEZ ama indeks kaymaz', async () => {
    // İndeks her <c> için artar → modelin formül hücresine yazdığı düzenleme
    // reddedilir, komşu hücreye kaymaz
    const buf = await buildBook(
      [{ name: 'Ocak', rows: row(1, nc('A1', 3) + fc('B1', 'A1*10', '30') + nc('C1', 7)) }],
    );
    const cells = extractEditableCells(await open(buf));

    expect(cells.map((c) => c.ref)).toEqual(['A1', 'C1']);
    expect(cells.map((c) => c.index)).toEqual([0, 2]); // 1 atlandı, kaydırılmadı
  });

  it('desteklenmeyen tür (tarih/boolean) listeye girmez', async () => {
    const buf = await buildBook([
      { name: 'S', rows: row(1, `<c r="A1" t="b"><v>1</v></c>` + nc('B1', 5)) },
    ]);
    expect(extractEditableCells(await open(buf)).map((c) => c.ref)).toEqual(['B1']);
  });

  it('çok sayfalı dosyada indeks sürekli akar', async () => {
    const buf = await buildBook(
      [
        { name: 'Ocak', rows: row(1, sc('A1', 0) + sc('B1', 1)) },
        { name: 'Subat', rows: row(1, sc('A1', 2)) },
      ],
      ['a', 'b', 'c'],
    );
    const cells = extractEditableCells(await open(buf));

    expect(cells.map((c) => [c.sheet, c.index])).toEqual([
      ['Ocak', 0],
      ['Ocak', 1],
      ['Subat', 2],
    ]);
  });

  it('boş metinli hücre listeye girmez', async () => {
    const buf = await buildBook([{ name: 'S', rows: row(1, sc('A1', 0) + sc('B1', 1)) }], ['', 'x']);
    expect(extractEditableCells(await open(buf)).map((c) => c.ref)).toEqual(['B1']);
  });

  it('zengin metinli <si> tek metin olarak okunur', async () => {
    const zip = new JSZip();
    const base = await buildBook([{ name: 'S', rows: row(1, sc('A1', 0)) }], ['x']);
    const z = await JSZip.loadAsync(base);
    z.file(
      'xl/sharedStrings.xml',
      `<?xml version="1.0"?><sst xmlns="${MAIN}" count="1" uniqueCount="1"><si><r><t>Kur</t></r><r><t>şun</t></r></si></sst>`,
    );
    void zip;
    const cells = extractEditableCells(await open(await z.generateAsync({ type: 'arraybuffer' })));
    expect(cells[0].text).toBe('Kurşun');
  });
});

describe('formatCellsForModel', () => {
  it('sayfa başlığı ve adresle numaralar', async () => {
    const buf = await buildBook(
      [
        { name: 'Ocak', rows: row(1, sc('A1', 0)) },
        { name: 'Subat', rows: row(1, sc('A1', 1)) },
      ],
      ['Kalem', 'Silgi'],
    );
    const text = formatCellsForModel(extractEditableCells(await open(buf)));

    expect(text).toBe(
      ['--- Sayfa: Ocak ---', '[0] A1 = Kalem', '--- Sayfa: Subat ---', '[1] A1 = Silgi'].join('\n'),
    );
  });
});

describe('validateCellEdits', () => {
  it('formül hücresini gerekçesiyle reddeder', async () => {
    const buf = await buildBook([{ name: 'Ocak', rows: row(1, fc('A1', 'B1*2', '10')) }]);
    const { accepted, rejected } = validateCellEdits(await open(buf), [
      { paragraph: 0, replace: '99' },
    ]);

    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toBe('formul');
    expect(rejected[0].locationLabel).toBe('Ocak!A1');
  });

  it('olmayan indeksi reddeder', async () => {
    const buf = await buildBook([{ name: 'S', rows: row(1, nc('A1', 1)) }]);
    const { rejected } = validateCellEdits(await open(buf), [{ paragraph: 99, replace: 'x' }]);
    expect(rejected[0].reason).toBe('hucre-yok');
  });

  it('find eşleşmezse reddeder', async () => {
    const buf = await buildBook([{ name: 'S', rows: row(1, sc('A1', 0)) }], ['Kalem']);
    const { rejected } = validateCellEdits(await open(buf), [
      { paragraph: 0, find: 'Defter', replace: 'x' },
    ]);
    expect(rejected[0].reason).toBe('bulunamadi');
  });

  it('kabul edilen düzenlemede adres etiketi ve önce/sonra doğru', async () => {
    const buf = await buildBook([{ name: 'Ocak', rows: row(2, sc('B2', 0)) }], ['Kalem']);
    const { accepted } = validateCellEdits(await open(buf), [
      { paragraph: 0, replace: 'Kurşun Kalem' },
    ]);

    expect(accepted[0]).toMatchObject({
      before: 'Kalem',
      after: 'Kurşun Kalem',
      wholeParagraph: true,
      locationLabel: 'Ocak!B2',
    });
  });

  it('find ile kısmi değişimde sonuç hücrenin tamamı olur', async () => {
    const buf = await buildBook([{ name: 'S', rows: row(1, sc('A1', 0)) }], ['Kalem ve Silgi']);
    const { accepted } = validateCellEdits(await open(buf), [
      { paragraph: 0, find: 'Kalem', replace: 'Defter' },
    ]);
    expect(accepted[0].after).toBe('Defter ve Silgi');
  });
});

describe('applyCellEdits — ortak dizge tuzağı', () => {
  it('AYNI <si>\'yi paylaşan diğer hücre DEĞİŞMEZ', async () => {
    // Bu motorun var olma sebebi. A2 ve A4 tek "Kalem" girdisini paylaşıyor;
    // yalnız A4 düzenleniyor. <si> yerinde değiştirilse A2 de bozulurdu.
    const buf = await buildBook(
      [
        {
          name: 'Ocak',
          rows:
            row(1, sc('A1', 0)) +
            row(2, sc('A2', 1)) +
            row(3, sc('A3', 2)) +
            row(4, sc('A4', 1)),
        },
      ],
      ['Ürün', 'Kalem', 'Silgi'],
    );
    const wb = await open(buf);
    const target = extractEditableCells(wb).find((c) => c.ref === 'A4')!;

    const r = await applyCellEdits(
      buf,
      [{ paragraph: target.index, replace: 'Kurşun Kalem' }],
      xmlParse,
      serialize,
    );
    expect(r.applied).toHaveLength(1);

    const out = await r.blob.arrayBuffer();
    expect(await readCell(out, 'Ocak', 'A4')).toBe('Kurşun Kalem');
    expect(await readCell(out, 'Ocak', 'A2')).toBe('Kalem'); // DOKUNULMADI
  });

  it('yeni <si> eklenir, mevcut girdiler korunur ve sayaçlar güncellenir', async () => {
    const buf = await buildBook([{ name: 'S', rows: row(1, sc('A1', 0)) }], ['Kalem']);
    const r = await applyCellEdits(buf, [{ paragraph: 0, replace: 'Defter' }], xmlParse, serialize);

    const sst = await partText(await r.blob.arrayBuffer(), 'xl/sharedStrings.xml');
    expect(sst).toContain('<t>Kalem</t>'); // eski girdi yerinde
    expect(sst).toContain('<t>Defter</t>'); // yeni girdi eklendi
    expect(sst).toContain('count="2"');
    expect(sst).toContain('uniqueCount="2"');
  });

  it('sharedStrings.xml YOKSA satır-içi dizgeye düşer', async () => {
    // SheetJS üretimi dosyalarda ortak tablo hiç olmuyor
    const buf = await buildBook([{ name: 'S', rows: row(1, `<c r="A1" t="str"><v>x</v></c>` + nc('B1', 5)) }]);
    const wb = await open(buf);
    const target = extractEditableCells(wb).find((c) => c.ref === 'B1')!;

    const r = await applyCellEdits(
      buf,
      [{ paragraph: target.index, replace: 'metin' }],
      xmlParse,
      serialize,
    );
    const sheet = await partText(await r.blob.arrayBuffer(), 'xl/worksheets/sheet1.xml');
    expect(sheet).toContain('t="inlineStr"');
    expect(await readCell(await r.blob.arrayBuffer(), 'S', 'B1')).toBe('metin');
  });
});

describe('applyCellEdits — hücre türü', () => {
  it('sayısal hücreye sayı yazılırsa SAYISAL kalır', async () => {
    // Aksi halde SUM gibi formüller bozulur
    const buf = await buildBook([{ name: 'S', rows: row(1, nc('A1', 3)) }], ['x']);
    const r = await applyCellEdits(buf, [{ paragraph: 0, replace: '5' }], xmlParse, serialize);

    const sheet = await partText(await r.blob.arrayBuffer(), 'xl/worksheets/sheet1.xml');
    expect(sheet).toContain('<c r="A1"><v>5</v></c>');
    expect(sheet).not.toContain('t="s"');
  });

  it('sayısal hücreye metin yazılırsa dizgeye döner', async () => {
    const buf = await buildBook([{ name: 'S', rows: row(1, nc('A1', 3)) }], ['x']);
    const r = await applyCellEdits(buf, [{ paragraph: 0, replace: 'yok' }], xmlParse, serialize);

    const out = await r.blob.arrayBuffer();
    expect(await partText(out, 'xl/worksheets/sheet1.xml')).toContain('t="s"');
    expect(await readCell(out, 'S', 'A1')).toBe('yok');
  });

  it('formül ve desteklenmeyen tür uygulanmaz, failed olarak döner', async () => {
    const buf = await buildBook([
      { name: 'S', rows: row(1, fc('A1', 'B1', '1') + `<c r="B1" t="d"><v>2020-01-01</v></c>`) },
    ]);
    const r = await applyCellEdits(
      buf,
      [
        { paragraph: 0, replace: 'x' },
        { paragraph: 1, replace: 'y' },
      ],
      xmlParse,
      serialize,
    );
    expect(r.applied).toHaveLength(0);
    expect(r.failed).toHaveLength(2);
  });
});

describe('applyCellEdits — formül önbelleği', () => {
  it('dokunulan sayfada formül önbelleği SİLİNİR', async () => {
    // Ölçülen tuzak: A1=3→5 yapılınca B1 (=A1*10) hâlâ 30 okuyor
    const buf = await buildBook([
      { name: 'S', rows: row(1, nc('A1', 3) + fc('B1', 'A1*10', '30')) },
    ]);
    const r = await applyCellEdits(buf, [{ paragraph: 0, replace: '5' }], xmlParse, serialize);

    const sheet = await partText(await r.blob.arrayBuffer(), 'xl/worksheets/sheet1.xml');
    expect(sheet).toContain('<f>A1*10</f>');
    expect(sheet).not.toContain('<v>30</v>'); // bayat önbellek gitti
    expect(r.formulasInvalidated).toBe(1);
  });

  it('workbook\'a fullCalcOnLoad konur', async () => {
    const buf = await buildBook([{ name: 'S', rows: row(1, nc('A1', 3)) }]);
    const r = await applyCellEdits(buf, [{ paragraph: 0, replace: '5' }], xmlParse, serialize);

    expect(await partText(await r.blob.arrayBuffer(), 'xl/workbook.xml')).toContain(
      'fullCalcOnLoad="1"',
    );
  });

  it('mevcut <calcPr> varsa yenisi eklenmez, niteliği güncellenir', async () => {
    const base = await buildBook([{ name: 'S', rows: row(1, nc('A1', 3)) }]);
    const z = await JSZip.loadAsync(base);
    z.file(
      'xl/workbook.xml',
      `<?xml version="1.0"?><workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="1"/></workbook>`,
    );
    const buf = await z.generateAsync({ type: 'arraybuffer' });
    const r = await applyCellEdits(buf, [{ paragraph: 0, replace: '5' }], xmlParse, serialize);

    const wbXml = await partText(await r.blob.arrayBuffer(), 'xl/workbook.xml');
    expect(wbXml.match(/<calcPr/g)).toHaveLength(1);
    expect(wbXml).toContain('calcId="1"');
    expect(wbXml).toContain('fullCalcOnLoad="1"');
  });

  it('hiç düzenleme uygulanmazsa workbook\'a DOKUNULMAZ', async () => {
    const buf = await buildBook([{ name: 'S', rows: row(1, fc('A1', 'B1', '1')) }]);
    const before = await partText(buf, 'xl/workbook.xml');
    const r = await applyCellEdits(buf, [{ paragraph: 0, replace: 'x' }], xmlParse, serialize);

    expect(r.applied).toHaveLength(0);
    expect(await partText(await r.blob.arrayBuffer(), 'xl/workbook.xml')).toBe(before);
  });
});

describe('applyCellEdits — dokunulmayan part\'lar', () => {
  it('diğer sayfa, styles ve theme BYTE-EŞİT kalır', async () => {
    const styles = `<?xml version="1.0"?><styleSheet xmlns="${MAIN}"><cellXfs count="1"><xf/></cellXfs></styleSheet>`;
    const theme = `<?xml version="1.0"?><theme>ÖZEL</theme>`;
    const buf = await buildBook(
      [
        { name: 'Ocak', rows: row(1, nc('A1', 1)) },
        { name: 'Subat', rows: row(1, nc('A1', 2)) },
      ],
      undefined,
      { 'xl/styles.xml': styles, 'xl/theme/theme1.xml': theme, 'xl/media/image1.png': 'PNGVERİSİ' },
    );
    const sheet2Before = await partText(buf, 'xl/worksheets/sheet2.xml');

    const r = await applyCellEdits(buf, [{ paragraph: 0, replace: '9' }], xmlParse, serialize);
    const out = await r.blob.arrayBuffer();

    expect(await partText(out, 'xl/worksheets/sheet2.xml')).toBe(sheet2Before);
    expect(await partText(out, 'xl/styles.xml')).toBe(styles);
    expect(await partText(out, 'xl/theme/theme1.xml')).toBe(theme);
    expect(await partText(out, 'xl/media/image1.png')).toBe('PNGVERİSİ');
  });

  it('orijinal buffer değişmez', async () => {
    const buf = await buildBook([{ name: 'S', rows: row(1, nc('A1', 3)) }]);
    const before = await partText(buf, 'xl/worksheets/sheet1.xml');
    await applyCellEdits(buf, [{ paragraph: 0, replace: '5' }], xmlParse, serialize);
    expect(await partText(buf, 'xl/worksheets/sheet1.xml')).toBe(before);
  });

  it('bozuk zip açık hata verir', async () => {
    const bad = new TextEncoder().encode('bu bir zip değil').buffer;
    await expect(applyCellEdits(bad, [], xmlParse, serialize)).rejects.toThrow(/okunamadı/);
  });
});

describe('parseRef', () => {
  it('adresleri çözer', () => {
    expect(parseRef('A1')).toEqual({ col: 0, row: 0 });
    expect(parseRef('B12')).toEqual({ col: 1, row: 11 });
    expect(parseRef('AA3')).toEqual({ col: 26, row: 2 });
  });

  it('bozuk adreste null', () => {
    expect(parseRef('1A')).toBeNull();
    expect(parseRef('')).toBeNull();
  });
});

describe('buildSheetGrids', () => {
  it('boşlukları null bırakır ve formülü ayrı taşır', async () => {
    const buf = await buildBook(
      [{ name: 'S', rows: row(1, nc('A1', 1) + fc('C1', 'A1*2', '2')) }],
    );
    const [grid] = buildSheetGrids(await open(buf));

    expect(grid.rows).toHaveLength(1);
    expect(grid.rows[0][0]?.text).toBe('1');
    expect(grid.rows[0][1]).toBeNull(); // B1 yok
    expect(grid.rows[0][2]?.formula).toBe('=A1*2');
  });
});

// ---------------------------------------------------------------------------
// AD ALANI — kullanıcıya giden hatanın yakalandığı yer
// ---------------------------------------------------------------------------
describe('üretilen düğümler ad alanına SAHİP olmalı', () => {
  /**
   * Ad alanı null olan her elemanı toplar.
   *
   * Neden çıktıya bakmıyoruz: xmldom, ad-alansız elemanı da `<v>25</v>` diye
   * yazıyor — tarayıcı ise standart gereği `<v xmlns="">25</v>` yazmak zorunda
   * ve Excel o düğümü GÖRMÜYOR (hücre boş çıkıyor). Testin serileştiriciden
   * bağımsız olması için ağacın kendisine bakılıyor.
   */
  function nullNsElements(doc: Document): string[] {
    const bad: string[] = [];
    const walk = (el: Element) => {
      if (el.namespaceURI === null) bad.push(el.nodeName);
      for (const ch of Array.from(el.childNodes)) {
        if ((ch as Element).nodeType === 1) walk(ch as Element);
      }
    };
    if (doc.documentElement) walk(doc.documentElement);
    return bad;
  }

  /** serialize kancasını kullanarak ağacı serileştirmeden ÖNCE denetler */
  function inspectingSerializer() {
    const bad: string[] = [];
    const fn = (doc: Document) => {
      bad.push(...nullNsElements(doc));
      return serialize(doc);
    };
    return { fn, bad };
  }

  it('sayısal hücreye yazılan <v> ad alanlı (BOŞ HÜCRE HATASI)', async () => {
    // Gerçek olay: B2=10 → 25 istendi, panel 25 gösterdi, indirilen dosyada
    // B2 BOŞ çıktı. Sebebi <v xmlns=""> idi.
    const buf = await buildBook([{ name: 'S', rows: row(2, nc('B2', 10)) }]);
    const ins = inspectingSerializer();
    await applyCellEdits(buf, [{ paragraph: 0, replace: '25' }], xmlParse, ins.fn);

    expect(ins.bad).toEqual([]);
  });

  it('yeni <si> ve <t> ad alanlı', async () => {
    const buf = await buildBook([{ name: 'S', rows: row(1, sc('A1', 0)) }], ['Kalem']);
    const ins = inspectingSerializer();
    await applyCellEdits(buf, [{ paragraph: 0, replace: 'Defter' }], xmlParse, ins.fn);

    expect(ins.bad).toEqual([]);
  });

  it('satır-içi dizge (<is>/<t>) ad alanlı', async () => {
    // sharedStrings YOK → inlineStr yoluna düşer
    const buf = await buildBook([{ name: 'S', rows: row(1, nc('A1', 5)) }]);
    const ins = inspectingSerializer();
    await applyCellEdits(buf, [{ paragraph: 0, replace: 'metin' }], xmlParse, ins.fn);

    expect(ins.bad).toEqual([]);
  });

  it('<calcPr> ad alanlı', async () => {
    const buf = await buildBook([{ name: 'S', rows: row(1, nc('A1', 5)) }]);
    const ins = inspectingSerializer();
    await applyCellEdits(buf, [{ paragraph: 0, replace: '9' }], xmlParse, ins.fn);

    expect(ins.bad).toEqual([]);
  });

  it('denetleyici GERÇEKTEN çalışıyor — ad-alansız düğüm yakalanıyor', async () => {
    // Testin kendisi işe yarıyor mu: elle bozuk bir düğüm ekleyip yakaladığını gör
    const buf = await buildBook([{ name: 'S', rows: row(1, nc('A1', 5)) }]);
    const wb = await open(buf);
    const bozuk = wb.sheets[0].doc.createElement('bozuk');
    wb.sheets[0].doc.documentElement!.appendChild(bozuk);
    const ins = inspectingSerializer();
    ins.fn(wb.sheets[0].doc);

    expect(ins.bad).toEqual(['bozuk']);
  });

  it('çıktıda xmlns="" HİÇ olmamalı', async () => {
    const buf = await buildBook([{ name: 'S', rows: row(1, sc('A1', 0) + nc('B1', 1)) }], ['x']);
    const r = await applyCellEdits(
      buf,
      [
        { paragraph: 0, replace: 'yeni metin' },
        { paragraph: 1, replace: '42' },
      ],
      xmlParse,
      serialize,
    );
    const out = await r.blob.arrayBuffer();
    for (const part of ['xl/worksheets/sheet1.xml', 'xl/sharedStrings.xml', 'xl/workbook.xml']) {
      expect(await partText(out, part)).not.toContain('xmlns=""');
    }
  });
});

// ---------------------------------------------------------------------------
// Bağımsız doğrulama: kendi okuyucumuz kendi yazdığımızı okuyabilir, bu bir şey
// kanıtlamaz. SheetJS bambaşka bir uygulama — çıktımızı o da okuyabiliyorsa
// dosya gerçekten geçerli. Paket burada TAM kuruluyor ([Content_Types].xml
// dahil), buildBook'un minimal hâliyle değil.
// ---------------------------------------------------------------------------
describe('SheetJS (bağımsız okuyucu) çıktımızı okuyabiliyor mu', () => {
  it('ortak dizge düzenlemesi sonrası dosya geçerli', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`);
    zip.file('_rels/.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
    zip.file('xl/workbook.xml', `<?xml version="1.0"?><workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="Ocak" sheetId="1" r:id="rId1"/></sheets></workbook>`);
    zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`);
    zip.file('xl/sharedStrings.xml', `<?xml version="1.0"?><sst xmlns="${MAIN}" count="3" uniqueCount="3"><si><t>Ürün</t></si><si><t>Kalem</t></si><si><t>Silgi</t></si></sst>`);
    zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0"?><worksheet xmlns="${MAIN}"><dimension ref="A1:B4"/><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>3</v></c></row><row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3"><v>2</v></c></row><row r="4"><c r="A4" t="s"><v>1</v></c><c r="B4"><f>B2+B3</f><v>5</v></c></row></sheetData></worksheet>`);
    const buf = await zip.generateAsync({ type: 'arraybuffer' });

    const wb0 = await loadWorkbook(await JSZip.loadAsync(buf), xmlParse);
    const a4 = extractEditableCells(wb0).find((c) => c.ref === 'A4')!;
    const b2 = extractEditableCells(wb0).find((c) => c.ref === 'B2')!;

    const r = await applyCellEdits(buf, [
      { paragraph: a4.index, replace: 'Kurşun Kalem' },
      { paragraph: b2.index, replace: '10' },
    ], xmlParse, serialize);
    expect(r.applied).toHaveLength(2);

    // BAĞIMSIZ OKUYUCU
    const out = XLSX.read(Buffer.from(await r.blob.arrayBuffer()), { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(out.Sheets['Ocak'], { header: 1, defval: '' }) as unknown[][];

    expect(rows[1][0]).toBe('Kalem');          // A2 dokunulmadı
    expect(rows[3][0]).toBe('Kurşun Kalem');   // A4 değişti
    expect(rows[1][1]).toBe(10);               // B2 SAYI olarak kaldı
  });
});
