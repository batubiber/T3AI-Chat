import { describe, it, expect } from 'vitest';
import { metinGenisligi, sigarMi, quadDikdortgene, satirlariNumarala, enKucukFark, OLCUM_TOLERANSI, sigacakBoyut, EN_AZ_OLCEK } from './pdfMetin';

// Sahte ölçüm: her karakter 1 birim. Gerçek font metriklerine gerek yok —
// test edilen şey ARİTMETİK, glif genişlikleri değil.
const birebir = (m: string) => m.length;
// Dar/geniş ayrımını sınamak için: i dar, W geniş
const degisken = (m: string) => [...m].reduce((t, c) => t + (c === 'i' ? 0.3 : c === 'W' ? 1.4 : 1), 0);

describe('metinGenisligi', () => {
  it('boyutla ORANTILI', () => {
    expect(metinGenisligi('abcde', 10, birebir)).toBe(50);
    expect(metinGenisligi('abcde', 20, birebir)).toBe(100);
  });

  it('dar ve geniş glifleri ayırt eder', () => {
    // Karakter SAYMAK yeterli olsaydı ikisi eşit çıkardı; ölçümün asıl işi bu.
    expect(metinGenisligi('iiiii', 10, degisken))
      .toBeLessThan(metinGenisligi('WWWWW', 10, degisken));
  });

  it('boş metin sıfır', () => {
    expect(metinGenisligi('', 12, birebir)).toBe(0);
  });
});

describe('sigarMi', () => {
  it('tam sığanı KABUL eder', () => {
    // 5 karakter × 10pt = 50; kutu tam 50
    expect(sigarMi('abcde', 10, 50, birebir)).toBe(true);
  });

  it('bir tık taşanı REDDEDER', () => {
    expect(sigarMi('abcdef', 10, 50, birebir)).toBe(false);
  });

  it('boş metin her kutuya sığar', () => {
    expect(sigarMi('', 10, 0, birebir)).toBe(true);
  });
});

describe('quadDikdortgene', () => {
  it('sekiz sayıdan min/max dikdörtgen çıkarır', () => {
    // MuPDF quad'ı: ul, ur, ll, lr köşeleri (x,y çiftleri)
    expect(quadDikdortgene([10, 20, 60, 20, 10, 35, 60, 35])).toEqual([10, 20, 60, 35]);
  });

  it('köşeler TERS sırada gelse de doğru sonucu verir', () => {
    // Döndürülmüş sayfada koordinatlar sıralı gelmiyor; min/max şart.
    expect(quadDikdortgene([60, 35, 10, 35, 60, 20, 10, 20])).toEqual([10, 20, 60, 35]);
  });
});

describe('satirlariNumarala', () => {
  const satir = (birim: number, sayfa: number, metin: string): Parameters<typeof satirlariNumarala>[0][number] =>
    ({ birim, sayfa, metin, dikdortgen: [0, 0, 10, 10], boyut: 11 });

  it('diğer formatlarla AYNI biçimi üretir', () => {
    // pptx/xlsx ile birebir aynı: "--- ... ---" başlığı ve "[N] metin".
    // yerTutuculariBul bu biçime bağlı; bozulursa şablon doldurma PDF'te
    // sessizce çalışmaz.
    const c = satirlariNumarala([satir(0, 1, 'ilk'), satir(1, 1, 'ikinci'), satir(2, 2, 'sonraki')]);
    expect(c).toBe('--- Sayfa 1 ---\n[0] ilk\n[1] ikinci\n--- Sayfa 2 ---\n[2] sonraki');
  });

  it('birim numaraları sayfalar arasında SÜREKLİ', () => {
    const c = satirlariNumarala([satir(0, 1, 'a'), satir(1, 2, 'b'), satir(2, 3, 'c')]);
    expect(c.match(/\[\d+\]/g)).toEqual(['[0]', '[1]', '[2]']);
  });

  it('boş listede boş dize', () => {
    expect(satirlariNumarala([])).toBe('');
  });
});

describe('enKucukFark', () => {
  it('ortak ön ek ve son eki atıp yalnız DEĞİŞEN parçayı verir', () => {
    // Model satırın tamamını gönderiyor ama değişen tek şey iki rakam.
    // Tamamını değiştirmek satırın TÜMÜNÜ yedek fonta çevirirdi.
    expect(enKucukFark('October 22–27, 2011, Portland', 'October 22–27, 2026, Portland'))
      .toEqual({ find: '2011,', replace: '2026,' });
  });

  it('baştaki değişikliği bulur', () => {
    expect(enKucukFark('2011 yılında', '2026 yılında')).toEqual({ find: '2011', replace: '2026' });
  });

  it('sondaki değişikliği bulur', () => {
    expect(enKucukFark('sürüm 1.0', 'sürüm 1.5')).toEqual({ find: '1.0', replace: '1.5' });
  });

  it('tamamen farklı metinde tamamını verir', () => {
    expect(enKucukFark('abc', 'xyz')).toEqual({ find: 'abc', replace: 'xyz' });
  });

  it('metin AYNIYSA null döner — uygulanacak bir şey yok', () => {
    expect(enKucukFark('aynı', 'aynı')).toBeNull();
  });

  it('ekleme ve silmede de çalışır', () => {
    expect(enKucukFark('ab', 'axyzb')).toEqual({ find: 'ab', replace: 'axyzb' });
    expect(enKucukFark('axyzb', 'ab')).toEqual({ find: 'axyzb', replace: 'ab' });
  });

  it('Türkçe karakterlerde kod noktası bazında çalışır', () => {
    expect(enKucukFark('Ağustos 2025', 'Ağustos 2026')).toEqual({ find: '2025', replace: '2026' });
  });
});

