import { describe, it, expect } from 'vitest';
import { YENILIKLER, surumKarsilastir, okunmamisSayisi, surumKapsiyorMu, rozetDurumu } from './yenilikler';
import { APP_VERSION } from '@/lib/surum';

describe('surumKarsilastir', () => {
  it('DİZE karşılaştırması tuzağı: "2.9" > "2.36" çıkardı', () => {
    // '2.9' > '2.36' dize olarak DOĞRU — sıralama sessizce ters dönerdi.
    expect('2.9' > '2.36').toBe(true);              // tuzağın kendisi
    expect(surumKarsilastir('2.9', '2.36')).toBeLessThan(0);
  });

  it('sayısal sıralıyor', () => {
    expect(surumKarsilastir('2.36', '2.34')).toBeGreaterThan(0);
    expect(surumKarsilastir('2.1.17', '2.1.9')).toBeGreaterThan(0);
    expect(surumKarsilastir('2.36', '2.36')).toBe(0);
  });

  it('farklı uzunlukta sürümlerde çökmüyor', () => {
    expect(surumKarsilastir('2.36', '2.36.1')).toBeLessThan(0);
    expect(surumKarsilastir('3', '2.99.99')).toBeGreaterThan(0);
  });
});

describe('YENILIKLER içeriği', () => {
  it('EN YENİ kayıt çalışan sürümle eşleşiyor', () => {
    // Bu testin işi: "sürümü artırdım ama not yazmayı unuttum" durumunu
    // yakalamak. Bu tür paneller genelde tam bundan ölüyor.
    expect(surumKapsiyorMu(APP_VERSION, YENILIKLER[0].surum)).toBe(true);
  });

  it('YENİDEN ESKİYE sıralı', () => {
    for (let i = 1; i < YENILIKLER.length; i++) {
      expect(surumKarsilastir(YENILIKLER[i - 1].surum, YENILIKLER[i].surum)).toBeGreaterThan(0);
    }
  });

  it('her kaydın tarihi, başlığı ve en az bir maddesi var', () => {
    for (const y of YENILIKLER) {
      expect(y.tarih).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(y.baslik.length).toBeGreaterThan(0);
      expect(y.maddeler.length).toBeGreaterThan(0);
    }
  });

  it('KURUMSAL ton: senli hitap ve ettirgen çatı yok', () => {
    // Ürün kurumsal müşteriye sunuluyor. "yapabilirsin" gibi senli hitap ve
    // "düzenletebilirsiniz" gibi ettirgen biçimler günlük konuşmada normal,
    // sürüm notunda kulağı tırmalıyor.
    //
    // \b ŞART: "yapabilirsiniz" (sizli, doğru) içinde "yapabilirsin" geçiyor.
    const senli = /(abilirsin|ebilirsin|acaksın|eceksin|[ıiuü]yorsun)\b/;
    const ettirgen = /(düzenlet|değiştirt|hazırlat|yaptır|çevirt)[a-zçğıöşü]*bilir/;
    for (const y of YENILIKLER) {
      for (const m of [y.baslik, ...y.maddeler]) {
        expect(m, `senli hitap: "${m}"`).not.toMatch(senli);
        expect(m, `ettirgen çatı: "${m}"`).not.toMatch(ettirgen);
      }
    }
    // Tuzağın kendisi: sizli biçim YANLIŞLIKLA yakalanmamalı
    expect('Belgeyi indirebilirsiniz.').not.toMatch(senli);
    expect('Belgeyi indirebilirsin.').toMatch(senli);
  });

  it('sürümler benzersiz', () => {
    const s = YENILIKLER.map((y) => y.surum);
    expect(new Set(s).size).toBe(s.length);
  });

  it('maddeler KULLANICI dilinde — geliştirici jargonu yok', () => {
    // "MuPDF entegrasyonu" değil "PDF düzenleyebilirsiniz". Commit mesajı
    // kopyalanırsa bu test yakalar.
    const jargon = /\b(refactor|commit|API|endpoint|IndexedDB|MuPDF|prompt|token|embedding|localStorage|chunk)\b/i;
    for (const y of YENILIKLER) {
      for (const m of y.maddeler) expect(m).not.toMatch(jargon);
      expect(y.baslik).not.toMatch(jargon);
    }
  });
});

