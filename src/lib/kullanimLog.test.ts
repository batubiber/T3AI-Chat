import { describe, it, expect } from 'vitest';
import { logAyristir } from './kullanimLog';

const SATIR = '2026-08-17T07:49:32+00:00|t3ai|glm-5.2';

describe('logAyristir', () => {
  it('tek satırı çözer', () => {
    const { kayitlar, bozukSatir } = logAyristir(SATIR);
    expect(bozukSatir).toBe(0);
    expect(kayitlar).toHaveLength(1);
    expect(kayitlar[0].uygulama).toBe('t3ai');
    expect(kayitlar[0].model).toBe('glm-5.2');
    expect(kayitlar[0].zaman.toISOString()).toBe('2026-08-17T07:49:32.000Z');
  });

  it('çok satırı çözer ve her satır BİR isteği temsil eder', () => {
    const ham = [
      SATIR,
      '2026-08-17T08:00:00+00:00|t3ai|gemma-4-31b',
      '2026-08-18T09:10:11+00:00|claude-code|glm-5.2',
    ].join('\n');
    const { kayitlar, bozukSatir } = logAyristir(ham);
    expect(kayitlar).toHaveLength(3);
    expect(bozukSatir).toBe(0);
    expect(kayitlar[2].uygulama).toBe('claude-code');
  });

  it('boş dosyada boş dizi döner', () => {
    expect(logAyristir('')).toEqual({ kayitlar: [], bozukSatir: 0 });
    expect(logAyristir('   \n  \n')).toEqual({ kayitlar: [], bozukSatir: 0 });
  });

  it('sondaki boş satır ve \\r\\n bozuk sayılmaz', () => {
    const { kayitlar, bozukSatir } = logAyristir(`${SATIR}\r\n${SATIR}\r\n`);
    expect(kayitlar).toHaveLength(2);
    expect(bozukSatir).toBe(0);
    // Satır sonundaki \r gerçekten temizlenmeli: "glm-5.2\r" sızarsa
    // gruplama aynı modeli iki ayrı satır sanır. Bu yüzden alan
    // DEĞERLERİNİ birebir doğruluyoruz, yalnız sayıları değil.
    for (const kayit of kayitlar) {
      expect(kayit.uygulama).toBe('t3ai');
      expect(kayit.model).toBe('glm-5.2');
      expect(kayit.model).not.toContain('\r');
    }
  });

  it('eksik alanlı satırı atlar ve sayar', () => {
    const { kayitlar, bozukSatir } = logAyristir(`${SATIR}\n2026-08-17T07:49:32+00:00|t3ai`);
    expect(kayitlar).toHaveLength(1);
    expect(bozukSatir).toBe(1);
  });

  it('fazla alanlı satırı atlar', () => {
    const { kayitlar, bozukSatir } = logAyristir(`${SATIR}|fazla`);
    expect(kayitlar).toHaveLength(0);
    expect(bozukSatir).toBe(1);
  });

  it('geçersiz tarihi atlar', () => {
    const { kayitlar, bozukSatir } = logAyristir('tarihdegil|t3ai|glm-5.2');
    expect(kayitlar).toHaveLength(0);
    expect(bozukSatir).toBe(1);
  });

  it('boş uygulama adını atlar — adsız kayıt kırılımı bozardı', () => {
    const { kayitlar, bozukSatir } = logAyristir('2026-08-17T07:49:32+00:00||glm-5.2');
    expect(kayitlar).toHaveLength(0);
    expect(bozukSatir).toBe(1);
  });

  it('nginx boş değeri "-" olarak yazdığında da atar', () => {
    // nginx bir değişkeni dolduramazsa "-" yazar; onu geçerli ad saymak
    // panelde "-" diye sahte bir uygulama satırı üretirdi
    const { kayitlar, bozukSatir } = logAyristir('2026-08-17T07:49:32+00:00|-|glm-5.2');
    expect(kayitlar).toHaveLength(0);
    expect(bozukSatir).toBe(1);
  });

  it('boş model adını atlar', () => {
    const { kayitlar, bozukSatir } = logAyristir('2026-08-17T07:49:32+00:00|t3ai|');
    expect(kayitlar).toHaveLength(0);
    expect(bozukSatir).toBe(1);
  });
});