describe('sigarMi — ölçüm toleransı', () => {
  it('karakter karakter toplamanın FAZLA ölçmesini telafi eder', () => {
    // PyMuPDF dokümantasyonu: tek tek genişlikleri toplamak yuvarlama
    // yüzünden gerçek metin genişliğinden BÜYÜK çıkıyor. Tolerans olmadan
    // tam sığan metinler yanlışlıkla reddediliyordu.
    const olc = (m: string) => m.length;
    // 100 birim genişlik, kutu 99: tolerans içinde kalmalı
    expect(sigarMi('x'.repeat(100), 1, 99, olc)).toBe(true);
  });

  it('toleransı AŞAN taşmayı hâlâ reddeder', () => {
    const olc = (m: string) => m.length;
    expect(sigarMi('x'.repeat(120), 1, 100, olc)).toBe(false);
  });

  it('tolerans makul bir aralıkta', () => {
    // Çok büyük olursa gerçek taşmalar geçer, çok küçük olursa işe yaramaz.
    expect(OLCUM_TOLERANSI).toBeGreaterThan(1);
    expect(OLCUM_TOLERANSI).toBeLessThan(1.1);
  });
});

describe('enKucukFark — kelime sınırı', () => {
  it('kelimeyi BÖLMEZ — aranabilirlik bunun için', () => {
    // Karakter seviyesinde kesmek ("11") gömülen metni ayrı parçaya düşürüyor
    // ve sonuçta "2026" PDF içinde ARANAMIYOR. Ölçülerek bulundu.
    const f = enKucukFark('tarih 2011 sonu', 'tarih 2026 sonu')!;
    expect(f.find).toBe('2011');
    expect(f.replace).toBe('2026');
  });

  it('birden çok kelime değişirse aralarını da kapsar', () => {
    const f = enKucukFark('bir iki uc', 'bir dort bes uc')!;
    expect(f.find).toBe('iki');
    expect(f.replace).toBe('dort bes');
  });
});

describe('sigacakBoyut', () => {
  const olc = (m: string) => m.length;   // 1 karakter = 1 birim

  it('zaten sığıyorsa ORİJİNAL boyutu döner — gereksiz küçültme yok', () => {
    // 5 karakter x 10pt = 50, kutu 60: küçültmeye gerek yok
    expect(sigacakBoyut('abcde', 10, 60, olc)).toBe(10);
  });

  it('az taşıyorsa KÜÇÜLTÜP sığdırır', () => {
    // 10 karakter x 10pt = 100, kutu 90 -> 9pt olmalı
    const b = sigacakBoyut('abcdefghij', 10, 90, olc)!;
    expect(b).toBeCloseTo(9, 5);
    // küçültülmüş boyutta gerçekten sığıyor mu
    expect(metinGenisligi('abcdefghij', b, olc)).toBeLessThanOrEqual(90 * OLCUM_TOLERANSI);
  });

  it('ÇOK küçülmesi gerekiyorsa null — okunmaz metin üretmeyiz', () => {
    // "2026" bölüm numarasının (kutu 12) yerine: 20pt gerekiyor, oran 0.6
    // Bu, "2.1" yerine "2026" yazma denemesinin ta kendisi.
    expect(sigacakBoyut('2026', 9, 12, olc)).toBeNull();
  });

  it('alt sınırın TAM üstü kabul, altı red', () => {
    // 10 karakter, kutu = 10 * EN_AZ_OLCEK * 10 -> tam sınırda
    const kutu = 10 * 10 * EN_AZ_OLCEK;
    expect(sigacakBoyut('abcdefghij', 10, kutu, olc)).not.toBeNull();
    expect(sigacakBoyut('abcdefghij', 10, kutu * 0.9, olc)).toBeNull();
  });

  it('alt sınır makul: okunur ama işe yarar', () => {
    expect(EN_AZ_OLCEK).toBeGreaterThan(0.5);
    expect(EN_AZ_OLCEK).toBeLessThan(1);
  });

  it('boş metin her zaman sığar', () => {
    expect(sigacakBoyut('', 10, 0, olc)).toBe(10);
  });
});
