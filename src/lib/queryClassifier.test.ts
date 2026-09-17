import { describe, it, expect } from 'vitest';
import { classifyQuery, getRetrievalParams, type QueryType } from './queryClassifier';

/** Sorgu için arama açılıyor mu? Asıl önemsediğimiz şey bu. */
const aramaAcik = (s: string) => !getRetrievalParams(classifyQuery(s)).skipRetrieval;
const tur = (s: string): QueryType => classifyQuery(s);

describe('sohbet bağlacıyla başlayan GERÇEK sorular', () => {
  /* REGRESYON BEKÇİSİ. Eskiden bunların hepsinde arama tamamen kapanıyordu:
     `^(evet|tamam|ok|peki|...)` deseninin sonunda sınır yoktu ve sohbet
     denetimi factual'dan ÖNCE koşuyordu. Model belgeyi hiç görmeden cevap
     veriyordu — hata da vermiyordu. Ölçüldü: 12/12 kapanıyordu. */
  const SORULAR = [
    'Peki menzili kaç km?',
    'Peki bu belgede ne yazıyor?',
    'Peki teslim tarihi?',
    'Okul yönetmeliği nedir?',
    'Olur yazısı ne zaman çıktı?',
    'Tamamlanma tarihi nedir?',
    'Anladım, peki maliyeti?',
    'Evet, kaç adet var?',
    'Hayır, diğerini sor',
    'Güzel, kapasitesi ne?',
    'Harika, peki ağırlığı?',
    'Süper, hızı nedir?',
  ];

  it('hepsinde arama AÇIK kalıyor', () => {
    const kapananlar = SORULAR.filter((s) => !aramaAcik(s));
    expect(kapananlar).toEqual([]);
  });

  it('bağlaç soyulduktan sonra doğru tipe düşüyor', () => {
    expect(tur('Peki menzili kaç km?')).toBe('factual');
    expect(tur('Tamamlanma tarihi nedir?')).toBe('factual');
    expect(tur('Güzel, kapasitesi ne?')).toBe('factual');
  });
});

describe('gerçek sohbet — arama KAPALI kalmalı', () => {
  it('tek başına selamlama ve onaylar', () => {
    for (const s of ['Merhaba', 'Selam', 'Teşekkürler', 'Tamam', 'Peki', 'Evet', 'Sağ ol', 'Günaydın', 'thanks']) {
      expect(aramaAcik(s), s).toBe(false);
    }
  });

  it('zincirlenmiş bağlaçlar da soyuluyor', () => {
    // "tamam peki teşekkürler" → hepsi soyulunca geriye bir şey kalmıyor
    expect(tur('Tamam peki teşekkürler')).toBe('conversational');
    expect(tur('Merhaba, nasılsın?')).toBe('conversational');
  });

  it('noktalama tek başına sohbeti bozmuyor', () => {
    expect(tur('Peki?')).toBe('conversational');
    expect(tur('Tamam...')).toBe('conversational');
  });
});

describe('Türkçe kelime sınırı — `\\b` yetmediği için', () => {
  /* JS'te `\b` ASCII tabanlı; Türkçe harfler kelime karakteri sayılmıyor.
     `\bpeki\b` bu yüzden "pekiştirme" ile de eşleşirdi. */
  it('bağlaçla BAŞLAYAN ama bağlaç OLMAYAN kelimeler soyulmuyor', () => {
    expect(aramaAcik('pekiştirme sürecini anlat')).toBe(true);
    expect(aramaAcik('okul yönetmeliği nedir?')).toBe(true);
    expect(aramaAcik('evetleme nedir')).toBe(true);
    expect(aramaAcik('güzelleştirme çalışması')).toBe(true);
  });

  it('"ok" öneki "okul"u yutmuyor', () => {
    expect(tur('Okul yönetmeliği nedir?')).toBe('factual');
  });
});

describe('büyük harf ve karışık yazım', () => {
  it('Türkçe büyük harf katlaması bozmuyor', () => {
    expect(tur('PEKİ MENZİLİ KAÇ KM?')).toBe('factual');
    expect(tur('TAMAM, KAPASİTESİ NE?')).toBe('factual');
  });

  it('Latin büyük harf token`ları hâlâ kod olarak tanınıyor', () => {
    expect(tur('API endpoint kodu')).toBe('code');
  });
});

describe('diğer tipler bozulmadı', () => {
  it('karşılaştırma, factual, kod, keşif', () => {
    expect(tur('VEGA-1 ile VEGA-2 arasındaki fark nedir')).toBe('comparison');
    expect(tur('Raporun sonucu nedir?')).toBe('factual');
    expect(tur('fonksiyon imzası ne')).toBe('code');
    expect(tur('GÜNEŞ ENERJİSİ hakkında bilgi ver')).toBe('exploratory');
  });

  it('conversational dışındaki her tipte arama açık', () => {
    for (const t of ['factual', 'comparison', 'code', 'exploratory'] as QueryType[]) {
      expect(getRetrievalParams(t).skipRetrieval, t).toBe(false);
    }
    expect(getRetrievalParams('conversational').skipRetrieval).toBe(true);
  });
});
