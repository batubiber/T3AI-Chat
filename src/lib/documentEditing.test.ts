import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import {
  ATTACHMENT_MARKER,
  detectEditableFormat,
  editableAttachmentsIn,
  documentEditHandoffHint,
  formatLabel,
  unitLabel,
  applyDocumentEdits,
  renderDocumentPreview,
  loadEditableDocument,
} from './documentEditing';

describe('detectEditableFormat', () => {
  it('docx, pptx, xlsx ve pdf tanınır', () => {
    expect(detectEditableFormat('rapor.docx')).toBe('docx');
    expect(detectEditableFormat('sunum.pptx')).toBe('pptx');
    expect(detectEditableFormat('tablo.xlsx')).toBe('xlsx');
    expect(detectEditableFormat('belge.pdf')).toBe('pdf');
  });

  it('düzenlenemeyen türler null döner', () => {
    expect(detectEditableFormat('a.txt')).toBeNull();
    expect(detectEditableFormat('a.csv')).toBeNull();
  });
});

describe('editableAttachmentsIn', () => {
  const line = (list: string) => `**${ATTACHMENT_MARKER} ${list}**\n\nyazım hatalarını düzelt`;

  it('ek satırındaki düzenlenebilir dosyayı bulur', () => {
    expect(editableAttachmentsIn(line('rapor.docx'))).toEqual(['rapor.docx']);
  });

  it('birden çok dosyada yalnız düzenlenebilir olanları verir', () => {
    expect(editableAttachmentsIn(line('a.docx, b.txt, c.pptx, d.xlsx, e.pdf'))).toEqual([
      'a.docx',
      'c.pptx',
      'd.xlsx',
      'e.pdf',
    ]);
  });

  it('ek yoksa boş döner', () => {
    expect(editableAttachmentsIn('merhaba, nasılsın?')).toEqual([]);
  });

  it('yalnız desteklenmeyen tür ekliyse boş döner', () => {
    expect(editableAttachmentsIn(line('veri.csv, metin.txt'))).toEqual([]);
  });

  it('kullanıcının cümlesinde geçen ".docx" tetiklemez', () => {
    // İşaret uygulamanın kendi yazdığı satırda; serbest metin sayılmaz
    expect(editableAttachmentsIn('bana bir .docx dosyası nasıl açarım anlat')).toEqual([]);
  });
});

describe('documentEditHandoffHint', () => {
  it('dosya adını içerir ve devretmeyi söyler', () => {
    const hint = documentEditHandoffHint(['rapor.docx']);
    expect(hint).toContain('rapor.docx');
    expect(hint).toContain('yeniden YAZMA');
  });

  it('modele yapamayacağı şeyi VAAT ETMEZ', () => {
    // "artifact üretebilirsin" denseydi model olmayan bir dosya vaat ederdi
    const hint = documentEditHandoffHint(['a.pptx']);
    expect(hint).toContain('üretemezsin');
  });
});

describe('formatLabel', () => {
  it('kullanıcıya gösterilecek adları verir', () => {
    expect(formatLabel('docx')).toBe('Word belgesi');
    expect(formatLabel('pptx')).toBe('PowerPoint sunumu');
    expect(formatLabel('xlsx')).toBe('Excel tablosu');
  });

  // Her iki etiket de if-zinciri ve SONDA koşulsuz `return` var: yeni format
  // için dal yazılmazsa tsc susar, PDF sessizce "Excel tablosu"/"hücre"
  // olur ve model belgeyi Excel sanıp ona göre öneri üretir.
  it('PDF, Excel etiketine DÜŞMEZ', () => {
    expect(formatLabel('pdf')).toBe('PDF belgesi');
    expect(unitLabel('pdf')).toBe('satır');
  });
});

describe('unitLabel', () => {
  it('her formatın birim adını verir', () => {
    expect(unitLabel('docx')).toBe('paragraf');
    expect(unitLabel('pptx')).toBe('slayt paragrafı');
    expect(unitLabel('xlsx')).toBe('hücre');
  });
});

