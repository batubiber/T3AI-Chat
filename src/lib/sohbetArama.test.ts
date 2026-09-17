import { describe, it, expect } from 'vitest';
import { trNormalize, sohbetleriSuz, eslesiyorMu } from './sohbetArama';

const S = (title: string) => ({ id: title, title });

describe('trNormalize', () => {
  it('İ tuzağı: düz toLowerCase birleşen nokta bırakıyor', () => {
    // "İSTANBUL".toLowerCase() === "i̇stanbul" — "istanbul" ARAMASI TUTMAZ.
    // Bu satır kırmızıya dönerse arama Türkçe başlıklarda sessizce çalışmaz.
    expect('İSTANBUL'.toLowerCase()).not.toBe('istanbul');   // tuzağın kendisi
    expect(trNormalize('İSTANBUL')).toBe('istanbul');
  });

  it('I → ı → i: iki yazım da aynı yere düşüyor', () => {
    expect(trNormalize('ISTANBUL')).toBe(trNormalize('istanbul'));
    expect(trNormalize('Iğdır')).toBe('igdir');
  });

  it('şapkasız yazan bulsun: ç ğ ı ö ş ü sadeleşiyor', () => {
    expect(trNormalize('Şirket Çöp Güneş')).toBe('sirket cop gunes');
  });
});

describe('sohbetleriSuz', () => {
  const liste = [S('PDF düzenleme'), S('Şirket raporu'), S('İstanbul gezisi'), S('Excel tablosu')];

  it('boş sorgu HEPSİNİ döner — filtre yokmuş gibi', () => {
    expect(sohbetleriSuz(liste, '')).toHaveLength(4);
    expect(sohbetleriSuz(liste, '   ')).toHaveLength(4);
  });

  it('boş sorguda AYNI diziyi döner — gereksiz yeniden çizim olmasın', () => {
    // Kopya dönerse arama kutusu boşken bile her render'da yeni referans
    // üretilir ve sohbet listesinin tamamı yeniden çizilir.
    expect(sohbetleriSuz(liste, '')).toBe(liste);
  });

  it('şapkasız aramada şapkalı başlığı buluyor', () => {
    expect(sohbetleriSuz(liste, 'sirket').map(s => s.title)).toEqual(['Şirket raporu']);
  });

  it('İ ile başlayan başlığı düz i ile buluyor', () => {
    expect(sohbetleriSuz(liste, 'istanbul').map(s => s.title)).toEqual(['İstanbul gezisi']);
  });

  it('büyük/küçük harf fark etmiyor', () => {
    expect(sohbetleriSuz(liste, 'EXCEL')).toHaveLength(1);
  });

  it('sorgunun başındaki/sonundaki boşluğu yok sayıyor', () => {
    expect(sohbetleriSuz(liste, '  pdf  ')).toHaveLength(1);
  });

  it('SIRAYI koruyor — arama sıralamayı değiştirmemeli', () => {
    expect(sohbetleriSuz(liste, 'u').map(s => s.title))
      .toEqual(liste.filter(s => sohbetleriSuz([s], 'u').length).map(s => s.title));
  });

  it('eşleşme yoksa boş dizi', () => {
    expect(sohbetleriSuz(liste, 'zzzz')).toEqual([]);
  });

  it('başlığı olmayan kayıtta çökmüyor', () => {
    expect(sohbetleriSuz([{ id: 'x', title: undefined as unknown as string }], 'a')).toEqual([]);
  });
});

describe('eslesiyorMu (sohbet ve proje aramasının ortak yüklemi)', () => {
  it('şapkasız sorgu şapkalı metni buluyor', () => {
    expect(eslesiyorMu('Şirket Kılavuzu', 'sirket')).toBe(true);
    expect(eslesiyorMu('Iğdır notları', 'igdir')).toBe(true);
  });

  it('düz i ile yazılan sorgu İ ile başlayan metni buluyor', () => {
    // Proje aramasında bozuk olan tam da buydu.
    expect(eslesiyorMu('İstanbul Projesi', 'istanbul')).toBe(true);
  });

  it('tanımsız metinde çökmüyor', () => {
    expect(eslesiyorMu(undefined, 'x')).toBe(false);
    expect(eslesiyorMu(undefined, '')).toBe(true);
  });

  it('boş sorgu her şeyle eşleşiyor', () => {
    expect(eslesiyorMu('herhangi', '   ')).toBe(true);
  });
});
