import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { zipDepoOku, ortakKok } from './repoZip';

async function zipKur(dosyalar: Record<string, string>): Promise<ArrayBuffer> {
  const zip = new JSZip();
  for (const [yol, icerik] of Object.entries(dosyalar)) zip.file(yol, icerik);
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('ortakKok', () => {
  it('GitHub zip\'inin sardığı kök klasörü bulur', () => {
    // "proje-main/src/a.py" → yollar "src/a.py" olmalı, kök gürültü
    expect(ortakKok(['proje-main/src/a.py', 'proje-main/README.md'])).toBe('proje-main/');
  });

  it('ortak kök yoksa boş döner', () => {
    expect(ortakKok(['src/a.py', 'lib/b.py'])).toBe('');
  });

  it('boş listede boş', () => {
    expect(ortakKok([])).toBe('');
  });
});

describe('zipDepoOku', () => {
  it('kaynak dosyaları alır, gürültüyü eler', async () => {
    const buf = await zipKur({
      'proje-main/src/main.py': 'def f():\n    return 1',
      'proje-main/src/utils.ts': 'export const a = 1;',
      'proje-main/node_modules/react/index.js': 'module.exports = {};',
      'proje-main/README.md': '# proje',
      'proje-main/package-lock.json': '{}',
    });
    const r = await zipDepoOku(buf);

    expect(r.dosyalar.map((x) => x.path).sort()).toEqual(['src/main.py', 'src/utils.ts']);
    // Kök klasör yollardan atılmış
    expect(r.dosyalar.every((x) => !x.path.startsWith('proje-main'))).toBe(true);
  });

  it('elenen dosyaları SEBEBİYLE raporlar', async () => {
    const buf = await zipKur({
      'src/a.py': 'def f(): pass',
      'node_modules/x/i.js': 'x',
      'logo.png': 'x',
    });
    const r = await zipDepoOku(buf);

    expect(r.atlanan.find((x) => x.path === 'node_modules/x/i.js')?.sebep).toBe('dislanan-dizin');
    expect(r.atlanan.find((x) => x.path === 'logo.png')?.sebep).toBe('kod-degil');
  });

  it('ilerleme bildirir', async () => {
    const buf = await zipKur({ 'a.py': 'x = 1', 'b.py': 'y = 2' });
    const adimlar: number[] = [];
    await zipDepoOku(buf, {}, (p) => adimlar.push(p.okunan));
    expect(adimlar).toEqual([1, 2]);
  });

  it('sınırlar zip yolunda da geçerli', async () => {
    const dosyalar: Record<string, string> = {};
    for (let i = 0; i < 10; i++) dosyalar[`f${i}.py`] = 'def f(): pass';
    const r = await zipDepoOku(await zipKur(dosyalar), { maxDosya: 3 });
    expect(r.dosyalar).toHaveLength(3);
    expect(r.atlanan.filter((x) => x.sebep === 'dosya-siniri')).toHaveLength(7);
  });

  it('bozuk zip açık hata verir', async () => {
    const bozuk = new TextEncoder().encode('bu bir zip degil').buffer;
    await expect(zipDepoOku(bozuk)).rejects.toThrow(/okunamadı|bozuk/i);
  });
});
