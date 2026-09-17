import { describe, it, expect } from 'vitest';
import { katlamaTavani, AZAMI_SATIR } from './mesajKatlama';

// Gerçek ölçüler: text-sm (14px) + leading-relaxed (1.625) = 22.75px satır
const SATIR = 22.75;
const satirlar = (n: number) => n * SATIR;

describe('katlamaTavani', () => {
  it('eşiği aşan mesaj katlanıyor ve tavan altı satır', () => {
    expect(katlamaTavani(satirlar(20), SATIR)).toBeCloseTo(AZAMI_SATIR * SATIR);
  });

  it('kısa mesaj katlanmıyor', () => {
    expect(katlamaTavani(satirlar(3), SATIR)).toBeNull();
  });

  it('TAM altı satır katlanmıyor — yuvarlama tuzağı', () => {
    // 6 × 22.75 = 136.5 ama scrollHeight tam sayı döner (137). Tolerans
    // olmasaydı gizlenecek hiçbir şey yokken ok işareti çıkardı.
    expect(katlamaTavani(137, SATIR)).toBeNull();
    expect(katlamaTavani(satirlar(6), SATIR)).toBeNull();
  });

  it('yedinci satır katlamayı açıyor', () => {
    expect(katlamaTavani(Math.round(satirlar(7)), SATIR)).toBeCloseTo(AZAMI_SATIR * SATIR);
  });

  it('satır yüksekliği ölçülemiyorsa katlama YOK', () => {
    // line-height: normal → parseFloat NaN. Katlamak, tavanı NaN yapıp
    // mesajı tamamen gizlerdi.
    expect(katlamaTavani(5000, NaN)).toBeNull();
    expect(katlamaTavani(5000, 0)).toBeNull();
  });

  it('eşik parametrik', () => {
    expect(katlamaTavani(satirlar(5), SATIR, 4)).toBeCloseTo(4 * SATIR);
    expect(katlamaTavani(satirlar(5), SATIR, 8)).toBeNull();
  });
});
