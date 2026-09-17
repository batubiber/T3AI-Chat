import { describe, it, expect } from 'vitest';
import {
  gruplaKaynaklar,
  sayfaAraligi,
  birlestirAraliklar,
  satirAraligiMetni,
} from '@/lib/contextSources';
import type { RagSource } from '@/lib/ragService';

const k = (o: Partial<RagSource>): RagSource => ({
  fileName: 'a.pdf',
  chunkIndex: 0,
  score: 0.5,
  retrieval: 'search',
  ...o,
});

describe('gruplaKaynaklar', () => {
  it('aynı dosyanın parçalarını tek satırda toplar', () => {
    const g = gruplaKaynaklar([
      k({ fileName: 'rapor.pdf', chunkIndex: 0 }),
      k({ fileName: 'rapor.pdf', chunkIndex: 1 }),
      k({ fileName: 'sunum.pptx', chunkIndex: 0 }),
    ]);
    expect(g).toHaveLength(2);
    expect(g.find((x) => x.fileName === 'rapor.pdf')!.parcaSayisi).toBe(2);
  });

  it('sayfaları tekrarsız ve sıralı tutar', () => {
    const g = gruplaKaynaklar([
      k({ pageNumber: 5 }),
      k({ pageNumber: 2 }),
      k({ pageNumber: 5 }),
    ]);
    expect(g[0].sayfalar).toEqual([2, 5]);
  });

  it('en iyi skoru alır', () => {
    const g = gruplaKaynaklar([k({ score: 0.4 }), k({ score: 0.82 }), k({ score: 0.6 })]);
    expect(g[0].enIyiSkor).toBeCloseTo(0.82);
  });

  it('sohbete eklenen dosyada SKOR YOK — %0 gösterilmesin', () => {
    // Yedek yol sıralama yapmıyor; score alanı 0 geliyor ama bu "alaka yok"
    // demek değil. null dönmeli, arayüz de skor yerine "eklendi" yazıyor.
    const g = gruplaKaynaklar([k({ retrieval: 'conversation', score: 0 })]);
    expect(g[0].enIyiSkor).toBeNull();
    expect(g[0].dogrudanEklendi).toBe(true);
  });

  it('aynı dosya iki yoldan geldiyse skor korunur, eklendi işareti de kalır', () => {
    const g = gruplaKaynaklar([
      k({ fileName: 'x.pdf', retrieval: 'conversation', score: 0 }),
      k({ fileName: 'x.pdf', retrieval: 'search', score: 0.7 }),
    ]);
    expect(g[0].enIyiSkor).toBeCloseTo(0.7);
    expect(g[0].dogrudanEklendi).toBe(true);
  });

  it('skorlu kaynaklar skorsuzlardan önce sıralanır', () => {
    const g = gruplaKaynaklar([
      k({ fileName: 'eklenen.xlsx', retrieval: 'conversation', score: 0 }),
      k({ fileName: 'bulunan.pdf', retrieval: 'search', score: 0.3 }),
    ]);
    expect(g.map((x) => x.fileName)).toEqual(['bulunan.pdf', 'eklenen.xlsx']);
  });

  it('boş girdide boş liste', () => {
    expect(gruplaKaynaklar([])).toEqual([]);
  });
});

describe('sayfaAraligi', () => {
  it('bitişik sayfaları aralığa çevirir', () => {
    expect(sayfaAraligi([3, 4, 5])).toBe('3-5');
  });

  it('kopuk sayfaları virgülle ayırır', () => {
    expect(sayfaAraligi([1, 2, 7])).toBe('1-2, 7');
  });

  it('tek sayfa', () => {
    expect(sayfaAraligi([9])).toBe('9');
  });

  it('karışık: aralık + tek + aralık', () => {
    expect(sayfaAraligi([1, 2, 3, 8, 11, 12])).toBe('1-3, 8, 11-12');
  });

  it('boş', () => {
    expect(sayfaAraligi([])).toBe('');
  });
});

describe('birlestirAraliklar — kod satır aralıkları', () => {
  it('örtüşen pencereleri tek aralığa indirger', () => {
    // Kod parçalayıcı örtüşmeli pencere kullanıyor; "120-180, 178-240" iki ayrı
    // aralık gibi görünüyordu
    expect(birlestirAraliklar([{ bas: 120, son: 180 }, { bas: 178, son: 240 }])).toEqual([
      { bas: 120, son: 240 },
    ]);
  });

  it('bitişik aralıkları birleştirir', () => {
    expect(birlestirAraliklar([{ bas: 10, son: 20 }, { bas: 21, son: 30 }])).toEqual([
      { bas: 10, son: 30 },
    ]);
  });

  it('kopuk aralıkları ayrı bırakır', () => {
    expect(birlestirAraliklar([{ bas: 1, son: 5 }, { bas: 40, son: 50 }])).toEqual([
      { bas: 1, son: 5 },
      { bas: 40, son: 50 },
    ]);
  });

  it('sırasız girdiyi sıralar', () => {
    expect(birlestirAraliklar([{ bas: 40, son: 50 }, { bas: 1, son: 5 }])[0]).toEqual({ bas: 1, son: 5 });
  });

  it('boş girdi', () => {
    expect(birlestirAraliklar([])).toEqual([]);
  });
});

describe('satirAraligiMetni', () => {
  it('aralıkları yazar', () => {
    expect(satirAraligiMetni([{ bas: 120, son: 180 }])).toBe('120-180');
    expect(satirAraligiMetni([{ bas: 12, son: 12 }])).toBe('12');
    expect(satirAraligiMetni([{ bas: 1, son: 5 }, { bas: 40, son: 50 }])).toBe('1-5, 40-50');
  });
});

describe('gruplaKaynaklar — kod kaynakları', () => {
  it('satır aralıklarını toplar ve birleştirir', () => {
    const g = gruplaKaynaklar([
      k({ fileName: 'main.py', startLine: 10, endLine: 40 }),
      k({ fileName: 'main.py', startLine: 38, endLine: 80 }),
    ]);
    expect(g[0].satirAraliklari).toEqual([{ bas: 10, son: 80 }]);
  });

  it('satırsız kaynakta boş kalır (belge dosyaları)', () => {
    expect(gruplaKaynaklar([k({ pageNumber: 3 })])[0].satirAraliklari).toEqual([]);
  });
});
