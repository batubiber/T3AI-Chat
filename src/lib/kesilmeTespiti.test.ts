import { describe, it, expect } from 'vitest';
import { kesildiMi, bitisSebebiniOku } from './kesilmeTespiti';

describe('kesildiMi', () => {
  it('uzunluk sınırına takılan yanıt KESİK', () => {
    expect(kesildiMi('length')).toBe(true);
  });

  it('bazı sunucular "max_tokens" diyor — o da kesik', () => {
    expect(kesildiMi('max_tokens')).toBe(true);
  });

  it('normal bitiş kesik DEĞİL', () => {
    expect(kesildiMi('stop')).toBe(false);
  });

  it('ARAÇ ÇAĞRISIYLA biten tur kesik DEĞİL', () => {
    // Belge üretme/düzenleme turları böyle bitiyor. Kesik sayılsaydı her
    // belge isteğinde kullanıcıya yanlışlıkla "yanıt yarım kaldı" derdik.
    expect(kesildiMi('tool_calls')).toBe(false);
    expect(kesildiMi('function_call')).toBe(false);
  });

  it('sebep yoksa uyarı YOK — uydurma uyarı göstermiyoruz', () => {
    expect(kesildiMi(null)).toBe(false);
    expect(kesildiMi(undefined)).toBe(false);
    expect(kesildiMi('')).toBe(false);
  });

  it('tanınmayan sebep kesik sayılmıyor', () => {
    expect(kesildiMi('content_filter')).toBe(false);
    expect(kesildiMi('bilinmeyen')).toBe(false);
  });
});

describe('bitisSebebiniOku', () => {
  it('akış parçasından sebebi çıkarıyor', () => {
    expect(bitisSebebiniOku({ choices: [{ delta: {}, finish_reason: 'length' }] })).toBe('length');
  });

  it('sebep henüz yokken null — akışın ortasındaki parçalar', () => {
    expect(bitisSebebiniOku({ choices: [{ delta: { content: 'merhaba' } }] })).toBeNull();
    expect(bitisSebebiniOku({ choices: [{ delta: {}, finish_reason: null }] })).toBeNull();
  });

  it('beklenmedik gövdede çökmüyor', () => {
    expect(bitisSebebiniOku(null)).toBeNull();
    expect(bitisSebebiniOku({})).toBeNull();
    expect(bitisSebebiniOku({ choices: [] })).toBeNull();
    expect(bitisSebebiniOku('metin')).toBeNull();
  });
});
