import { describe, it, expect } from 'vitest';
import { derivePageNumbers, chunkFile, chunkPptxText, splitSheetBlocks } from './textChunker';

describe('derivePageNumbers', () => {
  it('chunk içindeki SON sayfa işaretini kullanır', () => {
    const out = derivePageNumbers([
      { content: '--- Sayfa 1 ---\nmetin\n--- Sayfa 2 ---\ndevam' },
    ]);
    expect(out).toEqual([2]);
  });
  it('işaretsiz chunk önceki sayfayı taşır', () => {
    const out = derivePageNumbers([
      { content: '--- Sayfa 3 ---\nbaşlangıç' },
      { content: 'işaretsiz orta parça' },
      { content: '--- Sayfa 5 ---\nson' },
    ]);
    expect(out).toEqual([3, 3, 5]);
  });
  it('hiç işaret görülmemişse undefined (DOCX/TXT dokümanları)', () => {
    const out = derivePageNumbers([
      { content: 'düz metin' },
      { content: 'yine düz' },
    ]);
    expect(out).toEqual([undefined, undefined]);
  });
  it('boş liste boş dizi döner', () => {
    expect(derivePageNumbers([])).toEqual([]);
  });
  it('Slayt işaretlerini de tanır (PPTX)', () => {
    const out = derivePageNumbers([
      { content: '--- Slayt 1 ---\nbaşlık' },
      { content: 'işaretsiz devam' },
      { content: '--- Slayt 4 ---\nson slayt' },
    ]);
    expect(out).toEqual([1, 1, 4]);
  });
  it('Sayfa ve Slayt işaretleri karışsa da son işaret kazanır', () => {
    const out = derivePageNumbers([
      { content: '--- Sayfa 2 ---\nmetin\n--- Slayt 7 ---\ndevam' },
    ]);
    expect(out).toEqual([7]);
  });
});

describe('chunkPptxText', () => {
  const deck = [
    '--- Slayt 1 ---\nGiriş slaydı',
    '--- Slayt 2 ---\nİkinci slaytın metni',
    '--- Slayt 3 ---\nÜçüncü slayt',
  ].join('\n\n');

  it('her slaytı ayrı chunk yapar', () => {
    const out = chunkPptxText(deck, { chunkSize: 3000, fileName: 'a.pptx' });
    expect(out).toHaveLength(3);
    expect(out[0].content).toContain('Giriş slaydı');
    expect(out[1].content).toContain('İkinci slaytın metni');
    expect(out[2].content).toContain('Üçüncü slayt');
  });

  it('slayt işaretini içerikte bırakır (derivePageNumbers okuyabilsin)', () => {
    const out = chunkPptxText(deck, { chunkSize: 3000, fileName: 'a.pptx' });
    expect(out[1].content).toContain('--- Slayt 2 ---');
    expect(derivePageNumbers(out)).toEqual([1, 2, 3]);
  });

  it('headingContext olarak slayt numarasını yazar', () => {
    const out = chunkPptxText(deck, { chunkSize: 3000, fileName: 'a.pptx' });
    expect(out[1].metadata.headingContext).toBe('Slayt 2');
  });

  it('chunkSize aşan slaytı böler ama diğerlerini bölmez', () => {
    const big = '--- Slayt 1 ---\nkısa\n\n--- Slayt 2 ---\n' + 'uzun cümle. '.repeat(200);
    const out = chunkPptxText(big, { chunkSize: 300, fileName: 'a.pptx' });
    expect(out.length).toBeGreaterThan(2);
    expect(out[0].content).toContain('kısa');
    // Slayt 2'den türeyen parçaların hepsi 2. slayta ait sayılmalı
    const pages = derivePageNumbers(out);
    expect(pages[0]).toBe(1);
    expect(pages.slice(1).every((p) => p === 2)).toBe(true);
    // Her parça TEK BAŞINA (bir öncekinden sayfa taşımadan) da 2. slayta ait çıkmalı;
    // bu yalnız işaret her parçaya yeniden eklendiyse doğrulanır
    out.slice(1).forEach((c) => expect(derivePageNumbers([c])).toEqual([2]));
  });

  it('işaretsiz metin tek chunk grubu olarak ele alınır', () => {
    const out = chunkPptxText('hiç işaret yok', { chunkSize: 3000, fileName: 'a.pptx' });
    expect(out).toHaveLength(1);
    expect(out[0].content).toBe('hiç işaret yok');
  });

  it('gövdesi boşluk satırsız tek uzun satır olan slaytta işaret-only (gövdesiz) chunk üretmez', () => {
    // chunkText içinde ayraç '\n' olarak çözülür (satırda boş satır yok), işaret
    // kendi başına currentChunk olur ve sonraki parça chunkSize'ı aşınca işaret
    // tek başına flush edilir — chunkPptxText bu parçayı atlamalı.
    const uzunSatir = 'sözcük '.repeat(30);
    const big = '--- Slayt 1 ---\nkısa\n\n--- Slayt 2 ---\n' + uzunSatir;
    const out = chunkPptxText(big, { chunkSize: 120, fileName: 'a.pptx' });
    // Atlama parçayı yutmamış olmalı: gerçek içerik hayatta kalmış olmalı
    expect(out.length).toBeGreaterThan(1);
    expect(out.map((c) => c.content).join(' ')).toContain('sözcük');
    out.forEach((c) => {
      const govdesiz = c.content.replace(/^---\s*Slayt\s+\d+\s*---\s*/, '').trim();
      expect(govdesiz.length).toBeGreaterThan(0);
    });
  });

  it('gövdesi yalnızca işaretten ibaret olan slayt (küçük-slayt yolu) chunk üretmez', () => {
    // Küçük-slayt yolu: gövde chunkSize altında kalınca doğrudan push edilir (satır 511-512).
    // Slayt 2'nin gövdesi yalnızca kendi işaretinden ibaret (boş slayt/bölüm ayıracı) —
    // bu durumda hiç chunk üretilmemeli, ama Slayt 1 ve 3 etkilenmemeli.
    const deck2 = '--- Slayt 1 ---\nmetin\n\n--- Slayt 2 ---\n\n--- Slayt 3 ---\nson';
    const out = chunkPptxText(deck2, { chunkSize: 3000, fileName: 'a.pptx' });
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.metadata.headingContext)).toEqual(['Slayt 1', 'Slayt 3']);
    expect(out[0].content).toContain('metin');
    expect(out[1].content).toContain('son');
  });
});

