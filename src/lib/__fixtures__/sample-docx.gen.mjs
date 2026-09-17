#!/usr/bin/env node
/**
 * sample.docx üreteci — DOCX düzenleme testlerinin fixture'ı.
 *
 * Gerçek belgeler (sınav soruları, iç brief) repoya konmuyor; onların YAPISAL
 * özelliği taklit ediliyor. Kritik özellik run parçalanması: ölçümde gerçek bir
 * docx'te paragraf başına 82 run görüldü (Word cümleyi kelime kelime böler),
 * bu yüzden fixture'da da bilinçli olarak parçalanmış bir paragraf var.
 *
 * Kullanım:  node sample-docx.gen.mjs
 */
import JSZip from '../../../node_modules/jszip/lib/index.js';
import { writeFileSync } from 'node:fs';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Tek run'lı paragraf */
const p1 = (text) =>
  `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

/** Metni verilen parçalara bölerek ÇOK run'lı paragraf — Word'ün davranışı */
const pN = (parts) =>
  `<w:p>${parts
    .map((t) => `<w:r><w:rPr><w:lang w:val="tr-TR"/></w:rPr><w:t xml:space="preserve">${t}</w:t></w:r>`)
    .join('')}</w:p>`;

/** Tablo — hücre içindeki paragraflar da düzenlenebilir olmalı */
const table = (rows) =>
  `<w:tbl>${rows
    .map(
      (r) =>
        `<w:tr>${r.map((c) => `<w:tc>${p1(c)}</w:tc>`).join('')}</w:tr>`,
    )
    .join('')}</w:tbl>`;

const body = [
  p1('Bu cümlede bir yalnış var.'),
  '<w:p/>', // boş paragraf — index korunmalı, listeye girmemeli
  // 12 run'a bölünmüş paragraf: hedef ifade run sınırlarını aşıyor
  pN(['Sürü', ' ', 'haberleşme', ' ', 'ağı', ' ', 'merkezi', ' ', 'bir', ' ', 'düğüme', ' bağlıdır.']),
  p1('Aynı ifade burada da geçiyor: tekrar eden metin.'),
  p1('Aynı ifade burada da geçiyor: tekrar eden metin.'),
  table([['Başlık A', 'Başlık B'], ['Hücrede yalnış yazım', 'ikinci hücre']]),
  p1('  Baştaki ve sondaki boşluk korunmalı  '),
  // AYNI paragrafta iki kez geçen ifade → 'birden-fazla' reddi testi
  p1('Bu satırda kritik terim kritik terim olarak iki kez var.'),
].join('');

const zip = new JSZip();

zip.file(
  '[Content_Types].xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`,
);

zip.file(
  '_rels/.rels',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
);

zip.file(
  'word/document.xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`,
);

// styles + medya: "document.xml dışındaki part'lar korunuyor" testinin kanıtı
zip.file(
  'word/styles.xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}"><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`,
);
zip.file('word/media/image1.png', Buffer.from('89504e470d0a1a0a', 'hex'));

const buf = await zip.generateAsync({ type: 'nodebuffer' });
writeFileSync(new URL('./sample.docx', import.meta.url), buf);
console.log('sample.docx yazıldı —', buf.length, 'bayt');
