import { describe, it, expect } from 'vitest';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import {
  extractEditableParagraphs,
  formatForModel,
  allParagraphs,
  paragraphText,
} from './docxEditableText';
import {
  validateEdits,
  replaceInParagraph,
  replaceParagraphText,
  applyEdits,
  type DocxEdit,
} from './docxEditor';

// Node'da global DOMParser/XMLSerializer yok — testlerde xmldom enjekte edilir.
const xmlParse = (xml: string) =>
  new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document;
const serialize = (doc: Document) =>
  new XMLSerializer().serializeToString(doc as unknown as Node);

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Tek run'lı paragraf içeren minimal belge */
const docWith = (bodyXml: string) =>
  xmlParse(`<?xml version="1.0"?><w:document xmlns:w="${W}"><w:body>${bodyXml}</w:body></w:document>`);

const p1 = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
const pN = (parts: string[]) =>
  `<w:p>${parts.map((t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`).join('')}</w:p>`;

const firstParagraph = (doc: Document) => allParagraphs(doc)[0];

const fixtureBuf = () => {
  const b = readFileSync(new URL('./__fixtures__/sample.docx', import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

describe('replaceInParagraph — tek run', () => {
  it('metni değiştirir', () => {
    const doc = docWith(p1('Bu cümlede bir yalnış var.'));
    const p = firstParagraph(doc);
    expect(replaceInParagraph(p, 'yalnış', 'yanlış')).toBe(true);
    expect(paragraphText(p)).toBe('Bu cümlede bir yanlış var.');
  });

  it('bulunamayan metinde false döner ve paragrafa dokunmaz', () => {
    const doc = docWith(p1('Metin'));
    const p = firstParagraph(doc);
    expect(replaceInParagraph(p, 'yok', 'X')).toBe(false);
    expect(paragraphText(p)).toBe('Metin');
  });

  it('boş arama metni reddedilir', () => {
    const doc = docWith(p1('Metin'));
    expect(replaceInParagraph(firstParagraph(doc), '', 'X')).toBe(false);
  });

  it('metni silmek için boş değiştirme kabul edilir', () => {
    const doc = docWith(p1('Bu fazla kelime gitsin.'));
    const p = firstParagraph(doc);
    expect(replaceInParagraph(p, 'fazla ', '')).toBe(true);
    expect(paragraphText(p)).toBe('Bu kelime gitsin.');
  });
});

describe('replaceInParagraph — run sınırlarına yayılan metin', () => {
  it('iki run üzerine yayılan ifadeyi değiştirir', () => {
    const doc = docWith(pN(['Sürü ', 'haberleşme ağı']));
    const p = firstParagraph(doc);
    expect(replaceInParagraph(p, 'Sürü haberleşme', 'Filo iletişim')).toBe(true);
    expect(paragraphText(p)).toBe('Filo iletişim ağı');
  });

  it('12 run üzerine yayılan ifadeyi değiştirir (gerçek Word deseni)', () => {
    const parts = ['Sürü', ' ', 'haberleşme', ' ', 'ağı', ' ', 'merkezi', ' ', 'bir', ' ', 'düğüme', ' bağlıdır.'];
    const doc = docWith(pN(parts));
    const p = firstParagraph(doc);
    expect(replaceInParagraph(p, 'merkezi bir düğüme', 'dağıtık bir yapıya')).toBe(true);
    expect(paragraphText(p)).toBe('Sürü haberleşme ağı dağıtık bir yapıya bağlıdır.');
  });

  it('run sayısını değiştirmez (yapı bozulmaz)', () => {
    const doc = docWith(pN(['bir', ' iki', ' üç']));
    const p = firstParagraph(doc);
    const before = p.getElementsByTagName('w:t').length;
    replaceInParagraph(p, 'iki üç', 'DEĞİŞTİ');
    expect(p.getElementsByTagName('w:t').length).toBe(before);
  });

  it('hedefin dışındaki run\'lara dokunmaz', () => {
    const doc = docWith(pN(['BAŞ ', 'orta', ' SON']));
    const p = firstParagraph(doc);
    replaceInParagraph(p, 'orta', 'ORTA');
    const texts = Array.from(p.getElementsByTagName('w:t')).map((t) => t.textContent);
    expect(texts).toEqual(['BAŞ ', 'ORTA', ' SON']);
  });

  it('run ortasından başlayan ifadede ön parça korunur', () => {
    const doc = docWith(pN(['abcXY', 'Zdef']));
    const p = firstParagraph(doc);
    expect(replaceInParagraph(p, 'XYZ', '-')).toBe(true);
    expect(paragraphText(p)).toBe('abc-def');
  });
});

describe('replaceInParagraph — boşluk korunumu', () => {
  it('baştaki/sondaki boşluk kaybolmaz', () => {
    const doc = docWith(p1('  başta ve sonda boşluk  '));
    const p = firstParagraph(doc);
    replaceInParagraph(p, 'başta', 'BAŞTA');
    expect(paragraphText(p)).toBe('  BAŞTA ve sonda boşluk  ');
  });

  it('boşluklu sonuçta xml:space="preserve" işaretlenir', () => {
    const doc = docWith('<w:p><w:r><w:t>kelime</w:t></w:r></w:p>');
    const p = firstParagraph(doc);
    replaceInParagraph(p, 'kelime', 'kelime ');
    expect(p.getElementsByTagName('w:t')[0].getAttribute('xml:space')).toBe('preserve');
  });
});

describe('extractEditableParagraphs', () => {
  it('boş paragrafı listeye almaz ama index kaydırmaz', () => {
    const doc = docWith(p1('birinci') + '<w:p/>' + p1('üçüncü'));
    expect(extractEditableParagraphs(doc)).toEqual([
      { index: 0, text: 'birinci' },
      { index: 2, text: 'üçüncü' },
    ]);
  });

  it('tablo hücrelerindeki paragrafları da alır', () => {
    const doc = docWith(`<w:tbl><w:tr><w:tc>${p1('hücre metni')}</w:tc></w:tr></w:tbl>`);
    expect(extractEditableParagraphs(doc)).toEqual([{ index: 0, text: 'hücre metni' }]);
  });

  it('run\'lara bölünmüş paragrafı tek metin olarak verir', () => {
    const doc = docWith(pN(['par', 'ça', 'lı']));
    expect(extractEditableParagraphs(doc)[0].text).toBe('parçalı');
  });

  it('formatForModel numaralı satır üretir', () => {
    const doc = docWith(p1('bir') + '<w:p/>' + p1('iki'));
    expect(formatForModel(extractEditableParagraphs(doc))).toBe('[0] bir\n[2] iki');
  });
});

describe('validateEdits', () => {
  const doc = () => docWith(p1('Bu cümlede yalnış var.') + p1('tekrar tekrar eden metin'));

  it('geçerli düzenlemeyi kabul eder', () => {
    const edits: DocxEdit[] = [{ paragraph: 0, find: 'yalnış', replace: 'yanlış' }];
    const v = validateEdits(doc(), edits);
    expect(v.accepted).toHaveLength(1);
    expect(v.rejected).toHaveLength(0);
  });

  it('olmayan paragrafı reddeder', () => {
    const v = validateEdits(doc(), [{ paragraph: 99, find: 'x', replace: 'y' }]);
    expect(v.accepted).toHaveLength(0);
    expect(v.rejected[0].reason).toBe('paragraf-yok');
    expect(v.rejected[0].message).toMatch(/paragraf yok/i);
  });

  it('bulunamayan metni reddeder (model uydurmuşsa dosyaya bulaşmaz)', () => {
    const v = validateEdits(doc(), [{ paragraph: 0, find: 'olmayan ifade', replace: 'y' }]);
    expect(v.rejected[0].reason).toBe('bulunamadi');
  });

  it('AYNI paragrafta birden fazla geçen metni KABUL eder ve sayısını verir', () => {
    // Eskiden 'belirsiz' diye reddediliyordu; kullanıcı "X'leri Y yap" derken
    // hepsinin değişmesini istiyor ve model hangisi olduğunu belirtemiyor.
    const v = validateEdits(doc(), [{ paragraph: 1, find: 'tekrar', replace: 'y' }]);
    expect(v.rejected).toHaveLength(0);
    expect(v.accepted).toHaveLength(1);
    expect(v.accepted[0].occurrences).toBe(2);
  });

  it('find YOKSA paragrafın tamamı yeniden yazılır — asla reddedilmez', () => {
    const v = validateEdits(doc(), [{ paragraph: 0, replace: 'Tamamen yeni metin.' }]);
    expect(v.rejected).toHaveLength(0);
    expect(v.accepted[0].wholeParagraph).toBe(true);
    expect(v.accepted[0].before).toBe('Bu cümlede yalnış var.');
    expect(v.accepted[0].after).toBe('Tamamen yeni metin.');
  });

  it('boş find de tam-paragraf yazımı sayılır', () => {
    const v = validateEdits(doc(), [{ paragraph: 0, find: '', replace: 'yeni' }]);
    expect(v.rejected).toHaveLength(0);
    expect(v.accepted[0].wholeParagraph).toBe(true);
  });

  it('farklı paragraflarda geçen aynı metin belirsiz SAYILMAZ', () => {
    const d = docWith(p1('aynı metin') + p1('aynı metin'));
    const v = validateEdits(d, [{ paragraph: 1, find: 'aynı metin', replace: 'X' }]);
    expect(v.accepted).toHaveLength(1);
  });

  it('geçerli ve geçersizi tek çağrıda ayırır', () => {
    const v = validateEdits(doc(), [
      { paragraph: 0, find: 'yalnış', replace: 'yanlış' },
      { paragraph: 0, find: 'yok', replace: 'x' },
      { paragraph: 1, find: 'tekrar', replace: 'x' },
    ]);
    expect(v.accepted).toHaveLength(2); // 'tekrar' artık kabul (2 yerde)
    expect(v.rejected.map((r) => r.reason)).toEqual(['bulunamadi']);
  });
});

describe('applyEdits — gerçek fixture ile uçtan uca', () => {
  const zipOf = async (blob: Blob) => JSZip.loadAsync(await blob.arrayBuffer());
  const applyBlob = async (...a: Parameters<typeof applyEdits>) => (await applyEdits(...a)).blob;

  it('düzenlenmiş geçerli bir docx üretir', async () => {
    const blob = await applyBlob(
      fixtureBuf(),
      [{ paragraph: 0, find: 'yalnış', replace: 'yanlış' }],
      xmlParse,
      serialize,
    );
    const zip = await zipOf(blob);
    const doc = xmlParse(await zip.file('word/document.xml')!.async('string'));
    expect(paragraphText(allParagraphs(doc)[0])).toBe('Bu cümlede bir yanlış var.');
  });

  it('word/document.xml DIŞINDAKİ part\'ları bit bit korur', async () => {
    const buf = fixtureBuf();
    const before = await JSZip.loadAsync(buf);
    const after = await zipOf(
      await applyBlob(buf, [{ paragraph: 0, find: 'yalnış', replace: 'yanlış' }], xmlParse, serialize),
    );

    const names = Object.keys(before.files).filter((n) => !before.files[n].dir);
    for (const name of names) {
      if (name === 'word/document.xml') continue;
      const a = await before.file(name)!.async('uint8array');
      const b = await after.file(name)!.async('uint8array');
      expect(Array.from(b), `${name} değişmemeli`).toEqual(Array.from(a));
    }
  });

  it('12 run\'a bölünmüş paragrafı fixture üzerinde düzenler', async () => {
    const blob = await applyBlob(
      fixtureBuf(),
      [{ paragraph: 2, find: 'merkezi bir düğüme', replace: 'dağıtık bir yapıya' }],
      xmlParse,
      serialize,
    );
    const zip = await zipOf(blob);
    const doc = xmlParse(await zip.file('word/document.xml')!.async('string'));
    expect(paragraphText(allParagraphs(doc)[2])).toBe('Sürü haberleşme ağı dağıtık bir yapıya bağlıdır.');
  });

  it('birden çok düzenlemeyi birlikte uygular', async () => {
    const blob = await applyBlob(
      fixtureBuf(),
      [
        { paragraph: 0, find: 'yalnış', replace: 'yanlış' },
        { paragraph: 7, find: 'yalnış', replace: 'yanlış' },
      ],
      xmlParse,
      serialize,
    );
    const zip = await zipOf(blob);
    const doc = xmlParse(await zip.file('word/document.xml')!.async('string'));
    const paras = allParagraphs(doc);
    expect(paragraphText(paras[0])).toContain('yanlış');
    expect(paragraphText(paras[7])).toBe('Hücrede yanlış yazım');
  });

  it('uygulanmayan düzenleme belgeyi değiştirmez', async () => {
    const buf = fixtureBuf();
    const orig = await (await JSZip.loadAsync(buf)).file('word/document.xml')!.async('string');
    const blob = await applyBlob(buf, [{ paragraph: 0, find: 'HİÇ YOK', replace: 'X' }], xmlParse, serialize);
    const zip = await zipOf(blob);
    const doc = xmlParse(await zip.file('word/document.xml')!.async('string'));
    expect(paragraphText(allParagraphs(doc)[0])).toBe('Bu cümlede bir yalnış var.');
    expect(orig).toContain('yalnış');
  });

  it('orijinal buffer\'a dokunmaz', async () => {
    const buf = fixtureBuf();
    const snapshot = new Uint8Array(buf.slice(0));
    await applyEdits(buf, [{ paragraph: 0, find: 'yalnış', replace: 'yanlış' }], xmlParse, serialize);
    expect(Array.from(new Uint8Array(buf))).toEqual(Array.from(snapshot));
  });

  it('bozuk dosyada net hata verir', async () => {
    const bad = new TextEncoder().encode('bu bir docx değil').buffer;
    await expect(applyEdits(bad, [], xmlParse, serialize)).rejects.toThrow(/okunamadı|şifre/i);
  });

  it('document.xml içermeyen zip için net hata verir', async () => {
    const z = new JSZip();
    z.file('foo.txt', 'x');
    const buf = await z.generateAsync({ type: 'arraybuffer' });
    await expect(applyEdits(buf, [], xmlParse, serialize)).rejects.toThrow(/Geçerli bir Word belgesi değil/);
  });
});

describe('applyEdits — çakışan düzenleme sessizce düşmez', () => {
  /** Kullanıcının bildirdiği vaka: tablo hücresinde "HA 1 ve HA 2" varken
   *  model hem dar hem geniş eşleşme önerirse ikincisi boşa düşüyordu. */
  const buildCell = async (text: string) => {
    const z = new JSZip();
    z.file(
      'word/document.xml',
      `<?xml version="1.0"?><w:document xmlns:w="${W}"><w:body>` +
        `<w:tbl><w:tr><w:tc>${p1(text)}</w:tc></w:tr></w:tbl>` +
        `</w:body></w:document>`,
    );
    return z.generateAsync({ type: 'arraybuffer' });
  };

  it('önceki düzenlemenin bozduğu aramayı FAILED olarak bildirir', async () => {
    const buf = await buildCell('HA 1 ve HA 2');
    const r = await applyEdits(
      buf,
      [
        { paragraph: 0, find: 'HA 1', replace: 'HA 3' },          // uygulanır
        { paragraph: 0, find: 'HA 1 ve HA 2', replace: 'HA 3 ve HA 4' }, // artık yok
      ],
      xmlParse,
      serialize,
    );
    expect(r.applied).toHaveLength(1);
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0].find).toBe('HA 1 ve HA 2');
  });

  it('çakışmayan iki düzenleme aynı paragrafta birlikte uygulanır', async () => {
    const buf = await buildCell('HA 1 ve HA 2');
    const r = await applyEdits(
      buf,
      [
        { paragraph: 0, find: 'HA 1', replace: 'HA 3' },
        { paragraph: 0, find: 'HA 2', replace: 'HA 4' },
      ],
      xmlParse,
      serialize,
    );
    expect(r.failed).toHaveLength(0);
    const zip = await JSZip.loadAsync(await r.blob.arrayBuffer());
    const doc = xmlParse(await zip.file('word/document.xml')!.async('string'));
    expect(paragraphText(allParagraphs(doc)[0])).toBe('HA 3 ve HA 4');
  });

  it('olmayan paragraf da FAILED sayılır (sessiz atlama yok)', async () => {
    const buf = await buildCell('metin');
    const r = await applyEdits(buf, [{ paragraph: 99, find: 'x', replace: 'y' }], xmlParse, serialize);
    expect(r.applied).toHaveLength(0);
    expect(r.failed).toHaveLength(1);
  });
});

describe('replaceInParagraph — TÜM geçişler', () => {
  it('aynı paragraftaki her geçişi değiştirir', () => {
    const doc = docWith(p1('HA 1 ve HA 1 tekrar HA 1'));
    const p = firstParagraph(doc);
    expect(replaceInParagraph(p, 'HA 1', 'HA 3')).toBe(true);
    expect(paragraphText(p)).toBe('HA 3 ve HA 3 tekrar HA 3');
  });

  it('run sınırlarına yayılan çoklu geçişte de çalışır', () => {
    const doc = docWith(pN(['HA ', '1 ve ', 'HA ', '1']));
    const p = firstParagraph(doc);
    expect(replaceInParagraph(p, 'HA 1', 'HA 3')).toBe(true);
    expect(paragraphText(p)).toBe('HA 3 ve HA 3');
  });

  it('replace, find\'ı içerse bile sonsuz döngüye girmez', () => {
    const doc = docWith(p1('a a a'));
    const p = firstParagraph(doc);
    expect(replaceInParagraph(p, 'a', 'aa')).toBe(true);
    expect(paragraphText(p)).toBe('aa aa aa');
  });
});

describe('replaceParagraphText — paragrafı yeniden yaz', () => {
  it('tüm metni değiştirir, run yapısını korur', () => {
    const doc = docWith(pN(['par', 'ça', 'lı metin']));
    const p = firstParagraph(doc);
    expect(replaceParagraphText(p, 'yepyeni metin')).toBe(true);
    expect(paragraphText(p)).toBe('yepyeni metin');
    expect(p.getElementsByTagName('w:t')).toHaveLength(3); // yapı bozulmadı
  });

  it('metinsiz paragrafta false döner', () => {
    const doc = docWith('<w:p/>');
    expect(replaceParagraphText(firstParagraph(doc), 'x')).toBe(false);
  });

  it('applyEdits find olmadan da uygular ve ESLEŞME ARAMAZ', async () => {
    const z = new JSZip();
    z.file(
      'word/document.xml',
      `<?xml version="1.0"?><w:document xmlns:w="${W}"><w:body>` +
        `<w:tbl><w:tr><w:tc>${p1('HA 1 ve HA 2')}</w:tc></w:tr></w:tbl>` +
        `</w:body></w:document>`,
    );
    const buf = await z.generateAsync({ type: 'arraybuffer' });
    const r = await applyEdits(buf, [{ paragraph: 0, replace: 'HA 3 ve HA 4' }], xmlParse, serialize);
    expect(r.failed).toHaveLength(0);
    const zip = await JSZip.loadAsync(await r.blob.arrayBuffer());
    const doc = xmlParse(await zip.file('word/document.xml')!.async('string'));
    expect(paragraphText(allParagraphs(doc)[0])).toBe('HA 3 ve HA 4');
  });
});