describe('chunkFile pptx yönlendirmesi', () => {
  it('.pptx uzantısı chunkPptxText yoluna gider', () => {
    const out = chunkFile('sunum.pptx', '--- Slayt 1 ---\nbir\n\n--- Slayt 2 ---\niki');
    expect(out).toHaveLength(2);
    expect(out[0].metadata.headingContext).toBe('Slayt 1');
  });
});

// parseXlsxFile'ın ürettiği biçim
const xlsxSheet = (name: string, rows: string[][]) =>
  [
    `## ${name}`,
    '',
    '| ' + rows[0].join(' | ') + ' |',
    '| ' + rows[0].map(() => '---').join(' | ') + ' |',
    ...rows.slice(1).map((r) => '| ' + r.join(' | ') + ' |'),
    '',
    'TSV biçimi:',
    '```tsv',
    ...rows.map((r) => r.join('\t')),
    '```',
  ].join('\n');

describe('splitSheetBlocks — hücre içeriğine kanmaz', () => {
  it('normal çok sayfalı dosyayı sayfa başına böler', () => {
    const text = [
      xlsxSheet('Ocak', [['Ürün', 'Adet'], ['A', '1']]),
      xlsxSheet('Şubat', [['Ürün', 'Adet'], ['C', '3']]),
    ].join('\n\n');
    const blocks = splitSheetBlocks(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain('## Ocak');
    expect(blocks[1]).toContain('## Şubat');
  });

  it('```tsv çiti İÇİNDEKİ "## " satırından BÖLMEZ', () => {
    // Excel hücresinde "## Toplam" yazıyorsa TSV satırı da öyle başlar
    const text = xlsxSheet('Ocak', [['Ürün', 'Adet'], ['A', '1'], ['## Toplam', '3']]);
    const blocks = splitSheetBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain('## Toplam');
  });

  it('markdown tablo satırındaki "## " de bölmez', () => {
    const text = xlsxSheet('Ocak', [['Ürün'], ['## Ara toplam']]);
    expect(splitSheetBlocks(text)).toHaveLength(1);
  });

  it('boş metin boş dizi döner', () => {
    expect(splitSheetBlocks('')).toEqual([]);
  });
});

describe('chunkXlsxText chunkIndex bütünlüğü', () => {
  it('normal çok sayfalı dosyada indeksler boşluksuz ve tekrarsız', () => {
    const text = [
      xlsxSheet('Ocak', [['Ürün', 'Adet'], ['A', '1'], ['B', '2']]),
      xlsxSheet('Şubat', [['Ürün', 'Adet'], ['C', '3'], ['D', '4']]),
    ].join('\n\n');
    const idx = chunkFile('rapor.xlsx', text).map((c) => c.metadata.chunkIndex);
    expect(idx).toEqual(idx.map((_, i) => i));
  });

  it('"## " ile başlayan hücre indeks tekrarı üretmez (regresyon)', () => {
    const text = [
      xlsxSheet('Ocak', [['Ürün', 'Adet'], ['A', '1'], ['## Toplam', '3']]),
      xlsxSheet('Şubat', [['Ürün', 'Adet'], ['C', '3']]),
    ].join('\n\n');
    const out = chunkFile('rapor.xlsx', text);
    const idx = out.map((c) => c.metadata.chunkIndex);
    expect(idx).toEqual(idx.map((_, i) => i));       // boşluksuz, tekrarsız
    expect(new Set(idx).size).toBe(idx.length);
    // tablo parçalanmamış: "## Toplam" kendi sayfasının chunk'ında kalmalı
    const toplamChunk = out.find((c) => c.content.includes('## Toplam'))!;
    expect(toplamChunk.content).toContain('Ocak');
  });
});
