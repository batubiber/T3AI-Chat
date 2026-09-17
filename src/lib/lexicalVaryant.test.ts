import { describe, it, expect } from 'vitest';
import { tokenizeTr, buildLexicalIndex, scoreBm25 } from './lexicalSearch';
import { EVAL_DOCS, EVAL_CASES } from '@/dev/ragEvalSet';

/**
 * BM25 bacağı TİRELİ VARYANT kodlarını ayırt edebiliyor mu?
 *
 * `tokenizeTr` tireyi ayırıcı sayıyor ve 2 karakterden kısa parçayı atıyor.
 * Sonuç: 'VEGA-2' → ['vega'], 'VEGA-1' → ['vega'] — ikisi AYNI. Sözcüksel
 * bacak bu iki belgeyi hiçbir sorguda ayıramıyor; sıralamaya katkı vermeden
 * gürültü ekliyor. ('PRT-4412' → ['prt','4412'] sağlam, sorun yalnız TEK
 * HANELİ sonekte.)
 *
 * Bu dosya ölçüm aletidir: düzeltmeden ÖNCE kırmızı olması gerekiyordu.
 */

const belge = (ad: string) => {
  const d = EVAL_DOCS.find((x) => x.name === ad);
  if (!d) throw new Error(`fixture yok: ${ad}`);
  return { id: ad, content: d.content };
};

const V2 = 'vega-2-spec.md';
const V1 = 'vega-1-spec.md';

describe('tokenizeTr — tireli varyant', () => {
  it('VEGA-2 ile VEGA-1 farklı token üretmeli', () => {
    expect(tokenizeTr('VEGA-2')).not.toEqual(tokenizeTr('VEGA-1'));
  });

  it('varyant numarası token olarak korunmalı', () => {
    expect(tokenizeTr('VEGA-2')).toContain('2');
  });

  it('çok haneli parça kodu bozulmuyor, üstüne bütün token da geliyor', () => {
    const t = tokenizeTr('PRT-4412');
    expect(t).toContain('prt');
    expect(t).toContain('4412');
    // Bütün biçim nadir ve ayırt edici — sorgu da aynısını üretiyor.
    expect(t).toContain('prt4412');
  });

  it('tek harfli önek + sayı da korunmalı (F-16)', () => {
    expect(tokenizeTr('F-16')).toContain('16');
  });
});

describe('BM25 bacağı varyantı sıralayabiliyor mu', () => {
  const indeks = buildLexicalIndex([belge(V2), belge(V1)]);

  const ustte = (sorgu: string, beklenen: string, oteki: string) => {
    const s = scoreBm25(indeks, tokenizeTr(sorgu));
    return (s.get(beklenen) ?? 0) > (s.get(oteki) ?? 0);
  };

  it('"VEGA-2 azami irtifa" → VEGA-2 belgesi üstte', () => {
    expect(ustte('VEGA-2 azami irtifa', V2, V1)).toBe(true);
  });

  it('"VEGA-1 azami irtifa" → VEGA-1 belgesi üstte', () => {
    expect(ustte('VEGA-1 azami irtifa', V1, V2)).toBe(true);
  });

  it('ÖLÇÜM: varyanta duyarlı vakaların kaçında doğru belge üstte', () => {
    const varyantVakalari = EVAL_CASES.filter(
      (c) => /VEGA-[12]/.test(c.query) && (c.expectFile === V1 || c.expectFile === V2),
    );
    const dogru = varyantVakalari.filter((c) =>
      ustte(c.query, c.expectFile, c.expectFile === V2 ? V1 : V2),
    );
    console.log(`\n  BM25 bacağı: ${dogru.length}/${varyantVakalari.length} varyant vakasında doğru belgeyi üste koyuyor`);
    expect(varyantVakalari.length).toBeGreaterThanOrEqual(8);
    expect(dogru.length).toBe(varyantVakalari.length);
  });
});
