import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { pptxBaytlari, SLAYT_BLOK_SINIRI } from './pptxOlustur';
import type { Blok } from './belgeIcerik';

/** Üretilen dosyayı zip olarak açar — geçerli PKZIP olmasa JSZip fırlatır. */
async function zipAc(bayt: Uint8Array) {
  return JSZip.loadAsync(bayt);
}

/** ppt/slides/slideN.xml yollarını slayt sırasına göre döndürür. */
async function slaytDosyalari(bayt: Uint8Array): Promise<string[]> {
  const zip = await zipAc(bayt);
  return Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
}

async function slaytXml(bayt: Uint8Array, n: number): Promise<string> {
  const zip = await zipAc(bayt);
  const dosya = zip.file(`ppt/slides/slide${n}.xml`);
  if (!dosya) throw new Error(`ppt/slides/slide${n}.xml yok`);
  return dosya.async('string');
}

/**
 * <a:r>...<a:t>metin</a:t></a:r> koşusunu BÜTÜN olarak döndürür.
 * Sadece metnin sayfada bir yerde geçtiğini değil, kalın/italik gibi biçimin
 * DOĞRU koşuya uygulandığını (rastgele başka bir run'a değil) doğrulamak için.
 */
function calistirBul(xml: string, metin: string): string {
  const kacan = metin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const es = xml.match(new RegExp(`<a:r>(?:(?!</a:r>).)*?<a:t>${kacan}</a:t></a:r>`, 's'));
  if (!es) throw new Error(`run bulunamadı: "${metin}"\n---\n${xml}`);
  return es[0];
}

const paragraf = (metin: string): Blok => ({ tip: 'paragraf', parcalar: [{ metin }] });

/**
 * XML'i JSZip'ten TAMAMEN BAĞIMSIZ bir ayrıştırıcıyla (@xmldom/xmldom — bu
 * projenin pptx DÜZENLEME özelliğinin de kullandığı kütüphane, bkz.
 * documentEditing.test.ts) gerçek bir DOM ağacına çevirir. JSZip zaten
 * "geçerli PKZIP" iddiasını doğruluyor; bu, "içindeki XML gerçekten
 * ayrıştırılabiliyor mu" sorusunu AYRI bir kütüphaneyle sorar — pptxgenjs'in
 * kendi çıktısını yine pptxgenjs'e sormanın döngüselliğine düşmemek için.
 * NOT: xmldom bazı ihlallerde (ör. çıplak "&") sessiz kalabiliyor — mammoth'un
 * docx'te olduğu gibi TAM bir doğrulayıcı değil, ama JSZip'in tek başına
 * veremediği "ağaç olarak tutarlı mı" sinyalini veriyor.
 */
function katiAyristir(xml: string): { doc: Document; hatalar: string[] } {
  const hatalar: string[] = [];
  const doc = new DOMParser({
    errorHandler: (seviye: string, mesaj: string) => hatalar.push(`${seviye}: ${mesaj}`),
  }).parseFromString(xml, 'application/xml');
  return { doc, hatalar };
}

// Aşağıdaki iki test SLAYT_BLOK_SINIRI'nin GÜNCEL değerine göre kaç blok
// üreteceğini hesaplıyor. Mutasyon adımında (bkz. task-6-brief.md Adım 5)
// sabit KASITLI çok büyütülüyor; sınır koyulmazsa üretilecek blok sayısı da
// onunla birlikte patlar (bir denemede 2 MİLYON addText çağrısı vitest'i
// kilitledi). Tavan, tasarımın zaten küçük tutulması gereken bu sabit için
// gerçek kullanımda hiç devreye girmez (bkz. dosya başı "20 maddelik okunmaz
// slayt" kaygısı) — yalnız mutasyon denemesini güvenli kılıyor.
const MUTASYON_GUVENLI_TAVAN = 50;
const sinirliUzunluk = (n: number) => Math.min(n, MUTASYON_GUVENLI_TAVAN);

