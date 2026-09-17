import { describe, it, expect } from 'vitest';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import { docxBaytlari } from './docxOlustur';
import type { Blok } from './belgeIcerik';

/** Üretilen dosyayı projenin KENDİ okuyucusuyla geri okur — geçerliliğin kanıtı */
async function geriOku(bayt: Uint8Array) {
  return mammoth.convertToHtml({ buffer: Buffer.from(bayt) });
}

const ORNEK: Blok[] = [
  { tip: 'baslik', seviye: 1, metin: 'Çeyrek Raporu' },
  { tip: 'paragraf', parcalar: [{ metin: 'Normal ' }, { metin: 'kalın', kalin: true }] },
  { tip: 'liste', sirali: false, ogeler: [{ metin: 'birinci', seviye: 0 }] },
  { tip: 'tablo', basliklar: ['Kalem', 'Tutar'], satirlar: [['Motor', '1250']] },
];

describe('docxBaytlari', () => {
  it('mammoth dosyayı OKUYABİLİYOR ve içerik doğru', async () => {
    const { value } = await geriOku(await docxBaytlari(ORNEK));
    expect(value).toContain('<h1>Çeyrek Raporu</h1>');
    expect(value).toContain('kalın');
    expect(value).toContain('birinci');
    expect(value).toContain('Motor');
    expect(value).toContain('1250');
  });

  it('STİL UYARISI ÇIKMIYOR — styles.xml gerçekten tanımlı', async () => {
    // Bu testin var olma sebebi: styles.xml yokken mammoth okuyor ama WORD
    // başlıkları düz metin gösteriyor. Uyarı, o sessiz bozukluğun tek işareti.
    const { messages } = await geriOku(await docxBaytlari(ORNEK));
    const stilUyarisi = messages.filter((m) => /style.*not be defined|not defined/i.test(m.message));
    expect(stilUyarisi).toEqual([]);
  });

  it('paketin beş parçası da var — styles.xml İLİŞKİYLE bağlı', async () => {
    // ÖLÇÜLDÜ: mammoth ilişki olsa da olmasa da uyarı vermiyor, çünkü
    // styles.xml'i yol geleneğiyle buluyor. WORD ise parçaları ilişki üzerinden
    // keşfediyor; ilişki yoksa stilleri hiç yüklemeyebilir. Yani bu testin
    // koruduğu şeyi mammoth doğrulayamıyor — dosya listesi tek bekçimiz.
    const zip = await JSZip.loadAsync(await docxBaytlari(ORNEK));
    expect(Object.keys(zip.files).filter((f) => !f.endsWith('/')).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'word/_rels/document.xml.rels',
      'word/document.xml',
      'word/styles.xml',
    ].sort());
  });

  it('tabloda tblPr sonrası w:tblGrid ve sütun sayısı kadar w:gridCol var', async () => {
    // ECMA-376 CT_Tbl, tblPr'ın ardından tblGrid İSTER (minOccurs=1). mammoth
    // şema doğrulamadığı için tblGrid'siz tabloyu da okuyor — styles.xml'deki
    // kör noktanın aynısı. Ham document.xml tek bekçi (beş-parça testindeki
    // desenin aynısı: mammoth'un göremediğini zip'ten ham okuyarak koruyoruz).
    const bayt = await docxBaytlari([
      { tip: 'tablo', basliklar: ['Kalem', 'Tutar', 'Not'], satirlar: [['Motor', '1250', 'yerli']] },
    ]);
    const belgeXml = await (await JSZip.loadAsync(bayt)).file('word/document.xml')!.async('string');
    expect(belgeXml).toContain('</w:tblPr><w:tblGrid>');
    // 3 sütun, 2 satır: gridCol sayısı satır/hücre sayısıyla karışamaz
    expect(belgeXml.match(/<w:gridCol/g) ?? []).toHaveLength(3);
  });

  it('Türkçe karakterler bozulmuyor', async () => {
    const { value } = await geriOku(await docxBaytlari([
      { tip: 'paragraf', parcalar: [{ metin: 'ğüşıöç İĞÜŞÖÇ' }] },
    ]));
    expect(value).toContain('ğüşıöç İĞÜŞÖÇ');
  });

  it('XML kaçırma: & < > metni bozmuyor', async () => {
    const bayt = await docxBaytlari([
      { tip: 'paragraf', parcalar: [{ metin: 'A & B < C > D' }] },
    ]);
    const { value } = await geriOku(bayt);
    expect(value).toContain('A &amp; B &lt; C &gt; D');
    // ÖLÇÜLDÜ (mutasyon adımı): & kaçırması silinince mammoth YİNE DE okudu —
    // ayrıştırıcısı çıplak & işaretini hoş görüp çıktıda geri kaçırıyor, mutant
    // yeşil kalıyordu. Word ise well-formed olmayan XML'i reddeder. Bu yüzden
    // kaçırmayı ham document.xml üzerinde de doğruluyoruz.
    const belgeXml = await (await JSZip.loadAsync(bayt)).file('word/document.xml')!.async('string');
    expect(belgeXml).toContain('A &amp; B &lt; C &gt; D');
  });

  it('başlık seviyeleri h1/h2/h3 olarak çıkıyor', async () => {
    const { value } = await geriOku(await docxBaytlari([
      { tip: 'baslik', seviye: 1, metin: 'Bir' },
      { tip: 'baslik', seviye: 2, metin: 'İki' },
      { tip: 'baslik', seviye: 3, metin: 'Üç' },
    ]));
    expect(value).toContain('<h1>Bir</h1>');
    expect(value).toContain('<h2>İki</h2>');
    expect(value).toContain('<h3>Üç</h3>');
  });

  it('sıralı düz liste 1. 2. 3. diye sayıyor', async () => {
    // sirali:true bu teste kadar HİÇ test edilmiyordu. Tam eşleşme bilerek:
    // toContain('1.') gibi gevşek bir kontrol sayaç mutasyonunu yakalayamaz.
    const { value } = await geriOku(await docxBaytlari([
      { tip: 'liste', sirali: true, ogeler: [
        { metin: 'elma', seviye: 0 },
        { metin: 'armut', seviye: 0 },
        { metin: 'kiraz', seviye: 0 },
      ] },
    ]));
    expect(value).toBe('<p>1. elma</p><p>2. armut</p><p>3. kiraz</p>');
  });

  it('iç içe sıralı listede her seviyenin sayacı ayrı', async () => {
    // Seviyeler [0,1,1,0,1]: düz dizi indeksi 1. 2. 3. 4. 5. basardı.
    // Doğrusu: her seviye kendi sayacını tutar, yüzeye dönünce alt seviye
    // sıfırlanır — son öge bu sıfırlamanın kanıtı (5. değil 1.).
    const { value } = await geriOku(await docxBaytlari([
      { tip: 'liste', sirali: true, ogeler: [
        { metin: 'birinci', seviye: 0 },
        { metin: 'alt bir', seviye: 1 },
        { metin: 'alt iki', seviye: 1 },
        { metin: 'ikinci', seviye: 0 },
        { metin: 'yeni alt', seviye: 1 },
      ] },
    ]));
    expect(value).toBe(
      '<p>1. birinci</p><p>  1. alt bir</p><p>  2. alt iki</p><p>2. ikinci</p><p>  1. yeni alt</p>',
    );
  });

  it('boş blok listesinde bile geçerli dosya üretir', async () => {
    const { messages } = await geriOku(await docxBaytlari([]));
    expect(messages.filter((m) => m.type === 'error')).toEqual([]);
  });

  it('Uint8Array döner — Blob değil', async () => {
    expect(await docxBaytlari(ORNEK)).toBeInstanceOf(Uint8Array);
  });
});
