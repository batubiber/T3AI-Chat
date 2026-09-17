import { describe, it, expect } from 'vitest';
import { eforMerdiveni, AVAILABLE_MODELS } from './modelConfig';

describe('eforMerdiveni', () => {
  it('GLM için AZDAN ÇOĞA sıralı liste veriyor', () => {
    // Kaydırıcı soldan sağa doldukça efor ARTMALI. modelConfig'teki menü
    // sırası ise çoktan aza (Derin önce) — menüde en güçlü seçenek üstte
    // olsun diye. İkisi ters, bu yüzden ayrı bir fonksiyon var.
    const m = eforMerdiveni('glm-5.2')!;
    expect(m.map((p) => p.id)).toEqual(['reasoning-off', 'reasoning-high', 'reasoning-max']);
  });

  it('Gemma için AZDAN ÇOĞA: en hızlıdan en dikkatliye', () => {
    // Eksen "efor" DEĞİL: Kodlama, Genel'den daha çok düşünmüyor — daha düşük
    // sıcaklıkla daha tutarlı. Arayüzde hiçbir yerde "efor" yazmıyor.
    expect(eforMerdiveni('gemma-4-31b')!.map((p) => p.id))
      .toEqual(['thinking-off', 'general', 'coding']);
  });

  it('bayrağı OLMAYAN modelde null — kaydırıcı gösterilmez', () => {
    // Bayrak elle konuyor; konmamışsa liste sıralı sayılmamalı, yoksa
    // kullanıcıya olmayan bir merdiven gösterilir.
    const glm = AVAILABLE_MODELS.find((m) => m.id === 'glm-5.2')!;
    const yedek = glm.eforMerdiveniVar;
    glm.eforMerdiveniVar = undefined;
    try {
      expect(eforMerdiveni('glm-5.2')).toBeNull();
    } finally {
      glm.eforMerdiveniVar = yedek;
    }
  });

  it('tanınmayan modelde null', () => {
    expect(eforMerdiveni('olmayan-model')).toBeNull();
  });

  it('merdiven, modelin preset listesinin TAMAMINI kapsıyor', () => {
    // Eksik kalan bir preset kaydırıcıdan erişilemez olurdu.
    for (const model of AVAILABLE_MODELS) {
      const m = eforMerdiveni(model.id);
      if (!m) continue;
      expect(m.length).toBe(model.presets!.length);
      expect(new Set(m.map((p) => p.id)).size).toBe(m.length);
    }
  });
});
