// vitest 4 CommonJS'ten require('vitest') edilmeyi REDDEDİYOR; bu tek satır
// ESM import olmak zorunda. Test edilen modül CommonJS kaldığı için aşağıda
// require kullanılmaya devam ediliyor.
import { describe, it, expect } from 'vitest';
const { jetonUret, jetonDogrula, JETON_OMRU_MS } = require('./adminJeton');

const SIR = 'deneme-sir';
const SIMDI = 1_700_000_000_000;

describe('jetonUret / jetonDogrula', () => {
  it('ürettiği jetonu doğrular', () => {
    const j = jetonUret(SIR, SIMDI);
    expect(jetonDogrula(j, SIR, SIMDI)).toBe(true);
  });

  it('ömrü dolmamışken geçerli, dolunca geçersiz', () => {
    const j = jetonUret(SIR, SIMDI);
    expect(jetonDogrula(j, SIR, SIMDI + JETON_OMRU_MS - 1000)).toBe(true);
    expect(jetonDogrula(j, SIR, SIMDI + JETON_OMRU_MS + 1000)).toBe(false);
  });

  it('BAŞKA sırla üretilmiş jetonu reddeder', () => {
    const j = jetonUret('baska-sir', SIMDI);
    expect(jetonDogrula(j, SIR, SIMDI)).toBe(false);
  });

  it('imzası bozulmuş jetonu reddeder', () => {
    const j = jetonUret(SIR, SIMDI);
    const [govde, imza] = j.split('.');
    const bozuk = `${govde}.${imza.slice(0, -2)}xy`;
    expect(jetonDogrula(bozuk, SIR, SIMDI)).toBe(false);
  });

  it('SÜRE UZATMA denemesini reddeder', () => {
    // Saldırgan gövdeyi ileri tarihe çekip imzayı olduğu gibi bırakırsa
    // imza artık tutmamalı. Bu, jetonun asıl işi.
    const j = jetonUret(SIR, SIMDI);
    const imza = j.split('.')[1];
    const uzun = Buffer.from(String(SIMDI + 10 * JETON_OMRU_MS)).toString('base64url');
    expect(jetonDogrula(`${uzun}.${imza}`, SIR, SIMDI)).toBe(false);
  });

  it('biçimsiz girdide ÇÖKMEZ, reddeder', () => {
    for (const kotu of ['', '.', 'noktasiz', 'a.b.c', null, undefined, 123, {}]) {
      expect(() => jetonDogrula(kotu, SIR, SIMDI)).not.toThrow();
      expect(jetonDogrula(kotu, SIR, SIMDI)).toBe(false);
    }
  });
});
