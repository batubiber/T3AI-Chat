import { describe, it, expect } from 'vitest';
import { haftaBasi, ozetle, uygulamaBazinda, modelBazinda, haftaBazinda } from './usageStats';
import type { KullanimKaydi } from './kullanimLog';

const kayit = (gun: string, uygulama: string, model: string): KullanimKaydi => ({
  zaman: new Date(gun), uygulama, model,
});

describe('haftaBasi', () => {
  it('haftayı PAZARTESİye çeker', () => {
    // 2026-08-17 pazartesi; 19'u çarşamba, 23'ü pazar — üçü de aynı haftada
    expect(haftaBasi(new Date(2026, 7, 17, 12, 0))).toBe('2026-08-17');
    expect(haftaBasi(new Date(2026, 7, 19, 12, 0))).toBe('2026-08-17');
    expect(haftaBasi(new Date(2026, 7, 23, 23, 59))).toBe('2026-08-17');
  });

  it('pazar biten haftaya ait, sonrakine değil', () => {
    expect(haftaBasi(new Date(2026, 7, 23, 0, 0))).toBe('2026-08-17');
    expect(haftaBasi(new Date(2026, 7, 24, 0, 0))).toBe('2026-08-24');
  });

  it('yerel gece yarısı bir önceki güne KAYMAZ', () => {
    // localDb.ts'teki toISOString kusuru: UTC+3'te 00:00 → önceki gün 21:00Z
    expect(haftaBasi(new Date(2026, 7, 17, 0, 0, 0))).toBe('2026-08-17');
  });

  it('ay ve yıl sınırını geçer', () => {
    expect(haftaBasi(new Date(2026, 0, 1, 12, 0))).toBe('2025-12-29');
  });
});

describe('ozetle', () => {
  it('boş dizide sıfır döner, çökmez', () => {
    expect(ozetle([])).toEqual({ istek: 0, ilkKayit: null, sonKayit: null, uygulamaSayisi: 0 });
  });

  it('istek sayısı = kayıt sayısı', () => {
    const o = ozetle([
      kayit('2026-08-17T10:00:00Z', 't3ai', 'glm-5.2'),
      kayit('2026-08-19T10:00:00Z', 't3ai', 'glm-5.2'),
    ]);
    expect(o.istek).toBe(2);
    expect(o.ilkKayit?.toISOString()).toBe('2026-08-17T10:00:00.000Z');
    expect(o.sonKayit?.toISOString()).toBe('2026-08-19T10:00:00.000Z');
  });

  it('farklı uygulamaları sayar', () => {
    const o = ozetle([
      kayit('2026-08-17T10:00:00Z', 't3ai', 'glm-5.2'),
      kayit('2026-08-17T11:00:00Z', 'claude-code', 'glm-5.2'),
      kayit('2026-08-17T12:00:00Z', 't3ai', 'glm-5.2'),
    ]);
    expect(o.uygulamaSayisi).toBe(2);
  });

  it('kayıtlar sırasız gelse de aralık doğru', () => {
    // Uçlar BİLEREK dizinin ortasında: en eski de en yeni de ilk/son eleman
    // değil. Böylece ilk/son kaydı taramak yerine konumdan alan bir mutasyon
    // (ör. `son = kayitlar[kayitlar.length - 1].zaman`) yakalanır.
    const o = ozetle([
      kayit('2026-08-18T10:00:00Z', 't3ai', 'glm-5.2'),
      kayit('2026-08-19T10:00:00Z', 't3ai', 'glm-5.2'), // en yeni, ortada
      kayit('2026-08-17T10:00:00Z', 't3ai', 'glm-5.2'), // en eski, ortada
      kayit('2026-08-18T12:00:00Z', 't3ai', 'glm-5.2'),
    ]);
    expect(o.ilkKayit?.toISOString()).toBe('2026-08-17T10:00:00.000Z');
    expect(o.sonKayit?.toISOString()).toBe('2026-08-19T10:00:00.000Z');
  });
});

describe('uygulamaBazinda', () => {
  it('uygulamaları gruplar ve isteğe göre sıralar', () => {
    const d = uygulamaBazinda([
      kayit('2026-08-17T10:00:00Z', 'claude-code', 'glm-5.2'),
      kayit('2026-08-17T11:00:00Z', 't3ai', 'glm-5.2'),
      kayit('2026-08-17T12:00:00Z', 't3ai', 'gemma-4-31b'),
    ]);
    expect(d).toEqual([
      { ad: 't3ai', istek: 2 },
      { ad: 'claude-code', istek: 1 },
    ]);
  });

  it('SABİT kova üretmez — yalnız logda göreni listeler', () => {
    // "Claude Code: 0" satırı, Claude Code kullanılmıyor anlamına gelirdi;
    // bizim proxy onun trafiğini zaten göremiyor (spec §5.3)
    const d = uygulamaBazinda([kayit('2026-08-17T10:00:00Z', 't3ai', 'glm-5.2')]);
    expect(d).toEqual([{ ad: 't3ai', istek: 1 }]);
    expect(d.map((s) => s.ad)).not.toContain('claude-code');
  });

  it('boş dizide boş döner', () => {
    expect(uygulamaBazinda([])).toEqual([]);
  });
});

describe('modelBazinda', () => {
  it('modelleri gruplar ve isteğe göre sıralar', () => {
    const d = modelBazinda([
      kayit('2026-08-17T10:00:00Z', 't3ai', 'gemma-4-31b'),
      kayit('2026-08-17T11:00:00Z', 't3ai', 'glm-5.2'),
      kayit('2026-08-17T12:00:00Z', 't3ai', 'glm-5.2'),
    ]);
    expect(d).toEqual([
      { ad: 'glm-5.2', istek: 2 },
      { ad: 'gemma-4-31b', istek: 1 },
    ]);
  });

  it('boş dizide boş döner', () => {
    expect(modelBazinda([])).toEqual([]);
  });
});

describe('haftaBazinda', () => {
  it('haftaları gruplar ve YENİDEN ESKİYE sıralar', () => {
    const d = haftaBazinda([
      kayit('2026-08-18T10:00:00Z', 't3ai', 'glm-5.2'),
      kayit('2026-08-25T10:00:00Z', 't3ai', 'glm-5.2'),
      kayit('2026-08-19T10:00:00Z', 't3ai', 'glm-5.2'),
    ]);
    expect(d).toEqual([
      { haftaBasi: '2026-08-24', istek: 1 },
      { haftaBasi: '2026-08-17', istek: 2 },
    ]);
  });

  it('boş dizide boş döner', () => {
    expect(haftaBazinda([])).toEqual([]);
  });
});