// ---------------------------------------------------------------------------
// Panelin çağırdığı yol — v2.8.0'da burası DOCX'e sabitliydi ve PPTX patlıyordu
// ---------------------------------------------------------------------------
describe('applyDocumentEdits / renderDocumentPreview — format dağıtımı', () => {
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  // Node ortamında global DOMParser yok — motorlara xmldom enjekte edilir
  const xmlParse = (xml: string) =>
    new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document;
  const serialize = (doc: Document) =>
    new XMLSerializer().serializeToString(doc as unknown as Node);

  async function deck(text: string): Promise<ArrayBuffer> {
    const zip = new JSZip();
    zip.file(
      'ppt/presentation.xml',
      `<?xml version="1.0"?><p:presentation xmlns:p="${P}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`,
    );
    zip.file(
      'ppt/_rels/presentation.xml.rels',
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`,
    );
    zip.file(
      'ppt/slides/slide1.xml',
      `<?xml version="1.0"?><p:sld xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
    );
    return zip.generateAsync({ type: 'arraybuffer' });
  }

  async function docx(text: string): Promise<ArrayBuffer> {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      `<?xml version="1.0"?><w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
    );
    return zip.generateAsync({ type: 'arraybuffer' });
  }

  it('PPTX düzenlemesi uygulanır — Word motoruna düşmez', async () => {
    const buf = await deck('eski baslik');
    const r = await applyDocumentEdits(
      buf,
      'sunum.pptx',
      [{ paragraph: 0, find: 'eski', replace: 'yeni' }],
      xmlParse,
      serialize,
    );
    expect(r.applied).toHaveLength(1);
    expect(r.failed).toHaveLength(0);

    // Sonuç gerçekten yazılmış mı — zip'i tekrar açıp bak
    const out = await JSZip.loadAsync(await r.blob.arrayBuffer());
    const xml = await out.file('ppt/slides/slide1.xml')!.async('string');
    expect(xml).toContain('yeni baslik');
  });

  it('PPTX önizlemesi üretilir', async () => {
    const html = await renderDocumentPreview(await deck('merhaba'), 'sunum.pptx', [], xmlParse);
    expect(html).toContain('Slayt 1');
    expect(html).toContain('merhaba');
  });

  it('DOCX yolu bozulmadı', async () => {
    const r = await applyDocumentEdits(
      await docx('eski metin'),
      'rapor.docx',
      [{ paragraph: 0, find: 'eski', replace: 'yeni' }],
      xmlParse,
      serialize,
    );
    expect(r.applied).toHaveLength(1);
    const out = await JSZip.loadAsync(await r.blob.arrayBuffer());
    expect(await out.file('word/document.xml')!.async('string')).toContain('yeni metin');
  });

  it('desteklenmeyen türde açık hata verir', async () => {
    await expect(
      applyDocumentEdits(await docx('x'), 'a.txt', [], xmlParse, serialize),
    ).rejects.toThrow(/desteklenmiyor/);
    await expect(
      renderDocumentPreview(await docx('x'), 'a.csv', [], xmlParse),
    ).rejects.toThrow(/desteklenmiyor/);
  });
});

describe('XLSX dağıtımı', () => {
  const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const xmlParse = (xml: string) =>
    new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document;
  const serialize = (doc: Document) =>
    new XMLSerializer().serializeToString(doc as unknown as Node);

  async function book(): Promise<ArrayBuffer> {
    const zip = new JSZip();
    zip.file(
      'xl/workbook.xml',
      `<?xml version="1.0"?><workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="Ocak" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    );
    zip.file(
      'xl/_rels/workbook.xml.rels',
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    );
    zip.file(
      'xl/sharedStrings.xml',
      `<?xml version="1.0"?><sst xmlns="${MAIN}" count="1" uniqueCount="1"><si><t>Kalem</t></si></sst>`,
    );
    zip.file(
      'xl/worksheets/sheet1.xml',
      `<?xml version="1.0"?><worksheet xmlns="${MAIN}"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>`,
    );
    return zip.generateAsync({ type: 'arraybuffer' });
  }

  it('applyDocumentEdits XLSX motoruna gider, Word motoruna DÜŞMEZ', async () => {
    const r = await applyDocumentEdits(
      await book(),
      'tablo.xlsx',
      [{ paragraph: 0, replace: 'Defter' }],
      xmlParse,
      serialize,
    );
    expect(r.applied).toHaveLength(1);
    const out = await JSZip.loadAsync(await r.blob.arrayBuffer());
    expect(await out.file('xl/sharedStrings.xml')!.async('string')).toContain('<t>Defter</t>');
  });

  it('renderDocumentPreview hücre ADRESİNE göre işaretler', async () => {
    // DOCX/PPTX metin eşleştiriyor; XLSX'te adres var, eşleştirmeye gerek yok
    const html = await renderDocumentPreview(
      await book(),
      'tablo.xlsx',
      [{ text: 'alakasız metin', locationLabel: 'Ocak!A1' }],
      xmlParse,
    );
    expect(html).toContain('<mark>Kalem</mark>');
    expect(html).toContain('Ocak');
  });

  it('adres eşleşmezse hiçbir şey işaretlenmez', async () => {
    const html = await renderDocumentPreview(
      await book(),
      'tablo.xlsx',
      [{ text: 'Kalem', locationLabel: 'Ocak!Z99' }],
      xmlParse,
    );
    expect(html).not.toContain('<mark>');
  });

  it('loadEditableDocument xlsx için hücre sayar', async () => {
    const doc = await loadEditableDocument(await book(), 'tablo.xlsx', xmlParse);
    expect(doc.format).toBe('xlsx');
    expect(doc.unitCount).toBe(1);
    expect(doc.numberedText).toContain('--- Sayfa: Ocak ---');
    expect(doc.numberedText).toContain('[0] A1 = Kalem');
  });
});

