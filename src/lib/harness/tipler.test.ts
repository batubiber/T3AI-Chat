import { describe, it, expect } from 'vitest';
import { kesikSayilirMi, type DurmaNedeni } from './tipler';

/**
 * REGRESYON BEKÇİSİ.
 *
 * Kullanıcı "selam" yazıp yanıtı KENDİSİ durdurunca mesajın altında
 * "Yanıt uzunluk sınırına takıldı, yarım kalmış olabilir." uyarısı çıkıyordu.
 * Sebep: karar listesi `['iptal', 'akis-kesildi']` idi ve `iptal` kullanıcı
 * durdurmasının ta kendisi. Aynı dal `yanit-kesildi` telemetrisini de
 * tetiklediği için canlıdaki kesilme sayacı da kirleniyordu.
 */

const TUM_NEDENLER: DurmaNedeni[] = ['tamamlandi', 'iptal', 'sinir', 'arac-hatasi', 'akis-kesildi'];

describe('kesikSayilirMi', () => {
  it('KULLANICI DURDURMASI kesik sayılmaz', () => {
    expect(kesikSayilirMi('iptal')).toBe(false);
  });

  it('akış koptuysa / uzunluk sınırına takıldıysa kesik sayılır', () => {
    // turCalistir, `finish_reason: 'length'` ve bitiş sebebi hiç gelmeyen
    // durumları da 'akis-kesildi' olarak döndürüyor.
    expect(kesikSayilirMi('akis-kesildi')).toBe(true);
  });

  it('tamamlanan yanıt kesik sayılmaz', () => {
    expect(kesikSayilirMi('tamamlandi')).toBe(false);
  });

  it('adım sınırı ve araç hatası kesik SAYILMAZ — sebep zaten metnin içinde', () => {
    expect(kesikSayilirMi('sinir')).toBe(false);
    expect(kesikSayilirMi('arac-hatasi')).toBe(false);
  });

  it('yalnız TEK bir neden uyarı doğuruyor — yeni bir neden eklenirse bu test düşünmeye zorlar', () => {
    const uyaranlar = TUM_NEDENLER.filter(kesikSayilirMi);
    expect(uyaranlar).toEqual(['akis-kesildi']);
  });
});
