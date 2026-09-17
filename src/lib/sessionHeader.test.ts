import { describe, it, expect } from 'vitest';
import { SESSION_HEADER, ANAHTAR_UZUNLUGU, oturumAnahtari, sessionHeaders } from './sessionHeader';

/** generateId()'nin gerçek biçimi — localDb ile aynı. */
const gercekKimlik = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

describe('oturumAnahtari — router yönlendirme anahtarı', () => {
  it('HER ZAMAN tam 24 karakter', () => {
    // Router sabit uzunluk bekliyor
    for (let i = 0; i < 200; i++) {
      expect(oturumAnahtari(gercekKimlik())).toHaveLength(ANAHTAR_UZUNLUGU);
    }
  });

  it('KISA kimlikte de 24 karakter', () => {
    // Math.random().toString(36) bazen çok kısa çıkıyor; kimlik 15 karaktere
    // kadar inebiliyor. Dolgu olmadan router'a kısa anahtar giderdi.
    expect(oturumAnahtari('1755180000000-a')).toHaveLength(24);
    expect(oturumAnahtari('x')).toHaveLength(24);
  });

  it('DETERMİNİSTİK — aynı sohbet her zaman aynı anahtar', () => {
    // Bu özelliğin TAMAMI buna bağlı: değer değişirse konuşma başka node'a
    // düşer ve tüm prompt yeniden prefill edilir
    const id = gercekKimlik();
    const ilk = oturumAnahtari(id);
    for (let i = 0; i < 50; i++) expect(oturumAnahtari(id)).toBe(ilk);
  });

  it('farklı sohbetler farklı anahtar alır', () => {
    const anahtarlar = new Set(
      Array.from({ length: 500 }, () => oturumAnahtari(gercekKimlik())),
    );
    // Çakışma olsa yalnız aynı node'a düşerler (zararsız) ama pratikte olmamalı
    expect(anahtarlar.size).toBe(500);
  });

  it('yalnız harf ve rakam içerir', () => {
    for (let i = 0; i < 100; i++) {
      expect(oturumAnahtari(gercekKimlik())).toMatch(/^[a-zA-Z0-9]{24}$/);
    }
  });

  it('tiresiz kimlikte de çalışır', () => {
    expect(oturumAnahtari('abcdefghijklmnopqrstuvwxyz')).toBe('abcdefghijklmnopqrstuvwx');
  });
});

describe('sessionHeaders', () => {
  it('başlık adı SABİT — router bu adı bekliyor', () => {
    expect(SESSION_HEADER).toBe('X-Claude-Code-Session-Id');
  });

  it('kimlik varsa 24 karakterlik anahtarı koyar', () => {
    const h = sessionHeaders('1755180000000-k3j9x2m1q');
    expect(h[SESSION_HEADER]).toHaveLength(24);
  });

  it('kimlik YOKSA BİLE başlık konur — reject mode zorunlu kılıyor', () => {
    // Gateway "reject mode"da: header'sız /v1/chat/completions isteği 400 döner.
    // Eskiden burada başlık hiç konmuyordu (uydurma değer yollamamak için);
    // şart değişti, boş bırakmak isteği tamamen kaybettirir.
    for (const bos of [undefined, null, '']) {
      const h = sessionHeaders(bos as undefined);
      expect(h[SESSION_HEADER]).toBeDefined();
      expect(h[SESSION_HEADER]).toHaveLength(ANAHTAR_UZUNLUGU);
      expect(h[SESSION_HEADER]).toMatch(/^[a-zA-Z0-9]{24}$/);
    }
  });

  it('kimliksiz çağrılar AYNI yedek anahtarı paylaşır', () => {
    // "Tutarlı olması önemli" şartı: aynı sekmedeki kimliksiz istekler
    // birbirinden farklı anahtar alırsa her biri başka node'a düşer.
    const ilk = sessionHeaders()[SESSION_HEADER];
    expect(ilk).toMatch(/^[a-zA-Z0-9]{24}$/); // undefined===undefined ile geçmesin
    for (let i = 0; i < 50; i++) {
      expect(sessionHeaders()[SESSION_HEADER]).toBe(ilk);
      expect(sessionHeaders(null)[SESSION_HEADER]).toBe(ilk);
    }
  });

  it('yedek anahtar, gerçek sohbet anahtarıyla çakışmaz', () => {
    const yedek = sessionHeaders()[SESSION_HEADER];
    const gercek = sessionHeaders('1755180000000-k3j9x2m1q')[SESSION_HEADER];
    expect(yedek).toMatch(/^[a-zA-Z0-9]{24}$/); // ikisi de tanımlı olmalı ki
    expect(gercek).toMatch(/^[a-zA-Z0-9]{24}$/); // karşılaştırma anlam taşısın
    expect(yedek).not.toBe(gercek);
  });

  it('mevcut başlıklara yayılabilir', () => {
    const h = { 'Content-Type': 'application/json', ...sessionHeaders('s1') };
    expect(Object.keys(h)).toEqual(['Content-Type', SESSION_HEADER]);
  });
});