describe('surumKapsiyorMu', () => {
  it('ana hat kaydı tüm yamaları kapsıyor', () => {
    expect(surumKapsiyorMu('2.37.0', '2.37')).toBe(true);
    expect(surumKapsiyorMu('2.37.4', '2.37')).toBe(true);
  });

  it('yama kaydı YALNIZ o yamayı kapsıyor — önemli deploy\'da bayrak sıfırlansın', () => {
    expect(surumKapsiyorMu('2.37.4', '2.37.4')).toBe(true);
    expect(surumKapsiyorMu('2.37.5', '2.37.4')).toBe(false);
  });

  it('başka hat kapsanmıyor', () => {
    expect(surumKapsiyorMu('2.36.9', '2.37')).toBe(false);
    // "2.3" öneki "2.37"yi YANLIŞLIKLA kapsamamalı — parça parça karşılaştırma
    expect(surumKapsiyorMu('2.37.0', '2.3')).toBe(false);
  });
});

describe('okunmamisSayisi', () => {
  it('hiç açılmamışsa TÜMÜ okunmamış — panel ilk kez duyurulsun', () => {
    expect(okunmamisSayisi(null)).toBe(YENILIKLER.length);
  });

  it('en yeni sürüm görülmüşse okunmamış yok', () => {
    expect(okunmamisSayisi(YENILIKLER[0].surum)).toBe(0);
  });

  it('aradaki bir sürüm görülmüşse yalnız SONRAKİLER sayılıyor', () => {
    expect(okunmamisSayisi(YENILIKLER[2].surum)).toBe(2);
  });

  it('tanınmayan sürümde çökmüyor', () => {
    expect(okunmamisSayisi('bilinmeyen')).toBe(YENILIKLER.length);
  });

  it('ileri bir sürüm görülmüşse eksi sayı dönmüyor', () => {
    expect(okunmamisSayisi('99.0')).toBe(0);
  });
});

describe('rozetDurumu — her yeni sürümde yanar', () => {
  it('SÜRÜM DEĞİŞTİYSE yanar, not yazılmış olmasa bile', () => {
    // Asıl kural bu: kullanıcı yeni bir sürüm kurduğunda rozette "Yenilikler"
    // görmeli. Yalnız "yeni kayıt eklendi mi" bakılsaydı yama sürümlerinde
    // sessiz kalırdı.
    expect(rozetDurumu('2.37.1', '2.37.2').yeniVar).toBe(true);
    expect(rozetDurumu('2.37.2', '2.38.0').yeniVar).toBe(true);
  });

  it('AYNI sürüm görülmüşse sessiz', () => {
    expect(rozetDurumu('2.37.2', '2.37.2').yeniVar).toBe(false);
  });

  it('hiç açmamış kullanıcıda yanar', () => {
    expect(rozetDurumu(null, '2.37.2').yeniVar).toBe(true);
  });

  it('SAYI, sürüm farkını değil GERÇEK yeni kayıtları veriyor', () => {
    // Rozet yanabilir ama gösterilecek yeni kayıt olmayabilir (yama sürümü).
    // Balonda "0 yeni değişiklik" yazmaması için ikisi ayrı tutuluyor.
    //
    // Sürümler VERİDEN türetiliyor: sabit yazıldığında yeni bir kayıt
    // eklenince test geçersiz kalıyordu (bir kez yaşandı).
    const enYeni = YENILIKLER[0].surum;
    const birOnceki = YENILIKLER[1].surum;

    const yama = rozetDurumu(`${enYeni}.1`, `${enYeni}.2`);
    expect(yama.yeniVar).toBe(true);
    expect(yama.yeniKayitSayisi).toBe(0);

    const eski = rozetDurumu(birOnceki, `${enYeni}.0`);
    expect(eski.yeniVar).toBe(true);
    expect(eski.yeniKayitSayisi).toBeGreaterThan(0);

    expect(rozetDurumu(null, `${enYeni}.0`).yeniKayitSayisi).toBe(YENILIKLER.length);
  });
});