describe('pptxBaytlari — slayt bölümleme', () => {
  it('başlık her yeni slaytı açar — iki H1 → 2 slayt, başlık metinleri slayt XML’inde', async () => {
    const bayt = await pptxBaytlari([
      { tip: 'baslik', seviye: 1, metin: 'Birinci Bölüm' },
      { tip: 'baslik', seviye: 1, metin: 'İkinci Bölüm' },
    ]);
    expect(await slaytDosyalari(bayt)).toHaveLength(2);
    expect(await slaytXml(bayt, 1)).toContain('<a:t>Birinci Bölüm</a:t>');
    expect(await slaytXml(bayt, 2)).toContain('<a:t>İkinci Bölüm</a:t>');
  });

  it('seviye 2 başlık da yeni slayt açıyor', async () => {
    const bayt = await pptxBaytlari([
      { tip: 'baslik', seviye: 1, metin: 'H1' },
      { tip: 'baslik', seviye: 2, metin: 'H2' },
    ]);
    expect(await slaytDosyalari(bayt)).toHaveLength(2);
  });

  it('seviye 3 başlık YENİ SLAYT AÇMAZ — H1 + H3 → 1 slayt, H3 metni ara başlık olarak kalıyor', async () => {
    const bayt = await pptxBaytlari([
      { tip: 'baslik', seviye: 1, metin: 'Ana Başlık' },
      { tip: 'baslik', seviye: 3, metin: 'Ara Başlık' },
    ]);
    expect(await slaytDosyalari(bayt)).toHaveLength(1);
    const xml = await slaytXml(bayt, 1);
    expect(xml).toContain('<a:t>Ana Başlık</a:t>');
    expect(xml).toContain('<a:t>Ara Başlık</a:t>');
  });

  it('başlıksız içerik "Sunum" slaytına düşer', async () => {
    const bayt = await pptxBaytlari([paragraf('başlıksız paragraf')]);
    expect(await slaytDosyalari(bayt)).toHaveLength(1);
    const xml = await slaytXml(bayt, 1);
    expect(xml).toContain('<a:t>Sunum</a:t>');
    expect(xml).toContain('<a:t>başlıksız paragraf</a:t>');
  });

  it('başlıktan ÖNCEKİ içerik "Sunum" slaytına, SONRAKİ içerik kendi başlığına düşer', async () => {
    const bayt = await pptxBaytlari([
      paragraf('giriş cümlesi'),
      { tip: 'baslik', seviye: 1, metin: 'Asıl Başlık' },
      paragraf('asıl içerik'),
    ]);
    expect(await slaytDosyalari(bayt)).toHaveLength(2);
    const s1 = await slaytXml(bayt, 1);
    expect(s1).toContain('<a:t>Sunum</a:t>');
    expect(s1).toContain('<a:t>giriş cümlesi</a:t>');
    const s2 = await slaytXml(bayt, 2);
    expect(s2).toContain('<a:t>Asıl Başlık</a:t>');
    expect(s2).toContain('<a:t>asıl içerik</a:t>');
  });
});

