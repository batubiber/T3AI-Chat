import { describe, it, expect } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import {
  parseRels,
  resolveSlideOrder,
  extractSlideText,
  tableToMarkdown,
  chartToMarkdown,
  diagramToText,
  extractNotesText,
  shouldOcrImage,
  parsePptxBuffer,
  type SlideContext,
} from './pptxParser';

// Node'da global DOMParser yok — testlerde xmldom enjekte edilir.
// UYARI: xmldom'da .children ve querySelector YOK; implementasyon
// getElementsByTagName / childNodes / getAttribute / textContent ile sınırlı.
const xmlParse = (xml: string) =>
  new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document;

// Gerçek deck ölçüsü: 13.33 x 7.5 inch
const SLIDE_W = 12192000;
const SLIDE_H = 6858000;

const emptyCtx = (): SlideContext => ({
  slideW: SLIDE_W,
  slideH: SLIDE_H,
  rels: new Map<string, string>(),
  charts: new Map<string, Document>(),
  diagrams: new Map<string, Document>(),
});

const slide = (spTreeInner: string) =>
  xmlParse(`<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"
       xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
  <p:cSld><p:spTree>${spTreeInner}</p:spTree></p:cSld>
</p:sld>`);

const textBox = (paras: string) => `<p:sp><p:txBody>${paras}</p:txBody></p:sp>`;

const PIC = (rid: string, cx?: number, cy?: number) =>
  `<p:pic><p:spPr>${
    cx !== undefined ? `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` : ''
  }</p:spPr><p:blipFill><a:blip r:embed="${rid}"/></p:blipFill></p:pic>`;

