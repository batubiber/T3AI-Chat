import { describe, it, expect } from 'vitest';
import { surumuAyikla, yeniSurumVarMi, SURUM_YOLU, KONTROL_ARALIGI_MS } from './surumKontrol';

describe('surumuAyikla', () => {
  it('beklenen biçimden sürümü okuyor', () => {
    expect(surumuAyikla({ surum: '2.45.0' })).toBe('2.45.0');
  });

  it('tanınmayan gövdede null — uyarı gösterilmemeli', () => {
    // Nginx yanlış yapılandırılırsa /surum.json yerine index.html dönebiliyor;
    // JSON.parse patlamasa bile içinde `surum` alanı olmaz.
    expect(surumuAyikla({})).toBeNull();
    expect(surumuAyikla(null)).toBeNull();
    expect(surumuAyikla('2.45.0')).toBeNull();
    expect(surumuAyikla({ surum: 42 })).toBeNull();
    expect(surumuAyikla({ surum: '  ' })).toBeNull();
  });
});

describe('yeniSurumVarMi', () => {
  it('aynı sürümde uyarı YOK', () => {
    expect(yeniSurumVarMi('2.45.0', '2.45.0')).toBe(false);
  });

  it('sunucuda farklı sürüm varsa uyarı VAR', () => {
    expect(yeniSurumVarMi('2.45.0', '2.46.0')).toBe(true);
  });

  it('GERİ ALMA da uyarı üretiyor — doğru sürüm sunucudaki', () => {
    // Sayısal karşılaştırma yapılsaydı geri alınan bir dağıtımda kullanıcı
    // eski sekmesiyle kalırdı; oysa sunucudaki sürüm hangisiyse doğrusu odur.
    expect(yeniSurumVarMi('2.46.0', '2.45.0')).toBe(true);
  });

  it('okunamayan uzak sürümde uyarı YOK — sessizce geçiyor', () => {
    // Geliştirmede /surum.json yok; her açılışta uyarı çıkmamalı.
    expect(yeniSurumVarMi('2.45.0', null)).toBe(false);
  });

  it('çalışan sürüm boşsa uyarı YOK', () => {
    expect(yeniSurumVarMi('', '2.45.0')).toBe(false);
  });
});

describe('sabitler', () => {
  it('sürüm dosyası kök dizinde — alt yol proxy arkasında kayboluyordu', () => {
    expect(SURUM_YOLU.startsWith('/')).toBe(true);
  });

  it('kontrol aralığı makul: dakikada bir istek atmıyor', () => {
    expect(KONTROL_ARALIGI_MS).toBeGreaterThanOrEqual(5 * 60 * 1000);
  });
});
