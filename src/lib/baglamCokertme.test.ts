import { describe, it, expect } from 'vitest';
import { cokert, KORUNAN_TUR, AZAMI_ESKI_UZUNLUK } from './baglamCokertme';
import { selectMessagesForContext } from './contextManager';

const uzun = (n: number) => 'x'.repeat(n);
const mesaj = (role: 'user' | 'assistant', content: string) => ({ role, content });

/** n mesajlık konuşma: çift indeksler user, tek indeksler assistant. */
const konusma = (n: number, uzunluk = AZAMI_ESKI_UZUNLUK + 500) =>
  Array.from({ length: n }, (_, i) =>
    mesaj(i % 2 === 0 ? 'user' : 'assistant', `${i}:` + uzun(uzunluk)));

describe('cokert', () => {
  it('kısa konuşmaya DOKUNMUYOR', () => {
    const girdi = konusma(KORUNAN_TUR);
    expect(cokert(girdi).mesajlar).toEqual(girdi);
  });

  it('mesaj SAYISI ve SIRASI korunuyor — indeksler özetleme için kullanılıyor', () => {
    // ChatContext, özetlenecek mesajları ORİJİNAL diziden indeksle kesiyor.
    // Çökertme bir mesajı düşürseydi indeksler kayar ve yanlış aralık
    // özetlenirdi.
    const girdi = konusma(20);
    const c = cokert(girdi).mesajlar;
    expect(c.length).toBe(girdi.length);
    expect(c.map((m) => m.role)).toEqual(girdi.map((m) => m.role));
  });

  it('SON turlar olduğu gibi kalıyor', () => {
    const girdi = konusma(20);
    const c = cokert(girdi).mesajlar;
    for (let i = girdi.length - KORUNAN_TUR; i < girdi.length; i++) {
      expect(c[i].content).toBe(girdi[i].content);
    }
  });

  it('ESKİ asistan yanıtları kısaltılıyor ve işaretleniyor', () => {
    const girdi = konusma(20);
    const c = cokert(girdi).mesajlar;
    expect(c[1].content.length).toBeLessThan(girdi[1].content.length);
    expect(c[1].content).toMatch(/kısaltıldı/);
    // Baş taraf korunuyor: hangi cevap olduğu anlaşılsın
    expect(c[1].content.startsWith('1:')).toBe(true);
  });

  it('KULLANICI mesajlarına dokunulmuyor — niyeti onlar taşıyor', () => {
    // Kullanıcı mesajları kısa ve konuşmanın ne hakkında olduğunu onlar
    // söylüyor; kırpmanın kazancı düşük, kaybı yüksek.
    const girdi = konusma(20);
    const c = cokert(girdi).mesajlar;
    expect(c[0].content).toBe(girdi[0].content);
    expect(c[2].content).toBe(girdi[2].content);
  });

  it('zaten kısa olan eski yanıtlara dokunulmuyor', () => {
    const girdi = [
      ...Array.from({ length: 10 }, (_, i) => mesaj(i % 2 === 0 ? 'user' : 'assistant', 'kısa')),
      ...konusma(KORUNAN_TUR),
    ];
    expect(cokert(girdi).mesajlar[1].content).toBe('kısa');
  });

  it('GİRDİYİ DEĞİŞTİRMİYOR — saklanan geçmiş dokunulmadan kalmalı', () => {
    // Makalenin ayrımı: çökertme okuma-zamanı izdüşümü, yıkıcı düzenleme değil.
    const girdi = konusma(20);
    const kopya = JSON.parse(JSON.stringify(girdi));
    cokert(girdi);
    expect(girdi).toEqual(kopya);
  });

  it('idempotent — iki kez çökertmek bir kez çökertmekle aynı', () => {
    const bir = cokert(konusma(20)).mesajlar;
    const iki = cokert(bir).mesajlar;
    expect(iki).toEqual(bir);
  });

  it('kazanç oranı bildiriliyor', () => {
    const { kazanc } = cokert(konusma(20));
    expect(kazanc).toBeGreaterThan(0);
    expect(cokert(konusma(KORUNAN_TUR)).kazanc).toBe(0);
  });

  it('boş dizide çökmüyor', () => {
    expect(cokert([]).mesajlar).toEqual([]);
    expect(cokert([]).kazanc).toBe(0);
  });
});

describe('çökertme + pencere seçimi birlikte', () => {
  // ChatContext'te elle kurulan kablolama: pencere ÇÖKERTİLMİŞ diziden
  // seçiliyor ama özet ORİJİNAL metinden üretiliyor. İkisi karışırsa hata
  // sessiz olur — model daha az bağlam görür ya da özet kırpılmış metinden
  // çıkar. Tarayıcıda uzun sohbet açamadığım için burada kilitleniyor.
  const uzunCevap = (i: number) => `${i}: ` + 'y'.repeat(3000);
  const orijinal = Array.from({ length: 24 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
    content: i % 2 === 0 ? `soru ${i}` : uzunCevap(i),
  }));

  it('çökertme pencereye DAHA ÇOK tur sığdırıyor', () => {
    const dar = selectMessagesForContext(orijinal, undefined, 'glm-5.2', 0);
    const genis = selectMessagesForContext(cokert(orijinal).mesajlar, undefined, 'glm-5.2', 0);
    expect(genis.messages.length).toBeGreaterThanOrEqual(dar.messages.length);
    expect(genis.tokensUsed).toBeLessThan(dar.tokensUsed);
  });

  it('özetlenecek aralık ORİJİNAL metinden kesiliyor — indeksler uyuşuyor', () => {
    const cokertilmis = cokert(orijinal).mesajlar;
    const sonuc = selectMessagesForContext(cokertilmis, undefined, 'glm-5.2', 0);
    // ChatContext bu diliminin aynısını orijinalden alıyor
    const ozetlenecek = orijinal.slice(0, sonuc.newSummarizedCount);
    for (const m of ozetlenecek) {
      expect(m.content).not.toMatch(/kısaltıldı/);
    }
    // ve dilim, çökertilmiş dizideki karşılığıyla AYNI mesajlara denk geliyor
    expect(ozetlenecek.map((m) => m.role))
      .toEqual(cokertilmis.slice(0, sonuc.newSummarizedCount).map((m) => m.role));
  });
});
