import { describe, it, expect } from 'vitest';
import {
  suzDosyalar,
  yolDislandiMi,
  ikiliMi,
  oncelikSirasi,
  atlamaOzeti,
  dosyaAgaci,
} from './repoIngest';

const d = (path: string, content = 'def f():\n    return 1\n') => ({ path, content });

describe('yolDislandiMi', () => {
  it('bağımlılık ve derleme dizinlerini eler', () => {
    // Bunlar olmadan tek bir zip on binlerce dosya getirir
    for (const yol of [
      'node_modules/react/index.js',
      'proje/node_modules/lodash/lodash.js',
      '.git/config',
      'backend/__pycache__/main.cpython-311.pyc',
      'app/dist/bundle.js',
      'rust/target/debug/build.rs',
      '.venv/lib/site.py',
    ]) {
      expect(yolDislandiMi(yol), yol).toBe(true);
    }
  });

  it('kilit ve üretilmiş dosyaları eler', () => {
    for (const yol of ['package-lock.json', 'src/Cargo.lock', 'app.min.js', 'bundle.js.map']) {
      expect(yolDislandiMi(yol), yol).toBe(true);
    }
  });

  it('gerçek kaynak dosyasını ELEMEZ', () => {
    for (const yol of ['src/main.py', 'lib/utils.ts', 'Dockerfile', 'app/models/user.rb']) {
      expect(yolDislandiMi(yol), yol).toBe(false);
    }
  });

  it('dizin adı DOSYA adında geçerse elemez', () => {
    // "build" bir dizin adı; "build.py" bir kaynak dosyası
    expect(yolDislandiMi('scripts/build.py')).toBe(false);
    expect(yolDislandiMi('src/dist_utils.ts')).toBe(false);
  });
});

describe('ikiliMi', () => {
  it('NUL baytı olan içeriği ikili sayar', () => {
    expect(ikiliMi('PK\u0000\u0000binary')).toBe(true);
  });

  it('düz metni ikili SANMAZ', () => {
    expect(ikiliMi('def f():\n    return 1')).toBe(false);
    expect(ikiliMi('// Türkçe karakterler: şğüöçİ')).toBe(false);
  });

  it('boş içerik ikili değil', () => {
    expect(ikiliMi('')).toBe(false);
  });
});

describe('oncelikSirasi — sınıra takılınca NE alınacağı', () => {
  it('sığ yollar önce gelir', () => {
    const yollar = ['a/b/c/derin.py', 'ust.py', 'src/orta.py'];
    expect(yollar.sort(oncelikSirasi)).toEqual(['ust.py', 'src/orta.py', 'a/b/c/derin.py']);
  });

  it('aynı derinlikte alfabetik — deterministik olmalı', () => {
    // Aynı zip iki kez yüklenince aynı sonuç çıksın, embedding önbelleği tutsun
    expect(['src/z.py', 'src/a.py'].sort(oncelikSirasi)).toEqual(['src/a.py', 'src/z.py']);
  });
});