describe('pptxBaytlari — içerik türleri', () => {
  it('madde listesi slayta giriyor — maddeler ve GERÇEK madde işareti (buChar) XML’de', async () => {
    const bayt = await pptxBaytlari([
      { tip: 'baslik', seviye: 1, metin: 'Liste' },
      {
        tip: 'liste', sirali: false, ogeler: [
          { metin: 'birinci madde', seviye: 0 },
          { metin: 'ikinci madde', seviye: 0 },
        ],
      },
    ]);
    const xml = await slaytXml(bayt, 1);
    expect(xml).toContain('<a:t>birinci madde</a:t>');
    expect(xml).toContain('<a:t>ikinci madde</a:t>');
    expect(xml).toContain('<a:buChar');
  });

  it('sıralı liste PowerPoint’in OTOMATİK NUMARALANDIRMASINI kullanıyor (elle "1. 2." değil)', async () => {
    const bayt = await pptxBaytlari([
      { tip: 'liste', sirali: true, ogeler: [{ metin: 'bir', seviye: 0 }, { metin: 'iki', seviye: 0 }] },
    ]);
    const xml = await slaytXml(bayt, 1);
    expect(xml).toContain('<a:buAutoNum');
    expect(xml).not.toContain('<a:buChar');
    // elle numara BASILMADI: metin ham, "1. bir" değil "bir"
    expect(xml).toContain('<a:t>bir</a:t>');
    expect(xml).not.toContain('<a:t>1. bir</a:t>');
  });

  it('iç içe liste öğesi PowerPoint girinti seviyesini (lvl) taşıyor', async () => {
    const bayt = await pptxBaytlari([
      { tip: 'liste', sirali: false, ogeler: [{ metin: 'üst', seviye: 0 }, { metin: 'alt', seviye: 1 }] },
    ]);
    const xml = await slaytXml(bayt, 1);
    expect(xml).toContain('lvl="1"');
  });

  it('tablo slayta giriyor — hücre metinleri VE gerçek tablo elemanı (a:tbl) XML’de', async () => {
    const bayt = await pptxBaytlari([
      { tip: 'tablo', basliklar: ['Kalem', 'Tutar'], satirlar: [['Motor', '1250'], ['Kanat', '90']] },
    ]);
    const xml = await slaytXml(bayt, 1);
    expect(xml).toContain('<a:tbl>');
    expect(xml).toContain('<a:t>Kalem</a:t>');
    expect(xml).toContain('<a:t>Tutar</a:t>');
    expect(xml).toContain('<a:t>Motor</a:t>');
    expect(xml).toContain('<a:t>1250</a:t>');
    expect(xml).toContain('<a:t>Kanat</a:t>');
    expect(xml).toContain('<a:t>90</a:t>');
  });

  it('kalın/italik biçim DOĞRU metne uygulanıyor — karışık parçalı paragraf', async () => {
    const bayt = await pptxBaytlari([
      {
        tip: 'paragraf', parcalar: [
          { metin: 'düz ' },
          { metin: 'kalın', kalin: true },
          { metin: ' ve ' },
          { metin: 'italik', italik: true },
        ],
      },
    ]);
    const xml = await slaytXml(bayt, 1);
    expect(calistirBul(xml, 'düz ')).not.toContain('b="1"');
    expect(calistirBul(xml, 'kalın')).toContain('b="1"');
    expect(calistirBul(xml, ' ve ')).not.toMatch(/[bi]="1"/);
    expect(calistirBul(xml, 'italik')).toContain('i="1"');
  });

  it('XML özel karakterleri (& < > " \') bozmuyor — pptxgenjs kendi kaçırıyor', async () => {
    const bayt = await pptxBaytlari([paragraf('A & B < C > D')]);
    const xml = await slaytXml(bayt, 1);
    expect(xml).toContain('<a:t>A &amp; B &lt; C &gt; D</a:t>');
  });
});

