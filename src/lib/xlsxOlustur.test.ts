import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { xlsxBaytlari, tabloVarMi } from './xlsxOlustur';
import type { Blok } from './belgeIcerik';

const TABLO1: Blok = { tip: 'tablo', basliklar: ['Kalem', 'Tutar'], satirlar: [['Motor', '1250'], ['Kanat', '90']] };
const TABLO2: Blok = { tip: 'tablo', basliklar: ['Ay'], satirlar: [['Ocak']] };

const oku = (b: Uint8Array) => XLSX.read(b, { type: 'array' });
const satirlar = (wb: XLSX.WorkBook, s: string) =>
  XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets[s], { header: 1 });

describe('tabloVarMi', () => {
  it('tablo bloğu varsa true', () => {
    expect(tabloVarMi([TABLO1])).toBe(true);
  });
  it('yalnız düzyazı varsa false — hücreye yazacak veri yok', () => {
    expect(tabloVarMi([{ tip: 'paragraf', parcalar: [{ metin: 'metin' }] }])).toBe(false);
  });
  it('boş listede false', () => {
    expect(tabloVarMi([])).toBe(false);
  });
});

describe('xlsxBaytlari', () => {
  it('başlık ve satırlar hücrelere doğru yazılıyor', () => {
    const s = satirlar(oku(xlsxBaytlari([TABLO1])), 'Tablo 1');
    expect(s[0]).toEqual(['Kalem', 'Tutar']);
    expect(s[1]).toEqual(['Motor', 1250]);
    expect(s[2]).toEqual(['Kanat', 90]);
    expect(s).toHaveLength(3);
  });

  it('sayıya benzeyen hücre SAYI olarak yazılıyor — Excel toplayabilsin', () => {
    const wb = oku(xlsxBaytlari([TABLO1]));
    const h = wb.Sheets['Tablo 1']['B2'];
    expect(h.t).toBe('n');
    expect(h.v).toBe(1250);
  });

  it('sayı olmayan hücre METİN kalıyor', () => {
    const wb = oku(xlsxBaytlari([TABLO1]));
    expect(wb.Sheets['Tablo 1']['A2'].t).toBe('s');
  });

  it('her tablo AYRI sayfa olur', () => {
    const wb = oku(xlsxBaytlari([TABLO1, TABLO2]));
    expect(wb.SheetNames).toEqual(['Tablo 1', 'Tablo 2']);
    expect(satirlar(wb, 'Tablo 2')[1]).toEqual(['Ocak']);
  });

  it('tablo olmayan bloklar YOK SAYILIR', () => {
    const wb = oku(xlsxBaytlari([{ tip: 'baslik', seviye: 1, metin: 'X' }, TABLO1]));
    expect(wb.SheetNames).toEqual(['Tablo 1']);
  });

  it('Türkçe karakterler bozulmuyor', () => {
    const s = satirlar(oku(xlsxBaytlari([
      { tip: 'tablo', basliklar: ['Şehir'], satirlar: [['Çorum'], ['Iğdır']] },
    ])), 'Tablo 1');
    expect(s).toEqual([['Şehir'], ['Çorum'], ['Iğdır']]);
  });

  it('Uint8Array döner — Blob değil', () => {
    expect(xlsxBaytlari([TABLO1])).toBeInstanceOf(Uint8Array);
  });
});

// Brief'teki blokların ötesinde sınır durumları: kod bu davranışları zaten
// destekliyor, testler ileride sessizce bozulmaya karşı sabitliyor.
describe('xlsxBaytlari — sınır durumları (ek güvence)', () => {
  it('ondalıklı ve negatif sayılar da SAYI olarak yazılıyor', () => {
    const wb = oku(xlsxBaytlari([
      { tip: 'tablo', basliklar: ['Değer'], satirlar: [['90.5'], ['-5']] },
    ]));
    expect(satirlar(wb, 'Tablo 1')).toEqual([['Değer'], [90.5], [-5]]);
    expect(wb.Sheets['Tablo 1']['A2'].t).toBe('n');
    expect(wb.Sheets['Tablo 1']['A3'].t).toBe('n');
  });

  it('ayraçlı biçimli metin ("1.250,50") METİN kalıyor — yanlış sayıya çevrilmiyor', () => {
    const h = oku(xlsxBaytlari([
      { tip: 'tablo', basliklar: ['Tutar'], satirlar: [['1.250,50']] },
    ])).Sheets['Tablo 1']['A2'];
    expect(h.t).toBe('s');
    expect(h.v).toBe('1.250,50');
  });

  it('boşlukla çevrili sayı kırpılıp SAYI oluyor, metin olduğu gibi kalıyor', () => {
    const s = satirlar(oku(xlsxBaytlari([
      { tip: 'tablo', basliklar: ['Kalem', 'Tutar'], satirlar: [[' Motor ', ' 90 ']] },
    ])), 'Tablo 1');
    expect(s[1]).toEqual([' Motor ', 90]);
  });

  it('boş hücre satırı kaydırmıyor — boş metin olarak yerinde duruyor', () => {
    const s = satirlar(oku(xlsxBaytlari([
      { tip: 'tablo', basliklar: ['Kalem', 'Tutar'], satirlar: [['', '5'], ['x', '']] },
    ])), 'Tablo 1');
    expect(s[1]).toEqual(['', 5]);
    expect(s[2]).toEqual(['x', '']);
  });
});

// Türkçe binlik ayracı tuzağı: "1.250" Türkçede bin iki yüz ellidir. Eski kod
// bunu 1.25 SAYISINA çevirip sessizce 1000 kat yanlış veri yazıyordu. Nokta +
// tam üç hane artık belirsiz sayılır ve METİN kalır; diğer sayılar SAYI olur.
describe('xlsxBaytlari — Türkçe binlik ayracı belirsizliği', () => {
  const hucre = (deger: string) =>
    oku(xlsxBaytlari([
      { tip: 'tablo', basliklar: ['Değer'], satirlar: [[deger]] },
    ])).Sheets['Tablo 1']['A2'];

  it('"1250" SAYI olarak yazılıyor', () => {
    const h = hucre('1250');
    expect(h.t).toBe('n');
    expect(h.v).toBe(1250);
  });

  it('"1.250" METİN kalıyor — binlik ayraç olma ihtimali yüksek, 1.25 yazmak 1000 kat hata olurdu', () => {
    const h = hucre('1.250');
    expect(h.t).toBe('s');
    expect(h.v).toEqual('1.250');
  });

  it('"12.345" METİN kalıyor — nokta + tam üç hane aynı belirsizliği taşıyor', () => {
    const h = hucre('12.345');
    expect(h.t).toBe('s');
    expect(h.v).toEqual('12.345');
  });

  it('"12.5" SAYI — tek haneli ondalık belirsiz değil', () => {
    const h = hucre('12.5');
    expect(h.t).toBe('n');
    expect(h.v).toBe(12.5);
  });

  it('"0.75" SAYI — iki haneli ondalık belirsiz değil', () => {
    const h = hucre('0.75');
    expect(h.t).toBe('n');
    expect(h.v).toBe(0.75);
  });

  it('"-1.500" METİN — belirsizlik negatif sayılar için de geçerli', () => {
    const h = hucre('-1.500');
    expect(h.t).toBe('s');
    expect(h.v).toEqual('-1.500');
  });

  it('"-90" SAYI olarak yazılıyor', () => {
    const h = hucre('-90');
    expect(h.t).toBe('n');
    expect(h.v).toBe(-90);
  });
});
