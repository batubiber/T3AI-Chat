import { describe, it, expect } from 'vitest';
import {
  hafizaAraci, hafizayaEkle, AZAMI_HAFIZA, oneriGecerliMi, maddeleriCoz,
} from './hafizaOnerisi';

describe('hafizaAraci', () => {
  it('vLLM araç şemasına uyuyor', () => {
    const a = hafizaAraci();
    expect(a.type).toBe('function');
    expect(a.function.name).toBe('proje_hafizasi_ekle');
    expect(a.function.parameters.required).toEqual(['bilgi']);
  });

  it('KALICI bilgi ile geçici konuşmayı ayırt etmesini söylüyor', () => {
    // Araç açıklaması aşırı tetiklenmenin tek freni: her turda öneri çıkarsa
    // kullanıcı kartı görmezden gelmeyi öğrenir ve özellik ölür.
    // `/i` bayrağı Türkçede yetmiyor: JS'te "KALICI".toLowerCase() "kalici"
    // veriyor, "kalıcı" değil. Bu projede daha önce arama tarafında da aynı
    // tuzağa düşülmüştü; yerel-duyarlı karşılaştırma şart.
    const d = hafizaAraci().function.description.toLocaleLowerCase('tr');
    expect(d).toContain('kalıcı');
    expect(d).toContain('çağırma');
  });
});

describe('oneriGecerliMi', () => {
  it('boş ya da anlamsız kısa öneri kabul edilmiyor', () => {
    expect(oneriGecerliMi('')).toBe(false);
    expect(oneriGecerliMi('   ')).toBe(false);
    expect(oneriGecerliMi('ok')).toBe(false);
  });

  it('makul bir cümle kabul ediliyor', () => {
    expect(oneriGecerliMi('Raporlar her zaman İngilizce hazırlanacak.')).toBe(true);
  });

  it('ÇOK UZUN öneri kabul edilmiyor — hafıza alanı kullanıcının okuduğu bir yer', () => {
    expect(oneriGecerliMi('x'.repeat(600))).toBe(false);
  });
});

describe('hafizayaEkle', () => {
  it('boş belleğe ilk maddeyi ekliyor', () => {
    const s = hafizayaEkle('', 'Raporlar İngilizce.');
    expect(s.durum).toBe('eklendi');
    expect(s.metin).toBe('- Raporlar İngilizce.');
  });

  it('var olanın ALTINA ekliyor, üstüne yazmıyor', () => {
    // Bellek kullanıcının kendi düzenlediği bir alan; üstüne yazmak onun
    // yazdığını silmek olurdu.
    const s = hafizayaEkle('Eski not.', 'Yeni not.');
    expect(s.metin).toBe('Eski not.\n- Yeni not.');
  });

  it('kullanıcının ELLE yazdığı satırı yeniden biçimlendirmiyor', () => {
    // İşaretsiz eski satır olduğu gibi kalıyor; yalnız yeni satır işaretli.
    const s = hafizayaEkle('İşaretsiz eski satır.', 'Yeni bilgi.');
    expect(s.metin.split('\n')[0]).toBe('İşaretsiz eski satır.');
  });

  it('aynı bilgi işaretli/işaretsiz yazılmış olsa da ikinci kez eklenmiyor', () => {
    // Kullanıcı elle işaretsiz yazmış, model aynısını öneriyor.
    expect(hafizayaEkle('Raporlar İngilizce.', 'Raporlar İngilizce.').durum).toBe('zaten-var');
    // Tersi: mevcut satır işaretli, öneri işaretsiz.
    expect(hafizayaEkle('- Raporlar İngilizce.', 'Raporlar İngilizce.').durum).toBe('zaten-var');
    // Öneri de işaretle gelirse.
    expect(hafizayaEkle('- Raporlar İngilizce.', '• Raporlar İngilizce.').durum).toBe('zaten-var');
  });

  it('AYNI bilgi ikinci kez eklenmiyor', () => {
    const s = hafizayaEkle('Raporlar İngilizce.', 'Raporlar İngilizce.');
    expect(s.durum).toBe('zaten-var');
    expect(s.metin).toBe('Raporlar İngilizce.');
  });

  it('aynılık boşluk ve büyük/küçük harf farkına takılmıyor', () => {
    const s = hafizayaEkle('Raporlar   İngilizce.', '  raporlar İNGİLİZCE.  ');
    expect(s.durum).toBe('zaten-var');
  });

  it('tavana ulaşınca eklemiyor ve bunu söylüyor', () => {
    const dolu = 'y'.repeat(AZAMI_HAFIZA - 5);
    const s = hafizayaEkle(dolu, 'Bu sığmaz çünkü tavan aşılır.');
    expect(s.durum).toBe('dolu');
    expect(s.metin).toBe(dolu);
  });

  it('geçersiz öneri hiç eklenmiyor', () => {
    expect(hafizayaEkle('Eski.', '  ').durum).toBe('gecersiz');
    expect(hafizayaEkle('Eski.', '  ').metin).toBe('Eski.');
  });
});

describe('maddeleriCoz', () => {
  it('satırları maddeye çeviriyor ve işareti ayıklıyor', () => {
    expect(maddeleriCoz('- Bir\n- İki')).toEqual(['Bir', 'İki']);
  });

  it('işaretsiz eski metni de madde sayıyor', () => {
    // Geçmişte elle yazılmış bellekler işaretsiz; onlar da listede görünmeli.
    expect(maddeleriCoz('Bir\nİki')).toEqual(['Bir', 'İki']);
  });

  it('karışık işaretleri ve boş satırları temizliyor', () => {
    expect(maddeleriCoz('• Bir\n\n  \n* İki\n-   Üç')).toEqual(['Bir', 'İki', 'Üç']);
  });

  it('boş / tanımsız girdide boş liste', () => {
    expect(maddeleriCoz('')).toEqual([]);
    expect(maddeleriCoz(undefined)).toEqual([]);
    expect(maddeleriCoz(null)).toEqual([]);
  });

  it('metnin içindeki tireye dokunmuyor — yalnız satır BAŞI ayıklanıyor', () => {
    expect(maddeleriCoz('- Ocak-Şubat raporu hazırlanacak.')).toEqual(['Ocak-Şubat raporu hazırlanacak.']);
  });
});