describe('pptxBaytlari — slayt taşması (SLAYT_BLOK_SINIRI)', () => {
  it(`tam SLAYT_BLOK_SINIRI (${SLAYT_BLOK_SINIRI}) içerik bloğu TEK slaytta kalıyor`, async () => {
    const n = sinirliUzunluk(SLAYT_BLOK_SINIRI);
    const bloklar: Blok[] = [
      { tip: 'baslik', seviye: 1, metin: 'X' },
      ...Array.from({ length: n }, (_, i) => paragraf(`p${i}`)),
    ];
    const bayt = await pptxBaytlari(bloklar);
    expect(await slaytDosyalari(bayt)).toHaveLength(1);
    const xml = await slaytXml(bayt, 1);
    expect(xml).toContain(`<a:t>p${n - 1}</a:t>`);
  });

  it('8’den fazla blok TAŞAR ve (devam) başlığı alır — 1 başlık + 10 paragraf → 2 slayt', async () => {
    const bloklar: Blok[] = [
      { tip: 'baslik', seviye: 1, metin: 'X' },
      ...Array.from({ length: 10 }, (_, i) => paragraf(`p${i}`)),
    ];
    const bayt = await pptxBaytlari(bloklar);
    const dosyalar = await slaytDosyalari(bayt);
    expect(dosyalar).toHaveLength(2);

    const s2 = await slaytXml(bayt, 2);
    expect(s2).toContain('<a:t>X (devam)</a:t>');

    // Taşan içerik GERÇEKTEN ikinci slaytta, birincisi tam SINIR kadarını tutuyor
    const s1 = await slaytXml(bayt, 1);
    for (let i = 0; i < SLAYT_BLOK_SINIRI; i++) expect(s1).toContain(`<a:t>p${i}</a:t>`);
    expect(s1).not.toContain(`<a:t>p${SLAYT_BLOK_SINIRI}</a:t>`);
    for (let i = SLAYT_BLOK_SINIRI; i < 10; i++) expect(s2).toContain(`<a:t>p${i}</a:t>`);
  });

  it('İKİNCİ taşmada başlık kökten türer — "(devam) (devam)" OLMAZ', async () => {
    const n = sinirliUzunluk(SLAYT_BLOK_SINIRI) * 2 + 4;
    const bloklar: Blok[] = [
      { tip: 'baslik', seviye: 1, metin: 'X' },
      ...Array.from({ length: n }, (_, i) => paragraf(`p${i}`)),
    ];
    const bayt = await pptxBaytlari(bloklar);
    expect(await slaytDosyalari(bayt)).toHaveLength(3);
    const s3 = await slaytXml(bayt, 3);
    expect(s3).toContain('<a:t>X (devam)</a:t>');
    expect(s3).not.toContain('devam) (devam');
  });

  it('yeni başlık geldiğinde taşma sayacı SIFIRLANIR — yeni slaytın kendi 8 hakkı var', async () => {
    const bloklar: Blok[] = [
      { tip: 'baslik', seviye: 1, metin: 'X' },
      ...Array.from({ length: sinirliUzunluk(SLAYT_BLOK_SINIRI) }, (_, i) => paragraf(`x${i}`)),
      { tip: 'baslik', seviye: 1, metin: 'Y' },
      paragraf('y0'),
    ];
    const bayt = await pptxBaytlari(bloklar);
    // X tam dolu (1 slayt) + Y kendi slaydı — taşma OLMAMALI (3 değil 2 slayt)
    expect(await slaytDosyalari(bayt)).toHaveLength(2);
    expect(await slaytXml(bayt, 2)).toContain('<a:t>Y</a:t>');
  });
});

describe('pptxBaytlari — genel', () => {
  it('Türkçe karakterler bozulmuyor', async () => {
    const bayt = await pptxBaytlari([{ tip: 'baslik', seviye: 1, metin: 'ğüşıöç İĞÜŞÖÇ' }]);
    const xml = await slaytXml(bayt, 1);
    expect(xml).toContain('<a:t>ğüşıöç İĞÜŞÖÇ</a:t>');
  });

  it('boş blok listesinde en az bir slayt üretir — geçerli dosya', async () => {
    const bayt = await pptxBaytlari([]);
    const zip = await zipAc(bayt);
    // Gerekli parçalar: PowerPoint bunlar olmadan dosyayı açamaz.
    expect(zip.file('[Content_Types].xml')).not.toBeNull();
    expect(zip.file('_rels/.rels')).not.toBeNull();
    expect(zip.file('ppt/presentation.xml')).not.toBeNull();
    expect(await slaytDosyalari(bayt)).toHaveLength(1);
  });

  it('Uint8Array döner — Blob değil', async () => {
    const bayt = await pptxBaytlari([{ tip: 'baslik', seviye: 1, metin: 'X' }]);
    expect(bayt).toBeInstanceOf(Uint8Array);
  });

  it('[Content_Types].xml, gerçek slayt sayısı kadar presentationml.slide+xml kaydı taşıyor', async () => {
    const bayt = await pptxBaytlari([
      { tip: 'baslik', seviye: 1, metin: 'A' },
      { tip: 'baslik', seviye: 1, metin: 'B' },
      { tip: 'baslik', seviye: 1, metin: 'C' },
    ]);
    const zip = await zipAc(bayt);
    const icerikTurleri = await zip.file('[Content_Types].xml')!.async('string');
    const kayitSayisi = (icerikTurleri.match(/presentationml\.slide\+xml/g) ?? []).length;
    expect(kayitSayisi).toBe(3);
    expect(await slaytDosyalari(bayt)).toHaveLength(3);
  });

  it('ppt/presentation.xml, gerçek slayt sayısı kadar p:sldId kaydı taşıyor', async () => {
    const bayt = await pptxBaytlari([
      { tip: 'baslik', seviye: 1, metin: 'A' },
      { tip: 'baslik', seviye: 1, metin: 'B' },
    ]);
    const zip = await zipAc(bayt);
    const pres = await zip.file('ppt/presentation.xml')!.async('string');
    expect((pres.match(/<p:sldId /g) ?? []).length).toBe(2);
  });
});

