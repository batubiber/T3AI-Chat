import { describe, it, expect } from 'vitest';
import {
  AVAILABLE_MODELS,
  getModelPresets,
  getModelParams,
  varsayilanPresetId,
} from './modelConfig';

describe('varsayilanPresetId', () => {
  it('GLM varsayılanı DENGELİ — max efor değil', () => {
    // Varsayılan "Derin (Max)" iken her sohbet en yüksek eforla başlıyordu:
    // gereksiz yavaş. "Hızlı" ise akıl yürütmeyi tamamen kapatıp belge/PDF/RAG
    // gibi talimat takibine dayanan özellikleri bozardı.
    expect(varsayilanPresetId('glm-5.2')).toBe('reasoning-high');
  });

  it('GLM varsayılanı reasoning_effort:high GÖNDERİYOR', () => {
    // Sadece id'yi kontrol etmek yetmez: preset'in gövdesi boşalsa da geçerdi.
    const p = getModelParams('glm-5.2', varsayilanPresetId('glm-5.2')!);
    expect(p?.chat_template_kwargs).toEqual({ reasoning_effort: 'high' });
  });

  it('Gemma varsayılanı GENEL — sıralama değişse de kaymıyor', () => {
    // Preset listesi kaydırıcı için çoktan aza sıralandı, presets[0] artık
    // "Kodlama". Alan açıkça yazılmasaydı varsayılan sessizce oraya kayardı.
    expect(varsayilanPresetId('gemma-4-31b')).toBe('general');
    expect(getModelPresets('gemma-4-31b')[0].id).toBe('coding');
  });

  it('alanı OLMAYAN modelde ilk preset varsayılan kalıyor', () => {
    const gemma = AVAILABLE_MODELS.find((m) => m.id === 'gemma-4-31b')!;
    const yedek = gemma.varsayilanPresetId;
    gemma.varsayilanPresetId = undefined;
    try {
      expect(varsayilanPresetId('gemma-4-31b')).toBe(getModelPresets('gemma-4-31b')[0].id);
    } finally {
      gemma.varsayilanPresetId = yedek;
    }
  });

  it('preset\'i olmayan model için null', () => {
    expect(varsayilanPresetId('boyle-bir-model-yok')).toBeNull();
  });

  it('TANIMSIZ id yazılmışsa ilk preset\'e düşer — seçim boşta kalmaz', () => {
    // Bu alan elle yazılıyor; harf hatası varsayılanı undefined bırakıp
    // preset seçimini sessizce bozardı.
    const glm = AVAILABLE_MODELS.find((m) => m.id === 'glm-5.2')!;
    const yedek = glm.varsayilanPresetId;
    glm.varsayilanPresetId = 'boyle-preset-yok';
    try {
      expect(varsayilanPresetId('glm-5.2')).toBe(getModelPresets('glm-5.2')[0].id);
    } finally {
      glm.varsayilanPresetId = yedek;
    }
  });

  it('"(varsayılan)" yazısı GERÇEK varsayılanın üstünde', () => {
    // Açıklama metni elle yazılıyor; varsayılan değişince orada kalırsa
    // arayüz kullanıcıya yalan söyler.
    for (const model of AVAILABLE_MODELS) {
      const presetler = getModelPresets(model.id);
      if (presetler.length === 0) continue;
      const isaretli = presetler.filter((p) => p.description?.includes('varsayılan'));
      expect(isaretli.map((p) => p.id)).toEqual([varsayilanPresetId(model.id)]);
    }
  });
});