const TBL = (rows: string[][]) => {
  const tr = rows
    .map(
      (r) =>
        `<a:tr>${r
          .map((c) => `<a:tc><a:txBody><a:p><a:r><a:t>${c}</a:t></a:r></a:p></a:txBody></a:tc>`)
          .join('')}</a:tr>`,
    )
    .join('');
  return `<p:graphicFrame><a:graphic><a:graphicData><a:tbl>${tr}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
};

const PRES_RELS = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide3.xml"/>
</Relationships>`;

const presentation = (rids: string[]) => `<?xml version="1.0"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>${rids.map((r, i) => `<p:sldId id="${256 + i}" r:id="${r}"/>`).join('')}</p:sldIdLst>
</p:presentation>`;

describe('parseRels', () => {
  it('rId → zip yolu eşlemesi kurar (ppt/ tabanına göre)', () => {
    const rels = parseRels(PRES_RELS, xmlParse, 'ppt');
    expect(rels.get('rId1')).toBe('ppt/slides/slide1.xml');
    expect(rels.get('rId3')).toBe('ppt/slides/slide3.xml');
  });

  it('../ ile başlayan hedefleri normalize eder', () => {
    const rels = parseRels(
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId2" Type="x" Target="../charts/chart3.xml"/>
        <Relationship Id="rId5" Type="x" Target="../media/image7.png"/>
      </Relationships>`,
      xmlParse,
      'ppt/slides',
    );
    expect(rels.get('rId2')).toBe('ppt/charts/chart3.xml');
    expect(rels.get('rId5')).toBe('ppt/media/image7.png');
  });

  it('yüzde-kaçışlı hedefi çözer (boşluklu part adı)', () => {
    const rels = parseRels(
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="x" Target="../media/my%20image.png"/>
      </Relationships>`,
      xmlParse,
      'ppt/slides',
    );
    expect(rels.get('rId1')).toBe('ppt/media/my image.png');
  });

  it('TargetMode="External" bağlantıları atlar (zip\'te yok)', () => {
    const rels = parseRels(
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="x" Target="https://ornek.com" TargetMode="External"/>
        <Relationship Id="rId2" Type="x" Target="../media/a.png"/>
      </Relationships>`,
      xmlParse,
      'ppt/slides',
    );
    expect(rels.has('rId1')).toBe(false);
    expect(rels.get('rId2')).toBe('ppt/media/a.png');
  });

  it('boş rels boş map döner', () => {
    expect(parseRels('<Relationships/>', xmlParse, 'ppt').size).toBe(0);
  });
});

describe('resolveSlideOrder', () => {
  it('sldIdLst sırasını kullanır', () => {
    expect(resolveSlideOrder(presentation(['rId1', 'rId2']), PRES_RELS, xmlParse)).toEqual([
      'ppt/slides/slide1.xml',
      'ppt/slides/slide2.xml',
    ]);
  });

  it('yeniden sıralanmış deck: dosya adı sırası DEĞİL sldIdLst sırası geçerli', () => {
    expect(resolveSlideOrder(presentation(['rId3', 'rId1', 'rId2']), PRES_RELS, xmlParse)).toEqual([
      'ppt/slides/slide3.xml',
      'ppt/slides/slide1.xml',
      'ppt/slides/slide2.xml',
    ]);
  });

  it('sldIdLst yoksa boş dizi döner (çağıran sayısal fallback yapar)', () => {
    const pres = `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>`;
    expect(resolveSlideOrder(pres, PRES_RELS, xmlParse)).toEqual([]);
  });

  it('çözülemeyen rId atlanır, kalanların sırası bozulmaz', () => {
    expect(resolveSlideOrder(presentation(['rId1', 'rId99', 'rId2']), PRES_RELS, xmlParse)).toEqual([
      'ppt/slides/slide1.xml',
      'ppt/slides/slide2.xml',
    ]);
  });
});

describe('extractSlideText — metin', () => {
  it("run'ları birleştirir, paragrafları satıra böler", () => {
    const doc = slide(
      textBox(
        '<a:p><a:r><a:t>Merhaba </a:t></a:r><a:r><a:t>dünya</a:t></a:r></a:p>' +
          '<a:p><a:r><a:t>İkinci satır</a:t></a:r></a:p>',
      ),
    );
    expect(extractSlideText(doc, emptyCtx()).text).toBe('Merhaba dünya\nİkinci satır');
  });

  it('<a:br> satır sonu üretir', () => {
    const doc = slide(
      textBox('<a:p><a:r><a:t>bir</a:t></a:r><a:br/><a:r><a:t>iki</a:t></a:r></a:p>'),
    );
    expect(extractSlideText(doc, emptyCtx()).text).toBe('bir\niki');
  });

  it('slayt numarası alanını (slidenum) metne katmaz', () => {
    const doc = slide(
      textBox(
        '<a:p><a:r><a:t>Başlık</a:t></a:r></a:p>' +
          '<a:p><a:fld type="slidenum"><a:t>7</a:t></a:fld></a:p>',
      ),
    );
    expect(extractSlideText(doc, emptyCtx()).text).toBe('Başlık');
  });

  it('gruplanmış şekillere iner (p:grpSp)', () => {
    const doc = slide(
      `<p:grpSp>${textBox('<a:p><a:r><a:t>grup içi</a:t></a:r></a:p>')}` +
        `${textBox('<a:p><a:r><a:t>ikinci</a:t></a:r></a:p>')}</p:grpSp>`,
    );
    const out = extractSlideText(doc, emptyCtx()).text;
    expect(out).toContain('grup içi');
    expect(out).toContain('ikinci');
  });

  it('şekilleri doküman sırasında verir', () => {
    const doc = slide(
      textBox('<a:p><a:r><a:t>önce</a:t></a:r></a:p>') +
        textBox('<a:p><a:r><a:t>sonra</a:t></a:r></a:p>'),
    );
    const out = extractSlideText(doc, emptyCtx()).text;
    expect(out.indexOf('önce')).toBeLessThan(out.indexOf('sonra'));
  });

  it('boş şekiller çıktıya boş satır eklemez', () => {
    const doc = slide(
      textBox('<a:p><a:r><a:t>  </a:t></a:r></a:p>') +
        textBox('<a:p><a:r><a:t>dolu</a:t></a:r></a:p>'),
    );
    expect(extractSlideText(doc, emptyCtx()).text).toBe('dolu');
  });

  it('metinsiz slayt boş string döner', () => {
    expect(extractSlideText(slide(''), emptyCtx()).text).toBe('');
  });
});

describe('tablolar', () => {
  it('markdown pipe tablosu üretir, ilk satır başlık', () => {
    const out = extractSlideText(slide(TBL([['Ad', 'Yaş'], ['Ali', '30']])), emptyCtx()).text;
    expect(out).toContain('| Ad | Yaş |');
    expect(out).toContain('| --- | --- |');
    expect(out).toContain('| Ali | 30 |');
  });

  it('hücredeki pipe karakterini kaçırır', () => {
    expect(extractSlideText(slide(TBL([['a|b'], ['c']])), emptyCtx()).text).toContain('| a\\|b |');
  });

  it('eksik hücreleri boşla doldurur (satırlar eşit uzunlukta)', () => {
    expect(extractSlideText(slide(TBL([['a', 'b', 'c'], ['x']])), emptyCtx()).text).toContain(
      '| x |  |  |',
    );
  });

  it('tek satırlık tablo da başlık ayracı alır', () => {
    const out = extractSlideText(slide(TBL([['tek']])), emptyCtx()).text;
    expect(out).toContain('| tek |');
    expect(out).toContain('| --- |');
  });

  it('hücre içi satır sonlarını boşluğa çevirir (tablo bozulmasın)', () => {
    const cell =
      `<p:graphicFrame><a:graphic><a:graphicData><a:tbl><a:tr><a:tc><a:txBody>` +
      `<a:p><a:r><a:t>üst</a:t></a:r></a:p><a:p><a:r><a:t>alt</a:t></a:r></a:p>` +
      `</a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
    expect(extractSlideText(slide(cell), emptyCtx()).text).toContain('| üst alt |');
  });

  it('metin ve tablo aynı slaytta sırayla gelir', () => {
    const doc = slide(textBox('<a:p><a:r><a:t>Başlık</a:t></a:r></a:p>') + TBL([['x']]));
    const out = extractSlideText(doc, emptyCtx()).text;
    expect(out.indexOf('Başlık')).toBeLessThan(out.indexOf('| x |'));
  });

  it('satırsız tabloda boş string döner', () => {
    const doc = xmlParse('<a:tbl xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>');
    expect(tableToMarkdown(doc.getElementsByTagName('a:tbl')[0])).toBe('');
  });
});

const CHART = (inner: string) =>
  xmlParse(`<?xml version="1.0"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
              xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <c:chart>${inner}</c:chart>
</c:chartSpace>`);

const strCache = (vals: string[]) =>
  `<c:strRef><c:strCache>${vals
    .map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)
    .join('')}</c:strCache></c:strRef>`;
const numCache = (vals: string[]) =>
  `<c:numRef><c:numCache>${vals
    .map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)
    .join('')}</c:numCache></c:numRef>`;

describe('chartToMarkdown', () => {
  it('kategori/değer grafiğini tabloya çevirir, çok seriyi sütunlaştırır', () => {
    const doc = CHART(
      '<c:title><c:tx><c:rich><a:p><a:r><a:t>Satışlar</a:t></a:r></a:p></c:rich></c:tx></c:title>' +
        '<c:plotArea><c:barChart>' +
        `<c:ser><c:tx>${strCache(['2024'])}</c:tx><c:cat>${strCache(['Q1', 'Q2'])}</c:cat><c:val>${numCache(['120', '95'])}</c:val></c:ser>` +
        `<c:ser><c:tx>${strCache(['2025'])}</c:tx><c:cat>${strCache(['Q1', 'Q2'])}</c:cat><c:val>${numCache(['140', '130'])}</c:val></c:ser>` +
        '</c:barChart></c:plotArea>',
    );
    const md = chartToMarkdown(doc)!;
    expect(md).toContain('### Grafik: Satışlar (sütun grafik)');
    expect(md).toContain('| Kategori | 2024 | 2025 |');
    expect(md).toContain('| Q1 | 120 | 140 |');
    expect(md).toContain('| Q2 | 95 | 130 |');
  });

  it('başlıksız grafikte "Başlıksız" yazar', () => {
    const doc = CHART(
      '<c:plotArea><c:pieChart>' +
        `<c:ser><c:tx>${strCache(['Pay'])}</c:tx><c:cat>${strCache(['Ankara'])}</c:cat><c:val>${numCache(['45'])}</c:val></c:ser>` +
        '</c:pieChart></c:plotArea>',
    );
    expect(chartToMarkdown(doc)).toContain('### Grafik: Başlıksız (pasta grafik)');
  });

  it('dağılım grafiğinde xVal/yVal dalını kullanır', () => {
    const doc = CHART(
      '<c:plotArea><c:scatterChart>' +
        `<c:ser><c:tx>${strCache(['Ölçüm'])}</c:tx><c:xVal>${numCache(['1', '2'])}</c:xVal><c:yVal>${numCache(['2.5', '4.1'])}</c:yVal></c:ser>` +
        '</c:scatterChart></c:plotArea>',
    );
    const md = chartToMarkdown(doc)!;
    expect(md).toContain('(dağılım grafiği)');
    expect(md).toContain('| Seri | X | Y |');
    expect(md).toContain('| Ölçüm | 1 | 2.5 |');
    expect(md).toContain('| Ölçüm | 2 | 4.1 |');
  });

  it('kategori cache yoksa sıra numarası kullanır', () => {
    const doc = CHART(
      '<c:plotArea><c:lineChart>' +
        `<c:ser><c:tx>${strCache(['Seri'])}</c:tx><c:val>${numCache(['5', '6'])}</c:val></c:ser>` +
        '</c:lineChart></c:plotArea>',
    );
    const md = chartToMarkdown(doc)!;
    expect(md).toContain('| 1 | 5 |');
    expect(md).toContain('| 2 | 6 |');
  });

  it("seri yoksa null döner (cache'siz dış-bağlantılı grafik)", () => {
    expect(chartToMarkdown(CHART('<c:plotArea><c:barChart/></c:plotArea>'))).toBeNull();
  });

  it('plotArea yoksa null döner', () => {
    expect(chartToMarkdown(CHART(''))).toBeNull();
  });

  it('bilinmeyen grafik tipinde element adını kullanır', () => {
    const doc = CHART(
      '<c:plotArea><c:sankeyChart>' +
        `<c:ser><c:tx>${strCache(['S'])}</c:tx><c:cat>${strCache(['a'])}</c:cat><c:val>${numCache(['1'])}</c:val></c:ser>` +
        '</c:sankeyChart></c:plotArea>',
    );
    expect(chartToMarkdown(doc)).toContain('(sankeyChart)');
  });

  it('grafik slayt metnine rels üzerinden dahil olur', () => {
    const chartDoc = CHART(
      '<c:plotArea><c:barChart>' +
        `<c:ser><c:tx>${strCache(['S'])}</c:tx><c:cat>${strCache(['a'])}</c:cat><c:val>${numCache(['9'])}</c:val></c:ser>` +
        '</c:barChart></c:plotArea>',
    );
    const ctx = emptyCtx();
    ctx.rels.set('rId2', 'ppt/charts/chart1.xml');
    ctx.charts.set('ppt/charts/chart1.xml', chartDoc);
    const doc = slide(
      '<p:graphicFrame><a:graphic><a:graphicData><c:chart r:id="rId2"/></a:graphicData></a:graphic></p:graphicFrame>',
    );
    expect(extractSlideText(doc, ctx).text).toContain('| a | 9 |');
  });
});

describe('chartToMarkdown — gerçek python-pptx çıktısı (fixture)', () => {
  const fixtureBuf = () => readFileSync(new URL('./__fixtures__/chart-test.pptx', import.meta.url));

  it('chart-test.pptx içindeki üç grafiği de doğru çevirir', async () => {
    const zip = await JSZip.loadAsync(fixtureBuf());

    const c1 = chartToMarkdown(xmlParse(await zip.file('ppt/charts/chart1.xml')!.async('string')))!;
    expect(c1).toContain('### Grafik: Çeyreklik Satışlar (sütun grafik)');
    expect(c1).toContain('| Kategori | 2024 Satış | 2025 Satış |');
    expect(c1).toContain('| Q1 | 120 | 140 |');
    expect(c1).toContain('| Q2 | 95.5 | 130 |');

    const c2 = chartToMarkdown(xmlParse(await zip.file('ppt/charts/chart2.xml')!.async('string')))!;
    expect(c2).toContain('(pasta grafik)');
    expect(c2).toContain('| İstanbul | 35 |');

    const c3 = chartToMarkdown(xmlParse(await zip.file('ppt/charts/chart3.xml')!.async('string')))!;
    expect(c3).toContain('(dağılım grafiği)');
    expect(c3).toContain('| Ölçüm | 1 | 2.5 |');
  });

  it('fixture uçtan uca parse edilir: grafik tablosu + konuşmacı notu', async () => {
    const b = fixtureBuf();
    const out = await parsePptxBuffer(
      b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
      { xmlParse, ocrEnabled: async () => false, ocrOne: async () => null },
    );
    expect(out.metadata?.pageCount).toBe(3);
    expect(out.metadata?.format).toBe('pptx');
    expect(out.content).toContain('--- Slayt 1 ---');
    expect(out.content).toContain('### Grafik: Çeyreklik Satışlar (sütun grafik)');
    expect(out.content).toContain('### Konuşmacı Notları');
    expect(out.content).toContain('Bu grafik yıllık büyümeyi gösteriyor.');
    expect(out.content).toContain('--- Slayt 3 ---');
  });
});

describe('diagramToText (SmartArt)', () => {
  const DGM = (pts: string[]) =>
    xmlParse(`<?xml version="1.0"?>
<dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"
               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <dgm:ptLst>${pts
    .map((t) => `<dgm:pt><dgm:t><a:p><a:r><a:t>${t}</a:t></a:r></a:p></dgm:t></dgm:pt>`)
    .join('')}</dgm:ptLst>
</dgm:dataModel>`);

  it('diyagram metin noktalarını satır satır verir', () => {
    expect(diagramToText(DGM(['Adım 1', 'Adım 2']))).toBe('Adım 1\nAdım 2');
  });

  it('boş diyagram boş string döner', () => {
    expect(
      diagramToText(
        xmlParse(
          '<dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"/>',
        ),
      ),
    ).toBe('');
  });

  it('SmartArt slayt metnine dahil olur', () => {
    const ctx = emptyCtx();
    ctx.rels.set('rId9', 'ppt/diagrams/data1.xml');
    ctx.diagrams.set('ppt/diagrams/data1.xml', DGM(['Süreç']));
    const doc = slide(
      '<p:graphicFrame><a:graphic><a:graphicData><dgm:relIds r:dm="rId9"/></a:graphicData></a:graphic></p:graphicFrame>',
    );
    expect(extractSlideText(doc, ctx).text).toContain('Süreç');
  });
});

describe('extractNotesText', () => {
  const NOTES = (inner: string) =>
    xmlParse(`<?xml version="1.0"?>
<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
         xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>${inner}</p:spTree></p:cSld>
</p:notes>`);

  it('konuşmacı notu metnini verir', () => {
    expect(
      extractNotesText(NOTES(textBox('<a:p><a:r><a:t>Büyümeden bahset.</a:t></a:r></a:p>'))),
    ).toBe('Büyümeden bahset.');
  });

  it('slayt numarası alanını nota katmaz', () => {
    const doc = NOTES(
      textBox('<a:p><a:fld type="slidenum"><a:t>4</a:t></a:fld></a:p>') +
        textBox('<a:p><a:r><a:t>Gerçek not</a:t></a:r></a:p>'),
    );
    expect(extractNotesText(doc)).toBe('Gerçek not');
  });

  it('notsuz slaytta boş string döner', () => {
    expect(
      extractNotesText(
        xmlParse('<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>'),
      ),
    ).toBe('');
  });
});

describe('shouldOcrImage', () => {
  const picEl = (cx?: number, cy?: number) =>
    slide(PIC('rId1', cx, cy)).getElementsByTagName('p:pic')[0];

  it("dekoratif ikonu eler (slayt alanının %0.36'sı)", () => {
    // 0.45 x 0.45 inch = 411480 EMU kenar — OSINT.pptx ölçümü
    expect(shouldOcrImage(picEl(411480, 411480), SLIDE_W, SLIDE_H)).toBe(false);
  });

  it('içerik görselini geçirir (%24.8 — VideoRAG ölçümü)', () => {
    const cx = Math.round(SLIDE_W * 0.498);
    const cy = Math.round(SLIDE_H * 0.498);
    expect(shouldOcrImage(picEl(cx, cy), SLIDE_W, SLIDE_H)).toBe(true);
  });

  it('tam-slayt infografiği geçirir (%99)', () => {
    expect(shouldOcrImage(picEl(SLIDE_W, SLIDE_H), SLIDE_W, SLIDE_H)).toBe(true);
  });

  it('eşiğin hemen üstünü geçirir (%1.1)', () => {
    const cx = Math.round(SLIDE_W * 0.105);
    const cy = Math.round(SLIDE_H * 0.105);
    expect(shouldOcrImage(picEl(cx, cy), SLIDE_W, SLIDE_H)).toBe(true);
  });

  it('<a:ext> yoksa güvenli tarafta kalır ve geçirir', () => {
    expect(shouldOcrImage(picEl(), SLIDE_W, SLIDE_H)).toBe(true);
  });

  it('slayt boyutu 0 ise geçirir (bölme hatası olmasın)', () => {
    expect(shouldOcrImage(picEl(1000, 1000), 0, 0)).toBe(true);
  });

  it("extLst içindeki cx/cy'siz a:ext ölçüyü şaşırtmaz", () => {
    const pic = slide(
      `<p:pic><p:spPr><a:extLst><a:ext uri="{ABC}"/></a:extLst>` +
        `<a:xfrm><a:ext cx="411480" cy="411480"/></a:xfrm></p:spPr>` +
        `<p:blipFill><a:blip r:embed="rId1"/></p:blipFill></p:pic>`,
    ).getElementsByTagName('p:pic')[0];
    expect(shouldOcrImage(pic, SLIDE_W, SLIDE_H)).toBe(false);
  });
});

describe("görsel placeholder'ları", () => {
  it('geçen görsel için %%OCR_IMG_k%% üretir ve yolu kaydeder', () => {
    const ctx = emptyCtx();
    ctx.rels.set('rId5', 'ppt/media/image7.png');
    const out = extractSlideText(slide(PIC('rId5', SLIDE_W, SLIDE_H)), ctx);
    expect(out.text).toContain('%%OCR_IMG_0%%');
    expect(out.mediaPaths).toEqual(['ppt/media/image7.png']);
  });

  it('elenen ikon placeholder üretmez', () => {
    const ctx = emptyCtx();
    ctx.rels.set('rId5', 'ppt/media/icon.png');
    const out = extractSlideText(slide(PIC('rId5', 411480, 411480)), ctx);
    expect(out.text).not.toContain('OCR_IMG');
    expect(out.mediaPaths).toEqual([]);
  });

  it('çözülemeyen rId placeholder üretmez (indeks hizası bozulmasın)', () => {
    const out = extractSlideText(slide(PIC('rIdYok', SLIDE_W, SLIDE_H)), emptyCtx());
    expect(out.text).not.toContain('OCR_IMG');
    expect(out.mediaPaths).toEqual([]);
  });

  it('placeholder indeksleri slayt içinde artar', () => {
    const ctx = emptyCtx();
    ctx.rels.set('rA', 'ppt/media/a.png');
    ctx.rels.set('rB', 'ppt/media/b.png');
    const out = extractSlideText(
      slide(PIC('rA', SLIDE_W, SLIDE_H) + PIC('rB', SLIDE_W, SLIDE_H)),
      ctx,
    );
    expect(out.text).toContain('%%OCR_IMG_0%%');
    expect(out.text).toContain('%%OCR_IMG_1%%');
    expect(out.mediaPaths).toEqual(['ppt/media/a.png', 'ppt/media/b.png']);
  });
});

// --- Uçtan uca ---

async function buildDeck(opts: {
  slides: string[];
  notes?: (string | undefined)[];
  media?: Record<string, string>;
  slideRels?: Record<number, string>;
}): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}"/>
  <p:sldIdLst>${opts.slides
    .map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`)
    .join('')}</p:sldIdLst>
</p:presentation>`,
  );
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${opts.slides
  .map(
    (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`,
  )
  .join('')}
</Relationships>`,
  );
  opts.slides.forEach((inner, i) => {
    zip.file(
      `ppt/slides/slide${i + 1}.xml`,
      `<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld><p:spTree>${inner}</p:spTree></p:cSld></p:sld>`,
    );
    const rels: string[] = [];
    if (opts.slideRels?.[i + 1]) rels.push(opts.slideRels[i + 1]);
    if (opts.notes?.[i]) {
      rels.push(
        `<Relationship Id="rIdN" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${i + 1}.xml"/>`,
      );
      zip.file(
        `ppt/notesSlides/notesSlide${i + 1}.xml`,
        `<?xml version="1.0"?>
<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
         xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${opts.notes[i]}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`,
      );
    }
    if (rels.length > 0) {
      zip.file(
        `ppt/slides/_rels/slide${i + 1}.xml.rels`,
        `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`,
      );
    }
  });
  for (const [path, content] of Object.entries(opts.media || {})) zip.file(path, content);
  return zip.generateAsync({ type: 'arraybuffer' });
}

const imageRel = (rid: string, target: string) =>
  `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}"/>`;

const noOcr = {
  ocrEnabled: async () => false,
  ocrOne: async () => null,
};

describe('parsePptxBuffer', () => {
  it('slaytları sırayla işaretler ve metni birleştirir', async () => {
    const buf = await buildDeck({
      slides: [
        textBox('<a:p><a:r><a:t>Birinci</a:t></a:r></a:p>'),
        textBox('<a:p><a:r><a:t>İkinci</a:t></a:r></a:p>'),
      ],
    });
    const out = await parsePptxBuffer(buf, { xmlParse, ...noOcr });
    expect(out.content).toContain('--- Slayt 1 ---');
    expect(out.content).toContain('Birinci');
    expect(out.content).toContain('--- Slayt 2 ---');
    expect(out.content).toContain('İkinci');
    expect(out.metadata?.pageCount).toBe(2);
    expect(out.metadata?.format).toBe('pptx');
    expect(out.metadata?.warnings).toBeUndefined();
  });

  it('konuşmacı notlarını başlıkla ekler', async () => {
    const buf = await buildDeck({
      slides: [textBox('<a:p><a:r><a:t>Slayt</a:t></a:r></a:p>')],
      notes: ['Büyümeden bahset'],
    });
    const out = await parsePptxBuffer(buf, { xmlParse, ...noOcr });
    expect(out.content).toContain('### Konuşmacı Notları');
    expect(out.content).toContain('Büyümeden bahset');
  });

  it('onProgress her slayt için çağrılır', async () => {
    const calls: [number, number][] = [];
    const buf = await buildDeck({
      slides: [
        textBox('<a:p><a:r><a:t>a</a:t></a:r></a:p>'),
        textBox('<a:p><a:r><a:t>b</a:t></a:r></a:p>'),
      ],
    });
    await parsePptxBuffer(buf, { xmlParse, ...noOcr, onProgress: (c, t) => calls.push([c, t]) });
    expect(calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it('aynı medya birden çok slaytta geçse OCR bir kez çağrılır (dedupe)', async () => {
    let ocrCallCount = 0;
    const buf = await buildDeck({
      slides: [PIC('rIdImg', SLIDE_W, SLIDE_H), PIC('rIdImg', SLIDE_W, SLIDE_H)],
      media: { 'ppt/media/logo.png': 'FAKEPNG' },
      slideRels: {
        1: imageRel('rIdImg', '../media/logo.png'),
        2: imageRel('rIdImg', '../media/logo.png'),
      },
    });
    const out = await parsePptxBuffer(buf, {
      xmlParse,
      ocrEnabled: async () => true,
      ocrOne: async () => {
        ocrCallCount++;
        return 'LOGO METNİ';
      },
    });
    expect(ocrCallCount).toBe(1); // iki slayt, tek OCR
    expect(out.content.match(/LOGO METNİ/g)).toHaveLength(2); // ama iki yere yazıldı
  });

  it('OCR sonucu metne enjekte edilir ve ocrPages sayılır', async () => {
    const buf = await buildDeck({
      slides: [PIC('rIdImg', SLIDE_W, SLIDE_H)],
      media: { 'ppt/media/x.png': 'FAKE' },
      slideRels: { 1: imageRel('rIdImg', '../media/x.png') },
    });
    const out = await parsePptxBuffer(buf, {
      xmlParse,
      ocrEnabled: async () => true,
      ocrOne: async () => 'GÖRSELDEKİ YAZI',
    });
    expect(out.content).toContain('GÖRSELDEKİ YAZI');
    expect(out.metadata?.ocrPages).toBe(1);
  });

  it("OCR kapalıyken görsel placeholder'ı düşer ve uyarı verir", async () => {
    const buf = await buildDeck({
      slides: [
        textBox('<a:p><a:r><a:t>Metin var</a:t></a:r></a:p>') + PIC('rIdImg', SLIDE_W, SLIDE_H),
      ],
      media: { 'ppt/media/x.png': 'FAKE' },
      slideRels: { 1: imageRel('rIdImg', '../media/x.png') },
    });
    const out = await parsePptxBuffer(buf, { xmlParse, ...noOcr });
    expect(out.content).not.toContain('OCR_IMG');
    expect(out.content).toContain('Metin var');
    expect(out.metadata?.warnings?.join(' ')).toContain('görsel');
  });

  it('metin üretmeyen slaytları uyarıda sayar', async () => {
    const buf = await buildDeck({
      slides: [textBox('<a:p><a:r><a:t>dolu</a:t></a:r></a:p>'), '', ''],
    });
    const out = await parsePptxBuffer(buf, { xmlParse, ...noOcr });
    expect(out.metadata?.warnings?.join(' ')).toContain('2 slayttan metin çıkarılamadı');
  });

  it('TÜM slaytlar boşsa sert hata verir (sessiz boş indeks olmasın)', async () => {
    const buf = await buildDeck({ slides: ['', ''] });
    await expect(parsePptxBuffer(buf, { xmlParse, ...noOcr })).rejects.toThrow(
      /hiç metin çıkarılamadı/i,
    );
  });

  it('tamamen görsel deck + OCR kapalı → sert hata (T3AI deseni)', async () => {
    const buf = await buildDeck({
      slides: [PIC('rIdImg', SLIDE_W, SLIDE_H), PIC('rIdImg', SLIDE_W, SLIDE_H)],
      media: { 'ppt/media/x.png': 'FAKE' },
      slideRels: {
        1: imageRel('rIdImg', '../media/x.png'),
        2: imageRel('rIdImg', '../media/x.png'),
      },
    });
    await expect(parsePptxBuffer(buf, { xmlParse, ...noOcr })).rejects.toThrow(
      /hiç metin çıkarılamadı/i,
    );
  });

  it('sldIdLst yoksa SAYISAL dosya adı sırasına düşer', async () => {
    const zip = new JSZip();
    zip.file(
      'ppt/presentation.xml',
      `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}"/></p:presentation>`,
    );
    for (const i of [1, 2, 10]) {
      zip.file(
        `ppt/slides/slide${i}.xml`,
        `<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>S${i}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
      );
    }
    const out = await parsePptxBuffer(await zip.generateAsync({ type: 'arraybuffer' }), {
      xmlParse,
      ...noOcr,
    });
    // sayısal sıra 1,2,10 — sözlük sırası olsaydı 1,10,2 olurdu
    expect(out.content.indexOf('S2')).toBeLessThan(out.content.indexOf('S10'));
  });

  it('slaytsız zip için net hata verir', async () => {
    const zip = new JSZip();
    zip.file('docProps/app.xml', '<x/>');
    await expect(
      parsePptxBuffer(await zip.generateAsync({ type: 'arraybuffer' }), { xmlParse, ...noOcr }),
    ).rejects.toThrow(/Geçerli bir PowerPoint sunumu değil/);
  });

  it('bozuk zip için net hata verir', async () => {
    const bad = new TextEncoder().encode('bu bir zip değil').buffer;
    await expect(parsePptxBuffer(bad, { xmlParse, ...noOcr })).rejects.toThrow(/okunamadı|şifre/i);
  });
});
