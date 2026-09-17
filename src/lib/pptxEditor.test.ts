import { describe, it, expect } from 'vitest';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import JSZip from 'jszip';
import {
  extractEditableSlideParagraphs,
  formatSlidesForModel,
  validateSlideEdits,
  applySlideEdits,
  loadSlides,
  slideParagraphs,
} from './pptxEditor';
import { paragraphTextOf } from './ooxmlEdit';

const xmlParse = (xml: string) =>
  new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document;
const serialize = (doc: Document) =>
  new XMLSerializer().serializeToString(doc as unknown as Node);

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';

/** Tek run'lı paragraf içeren şekil */
const sp = (paras: string) => `<p:sp><p:txBody>${paras}</p:txBody></p:sp>`;
const p1 = (t: string) => `<a:p><a:r><a:t xml:space="preserve">${t}</a:t></a:r></a:p>`;
const pN = (parts: string[]) =>
  `<a:p>${parts.map((t) => `<a:r><a:t xml:space="preserve">${t}</a:t></a:r>`).join('')}</a:p>`;

const slideXml = (inner: string) => `<?xml version="1.0"?>
<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld><p:spTree>${inner}</p:spTree></p:cSld></p:sld>`;

/** N slaytlık minimal sunum */
async function buildDeck(slideInners: string[]): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0"?><p:presentation xmlns:p="${P}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <p:sldSz cx="12192000" cy="6858000"/>
      <p:sldIdLst>${slideInners.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join('')}</p:sldIdLst>
    </p:presentation>`,
  );
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      ${slideInners.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}
    </Relationships>`,
  );
  slideInners.forEach((inner, i) => zip.file(`ppt/slides/slide${i + 1}.xml`, slideXml(inner)));
  zip.file('ppt/theme/theme1.xml', '<theme/>');       // dokunulmaması gereken part
  zip.file('ppt/media/image1.png', 'FAKEPNG');
  return zip.generateAsync({ type: 'arraybuffer' });
}

const openDeck = async (buf: ArrayBuffer) => loadSlides(await JSZip.loadAsync(buf), xmlParse);

describe('extractEditableSlideParagraphs', () => {
  it('indeks TÜM SUNUM boyunca sürekli akar', async () => {
    const slides = await openDeck(await buildDeck([sp(p1('bir') + p1('iki')), sp(p1('üç'))]));
    expect(extractEditableSlideParagraphs(slides)).toEqual([
      { index: 0, slide: 1, text: 'bir' },
      { index: 1, slide: 1, text: 'iki' },
      { index: 2, slide: 2, text: 'üç' },
    ]);
  });

  it('boş paragrafı listeye almaz ama indeks kaydırmaz', async () => {
    const slides = await openDeck(await buildDeck([sp(p1('dolu') + '<a:p/>' + p1('son'))]));
    expect(extractEditableSlideParagraphs(slides).map((p) => p.index)).toEqual([0, 2]);
  });

  it("run'lara bölünmüş paragrafı tek metin verir", async () => {
    const slides = await openDeck(await buildDeck([sp(pN(['par', 'ça', 'lı']))]));
    expect(extractEditableSlideParagraphs(slides)[0].text).toBe('parçalı');
  });

  it('formatSlidesForModel slayt başlıkları ekler', async () => {
    const slides = await openDeck(await buildDeck([sp(p1('a')), sp(p1('b'))]));
    expect(formatSlidesForModel(extractEditableSlideParagraphs(slides))).toBe(
      '--- Slayt 1 ---\n[0] a\n--- Slayt 2 ---\n[1] b',
    );
  });
});

describe('validateSlideEdits', () => {
  it('geçerli düzenlemeyi slayt numarasıyla kabul eder', async () => {
    const slides = await openDeck(await buildDeck([sp(p1('x')), sp(p1('yalnış var'))]));
    const v = validateSlideEdits(slides, [{ paragraph: 1, find: 'yalnış', replace: 'yanlış' }]);
    expect(v.rejected).toHaveLength(0);
    expect(v.accepted[0].slide).toBe(2);
    expect(v.accepted[0].occurrences).toBe(1);
  });

  it('find yoksa tam-paragraf yazımı, asla reddedilmez', async () => {
    const slides = await openDeck(await buildDeck([sp(p1('eski'))]));
    const v = validateSlideEdits(slides, [{ paragraph: 0, replace: 'yepyeni' }]);
    expect(v.rejected).toHaveLength(0);
    expect(v.accepted[0].wholeParagraph).toBe(true);
    expect(v.accepted[0].before).toBe('eski');
  });

  it('olmayan paragrafı reddeder', async () => {
    const slides = await openDeck(await buildDeck([sp(p1('x'))]));
    const v = validateSlideEdits(slides, [{ paragraph: 99, find: 'a', replace: 'b' }]);
    expect(v.rejected[0].reason).toBe('paragraf-yok');
  });

  it('bulunamayan metni reddeder', async () => {
    const slides = await openDeck(await buildDeck([sp(p1('x'))]));
    const v = validateSlideEdits(slides, [{ paragraph: 0, find: 'yok', replace: 'b' }]);
    expect(v.rejected[0].reason).toBe('bulunamadi');
  });

  it('çoklu geçişi kabul edip sayar', async () => {
    const slides = await openDeck(await buildDeck([sp(p1('HA 1 ve HA 1'))]));
    const v = validateSlideEdits(slides, [{ paragraph: 0, find: 'HA 1', replace: 'HA 3' }]);
    expect(v.accepted[0].occurrences).toBe(2);
  });
});

