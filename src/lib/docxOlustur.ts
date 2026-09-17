/**
 * Blok modelinden sıfırdan Word dosyası kurar.
 *
 * Mevcut docxEditor var olan bir zip'i açıp değiştiriyor; burada şablon yok,
 * paketi baştan kuruyoruz.
 *
 * BEŞ PARÇA gerekiyor. styles.xml'i atlamak cazip görünüyor ama ÖLÇÜLDÜ:
 * tanımlı stil olmadan mammoth "Paragraph style with ID Heading1 was
 * referenced but not defined" uyarısı veriyor ve WORD başlıkları düz metin
 * gösteriyor. Testte o uyarının çıkmadığı doğrulanıyor.
 *
 * Beşinci parça word/_rels/document.xml.rels: mammoth onsuz da stilleri
 * buluyor (yol geleneğinden), yani yokluğunu ayırt edemiyor — ama Word
 * parçaları ilişki üzerinden keşfediyor, ilişki yoksa styles.xml hiç
 * yüklenmeyebilir. Beş-parça testi bu yüzden dosya listesine bakıyor.
 */
import JSZip from 'jszip';
import type { Blok, Parca } from './belgeIcerik';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** XML metin kaçırma. & ilk sırada olmalı, yoksa kendi ürettiğimiz & işaretlerini bozar. */
function xmlKacir(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function calistir(p: Parca): string {
  const bicim =
    (p.kalin ? '<w:b/>' : '') + (p.italik ? '<w:i/>' : '');
  const rPr = bicim ? `<w:rPr>${bicim}</w:rPr>` : '';
  // xml:space="preserve" ŞART: baştaki/sondaki boşluklar yoksa kelimeler birleşir
  return `<w:r>${rPr}<w:t xml:space="preserve">${xmlKacir(p.metin)}</w:t></w:r>`;
}

function paragraf(parcalar: Parca[], stil?: string): string {
  const pPr = stil ? `<w:pPr><w:pStyle w:val="${stil}"/></w:pPr>` : '';
  return `<w:p>${pPr}${parcalar.map(calistir).join('')}</w:p>`;
}

function hucre(metin: string): string {
  return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${paragraf([{ metin }])}</w:tc>`;
}

function tablo(basliklar: string[], satirlar: string[][]): string {
  const kenar = '<w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((k) => `<w:${k} w:val="single" w:sz="4" w:color="auto"/>`).join('') +
    '</w:tblBorders>';
  // ECMA-376 CT_Tbl: tblPr'dan hemen sonra tblGrid ZORUNLU (minOccurs=1).
  // mammoth şema doğrulamadığı için tblGrid'siz tabloyu da okuyor —
  // styles.xml'deki kör noktanın aynısı; bekçi testteki ham document.xml.
  const izgara = `<w:tblGrid>${basliklar.map(() => '<w:gridCol/>').join('')}</w:tblGrid>`;
  const satir = (h: string[]) => `<w:tr>${h.map(hucre).join('')}</w:tr>`;
  return `<w:tbl><w:tblPr>${kenar}</w:tblPr>${izgara}${[basliklar, ...satirlar].map(satir).join('')}</w:tbl>`;
}

function blokXml(b: Blok): string {
  switch (b.tip) {
    case 'baslik':
      return paragraf([{ metin: b.metin }], `Heading${b.seviye}`);
    case 'paragraf':
      return paragraf(b.parcalar);
    case 'liste': {
      // Gerçek numaralandırma numbering.xml ister; kapsam dışı. Girinti +
      // işaretle görsel olarak liste hâli veriliyor.
      // Sıralı listede HER SEVİYENİN KENDİ SAYACI var: düz dizi indeksi iç
      // içe listede yanlış sayar ([0,1,1,0] seviyeleri için 1. 2. 3. 4.
      // basar; doğrusu 1. 1. 2. 2.). Derine inip yüzeye dönülünce alt
      // seviyelerin sayacı sıfırlanır.
      const sayac: number[] = [];
      return b.ogeler
        .map((o) => {
          let isaret = '• ';
          if (b.sirali) {
            sayac[o.seviye] = (sayac[o.seviye] ?? 0) + 1;
            sayac.length = o.seviye + 1; // o.seviye'den derin sayaçlar sıfırlanır
            isaret = `${sayac[o.seviye]}. `;
          }
          const girinti = '  '.repeat(o.seviye);
          return paragraf([{ metin: girinti + isaret + o.metin }]);
        })
        .join('');
    }
    case 'tablo':
      return tablo(b.basliklar, b.satirlar);
  }
}

/** Başlık stilleri. Bu parça olmadan Word başlıkları düz metin gösteriyor. */
function stillerXml(): string {
  const baslik = (n: number, boyut: number) =>
    `<w:style w:type="paragraph" w:styleId="Heading${n}">` +
    `<w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/>` +
    `<w:pPr><w:outlineLvl w:val="${n - 1}"/><w:spacing w:before="240" w:after="120"/></w:pPr>` +
    `<w:rPr><w:b/><w:sz w:val="${boyut}"/></w:rPr></w:style>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W_NS}">
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
${baslik(1, 32)}${baslik(2, 26)}${baslik(3, 24)}
</w:styles>`;
}

export async function docxBaytlari(bloklar: Blok[]): Promise<Uint8Array> {
  const zip = new JSZip();

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);

  zip.folder('_rels')!.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  const kelime = zip.folder('word')!;
  kelime.file('styles.xml', stillerXml());
  kelime.file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W_NS}"><w:body>${bloklar.map(blokXml).join('')}</w:body></w:document>`);

  // word/_rels/document.xml.rels: styles.xml'i belgeye BAĞLAR.
  // ÖLÇÜLDÜ: mammoth bu parça olmadan da stilleri buluyor (yol geleneği), ama
  // Word parçaları ilişki üzerinden keşfediyor. Standarda uyuyoruz.
  kelime.folder('_rels')!.file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);

  return zip.generateAsync({ type: 'uint8array' });
}
