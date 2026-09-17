import { describe, it, expect } from 'vitest';
import { bilgiSatirlari, doluluk, gosterilmeliMi, sikistirmaVarMi, type TurBilgisi } from './turBilgisi';

const temiz: TurBilgisi = {
  gonderilenMesaj: 6, toplamMesaj: 6, dusenMesaj: 0,
  cokertilenMesaj: 0, cokertmeKazanci: 0,
  ozetVarMi: false, ozetlenenMesaj: 0,
  belgeParcasi: 0, kirpmalar: [],
  girdiToken: 4000, pencere: 131072, ciktiButcesi: 8192,
  model: 'GLM-5.2', kademe: 'Dengeli',
};

const sikisik: TurBilgisi = {
  ...temiz,
  gonderilenMesaj: 18, toplamMesaj: 42, dusenMesaj: 24,
  cokertilenMesaj: 6, cokertmeKazanci: 12345,
  ozetVarMi: true, ozetlenenMesaj: 24,
  belgeParcasi: 3, kirpmalar: ['Belge parçası bütçeye sığmadı, sonu kesildi.'],
  girdiToken: 48200,
};

const etiketler = (b: TurBilgisi) => bilgiSatirlari(b).map((s) => s.etiket);

describe('doluluk', () => {
  it('yüzdeyi pencereye göre veriyor', () => {
    expect(doluluk({ ...temiz, girdiToken: 65536, pencere: 131072 })).toBe(50);
  });

  it('pencereyi aşarsa 100de duruyor — %140 anlamsız', () => {
    expect(doluluk({ ...temiz, girdiToken: 200000, pencere: 131072 })).toBe(100);
  });

  it('pencere bilinmiyorsa 0, bölme hatası vermiyor', () => {
    expect(doluluk({ ...temiz, pencere: 0 })).toBe(0);
  });
});

describe('sikistirmaVarMi', () => {
  it('hiçbir şey sıkışmadıysa false', () => {
    expect(sikistirmaVarMi(temiz)).toBe(false);
  });

  it('bir şey ÇIKARILDIYSA işaret veriyor', () => {
    expect(sikistirmaVarMi({ ...temiz, dusenMesaj: 1 })).toBe(true);
    expect(sikistirmaVarMi({ ...temiz, ozetVarMi: true })).toBe(true);
    expect(sikistirmaVarMi({ ...temiz, kirpmalar: ['bir şey'] })).toBe(true);
  });

  it('ÇÖKERTME tek başına işaret çıkarMIYOR — neredeyse her turda oluyor', () => {
    /* Son sekiz turdan eskisinde 800 karakteri aşan her mesaj kısaltılıyor;
       model yanıtları çoğu zaman bundan uzun. İlk sürümde bu da işaret
       çıkarıyordu ve işaret sürekli yanıyordu — sürekli yanan uyarı yok
       saymayı öğretir. */
    expect(sikistirmaVarMi({ ...temiz, cokertilenMesaj: 12, cokertmeKazanci: 20000 })).toBe(false);
  });

  it('çökertme varken bile GERÇEK kayıp işareti bastırmıyor', () => {
    expect(sikistirmaVarMi({ ...temiz, cokertilenMesaj: 12, dusenMesaj: 3 })).toBe(true);
  });

  it('belge parçası tek başına işaret çıkarmaz — o ekleme, kayıp değil', () => {
    expect(sikistirmaVarMi({ ...temiz, belgeParcasi: 5 })).toBe(false);
  });

  it('çökertme işaret çıkarmasa da PANELDE görünmeye devam ediyor', () => {
    const s = bilgiSatirlari({ ...temiz, cokertilenMesaj: 9, cokertmeKazanci: 13450 })
      .find((x) => x.etiket === 'Kısaltma');
    expect(s?.deger).toBe('9 eski mesaj');
  });
});

