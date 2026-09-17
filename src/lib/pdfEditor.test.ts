import { describe, it, expect } from 'vitest';
import { loadPdf } from './pdfEditor';

/**
 * Elle yazılmış en küçük PDF. Depoya fixture dosyası koymamak için:
 * test kendi girdisini üretiyor.
 *
 * xref YOK — MuPDF "repairing PDF document" uyarısı basıp onarıyor. Uyarı
 * beklenen, hata değil.
 */
function miniPdf(metin: string): ArrayBuffer {
  const icerik = `BT /F1 12 Tf 20 50 Td (${metin}) Tj ET`;
  const kaynak =
    '%PDF-1.4\n' +
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]/Contents 4 0 R' +
    '/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
    `4 0 obj<</Length ${icerik.length}>>stream\n${icerik}\nendstream endobj\n` +
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n' +
    'trailer<</Root 1 0 R/Size 6>>\n%%EOF\n';
  return new TextEncoder().encode(kaynak).buffer as ArrayBuffer;
}

describe('loadPdf', () => {
  it('metni numaralı biçimde çıkarır', async () => {
    const d = await loadPdf(miniPdf('AGUSTOS 2026'));
    expect(d.format).toBe('pdf');
    expect(d.numberedText).toContain('--- Sayfa 1 ---');
    expect(d.numberedText).toContain('AGUSTOS 2026');
    expect(d.unitCount).toBeGreaterThan(0);
  });

  it('metin katmanı YOKSA anlaşılır hatayla reddeder', async () => {
    // Metinsiz PDF: içerik akışı boş.
    const bos = new TextEncoder().encode(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
      '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
      '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]>>endobj\n' +
      'trailer<</Root 1 0 R/Size 4>>\n%%EOF\n',
    ).buffer as ArrayBuffer;
    await expect(loadPdf(bos)).rejects.toThrow(/taranmış|metin/i);
  });

  it('GİDİŞ-DÖNÜŞ: eski metin siliniyor, yenisi aranabilir kalıyor', async () => {
    const d = await loadPdf(miniPdf('AGUSTOS 2026'));
    const birim = Number(d.numberedText.match(/\[(\d+)\]/)![1]);
    const { blob, appliedCount } = await d.apply([
      { paragraph: birim, find: 'AGUSTOS', replace: 'EYLUL' },
    ]);
    expect(appliedCount).toBe(1);

    // Sonucu yeniden yükleyip metnine bak
    const sonuc = await loadPdf(await blob.arrayBuffer());
    expect(sonuc.numberedText).not.toContain('AGUSTOS');
    expect(sonuc.numberedText).toContain('EYLUL');
  });

  it('Türkçe karakterler korunuyor', async () => {
    const d = await loadPdf(miniPdf('AGUSTOS 2026'));
    const birim = Number(d.numberedText.match(/\[(\d+)\]/)![1]);
    const { blob } = await d.apply([{ paragraph: birim, find: 'AGUSTOS', replace: 'EYLÜL' }]);
    const sonuc = await loadPdf(await blob.arrayBuffer());
    expect(sonuc.numberedText).toContain('EYLÜL');
  });

  it('SIĞMAYANI REDDETMEZ — puntoyu küçültüp sığdırır', async () => {
    // Üretimdeki standart davranış bu: Acrobat/PyMuPDF de sığmayan metni
    // reddetmiyor, kutuya sığacak kadar küçültüyor. Reddetmek 14 tarihten
    // 10'unu uygulanamaz bırakıyordu.
    const d = await loadPdf(miniPdf('AGUSTOS 2026'));
    const birim = Number(d.numberedText.match(/\[(\d+)\]/)![1]);
    const uzun = 'EYLUL 2026 AYINDA';    // kutudan geniş ama okunmaz olmayacak kadar
    const { accepted, rejected } = d.validate([
      { paragraph: birim, find: 'AGUSTOS 2026', replace: uzun },
    ]);
    expect(rejected).toHaveLength(0);
    expect(accepted).toHaveLength(1);

    const { blob, appliedCount } = await d.apply([
      { paragraph: birim, find: 'AGUSTOS 2026', replace: uzun },
    ]);
    expect(appliedCount).toBe(1);
    // Sadece "kabul edildi" demek yetmez: metin GERÇEKTEN yazılmış ve
    // aranabilir olmalı (bake çalıştı mı).
    const sonuc = await loadPdf(await blob.arrayBuffer());
    expect(sonuc.numberedText).toContain(uzun);
  });

  it('küçültme GERÇEKTEN oluyor — çıktıdaki punto daha küçük', async () => {
    // Yukarıdaki test metnin yazıldığını gösteriyor ama puntoyu görmüyor;
    // küçültme hiç olmasa ve metin taşsa da o test geçerdi. Burada çıktının
    // kendi font boyutu okunuyor.
    const mupdf = await import('mupdf');
    const oku = async (pdf: ArrayBuffer, ara: string) => {
      const belge = mupdf.Document.openDocument(pdf, 'application/pdf') as never as {
        loadPage(i: number): { toStructuredText(o: string): { asJSON(): string } };
      };
      const veri = JSON.parse(belge.loadPage(0).toStructuredText('preserve-whitespace').asJSON());
      for (const blok of veri.blocks ?? []) {
        for (const satir of blok.lines ?? []) {
          if ((satir.text ?? '').includes(ara)) return satir.font?.size as number;
        }
      }
      return null;
    };

    const girdi = miniPdf('AGUSTOS 2026');
    expect(await oku(girdi, 'AGUSTOS')).toBe(12);

    const d = await loadPdf(girdi);
    const birim = Number(d.numberedText.match(/\[(\d+)\]/)![1]);
    const { blob } = await d.apply([
      { paragraph: birim, find: 'AGUSTOS 2026', replace: 'EYLUL 2026 AYINDA' },
    ]);
    const yeniBoyut = await oku(await blob.arrayBuffer(), 'AYINDA')!;
    expect(yeniBoyut).toBeLessThan(12);          // küçüldü
    expect(yeniBoyut).toBeGreaterThanOrEqual(9); // ama alt sınırın (0.75) altına inmedi
  });

  it('OKUNMAZ kadar küçülmesi gerekiyorsa yine reddeder', async () => {
    const d = await loadPdf(miniPdf('AGUSTOS 2026'));
    const birim = Number(d.numberedText.match(/\[(\d+)\]/)![1]);
    const uzun = 'BU METIN KUTUYA ASLA SIGMAYACAK KADAR UZUNDUR VE TASMASI GEREKIR';
    const { rejected } = d.validate([{ paragraph: birim, find: 'AGUSTOS', replace: uzun }]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].message).toMatch(/sığm/i);
    expect(rejected[0].message).toMatch(/küçült/i);
    // Mesaj NEYİ değiştirmeye çalıştığını söylemeli — hedefsiz red teşhis
    // edilemiyordu ("hangi satır, neden?" sorusu cevapsız kalıyordu).
    expect(rejected[0].message).toContain('AGUSTOS');
  });
});

