import { describe, it, expect } from 'vitest';
import { genisModaGec, NEFES_PAYI, metinKutuYuksekligi, gonderilebilirMi } from './girdiDuzeni';

const g = (o: Partial<Parameters<typeof genisModaGec>[0]>) =>
  genisModaGec({ metin: 'x', metinPx: 0, kutuPx: 600, dugmelerPx: 200, metinPayiPx: 0, ...o });

describe('genisModaGec', () => {
  it('kısa metinde KOMPAKT kalıyor', () => {
    expect(g({ metinPx: 100 })).toBe(false);
  });

  it('metin düğmelere yaklaşınca GENİŞ moda geçiyor', () => {
    // 600 - 200 - 12 = 388 kullanılabilir
    expect(g({ metinPx: 389 })).toBe(true);
  });

  it('tam sınırda kompakt kalıyor, bir piksel ötesinde geçiyor', () => {
    const sinir = 600 - 200 - NEFES_PAYI;
    expect(g({ metinPx: sinir })).toBe(false);
    expect(g({ metinPx: sinir + 1 })).toBe(true);
  });

  it('SATIR SONU varsa ölçümden bağımsız geçiyor', () => {
    // Shift+Enter ile bilerek satır açılmış; kompakt satıra sığmaz.
    expect(g({ metin: 'a\nb', metinPx: 10 })).toBe(true);
  });

  it('dar ekranda daha ERKEN geçiyor', () => {
    // Karakter saymak yerine piksel ölçmenin sebebi bu: aynı metin dar
    // ekranda sığmıyor, geniş ekranda sığıyor.
    expect(g({ metinPx: 300, kutuPx: 600 })).toBe(false);
    expect(g({ metinPx: 300, kutuPx: 400 })).toBe(true);
  });

  it('düğmeler genişleyince daha erken geçiyor', () => {
    expect(g({ metinPx: 350, dugmelerPx: 200 })).toBe(false);
    expect(g({ metinPx: 350, dugmelerPx: 260 })).toBe(true);
  });

  it('metin alanının İÇ BOŞLUĞU da düşülüyor', () => {
    // Düşülmezse metin, geniş moda geçmeden önce sarıyor ve kompakt satır
    // iki satıra çıkıyor — tarayıcıda tam bu yaşandı.
    expect(g({ metinPx: 380, metinPayiPx: 0 })).toBe(false);
    expect(g({ metinPx: 380, metinPayiPx: 16 })).toBe(true);
  });

  it('ölçüm henüz yapılmadıysa (0) kompakt', () => {
    // İlk render'da gizli kopya ölçülmemiş olabiliyor; boş girdide açılmasın.
    expect(g({ metin: '', metinPx: 0 })).toBe(false);
  });
});

describe('metinKutuYuksekligi', () => {
  const satir = 20, pay = 24;   // 5 satır tavanı = 5*20 + 24 = 124

  it('tavanın ALTINDA içerik kadar büyüyor', () => {
    expect(metinKutuYuksekligi(60, satir, pay)).toEqual({ yukseklikPx: 60, kaydirilacak: false });
  });

  it('BEŞİNCİ satıra kadar kaydırma YOK', () => {
    // Şikâyet buydu: ikinci satırda kaydırma çubuğu çıkıyordu.
    const besSatir = 5 * satir + pay;
    expect(metinKutuYuksekligi(besSatir, satir, pay).kaydirilacak).toBe(false);
    expect(metinKutuYuksekligi(besSatir, satir, pay).yukseklikPx).toBe(besSatir);
  });

  it('ALTINCI satırda tavanda duruyor ve kaydırma açılıyor', () => {
    const altiSatir = 6 * satir + pay;
    const s = metinKutuYuksekligi(altiSatir, satir, pay);
    expect(s.yukseklikPx).toBe(5 * satir + pay);
    expect(s.kaydirilacak).toBe(true);
  });

  it('satır yüksekliği değişince tavan da kayıyor', () => {
    // Sabit piksel yazsaydık büyük yazı tipinde 5 satır tutmazdı.
    expect(metinKutuYuksekligi(999, 30, pay).yukseklikPx).toBe(5 * 30 + pay);
  });

  it('azami satır dışarıdan verilebiliyor', () => {
    expect(metinKutuYuksekligi(999, satir, pay, 3).yukseklikPx).toBe(3 * satir + pay);
  });
});

describe('gonderilebilirMi', () => {
  const bos = { metin: '', yapistirmaSayisi: 0, belgeSayisi: 0, resimSayisi: 0 };

  it('hiçbir şey yokken gönderilemiyor', () => {
    expect(gonderilebilirMi(bos)).toBe(false);
    expect(gonderilebilirMi({ ...bos, metin: '   \n ' })).toBe(false);
  });

  it('yalnız yazı varken gönderilebiliyor', () => {
    expect(gonderilebilirMi({ ...bos, metin: 'merhaba' })).toBe(true);
  });

  it('YALNIZ YAPIŞTIRMA KARTI varken gönderilebiliyor', () => {
    // Canlıda çıkan hata: kart duruyordu ama yazı alanı boş olduğu için hem
    // Enter hem gönder düğmesi sessizce hiçbir şey yapmıyordu.
    expect(gonderilebilirMi({ ...bos, yapistirmaSayisi: 1 })).toBe(true);
  });

  it('YALNIZ RESİM varken gönderilebiliyor', () => {
    // Aynı kökten ikinci hata: düğme etkinleşiyordu ama gönderim erken dönüyordu.
    expect(gonderilebilirMi({ ...bos, resimSayisi: 1 })).toBe(true);
  });

  it('yalnız belge varken gönderilebiliyor', () => {
    expect(gonderilebilirMi({ ...bos, belgeSayisi: 1 })).toBe(true);
  });
});
