import { describe, it, expect } from 'vitest';
import { belgeUyarisi } from './belgeDenetimi';
import type { Blok } from './belgeIcerik';

const baslik = (metin: string, seviye: 1 | 2 | 3 = 1): Blok => ({ tip: 'baslik', seviye, metin });
const paragraf = (metin: string): Blok => ({ tip: 'paragraf', parcalar: [{ metin }] });
const tablo = (satirlar: string[][]): Blok => ({ tip: 'tablo', basliklar: ['A', 'B'], satirlar });

describe('belgeUyarisi', () => {
  it('normal belgede uyarı YOK', () => {
    expect(belgeUyarisi([baslik('Rapor'), paragraf('Uzun bir metin.')], 'docx')).toBeNull();
  });

  it('YALNIZ BAŞLIKLARDAN oluşan belge uyarı veriyor', () => {
    // Panelde düzgün görünür ama içi boştur: kullanıcı dosyayı açana kadar
    // anlamaz. Tam olarak "sessiz hata".
    const u = belgeUyarisi([baslik('Giriş'), baslik('Gelişme'), baslik('Sonuç')], 'docx');
    expect(u).toMatch(/başlık/i);
  });

  it('başlıksız ama içerikli belge uyarı VERMİYOR', () => {
    expect(belgeUyarisi([paragraf('Sadece düz metin.')], 'docx')).toBeNull();
  });

  it('seviye 3 başlık İÇERİK sayılmıyor — pptx\'te slayt içi ara başlık', () => {
    // pptxOlustur'da seviye 3 slayt açmıyor ama tek başına içerik de değil.
    expect(belgeUyarisi([baslik('Slayt', 1), baslik('Ara', 3)], 'pptx')).toMatch(/başlık/i);
  });

  it('xlsx: tablo VAR ama SATIR YOK — uyarı veriyor', () => {
    // tabloVarMi yalnız tablonun varlığına bakıyor; başlık satırı döndürüp
    // veri döndürmeyen model boş bir Excel üretiyordu.
    expect(belgeUyarisi([tablo([])], 'xlsx')).toMatch(/veri/i);
  });

  it('xlsx: satırı olan tablo uyarı vermiyor', () => {
    expect(belgeUyarisi([tablo([['1', '2']])], 'xlsx')).toBeNull();
  });

  it('xlsx: tablolardan BİRİ doluysa uyarı yok', () => {
    expect(belgeUyarisi([tablo([]), tablo([['1', '2']])], 'xlsx')).toBeNull();
  });

  it('docx\'te boş tablo uyarı vermiyor — oradaki tablo yan öge', () => {
    // Word belgesinde tablo tek başına belgenin amacı değil; paragraf varsa
    // belge işe yarar. Yanlış uyarı, uyarı olmamasından kötüdür.
    expect(belgeUyarisi([paragraf('Metin.'), tablo([])], 'docx')).toBeNull();
  });

  it('boş blok listesinde uyarı YOK — o durumu çağıran zaten ayrı ele alıyor', () => {
    expect(belgeUyarisi([], 'docx')).toBeNull();
  });
});