describe('satırın tamamı gönderildiğinde (modelin yaptığı)', () => {
  // Canlıda yaşandı: kullanıcı "tarihleri 2026 yap" dedi, model satırın
  // TAMAMINI gönderdi ve 14 düzenlemenin 12'si "PDF'e sığmıyor" diye
  // reddedildi. Sebep tasarımdı: tüm satırı Helvetica ile ölçüp belgenin
  // kendi fontuyla dizilmiş kutusuyla karşılaştırıyorduk.
  it('yalnız değişen parçayı hedefler, REDDETMEZ', async () => {
    const d = await loadPdf(miniPdf('October 22-27, 2011, Portland'));
    const birim = Number(d.numberedText.match(/\[(\d+)\]/)![1]);
    // find YOK — model satırın tamamını yolluyor
    const { accepted, rejected } = d.validate([
      { paragraph: birim, replace: 'October 22-27, 2026, Portland' },
    ]);
    expect(rejected).toHaveLength(0);
    expect(accepted).toHaveLength(1);
  });

  it('uygularken satırın GERİ KALANINA dokunmaz', async () => {
    const d = await loadPdf(miniPdf('October 22-27, 2011, Portland'));
    const birim = Number(d.numberedText.match(/\[(\d+)\]/)![1]);
    const { blob, appliedCount } = await d.apply([
      { paragraph: birim, replace: 'October 22-27, 2026, Portland' },
    ]);
    expect(appliedCount).toBe(1);
    const sonuc = await loadPdf(await blob.arrayBuffer());
    // Yıl değişti, cümlenin geri kalanı yerinde
    // Kelime bütün hâlde değiştiği için "2026" ARANABİLİR kalıyor; karakter
    // seviyesinde kesilseydi "20" ve "26" ayrı parçalara düşer, bulunamazdı.
    expect(sonuc.numberedText).toContain('2026');
    expect(sonuc.numberedText).not.toContain('2011');
    expect(sonuc.numberedText).toContain('Portland');
    expect(sonuc.numberedText).toContain('October');
  });

  it('metin zaten aynıysa anlaşılır mesajla reddeder', async () => {
    const d = await loadPdf(miniPdf('DEGISMEYEN METIN'));
    const birim = Number(d.numberedText.match(/\[(\d+)\]/)![1]);
    const { rejected } = d.validate([{ paragraph: birim, replace: 'DEGISMEYEN METIN' }]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].message).toMatch(/aynı/i);
  });
});