describe('suzDosyalar', () => {
  it('kod olmayanları ayırır, kodu alır', () => {
    const r = suzDosyalar([d('src/main.py'), d('README.md'), d('logo.png', 'x')]);
    expect(r.dosyalar.map((x) => x.path)).toEqual(['src/main.py']);
    expect(r.atlanan.map((x) => x.sebep)).toEqual(['kod-degil', 'kod-degil']);
  });

  it('dili parça bilgisiyle birlikte taşır', () => {
    const r = suzDosyalar([d('lib.rs', 'fn main() {}')]);
    expect(r.dosyalar[0].language).toBe('rust');
  });

  it('DOSYA sınırına takılanı raporlar, sessizce atmaz', () => {
    const girdiler = Array.from({ length: 5 }, (_, i) => d(`f${i}.py`));
    const r = suzDosyalar(girdiler, { maxDosya: 2 });
    expect(r.dosyalar).toHaveLength(2);
    expect(r.atlanan.filter((x) => x.sebep === 'dosya-siniri')).toHaveLength(3);
  });

  it('TOPLAM boyut sınırına takılanı raporlar', () => {
    const buyuk = 'x'.repeat(400);
    const girdiler = Array.from({ length: 5 }, (_, i) => d(`f${i}.py`, `def f():\n${buyuk}`));
    const r = suzDosyalar(girdiler, { maxToplamKarakter: 900 });
    expect(r.dosyalar.length).toBeLessThan(5);
    expect(r.atlanan.some((x) => x.sebep === 'boyut-siniri')).toBe(true);
    expect(r.toplamKarakter).toBeLessThanOrEqual(900);
  });

  it('dosya başına boyut sınırı', () => {
    const r = suzDosyalar([d('dev.py', 'x'.repeat(5000))], { maxDosyaBoyutu: 1000 });
    expect(r.dosyalar).toHaveLength(0);
    expect(r.atlanan[0].sebep).toBe('cok-buyuk');
  });

  it('boş dosyayı alır gibi görünüp indekslemez', () => {
    const r = suzDosyalar([d('bos.py', '   \n  \n')]);
    expect(r.dosyalar).toHaveLength(0);
    expect(r.atlanan[0].sebep).toBe('bos');
  });

  it('ikili dosyayı uzantısı kod olsa BİLE eler', () => {
    // Zip'ten .ts uzantılı bir MPEG transport stream çıkabilir
    const r = suzDosyalar([d('video.ts', 'G@\u0000\u0000\u0000binary')]);
    expect(r.dosyalar).toHaveLength(0);
    expect(r.atlanan[0].sebep).toBe('ikili');
  });

  it('sınıra takılınca SIĞ yollar tercih edilir', () => {
    const r = suzDosyalar([d('a/b/c/derin.py'), d('ust.py')], { maxDosya: 1 });
    expect(r.dosyalar[0].path).toBe('ust.py');
  });

  it('gerçekçi bir depoda yalnız kaynak kalır', () => {
    const r = suzDosyalar([
      d('src/main.py'),
      d('src/utils.ts', 'export const a = 1;'),
      d('node_modules/react/index.js'),
      d('node_modules/react/cjs/react.min.js'),
      d('.git/HEAD', 'ref: refs/heads/main'),
      d('package-lock.json', '{}'),
      d('README.md', '# proje'),
      d('Dockerfile', 'FROM node:20'),
    ]);
    expect(r.dosyalar.map((x) => x.path).sort()).toEqual([
      'Dockerfile',
      'src/main.py',
      'src/utils.ts',
    ]);
  });
});

describe('atlamaOzeti', () => {
  it('sebebe göre gruplar ve çoktan aza sıralar', () => {
    // 4000 satırlık liste kimseye bir şey anlatmaz
    const ozet = atlamaOzeti([
      { path: 'a', sebep: 'dislanan-dizin' },
      { path: 'b', sebep: 'dislanan-dizin' },
      { path: 'c', sebep: 'ikili' },
    ]);
    expect(ozet[0]).toEqual({ sebep: 'derleme/bağımlılık dizini', sayi: 2 });
    expect(ozet[1]).toEqual({ sebep: 'ikili dosya', sayi: 1 });
  });

  it('boş girdi', () => {
    expect(atlamaOzeti([])).toEqual([]);
  });
});

describe('dosyaAgaci', () => {
  const dosya = (path: string, satir: number) => ({
    path,
    content: Array.from({ length: satir }, () => 'x').join('\n'),
    language: 'python' as const,
  });

  it('yol ve satır sayısı yazar, İÇERİK yazmaz', () => {
    const agac = dosyaAgaci([dosya('src/main.py', 12)]);
    expect(agac).toBe('src/main.py (12 satır)');
    expect(agac).not.toContain('x');
  });

  it('alfabetik sıralar', () => {
    const agac = dosyaAgaci([dosya('z.py', 1), dosya('a.py', 1)]);
    expect(agac.split('\n')[0]).toContain('a.py');
  });

  it('çok dosyada kısaltır ve KAÇ tane kısaldığını söyler', () => {
    const agac = dosyaAgaci(
      Array.from({ length: 250 }, (_, i) => dosya(`f${String(i).padStart(3, '0')}.py`, 1)),
      200,
    );
    expect(agac.split('\n')).toHaveLength(201);
    expect(agac).toContain('ve 50 dosya daha');
  });
});