describe('applySlideEdits', () => {
  const reopen = async (blob: Blob) => openDeck(await blob.arrayBuffer());

  it('doğru slaytta değişikliği uygular', async () => {
    const buf = await buildDeck([sp(p1('birinci')), sp(p1('yalnış var'))]);
    const r = await applySlideEdits(buf, [{ paragraph: 1, find: 'yalnış', replace: 'yanlış' }], xmlParse, serialize);
    expect(r.failed).toHaveLength(0);
    const slides = await reopen(r.blob);
    expect(paragraphTextOf(slideParagraphs(slides[0].doc)[0], 'a:t')).toBe('birinci');
    expect(paragraphTextOf(slideParagraphs(slides[1].doc)[0], 'a:t')).toBe('yanlış var');
  });

  it("run sınırlarına yayılan ifadeyi değiştirir", async () => {
    const buf = await buildDeck([sp(pN(['Sürü ', 'haberleşme', ' ağı']))]);
    const r = await applySlideEdits(buf, [{ paragraph: 0, find: 'Sürü haberleşme', replace: 'Filo iletişim' }], xmlParse, serialize);
    const slides = await reopen(r.blob);
    expect(paragraphTextOf(slideParagraphs(slides[0].doc)[0], 'a:t')).toBe('Filo iletişim ağı');
  });

  it('TÜM geçişleri değiştirir', async () => {
    const buf = await buildDeck([sp(p1('HA 1 ve HA 1'))]);
    const r = await applySlideEdits(buf, [{ paragraph: 0, find: 'HA 1', replace: 'HA 3' }], xmlParse, serialize);
    const slides = await reopen(r.blob);
    expect(paragraphTextOf(slideParagraphs(slides[0].doc)[0], 'a:t')).toBe('HA 3 ve HA 3');
  });

  it('find olmadan paragrafın tamamını yazar', async () => {
    const buf = await buildDeck([sp(pN(['par', 'ça', 'lı']))]);
    const r = await applySlideEdits(buf, [{ paragraph: 0, replace: 'yeni metin' }], xmlParse, serialize);
    const slides = await reopen(r.blob);
    expect(paragraphTextOf(slideParagraphs(slides[0].doc)[0], 'a:t')).toBe('yeni metin');
  });

  it('DOKUNULMAYAN part\'lar bit bit korunur', async () => {
    const buf = await buildDeck([sp(p1('a')), sp(p1('b'))]);
    const before = await JSZip.loadAsync(buf);
    const r = await applySlideEdits(buf, [{ paragraph: 0, find: 'a', replace: 'A' }], xmlParse, serialize);
    const after = await JSZip.loadAsync(await r.blob.arrayBuffer());
    for (const name of ['ppt/theme/theme1.xml', 'ppt/media/image1.png', 'ppt/presentation.xml']) {
      expect(await after.file(name)!.async('string'), name).toBe(await before.file(name)!.async('string'));
    }
    // değişmeyen SLAYT da yeniden yazılmamalı
    expect(await after.file('ppt/slides/slide2.xml')!.async('string')).toBe(
      await before.file('ppt/slides/slide2.xml')!.async('string'),
    );
  });

  it('uygulanamayan düzenleme FAILED olarak bildirilir', async () => {
    const buf = await buildDeck([sp(p1('HA 1 ve HA 2'))]);
    const r = await applySlideEdits(
      buf,
      [
        { paragraph: 0, find: 'HA 1', replace: 'HA 3' },
        { paragraph: 0, find: 'HA 1 ve HA 2', replace: 'x' }, // artık yok
      ],
      xmlParse, serialize,
    );
    expect(r.applied).toHaveLength(1);
    expect(r.failed).toHaveLength(1);
  });

  it('orijinal buffer değişmez', async () => {
    const buf = await buildDeck([sp(p1('metin'))]);
    const snapshot = new Uint8Array(buf.slice(0));
    await applySlideEdits(buf, [{ paragraph: 0, find: 'metin', replace: 'X' }], xmlParse, serialize);
    expect(Array.from(new Uint8Array(buf))).toEqual(Array.from(snapshot));
  });

  it('bozuk dosyada net hata', async () => {
    const bad = new TextEncoder().encode('pptx değil').buffer;
    await expect(applySlideEdits(bad, [], xmlParse, serialize)).rejects.toThrow(/okunamadı|şifre/i);
  });

  it('slaytsız zip için net hata', async () => {
    const z = new JSZip();
    z.file('docProps/app.xml', '<x/>');
    const buf = await z.generateAsync({ type: 'arraybuffer' });
    await expect(applySlideEdits(buf, [], xmlParse, serialize)).rejects.toThrow(/Geçerli bir PowerPoint/);
  });
});
