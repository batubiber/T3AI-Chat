import { describe, it, expect } from 'vitest';
import { cleanOcrOutput, isOcrOff, mapWithConcurrency, injectOcrResults, isOcrableImageType, collectTableImageIndices } from './ocrService';
import { htmlTableToMarkdown, formatChunkHeader } from './htmlTable';
import { htmlToTextWithTables } from './fileParser';

describe('htmlTableToMarkdown (taşınmış)', () => {
  it('basit HTML tabloyu markdown pipe tablosuna çevirir', () => {
    const md = htmlTableToMarkdown('<table><tr><td>Kod</td><td>Ad</td></tr><tr><td>PRT-1</td><td>Motor</td></tr></table>');
    expect(md).toContain('| Kod | Ad |');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| PRT-1 | Motor |');
  });
});

describe('cleanOcrOutput', () => {
  it('det etiketlerini ve koordinatları söker, metni korur', () => {
    const raw = '<|det|>title [60, 38, 892, 66]<|/det|>VEGA-2 İNSANSIZ SİSTEM\n<|det|>text [59, 119, 774, 246]<|/det|>Bu kılavuz şarj ünitesini kapsar.';
    const out = cleanOcrOutput(raw);
    expect(out).toContain('VEGA-2 İNSANSIZ SİSTEM');
    expect(out).toContain('Bu kılavuz şarj ünitesini kapsar.');
    expect(out).not.toContain('<|det|>');
    expect(out).not.toContain('[60, 38');
  });
  it('HTML tabloyu markdown pipe tablosuna çevirir (chunker koruması için)', () => {
    const raw = '<|det|>table [62, 294, 938, 430]<|/det|><table><tr><td>Parça Kodu</td><td>Ömür</td></tr><tr><td>PRT-4412</td><td>2.500</td></tr></table>';
    const out = cleanOcrOutput(raw);
    expect(out).toContain('| Parça Kodu | Ömür |');
    expect(out).toContain('| PRT-4412 | 2.500 |');
    expect(out).not.toContain('<table>');
  });
  it('bilinmeyen özel token\'ları söker, boş/bozuk girdide çökmez', () => {
    expect(cleanOcrOutput('<|grounding|>metin<|/grounding|> devam')).toBe('metin devam');
    expect(cleanOcrOutput('')).toBe('');
    expect(cleanOcrOutput('   \n\n\n  ')).toBe('');
  });
  it('Türkçe karakterleri bozmadan geçirir', () => {
    expect(cleanOcrOutput('ığüşöçİĞÜŞÖÇ')).toBe('ığüşöçİĞÜŞÖÇ');
  });
  it('hücre metnindeki $ desenleri bozulmadan korunur (replace pattern-injection)', () => {
    const raw = 'ÖNCEKİ METİN. <table><tr><td>100$`TL</td></tr></table>';
    const out = cleanOcrOutput(raw);
    expect(out).toContain('100$`TL');
    expect(out).not.toContain('ÖNCEKİ METİN. TL');
  });
  it('kapanmamış det bloğu koordinat sızdırmaz', () => {
    const out = cleanOcrOutput('Önceki metin.\n<|det|>text [10, 20, 30, 40]');
    expect(out).toBe('Önceki metin.');
    expect(out).not.toContain('[10, 20');
  });
});

describe('isOcrOff', () => {
  it('node ortamında (localStorage yok) false döner', () => {
    expect(isOcrOff()).toBe(false);
  });
});

describe('mapWithConcurrency', () => {
  it('sonuçları girdi sırasıyla döndürür', async () => {
    const out = await mapWithConcurrency([3, 1, 2], async (n) => {
      await new Promise((r) => setTimeout(r, n * 10));
      return n * 2;
    }, 2);
    expect(out).toEqual([6, 2, 4]);
  });
  it('eşzamanlılık sınırını aşmaz', async () => {
    let active = 0, peak = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5], async () => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 20));
      active--;
    }, 2);
    expect(peak).toBeLessThanOrEqual(2);
  });
  it('boş listede boş dizi döner', async () => {
    expect(await mapWithConcurrency([], async () => 1, 2)).toEqual([]);
  });
});

describe('injectOcrResults', () => {
  it('placeholder\'ı OCR bloğuyla değiştirir (1-tabanlı numara)', () => {
    const out = injectOcrResults('önce\n%%OCR_IMG_0%%\nsonra', ['PRT-4412 kodu']);
    expect(out).toContain('[Görsel 1 — OCR]');
    expect(out).toContain('PRT-4412 kodu');
    expect(out).not.toContain('%%OCR_IMG_0%%');
  });
  it('null/boş OCR sonucu placeholder\'ı sessizce düşürür', () => {
    const out = injectOcrResults('önce\n%%OCR_IMG_0%%\nsonra', [null]);
    expect(out).not.toContain('OCR_IMG');
    expect(out).not.toContain('[Görsel');
    expect(out).toContain('önce');
    expect(out).toContain('sonra');
  });
  it('birden çok görseli doğru indeksle eşler', () => {
    const out = injectOcrResults('%%OCR_IMG_0%% ara %%OCR_IMG_1%%', [null, 'ikinci metin']);
    expect(out).toContain('[Görsel 2 — OCR]');
    expect(out).toContain('ikinci metin');
    expect(out).not.toContain('[Görsel 1');
  });
});

