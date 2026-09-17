import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { escapeHtmlText, markChanges, STYLE_MAP } from './docxPreview';

describe('escapeHtmlText', () => {
  it('mammoth ile aynı karakterleri kaçırır', () => {
    expect(escapeHtmlText('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
  });
  it('dokunulmayacak metni değiştirmez', () => {
    expect(escapeHtmlText('düz Türkçe metin')).toBe('düz Türkçe metin');
  });
});

describe('markChanges', () => {
  it('değişen metni işaretler', () => {
    const out = markChanges('<p>Bu cümlede bir yanlış var.</p>', ['yanlış']);
    expect(out).toBe('<p>Bu cümlede bir <mark class="t3ai-degisti">yanlış</mark> var.</p>');
  });

  it('ETİKET İÇİNE dokunmaz', () => {
    // 'p' harfi etiket adında da geçiyor; işaret yalnız metne girmeli
    const out = markChanges('<p class="paragraf">pil</p>', ['pil']);
    expect(out).toBe('<p class="paragraf"><mark class="t3ai-degisti">pil</mark></p>');
  });

  it('aynı metnin tüm geçişlerini işaretler', () => {
    const out = markChanges('<p>HA 3 ve HA 3</p>', ['HA 3']);
    expect(out.match(/<mark/g)).toHaveLength(2);
  });

  it('birden çok değişikliği birlikte işaretler', () => {
    const out = markChanges('<p>bir ve iki</p>', ['bir', 'iki']);
    expect(out).toContain('<mark class="t3ai-degisti">bir</mark>');
    expect(out).toContain('<mark class="t3ai-degisti">iki</mark>');
  });

  it('uzun parça kısa olanı yutmaz (iç içe işaret olmaz)', () => {
    const out = markChanges('<p>HA 3 ve HA 4</p>', ['HA 3', 'HA 3 ve HA 4']);
    expect(out.match(/<mark/g)).toHaveLength(1);
    expect(out).toContain('>HA 3 ve HA 4</mark>');
  });

  it('HTML özel karakterli metni kaçırarak arar', () => {
    const out = markChanges('<p>a &amp; b</p>', ['a & b']);
    expect(out).toContain('<mark class="t3ai-degisti">a &amp; b</mark>');
  });

  it('değişiklik listesi boşsa HTML aynen kalır', () => {
    const html = '<p>dokunulmadı</p>';
    expect(markChanges(html, [])).toBe(html);
    expect(markChanges(html, ['   '])).toBe(html);
  });

  it('bulunmayan metin sessizce atlanır', () => {
    const html = '<p>metin</p>';
    expect(markChanges(html, ['yok'])).toBe(html);
  });

  it('tablo hücresindeki değişikliği işaretler', () => {
    const out = markChanges('<table><tr><td><p>Tamamlandı</p></td></tr></table>', ['Tamamlandı']);
    expect(out).toContain('<td><p><mark class="t3ai-degisti">Tamamlandı</mark></p></td>');
  });
});

// ---------------------------------------------------------------------------
// mammoth çıktısı — belgenin YAPISI korunuyor mu
// ---------------------------------------------------------------------------
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/**
 * Gerçek Word'ün yazdığına yakın belge kurar.
 *
 * `styleAdi` parametresi ÖNEMLİ: Word yerelleştirilmiş sürümde biçem ADINI
 * çeviriyor ("Alıntı") ama KİMLİĞİ ("Quote") değiştirmiyor. İki durum da
 * sınanıyor.
 */
async function buildDocx(styleAdlari: Record<string, string> = {}): Promise<Buffer> {
  const ad = (id: string, varsayilan: string) => styleAdlari[id] ?? varsayilan;
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${R}/numbering" Target="numbering.xml"/></Relationships>`,
  );
  zip.file(
    'word/styles.xml',
    `<?xml version="1.0"?><w:styles xmlns:w="${W}">
      <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
      <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>
      <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="${ad('Title', 'Title')}"/></w:style>
      <w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="${ad('Quote', 'Quote')}"/></w:style>
      <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/></w:style>
    </w:styles>`,
  );
  zip.file(
    'word/numbering.xml',
    `<?xml version="1.0"?><w:numbering xmlns:w="${W}">
      <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/><w:lvlText w:val="o"/></w:lvl></w:abstractNum>
      <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum>
      <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
      <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
    </w:numbering>`,
  );

  const p = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
  const stilli = (id: string, t: string) =>
    `<w:p><w:pPr><w:pStyle w:val="${id}"/></w:pPr><w:r><w:t>${t}</w:t></w:r></w:p>`;
  const madde = (numId: number, ilvl: number, t: string) =>
    `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr><w:r><w:t>${t}</w:t></w:r></w:p>`;

  zip.file(
    'word/document.xml',
    `<?xml version="1.0"?><w:document xmlns:w="${W}"><w:body>
      ${stilli('Title', 'Satış Raporu')}
      ${stilli('Heading1', 'Genel bakış')}
      ${p('Giriş paragrafı.')}
      ${stilli('Heading2', 'Öne çıkanlar')}
      ${madde(1, 0, 'İlk madde')}
      ${madde(1, 1, 'İç içe madde')}
      ${madde(1, 0, 'İkinci madde')}
      ${madde(2, 0, 'Numaralı birinci')}
      ${madde(2, 0, 'Numaralı ikinci')}
      ${stilli('Quote', 'Alıntı paragrafı.')}
      <w:tbl><w:tr><w:tc>${p('Ürün')}</w:tc><w:tc>${p('Adet')}</w:tc></w:tr><w:tr><w:tc>${p('Kalem')}</w:tc><w:tc>${p('12')}</w:tc></w:tr></w:tbl>
    </w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

const render = async (buffer: Buffer) =>
  (await mammoth.convertToHtml({ buffer }, { styleMap: STYLE_MAP })).value;

describe('mammoth çıktısı — belgenin YAPISI korunuyor', () => {
  it('başlık, liste, iç içe liste ve tablo üretiliyor', async () => {
    const html = await render(await buildDocx());

    expect(html).toContain('<h1>Genel bakış</h1>');
    expect(html).toContain('<h2>Öne çıkanlar</h2>');
    // Madde imleri CSS ile geliyor ama ETİKETLER burada olmalı
    expect(html).toContain('<ul>');
    expect(html).toContain('<ol>');
    expect(html).toContain('<table>');
    // İç içe liste: <li> içinde ikinci bir <ul>
    expect(/<li>[^<]*<ul>/.test(html.replace(/\s+/g, ''))).toBe(true);
  });

  it('Word\'ün Title ve Quote biçemleri düz <p> olarak DÜŞMÜYOR', async () => {
    const html = await render(await buildDocx());
    expect(html).toContain('class="t3ai-baslik"');
    expect(html).toContain('<blockquote>');
  });

  it('biçem ADI TÜRKÇE olsa da eşleşir (kimlik üzerinden)', async () => {
    // Türkçe Word biçem adını çeviriyor; kimlik ("Quote") değişmiyor.
    // Ad tabanlı eşleme tek başına yeterli olmadığı için ölçülen kritik durum bu.
    const html = await render(await buildDocx({ Quote: 'Alıntı', Title: 'Başlık' }));
    expect(html).toContain('<blockquote>');
    expect(html).toContain('class="t3ai-baslik"');
  });

  it('mammoth <th> ÜRETMİYOR — tablo başlığı CSS ile ilk satırdan geliyor', async () => {
    // Bu bir iddia değil, ölçüm: CSS'teki "ilk satır başlık" kuralının
    // gerekçesi bu. mammoth th üretmeye başlarsa bu test kırılır ve CSS
    // kuralı gözden geçirilir.
    const html = await render(await buildDocx());
    expect(html).not.toContain('<th');
    expect(html).toContain('<td>');
  });
});

