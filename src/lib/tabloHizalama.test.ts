import { describe, it, expect } from 'vitest';
import { sayisalMi, kolonHizalari } from './tabloHizalama';

describe('sayisalMi', () => {
  it('Türkçe biçimli sayıları tanır', () => {
    for (const s of ['12', '0', '1.240', '45.000', '3,5', '1.234.567,89']) {
      expect(sayisalMi(s), s).toBe(true);
    }
  });

  it('para birimi ve yüzde ekli sayıları tanır', () => {
    for (const s of ['45.000 TL', '2.500 TL', '1.200 ₺', '%18', '+%9', '-3,5', '17 adet']) {
      expect(sayisalMi(s), s).toBe(true);
    }
  });

  it('metni sayı SANMAZ', () => {
    for (const s of ['Stokta', 'Tükendi', 'Elektronik', 'Aksesuar', '', '   ']) {
      expect(sayisalMi(s), s).toBe(false);
    }
  });

  it('içinde sayı GEÇEN cümleyi sayı saymaz', () => {
    // Sağa yaslanırsa cümle tablodan kopuk durur
    expect(sayisalMi('3 adet stok kaldı')).toBe(false);
    expect(sayisalMi('2026 yılı raporu')).toBe(false);
  });
});

describe('kolonHizalari', () => {
  const satirlar = [
    ['Laptop', 'Elektronik', '45.000 TL', '12', 'Stokta'],
    ['Klavye', 'Aksesuar', '2.500 TL', '35', 'Stokta'],
    ['Mouse', 'Aksesuar', '1.200 TL', '0', 'Tükendi'],
  ];

  it('sayısal kolonları sağa yaslar, metni solda bırakır', () => {
    expect(kolonHizalari([null, null, null, null, null], satirlar)).toEqual([
      'left', 'left', 'right', 'right', 'left',
    ]);
  });

  it('MODELİN açık hizalaması her zaman kazanır', () => {
    // Model "---:" yazdıysa sezgi devreye girmemeli
    expect(kolonHizalari(['right', null, 'left', null, 'center'], satirlar)).toEqual([
      'right', 'left', 'left', 'right', 'center',
    ]);
  });

  it('boş hücreler oranı bozmaz', () => {
    const s = [['a', '10'], ['b', ''], ['c', '20']];
    expect(kolonHizalari([null, null], s)).toEqual(['left', 'right']);
  });

  it('karışık kolonda çoğunluk metinse sola yaslanır', () => {
    // 3'te 1 sayı → eşiğin altında
    const s = [['x', '10'], ['y', 'yok'], ['z', 'belirsiz']];
    expect(kolonHizalari([null, null], s)).toEqual(['left', 'left']);
  });

  it('tamamen boş kolonda sola yaslar', () => {
    expect(kolonHizalari([null, null], [['a', ''], ['b', '']])).toEqual(['left', 'left']);
  });

  it('satır yoksa açık hizalar korunur', () => {
    expect(kolonHizalari(['right', 'center'], [])).toEqual(['right', 'center']);
  });
});