// JSZip "geçerli PKZIP" iddiasını doğruluyor; bu blok "içindeki parçalar
// GERÇEK, ayrıştırılabilir XML mi" sorusunu tamamen AYRI bir kütüphaneyle
// (@xmldom/xmldom) soruyor — docxOlustur.test.ts'in mammoth'u kullanma
// gerekçesiyle aynı: üreticinin kendi çıktısını yine kendisine sormak hiçbir
// şey kanıtlamaz.
describe('pptxBaytlari — üretilen parçalar BAĞIMSIZ bir XML ayrıştırıcıdan geçiyor', () => {
  it('her içerik türünü taşıyan slayt XML’i gerçek bir DOM ağacına ayrıştırılıyor', async () => {
    const bayt = await pptxBaytlari([
      { tip: 'baslik', seviye: 1, metin: 'A' },
      paragraf('düz metin'),
      { tip: 'liste', sirali: true, ogeler: [{ metin: 'madde', seviye: 0 }] },
      { tip: 'tablo', basliklar: ['K'], satirlar: [['V']] },
    ]);
    const xml = await slaytXml(bayt, 1);
    const { doc, hatalar } = katiAyristir(xml);
    expect(hatalar).toEqual([]);
    expect(doc.documentElement?.nodeName).toBe('p:sld');
  });

  it('[Content_Types].xml ve ppt/presentation.xml de geçerli, ayrıştırılabilir XML', async () => {
    const bayt = await pptxBaytlari([{ tip: 'baslik', seviye: 1, metin: 'A' }]);
    const zip = await zipAc(bayt);
    const icerikTurleri = await zip.file('[Content_Types].xml')!.async('string');
    const pres = await zip.file('ppt/presentation.xml')!.async('string');

    const ct = katiAyristir(icerikTurleri);
    expect(ct.hatalar).toEqual([]);
    expect(ct.doc.documentElement?.nodeName).toBe('Types');

    const p = katiAyristir(pres);
    expect(p.hatalar).toEqual([]);
    expect(p.doc.documentElement?.nodeName).toBe('p:presentation');
  });

  it('Türkçe karakterli ve taşan (2 slaytlı) üretimde HER slayt ayrıştırılabiliyor', async () => {
    const bloklar: Blok[] = [
      { tip: 'baslik', seviye: 1, metin: 'Çeyrek Raporu ğüşıöç' },
      ...Array.from({ length: 10 }, (_, i) => paragraf(`madde ${i} İĞÜŞÖÇ`)),
    ];
    const bayt = await pptxBaytlari(bloklar);
    const dosyalar = await slaytDosyalari(bayt);
    expect(dosyalar).toHaveLength(2);
    for (let n = 1; n <= dosyalar.length; n++) {
      const { hatalar } = katiAyristir(await slaytXml(bayt, n));
      expect(hatalar).toEqual([]);
    }
  });
});
