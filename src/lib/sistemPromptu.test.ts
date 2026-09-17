import { describe, it, expect } from 'vitest';
import { SISTEM_KURALLARI, KIMLIK_VARSAYILANI, kurallariEkle } from './sistemPromptu';

describe('SISTEM_KURALLARI', () => {
  it('TAMAMEN İngilizce — yarı Türkçe prompt dil kaymasını davet ediyor', () => {
    // GLM çok dilli; karışık dilde talimat verilince dil kaydırıyor ve ilk
    // turda akıl yürütmeyi Çince üretebiliyor. Türkçeye özgü harf = regresyon.
    expect(SISTEM_KURALLARI).not.toMatch(/[ğĞıİşŞçÇöÖüÜ]/);
  });

  it('cevap dili kullanıcının dili, AKIL YÜRÜTME İngilizce', () => {
    // Türkçe düşünmeye zorlamak doğruluğu düşürüyor (orta-kaynak diller için
    // İngilizce akıl yürütme ölçülmüş şekilde daha iyi). Çince ise kullanıcıya
    // görünüyor çünkü düşünmeyi gösteriyoruz.
    expect(SISTEM_KURALLARI).toMatch(/SAME language as the user/);
    expect(SISTEM_KURALLARI).toMatch(/reasoning in English/i);
    expect(SISTEM_KURALLARI).toMatch(/Chinese/);
  });

  it('belge yeteneğini SERT dille anlatıyor', () => {
    // Canlıda model "dosya gönderemiyorum, size Python kodu vereyim" dedi ve
    // hemen ardından uygulama dosyayı verdi. GLM sert direktifleri daha iyi
    // dinliyor, o yüzden MUST NOT.
    expect(SISTEM_KURALLARI).toContain('MUST NOT');
    expect(SISTEM_KURALLARI).toMatch(/\.docx/);
    expect(SISTEM_KURALLARI).toMatch(/\.xlsx/);
    expect(SISTEM_KURALLARI).toMatch(/\.pptx/);
    expect(SISTEM_KURALLARI).toMatch(/Python/);
  });

  it('istenmeden dosya ÖNERMEME kuralı duruyor', () => {
    // Yalnız "yapabilirsin" deseydik model istenmediği hâlde "istersen Word
    // olarak da veririm" demeye başlar, kapı ateşlemez, ters yönde çelişki olur.
    expect(SISTEM_KURALLARI).toMatch(/not asked/i);
  });

  it('biçim kuralları burada — .env değil', () => {
    // Format kuralları koda ait: yeni format desteği eklendiğinde kırmızı
    // ağdaki .env'i elle güncellemek gerekmesin.
    expect(SISTEM_KURALLARI).toContain('$$');
    expect(SISTEM_KURALLARI).toMatch(/fenced/i);
  });

  it('render sınırlarını modele SÖYLÜYOR', () => {
    // Hepsi ChatMessage.tsx'teki gerçek kısıtlar:
    //  - yalnız h1/h2/h3 stillendirilmiş, gerisi tarayıcı varsayılanı
    //  - rehype-raw kurulu değil -> ham HTML düz metin görünür
    //  - tek $ satır içi matematik AÇIK -> "fiyat $5" matematiğe dönüşür
    //  - internetsiz cluster -> görsel/dış bağlantı ölü çıkar
    expect(SISTEM_KURALLARI).toMatch(/#, ## or ### only/);
    expect(SISTEM_KURALLARI).toMatch(/raw HTML/);
    expect(SISTEM_KURALLARI).toMatch(/\\\$/);
    expect(SISTEM_KURALLARI).toMatch(/no internet access/);
    expect(SISTEM_KURALLARI).toMatch(/tag the language/);
  });

  it('TARİH/SAAT yer tutucusu YOK — KV-cache kararı', () => {
    // Prompt promptun en başında; dakikalık bir satır ortak öneki ilk satırda
    // kopartıp prefix cache'i kullanılamaz hale getirirdi.
    expect(SISTEM_KURALLARI).not.toMatch(/\{DATE\}|\{TIME\}/);
  });
});

describe('kurallariEkle', () => {
  it('kuralları tabanın ARKASINA ekler', () => {
    const c = kurallariEkle('You are T3AI.');
    expect(c.startsWith('You are T3AI.')).toBe(true);
    expect(c).toContain(SISTEM_KURALLARI);
  });

  it('zaten varsa İKİNCİ kez eklemez', () => {
    const taban = `You are T3AI.\n\n${SISTEM_KURALLARI}`;
    expect(kurallariEkle(taban)).toBe(taban);
  });

  it('DETERMİNİSTİK — aynı girdi aynı çıktı (cache şartı)', () => {
    expect(kurallariEkle('X')).toBe(kurallariEkle('X'));
  });
});

describe('KIMLIK_VARSAYILANI', () => {
  it('yalnız KİMLİK — kural içermiyor', () => {
    // .env kimliği taşır, kuralları uygulama kurar. Varsayılan da bu bölüşmeye
    // uymalı, yoksa kurallar iki kere geçer.
    expect(KIMLIK_VARSAYILANI).not.toContain('MUST NOT');
    expect(KIMLIK_VARSAYILANI).not.toContain('$$');
    expect(KIMLIK_VARSAYILANI.length).toBeLessThan(200);
  });
});
