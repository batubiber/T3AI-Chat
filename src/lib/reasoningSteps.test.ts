import { describe, it, expect } from 'vitest';
import { parseReasoningSteps } from './reasoningSteps';

describe('parseReasoningSteps', () => {
  it('boş metinde adım yok', () => {
    expect(parseReasoningSteps('')).toEqual([]);
    expect(parseReasoningSteps('   \n  ')).toEqual([]);
  });

  it('boş satırla ayrılmış blokları adım yapar', () => {
    const s = parseReasoningSteps(
      'Kullanıcı Marmara bölgesindeki satış artışını soruyor, veriye bakmam gerek.\n\n' +
      'Bağlamda 2026 Q1 raporu var ve orada bölge kırılımı tablosu bulunuyor.\n\n' +
      'Marmara satırında yüzde on sekiz artış yazıyor, cevabı buna dayandıracağım.',
    );
    expect(s).toHaveLength(3);
    expect(s.map((x) => x.no)).toEqual([1, 2, 3]);
  });

  it('MODELİN KENDİ numaralandırmasını kullanır', () => {
    const s = parseReasoningSteps(
      '1. Soruyu ayrıştırıyorum: hangi bölge, hangi dönem soruluyor.\n' +
      '2. Bağlamdaki tabloyu buluyorum ve ilgili satırı okuyorum.\n' +
      '3. Sayıyı doğruluyorum ve cevabı yazıyorum, kaynağı da anıyorum.',
    );
    expect(s).toHaveLength(3);
    // Numara özetten atılır — sırayı zaten no veriyor
    expect(s[0].ozet.startsWith('1.')).toBe(false);
    expect(s[0].ozet).toContain('Soruyu ayrıştırıyorum');
  });

  it('geçiş sözcüklerinden böler', () => {
    const s = parseReasoningSteps(
      'Önce kullanıcının ne sorduğunu netleştirmem lazım, iki okuma mümkün görünüyor.\n' +
      'Sonra bağlamda buna karşılık gelen veriyi arayacağım ve bulduğumu doğrulayacağım.\n' +
      'Son olarak cevabı kısa tutup kaynağı anacağım, fazla ayrıntı vermeyeceğim.',
    );
    expect(s.length).toBeGreaterThan(1);
  });

  it('DÜZ tek blok bölünmeye ZORLANMAZ', () => {
    // Model yapı üretmediyse uydurma adım çıkarmıyoruz
    const tek = 'Bu tek bir cümlelik akıl yürütme, hiçbir yapı işareti içermiyor ve öyle kalmalı.';
    const s = parseReasoningSteps(tek);
    expect(s).toHaveLength(1);
    expect(s[0].text).toBe(tek);
  });

  it('kısa başlık satırı kendi başına adım olmaz', () => {
    const s = parseReasoningSteps(
      'Plan:\n\nİlk olarak bağlamı okuyup hangi belgelerin ilgili olduğunu tespit edeceğim ve not alacağım.',
    );
    expect(s).toHaveLength(1);
    expect(s[0].text).toContain('Plan:');
  });

  it('GERÇEK ÖLÇÜM: 21 bloklu GLM çıktısı 21 adım kalır, duvara dönüşmez', () => {
    // Ölçülen: 4520 karakter, 20 boş satır, 21 blok. Eski 12 sınırında son adım
    // 10 bloğun toplamı oluyordu. Regresyon testi.
    const bloklar = Array.from(
      { length: 21 },
      (_, i) => `Bu ${i + 1}. blok, gerçek ölçümdeki ortalama uzunluğa yakın bir akıl yürütme parçası.`,
    );
    const s = parseReasoningSteps(bloklar.join('\n\n'));
    expect(s).toHaveLength(21);
    // Hiçbir adım diğerlerinin katı kadar şişmemeli
    const uzunluklar = s.map((x) => x.text.length);
    expect(Math.max(...uzunluklar)).toBeLessThan(Math.min(...uzunluklar) * 2);
  });

  it('30 adımdan fazlası son adıma katılır, İÇERİK KAYBOLMAZ', () => {
    const bloklar = Array.from({ length: 40 }, (_, i) => `Bu ${i + 1}. adımın yeterince uzun metni, kırpılmamalı.`);
    const s = parseReasoningSteps(bloklar.join('\n\n'));
    expect(s).toHaveLength(30);
    expect(s[29].text).toContain('30. adımın');
    expect(s[29].text).toContain('40. adımın');
  });

  it('uzun ilk satır özet için cümleden kesilir', () => {
    const s = parseReasoningSteps(
      'Bu birinci cümle yeterince uzun olsun diye yazıldı ve burada bitiyor. Bu ikinci cümle özete girmemeli.',
    );
    expect(s[0].ozet.length).toBeLessThanOrEqual(81);
    expect(s[0].ozet).not.toContain('ikinci cümle');
  });

  it('her adımın metni korunur (özet ayrı alan)', () => {
    const s = parseReasoningSteps('Birinci blok metni burada yeterince uzun.\n\nİkinci blok metni de burada.');
    expect(s[0].text).toContain('Birinci blok');
    expect(s[0].ozet).toContain('Birinci blok');
  });
});
