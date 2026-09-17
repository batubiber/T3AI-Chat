import { describe, it, expect } from 'vitest';
import { cipeDonsunMu, mesajiBirlestir, ESIK_KARAKTER, ESIK_SATIR } from './yapistirmaCipi';

describe('cipeDonsunMu', () => {
  it('kısa yapıştırma yazı alanına giriyor', () => {
    expect(cipeDonsunMu('Merhaba, bu kısa bir not.')).toBe(false);
  });

  it('eşiği aşan uzun metin çipe dönüyor', () => {
    expect(cipeDonsunMu('a'.repeat(ESIK_KARAKTER + 1))).toBe(true);
  });

  it('TAM eşik kadar metin çipe DÖNMÜYOR — sınır dışarıda', () => {
    expect(cipeDonsunMu('a'.repeat(ESIK_KARAKTER))).toBe(false);
  });

  it('kısa ama ÇOK SATIRLI metin de çipe dönüyor', () => {
    // 40 karakterlik ama 20 satırlık bir liste girdi kutusunu yine taşırıyor;
    // yalnız karakter saymak bunu kaçırıyordu.
    const liste = Array.from({ length: ESIK_SATIR + 1 }, (_, i) => `${i}`).join('\n');
    expect(liste.length).toBeLessThan(ESIK_KARAKTER);
    expect(cipeDonsunMu(liste)).toBe(true);
  });

  it('tam eşik kadar satır çipe DÖNMÜYOR', () => {
    expect(cipeDonsunMu(Array.from({ length: ESIK_SATIR }, (_, i) => `${i}`).join('\n'))).toBe(false);
  });

  it('boş yapıştırma çip üretmiyor', () => {
    expect(cipeDonsunMu('')).toBe(false);
    expect(cipeDonsunMu('   \n  ')).toBe(false);
  });
});

describe('mesajiBirlestir', () => {
  it('yapıştırma yoksa yazılan metne DOKUNMUYOR', () => {
    expect(mesajiBirlestir([], 'merhaba')).toBe('merhaba');
  });

  it('tek yapıştırma, sanki elle yapıştırılmış gibi önce geliyor', () => {
    // Ayırıcı etiket YOK: modele giden metin bugünküyle birebir aynı kalsın
    // diye. Çip yalnız görsel bir katman; prompt değişmiyor.
    expect(mesajiBirlestir(['UZUN METİN'], 'bunu özetle')).toBe('UZUN METİN\n\nbunu özetle');
  });

  it('birden çok yapıştırma sırayla ekleniyor', () => {
    expect(mesajiBirlestir(['A', 'B'], 'karşılaştır')).toBe('A\n\nB\n\nkarşılaştır');
  });

  it('yazılan metin boşsa sonda boşluk bırakmıyor', () => {
    expect(mesajiBirlestir(['A'], '   ')).toBe('A');
  });
});