describe('htmlToTextWithTables + OCR placeholder entegrasyonu', () => {
  it('img placeholder tag-temizlikten SAĞ ÇIKAR, >> çöpü kalmaz', () => {
    const out = htmlToTextWithTables('<p>Önce metin</p><p><img src="OCR_IMG_0" /></p><p>Sonra metin</p>');
    expect(out).toContain('%%OCR_IMG_0%%');
    expect(out).not.toContain('>>');
    expect(out).toContain('Önce metin');
    expect(out).toContain('Sonra metin');
  });
  it('alt attribute\'lu img de eşleşir', () => {
    const out = htmlToTextWithTables('<p><img alt="şema görseli" src="OCR_IMG_2" /></p>');
    expect(out).toContain('%%OCR_IMG_2%%');
  });
  it('uçtan uca: placeholder → injectOcrResults zinciri çalışır', () => {
    const text = htmlToTextWithTables('<p>Başlangıç</p><p><img src="OCR_IMG_0" /></p>');
    const out = injectOcrResults(text, ['PRT-4412 içerik']);
    expect(out).toContain('[Görsel 1 — OCR]');
    expect(out).toContain('PRT-4412 içerik');
    expect(out).not.toContain('%%OCR_IMG');
  });
  it('görselsiz dokümanda kullanıcı metnindeki %%OCR_IMG_0%% korunur (inject çağrılmaz senaryosu)', () => {
    const out = htmlToTextWithTables('<p>Şablon değişkeni: %%OCR_IMG_0%% aynen kalmalı</p>');
    expect(out).toContain('%%OCR_IMG_0%%');
  });
});

describe('isOcrableImageType', () => {
  it('yaygın raster formatları kabul eder', () => {
    for (const t of ['image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/webp']) {
      expect(isOcrableImageType(t)).toBe(true);
    }
  });
  it('EMF/WMF ve bilinmeyenleri reddeder', () => {
    for (const t of ['image/x-emf', 'image/x-wmf', 'image/wmf', 'image/svg+xml', undefined, '']) {
      expect(isOcrableImageType(t as string)).toBe(false);
    }
  });
});

describe('collectTableImageIndices', () => {
  it('tablo içindeki görsel indekslerini toplar, dışarıdakileri toplamaz', () => {
    const html = '<p><img src="OCR_IMG_0" /></p><table><tr><td><img src="OCR_IMG_1" /></td></tr></table><p><img src="OCR_IMG_2" /></p>';
    expect(collectTableImageIndices(html)).toEqual(new Set([1]));
  });
  it('tablosuz HTML boş set döner', () => {
    expect(collectTableImageIndices('<p><img src="OCR_IMG_0" /></p>')).toEqual(new Set());
  });
  it('birden çok tablodaki görselleri toplar', () => {
    const html = '<table><td><img src="OCR_IMG_0" /></td></table><table><td><img src="OCR_IMG_3" /></td></table>';
    expect(collectTableImageIndices(html)).toEqual(new Set([0, 3]));
  });
});

describe('skip-set ↔ htmlToTextWithTables tutarlılığı', () => {
  it('tablo içi görsel placeholder üretmez, tablo dışı üretir; skip-set aynı ayrımı yapar', () => {
    const html = '<p><img src="OCR_IMG_0" /></p><table><tr><td>Hücre <img src="OCR_IMG_1" /></td></tr></table><p><img src="OCR_IMG_2" /></p>';
    const skip = collectTableImageIndices(html);
    const text = htmlToTextWithTables(html);
    // Tablo içindeki 1 numaralı görsel: skip-set'te VE metne placeholder olarak ulaşmıyor
    expect(skip).toEqual(new Set([1]));
    expect(text).not.toContain('%%OCR_IMG_1%%');
    // Tablo dışındakiler: skip-set'te DEĞİL ve placeholder'ları metinde
    expect(text).toContain('%%OCR_IMG_0%%');
    expect(text).toContain('%%OCR_IMG_2%%');
  });
});

describe('formatChunkHeader', () => {
  it('sayfa varsa "[dosya, Sayfa N]" üretir', () => {
    expect(formatChunkHeader('rapor.pdf', 12)).toBe('[rapor.pdf, Sayfa 12]');
  });
  it('sayfa yoksa yalnız dosya adı', () => {
    expect(formatChunkHeader('rapor.docx', undefined)).toBe('[rapor.docx]');
  });
  it('dosya adı yoksa Unknown', () => {
    expect(formatChunkHeader(undefined, undefined)).toBe('[Unknown]');
  });
  it('Chunk kelimesi asla geçmez', () => {
    expect(formatChunkHeader('a.pdf', 3)).not.toContain('Chunk');
  });
  it('pptx dosyasında "Slayt" der', () => {
    expect(formatChunkHeader('sunum.pptx', 3)).toBe('[sunum.pptx, Slayt 3]');
  });
  it('pdf dosyasında "Sayfa" demeye devam eder', () => {
    expect(formatChunkHeader('rapor.pdf', 3)).toBe('[rapor.pdf, Sayfa 3]');
  });
  it('büyük harfli uzantıyı da tanır', () => {
    expect(formatChunkHeader('SUNUM.PPTX', 1)).toBe('[SUNUM.PPTX, Slayt 1]');
  });
});
