import { describe, it, expect } from 'vitest';
import { dosyaAdi } from './belgeAdi';

const GUN = new Date('2026-08-20T10:00:00Z');

describe('dosyaAdi', () => {
  it('başlığı dosya adına çevirir ve uzantıyı ekler', () => {
    expect(dosyaAdi('Yapay Zeka Raporu', 'docx', GUN)).toBe('Yapay-Zeka-Raporu.docx');
    expect(dosyaAdi('Satış Verileri', 'xlsx', GUN)).toBe('Satış-Verileri.xlsx');
    expect(dosyaAdi('Siber Güvenlik', 'pptx', GUN)).toBe('Siber-Güvenlik.pptx');
  });

  it('Türkçe harfleri KORUR', () => {
    // Uygulama Türkçe; adı ASCII'ye kırpmak kullanıcıya bozuk isim gösterirdi.
    expect(dosyaAdi('İHA Üretimi Çalışması', 'docx', GUN)).toBe('İHA-Üretimi-Çalışması.docx');
  });

  it('dosya sisteminde yasak karakterleri atar', () => {
    expect(dosyaAdi('Rapor: 2026/Q3 <taslak>', 'docx', GUN)).toBe('Rapor-2026-Q3-taslak.docx');
    expect(dosyaAdi('a"b|c?d*e', 'docx', GUN)).toBe('abcde.docx');
  });

  it('dizin kaçışını etkisiz kılar', () => {
    // Ad modelden geliyor: "../../" içeren bir başlık indirme adına
    // olduğu gibi geçmemeli.
    const ad = dosyaAdi('../../etc/passwd', 'docx', GUN);
    expect(ad).not.toContain('/');
    expect(ad).not.toContain('..');
    expect(ad).toBe('etc-passwd.docx');
  });

  it('boşlukları teke indirir, baştaki ve sondaki tireleri atar', () => {
    expect(dosyaAdi('  Çok   Boşluklu   Başlık  ', 'docx', GUN)).toBe('Çok-Boşluklu-Başlık.docx');
    expect(dosyaAdi('---Rapor---', 'docx', GUN)).toBe('Rapor.docx');
  });

  it('başlık boşsa tarihli yedek ada düşer', () => {
    expect(dosyaAdi('', 'docx', GUN)).toBe('belge-2026-08-20.docx');
    expect(dosyaAdi('   ', 'xlsx', GUN)).toBe('belge-2026-08-20.xlsx');
    // Sadece yasak karakterden ibaret bir başlık da boşa düşer
    expect(dosyaAdi('///', 'pptx', GUN)).toBe('belge-2026-08-20.pptx');
  });

  it('çok uzun başlığı kırpar ve sonda tire bırakmaz', () => {
    const uzun = 'Türkiye Savunma Sanayii Insansız Hava Araçları Üretim Kapasitesi Değerlendirme Raporu';
    const ad = dosyaAdi(uzun, 'docx', GUN);
    expect(ad.length).toBeLessThanOrEqual(65);
    expect(ad.endsWith('.docx')).toBe(true);
    expect(ad).not.toContain('-.docx');
  });

  it('Windows ayrılmış adlarını kullanılabilir hâle getirir', () => {
    // "CON.docx" Windows'ta AÇILAMAZ; ad modelden geldiği için olabilir.
    expect(dosyaAdi('CON', 'docx', GUN)).toBe('belge-CON.docx');
    expect(dosyaAdi('com1', 'xlsx', GUN)).toBe('belge-com1.xlsx');
    expect(dosyaAdi('Rapor', 'docx', GUN)).toBe('Rapor.docx');
  });

  it('baştaki noktayı atar (gizli dosya olmasın)', () => {
    expect(dosyaAdi('.gizli rapor', 'docx', GUN)).toBe('gizli-rapor.docx');
  });
});
