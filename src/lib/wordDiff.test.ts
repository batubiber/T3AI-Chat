import { describe, it, expect } from 'vitest';
import { diffWords } from './wordDiff';

/** Testleri okunur kılan yardımcı: "same|removed|added:metin" listesi */
const shape = (before: string, after: string) =>
  diffWords(before, after).map((p) => `${p.op}:${p.text}`);

/** Fark parçalarından eski/yeni metni yeniden kur — kayıpsızlık kanıtı */
const rebuild = (before: string, after: string) => {
  const parts = diffWords(before, after);
  return {
    old: parts.filter((p) => p.op !== 'added').map((p) => p.text).join(''),
    neu: parts.filter((p) => p.op !== 'removed').map((p) => p.text).join(''),
  };
};

describe('diffWords', () => {
  it('aynı metinde tek "same" parçası verir', () => {
    expect(shape('bir iki üç', 'bir iki üç')).toEqual(['same:bir iki üç']);
  });

  it('tek kelime değişimini yakalar', () => {
    expect(shape('bu yalnış bir cümle', 'bu yanlış bir cümle')).toEqual([
      'same:bu ',
      'removed:yalnış ',
      'added:yanlış ',
      'same:bir cümle',
    ]);
  });

  it('eklenen kelimeyi işaretler', () => {
    expect(shape('bir üç', 'bir iki üç')).toEqual(['same:bir ', 'added:iki ', 'same:üç']);
  });

  it('silinen kelimeyi işaretler', () => {
    expect(shape('bir iki üç', 'bir üç')).toEqual(['same:bir ', 'removed:iki ', 'same:üç']);
  });

  it('tamamen farklı metinde ortak parça uydurmaz', () => {
    const ops = diffWords('elma armut', 'kalem defter').map((p) => p.op);
    expect(ops).not.toContain('same');
  });

  it('boş metinden metne: hepsi eklenmiş', () => {
    expect(shape('', 'yeni metin')).toEqual(['added:yeni metin']);
  });

  it('metinden boşa: hepsi silinmiş', () => {
    expect(shape('eski metin', '')).toEqual(['removed:eski metin']);
  });

  it('iki boş metin boş sonuç verir', () => {
    expect(diffWords('', '')).toEqual([]);
  });

  it('parçalardan iki metin de kayıpsız kurulabilir', () => {
    const cases: [string, string][] = [
      ['bu yalnış bir cümle', 'bu yanlış bir cümle'],
      ['  baştaki boşluk', '  baştaki  boşluk'],
      ['tek', 'tamamen başka bir şey'],
      ['a b c d e', 'a c e'],
    ];
    for (const [b, a] of cases) {
      const r = rebuild(b, a);
      expect(r.old, `eski: ${b}`).toBe(b);
      expect(r.neu, `yeni: ${a}`).toBe(a);
    }
  });

  it('boşlukları korur (kelime birleşmesi olmaz)', () => {
    const parts = diffWords('bir  iki', 'bir  üç');
    expect(parts.map((p) => p.text).join('')).toContain('  ');
  });

  it('tamamen değişen ifade TEK blok kalır (boşluk bölmez)', () => {
    // Boşluk ayrı token olsaydı 'same: ' araya girip ikiye bölerdi
    const ops = diffWords('a b', 'x y').map((p) => p.op);
    expect(ops.filter((o) => o === 'removed')).toHaveLength(1);
    expect(ops.filter((o) => o === 'added')).toHaveLength(1);
  });
});
