import { describe, it, expect } from 'vitest';
import { presetGocuUygula, GOC_ANAHTARI, PRESET_ANAHTARI } from './presetGocu';

function sahteDepo(baslangic: Record<string, string> = {}) {
  const veri = { ...baslangic };
  return {
    veri,
    getItem: (k: string) => (k in veri ? veri[k] : null),
    setItem: (k: string, v: string) => { veri[k] = v; },
    removeItem: (k: string) => { delete veri[k]; },
  };
}

describe('presetGocuUygula', () => {
  it('otomatik yazılmış reasoning-max SİLİNİYOR — yeni varsayılan devreye girsin', () => {
    const d = sahteDepo({ [PRESET_ANAHTARI]: 'reasoning-max' });
    expect(presetGocuUygula(d)).toBe(true);
    expect(d.getItem(PRESET_ANAHTARI)).toBeNull();
  });

  it('BİLEREK seçilmiş başka preset korunuyor', () => {
    const d = sahteDepo({ [PRESET_ANAHTARI]: 'reasoning-off' });
    expect(presetGocuUygula(d)).toBe(false);
    expect(d.getItem(PRESET_ANAHTARI)).toBe('reasoning-off');
  });

  it('İKİNCİ çalıştırmada dokunmuyor — kullanıcı Derin\'e dönerse orada kalır', () => {
    const d = sahteDepo({ [PRESET_ANAHTARI]: 'reasoning-max' });
    presetGocuUygula(d);
    d.setItem(PRESET_ANAHTARI, 'reasoning-max');   // kullanıcı bilerek geri seçti
    expect(presetGocuUygula(d)).toBe(false);
    expect(d.getItem(PRESET_ANAHTARI)).toBe('reasoning-max');
  });

  it('hiç değer yoksa çökmüyor', () => {
    const d = sahteDepo();
    expect(presetGocuUygula(d)).toBe(false);
  });

  it('bayrak İLK çalıştırmada yazılıyor', () => {
    const d = sahteDepo();
    presetGocuUygula(d);
    expect(d.getItem(GOC_ANAHTARI)).toBe('1');
  });
});