describe('PDF dağıtımı', () => {
  /** Elle yazılmış en küçük PDF — depoya fixture koymamak için. */
  const miniPdf = (metin: string): ArrayBuffer => {
    const icerik = `BT /F1 12 Tf 20 50 Td (${metin}) Tj ET`;
    return new TextEncoder().encode(
      '%PDF-1.4\n' +
      '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
      '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
      '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]/Contents 4 0 R' +
      '/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
      `4 0 obj<</Length ${icerik.length}>>stream\n${icerik}\nendstream endobj\n` +
      '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n' +
      'trailer<</Root 1 0 R/Size 6>>\n%%EOF\n',
    ).buffer as ArrayBuffer;
  };

  it('loadEditableDocument pdf için satır sayar', async () => {
    const doc = await loadEditableDocument(miniPdf('AGUSTOS 2026'), 'belge.pdf');
    expect(doc.format).toBe('pdf');
    expect(doc.unitCount).toBeGreaterThan(0);
    expect(doc.numberedText).toContain('--- Sayfa 1 ---');
  });

  // ZORUNLU: panel indirmeyi `applyDocumentEdits`ten, önizleme yenilemeyi
  // `renderDocumentPreview`ten geçiriyor. Bu dallar eksik olsa sürücünün
  // kendi testleri yine geçer ama kullanıcı indirmeye basınca
  // "desteklenmiyor" hatası alır.
  it('applyDocumentEdits PDF motoruna gider', async () => {
    const buf = miniPdf('AGUSTOS 2026');
    const doc = await loadEditableDocument(buf, 'belge.pdf');
    const birim = Number(/\[(\d+)\]/.exec(doc.numberedText)![1]);
    const r = await applyDocumentEdits(
      buf,
      'belge.pdf',
      [{ paragraph: birim, find: 'AGUSTOS', replace: 'EYLUL' }],
    );
    expect(r.applied).toHaveLength(1);
    expect(r.failed).toHaveLength(0);
    const sonuc = await loadEditableDocument(await r.blob.arrayBuffer(), 'belge.pdf');
    expect(sonuc.numberedText).toContain('EYLUL');
    expect(sonuc.numberedText).not.toContain('AGUSTOS');
  });

  it('sığmayan düzenleme failed listesine düşer, dosya bozulmaz', async () => {
    const buf = miniPdf('AGUSTOS 2026');
    const doc = await loadEditableDocument(buf, 'belge.pdf');
    const birim = Number(/\[(\d+)\]/.exec(doc.numberedText)![1]);
    const r = await applyDocumentEdits(
      buf,
      'belge.pdf',
      [{ paragraph: birim, find: 'AGUSTOS', replace: 'BU METIN KUTUYA ASLA SIGMAZ COK UZUN' }],
    );
    expect(r.applied).toHaveLength(0);
    expect(r.failed).toHaveLength(1);
    const sonuc = await loadEditableDocument(await r.blob.arrayBuffer(), 'belge.pdf');
    expect(sonuc.numberedText).toContain('AGUSTOS');
  });

  it('renderDocumentPreview PDF sayfasını görüntü olarak basar', async () => {
    const html = await renderDocumentPreview(
      miniPdf('AGUSTOS 2026'),
      'belge.pdf',
      [{ text: 'EYLUL', locationLabel: 'Sayfa 1' }],
    );
    expect(html).toContain('Sayfa 1');
    expect(html).toContain('data:image/png;base64,');
  });
});

describe('panel formata sabitlenmemeli', () => {
  it('DocumentEditPanel DOCX motorlarını doğrudan import etmiyor', async () => {
    // v2.8.0'da panel docxEditor/docxPreview'ı doğrudan çağırıyordu ve PPTX
    // "Geçerli bir Word belgesi değil" diye patlıyordu. Testler bileşeni
    // çalıştıramıyor (node ortamı, jsdom yok) — bu yüzden import düzeyinde
    // korunuyor: dağıtıcıyı atlayan her yeni import burada yakalanır.
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/components/DocumentEditPanel.tsx', 'utf8');
    const imports = src.split('\n').filter((l) => l.startsWith('import '));
    expect(imports.some((l) => l.includes('lib/docxEditor'))).toBe(false);
    expect(imports.some((l) => l.includes('lib/docxPreview'))).toBe(false);
    expect(imports.some((l) => l.includes('lib/pptxEditor'))).toBe(false);
    expect(imports.some((l) => l.includes('lib/pptxPreview'))).toBe(false);
    expect(imports.some((l) => l.includes('lib/xlsxEditor'))).toBe(false);
    expect(imports.some((l) => l.includes('lib/xlsxPreview'))).toBe(false);
  });
});