describe('bilgiSatirlari', () => {
  it('sıkıştırma yokken yalnız sabit satırlar çıkıyor', () => {
    expect(etiketler(temiz)).toEqual(['Mesaj', 'Girdi', 'Yanıt bütçesi', 'Model']);
  });

  it('sıkışmış turda özet, kısaltma ve belge satırları ekleniyor', () => {
    expect(etiketler(sikisik)).toEqual([
      'Mesaj', 'Özet', 'Kısaltma', 'Belge parçası', 'Girdi', 'Yanıt bütçesi', 'Model',
    ]);
  });

  it('düşen mesaj SAYIYLA söyleniyor ve vurgulanıyor', () => {
    const s = bilgiSatirlari(sikisik)[0];
    expect(s.deger).toBe('18 / 42');
    expect(s.ipucu).toBe('24 mesaj pencereye girmedi');
    expect(s.vurgu).toBe(true);
  });

  it('kayıp anlatan satırlar vurgulu, sabit satırlar değil', () => {
    const v = Object.fromEntries(bilgiSatirlari(sikisik).map((s) => [s.etiket, !!s.vurgu]));
    expect(v).toMatchObject({ Mesaj: true, 'Özet': true, 'Kısaltma': true });
    expect(v).toMatchObject({ Girdi: false, Model: false, 'Yanıt bütçesi': false });
  });

  it('token TAHMİN olduğunu söylüyor — kesin sanılırsa yanıltır', () => {
    const g = bilgiSatirlari(sikisik).find((s) => s.etiket === 'Girdi')!;
    expect(g.deger.startsWith('~')).toBe(true);
    expect(g.ipucu).toContain('tahmini');
  });

  it('sayılar Türkçe binlik ayırıcıyla yazılıyor', () => {
    const g = bilgiSatirlari(sikisik).find((s) => s.etiket === 'Girdi')!;
    expect(g.deger).toBe('~48.200 / 131.072');
  });

  it('kademe yoksa modelde nokta ayırıcı görünmüyor', () => {
    const m = bilgiSatirlari({ ...temiz, kademe: null }).find((s) => s.etiket === 'Model')!;
    expect(m.deger).toBe('GLM-5.2');
  });

  it('özet açık ama sayı bilinmiyorsa yine anlamlı bir ipucu veriyor', () => {
    const o = bilgiSatirlari({ ...temiz, ozetVarMi: true, ozetlenenMesaj: 0 })
      .find((s) => s.etiket === 'Özet')!;
    expect(o.ipucu).toBe('eski geçmişin yerine özet gönderildi');
  });
});

describe('gosterilmeliMi', () => {
  it('SIRADAN turda düğme hiç çıkmıyor — söylenecek bir şey yok', () => {
    // "6/6 mesaj, pencerenin %3'ü" kimseye bir şey anlatmıyor.
    expect(gosterilmeliMi(temiz)).toBe(false);
  });

  it('rutin kısaltmada çıkıyor (sessiz), gerçek kayıpta da çıkıyor', () => {
    expect(gosterilmeliMi({ ...temiz, cokertilenMesaj: 4 })).toBe(true);
    expect(gosterilmeliMi({ ...temiz, dusenMesaj: 2 })).toBe(true);
    expect(gosterilmeliMi({ ...temiz, ozetVarMi: true })).toBe(true);
    expect(gosterilmeliMi({ ...temiz, kirpmalar: ['bir şey'] })).toBe(true);
  });

  it('belge parçası da düğmeyi getiriyor — hangi parçaların kullanıldığı ilgi çekici', () => {
    expect(gosterilmeliMi({ ...temiz, belgeParcasi: 3 })).toBe(true);
  });

  it('üç kademe tutarlı: düğme yok < düğme var < düğme + nokta', () => {
    const rutin = { ...temiz, cokertilenMesaj: 4 };
    const kayip = { ...temiz, dusenMesaj: 2 };
    expect([gosterilmeliMi(temiz), sikistirmaVarMi(temiz)]).toEqual([false, false]);
    expect([gosterilmeliMi(rutin), sikistirmaVarMi(rutin)]).toEqual([true, false]);
    expect([gosterilmeliMi(kayip), sikistirmaVarMi(kayip)]).toEqual([true, true]);
  });
});
