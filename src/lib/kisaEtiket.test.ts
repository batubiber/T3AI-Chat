import { describe, it, expect } from 'vitest';
import { kisaPresetAdi } from './kisaEtiket';

describe('kisaPresetAdi', () => {
  it('parantezli açıklamayı atar', () => {
    expect(kisaPresetAdi('Derin (Max)')).toBe('Derin');
    expect(kisaPresetAdi('Dengeli (High)')).toBe('Dengeli');
  });

  it('parantez içi UZUN olduğunda da doğru tarafı tutar', () => {
    // "parantez içini al" kuralı burada ters teperdi: "Düşünme Kapalı",
    // "Hızlı"dan uzun. Kısaltmanın kısaltması gerekiyor.
    expect(kisaPresetAdi('Hızlı (Düşünme Kapalı)')).toBe('Hızlı');
    expect(kisaPresetAdi('Hızlı (Düşünmesiz)')).toBe('Hızlı');
  });

  it('parantez yoksa adı olduğu gibi bırakır', () => {
    expect(kisaPresetAdi('Kodlama')).toBe('Kodlama');
    expect(kisaPresetAdi('Genel Kullanım')).toBe('Genel Kullanım');
  });

  it('boşlukları temizler', () => {
    expect(kisaPresetAdi('  Derin  (Max)  ')).toBe('Derin');
  });

  it('boş girdide çökmez', () => {
    expect(kisaPresetAdi('')).toBe('');
    expect(kisaPresetAdi('   ')).toBe('');
  });

  it('sonuç ASLA girdiden uzun olmaz', () => {
    // Kısaltma işlevini yitirmesin diye değişmez bir kural.
    for (const ad of ['Derin (Max)', 'Hızlı (Düşünme Kapalı)', 'Kodlama', 'Genel Kullanım']) {
      expect(kisaPresetAdi(ad).length).toBeLessThanOrEqual(ad.length);
    }
  });
});
