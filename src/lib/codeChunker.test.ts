import { describe, it, expect } from 'vitest';
import { parcalaKod, bildirimBasi } from './codeChunker';
import { dosyaDili, kodDosyasiMi, citEtiketi } from './codeLanguages';

/** Bir parçanın satır aralığı gerçekten o metne mi denk geliyor. */
function araliklarTutarli(kaynak: string, parcalar: ReturnType<typeof parcalaKod>) {
  const satirlar = kaynak.split('\n');
  return parcalar.every((p) => {
    const beklenen = satirlar.slice(p.startLine - 1, p.endLine).join('\n');
    return beklenen === p.content;
  });
}

describe('dosyaDili', () => {
  it('uzantıdan dili bulur', () => {
    expect(dosyaDili('main.py')).toBe('python');
    expect(dosyaDili('Program.cs')).toBe('csharp');
    expect(dosyaDili('lib.rs')).toBe('rust');
    expect(dosyaDili('app.tsx')).toBe('typescript');
    expect(dosyaDili('style.scss')).toBe('css');
  });

  it('uzantısız ama adı belli dosyaları tanır', () => {
    // Depo yüklemede sık; uzantıya bakan bir kontrol bunları kaçırırdı
    expect(dosyaDili('Dockerfile')).toBe('dockerfile');
    expect(dosyaDili('Dockerfile.prod')).toBe('dockerfile');
    expect(dosyaDili('Makefile')).toBe('bash');
    expect(dosyaDili('.env')).toBe('config');
  });

  it('yol içindeki dosyayı da çözer', () => {
    expect(dosyaDili('src/lib/utils.ts')).toBe('typescript');
  });

  it('kod olmayan dosyada null', () => {
    expect(dosyaDili('rapor.pdf')).toBeNull();
    expect(dosyaDili('notlar.txt')).toBeNull();
    expect(dosyaDili('LICENSE')).toBeNull();
    expect(kodDosyasiMi('a.docx')).toBe(false);
  });

  it('çit etiketi üretir', () => {
    expect(citEtiketi('python')).toBe('python');
    expect(citEtiketi('config')).toBe('ini');
  });
});

describe('bildirimBasi — dil desenleri', () => {
  const ornekler: [string, Parameters<typeof bildirimBasi>[1], string | undefined][] = [
    ['def hesapla(x):', 'python', 'hesapla'],
    ['    async def getir(self):', 'python', 'getir'],
    ['class Musteri:', 'python', 'Musteri'],
    ['pub fn topla(a: i32) -> i32 {', 'rust', 'topla'],
    ['impl Display for Kullanici {', 'rust', 'Display for Kullanici'],
    ['public static void Main(string[] args)', 'csharp', 'Main'],
    ['public class Siparis', 'csharp', 'Siparis'],
    ['func Topla(a int) int {', 'go', 'Topla'],
    ['export function hesapla(a) {', 'javascript', 'hesapla'],
    ['export const getir = async () => {', 'javascript', 'getir'],
    ['export interface Kayit {', 'typescript', 'Kayit'],
    ['def merhaba', 'ruby', 'merhaba'],
    ['fun topla(a: Int): Int {', 'kotlin', 'topla'],
  ];

  it.each(ornekler)('%s (%s) → %s', (satir, dil, beklenenAd) => {
    const r = bildirimBasi(satir, dil);
    expect(r.eslesti).toBe(true);
    expect(r.ad).toBe(beklenenAd);
  });

  it('C ailesinde DENETİM yapısını bildirim sanmaz', () => {
    // "if (x) {" bir fonksiyon değil; sanılsaydı gövde ortadan bölünürdü
    for (const satir of ['if (x > 0) {', 'for (int i = 0; i < n; i++) {', 'while (ok) {']) {
      expect(bildirimBasi(satir, 'c').eslesti, satir).toBe(false);
    }
  });

  it('C ailesinde prototipi tanım sanmaz', () => {
    expect(bildirimBasi('int topla(int a, int b);', 'c').eslesti).toBe(false);
    expect(bildirimBasi('int topla(int a, int b) {', 'c')).toEqual({ eslesti: true, ad: 'topla' });
  });

  it('yorum satırını bildirim sanmaz', () => {
    expect(bildirimBasi('// void eski(void) {', 'cpp').eslesti).toBe(false);
  });
});

describe('parcalaKod — bildirimden bölme', () => {
  const python = [
    'import os',
    'import sys',
    '',
    'SABIT = 42',
    '',
    'def birinci(x):',
    '    """Birinci fonksiyonun gövdesi yeterince uzun olsun diye yazıldı."""',
    '    toplam = 0',
    '    for i in range(x):',
    '        toplam += i * 2',
    '    return toplam',
    '',
    'def ikinci(y):',
    '    """İkinci fonksiyon da benzer sekilde bir miktar govde iceriyor."""',
    '    sonuc = []',
    '    for j in range(y):',
    '        sonuc.append(j)',
    '    return sonuc',
  ].join('\n');

  it('fonksiyonları AYRI parçalara koyar', () => {
    const p = parcalaKod(python, 'python');
    expect(p.length).toBeGreaterThanOrEqual(2);
    const adlar = p.map((x) => x.symbol);
    expect(adlar).toContain('birinci');
    expect(adlar).toContain('ikinci');
  });

  it('fonksiyon gövdesi ORTADAN bölünmez', () => {
    const p = parcalaKod(python, 'python');
    const birinci = p.find((x) => x.symbol === 'birinci')!;
    expect(birinci.content).toContain('def birinci');
    expect(birinci.content).toContain('return toplam');
  });

  it('satır aralıkları içerikle birebir tutarlı', () => {
    const p = parcalaKod(python, 'python');
    expect(araliklarTutarli(python, p)).toBe(true);
  });

  it('ilk bildirimden ÖNCEKİ kısım (import/sabit) kaybolmaz', () => {
    const p = parcalaKod(python, 'python');
    expect(p.some((x) => x.content.includes('import os'))).toBe(true);
  });

  it('satır numaraları 1-tabanlı', () => {
    const p = parcalaKod(python, 'python');
    expect(Math.min(...p.map((x) => x.startLine))).toBe(1);
  });
});

describe('parcalaKod — sınır durumları', () => {
  it('deseni tutmayan dosya satır penceresine düşer, ZORLANMAZ', () => {
    const ini = Array.from({ length: 40 }, (_, i) => `anahtar${i} = deger${i}`).join('\n');
    const p = parcalaKod(ini, 'config', { chunkSize: 200 });
    expect(p.length).toBeGreaterThan(1);
    expect(araliklarTutarli(ini, p)).toBe(true);
    expect(p.every((x) => x.symbol === undefined)).toBe(true);
  });

  it('tek bir dev fonksiyon pencerelenir ama SEMBOL adı korunur', () => {
    const govde = Array.from({ length: 200 }, (_, i) => `    satir_${i} = ${i} * 2`).join('\n');
    const kaynak = `def devasa(x):\n${govde}`;
    const p = parcalaKod(kaynak, 'python', { chunkSize: 500 });
    expect(p.length).toBeGreaterThan(1);
    expect(p.every((x) => x.symbol === 'devasa')).toBe(true);
    // Örtüşme parçalar ARASINDA; her parçanın KENDİ aralığı yine birebir
    expect(araliklarTutarli(kaynak, p)).toBe(true);
    expect(p[0].content).toContain('def devasa');
    expect(p[p.length - 1].content).toContain('satir_199');
  });

  it('boş dosyada parça yok', () => {
    expect(parcalaKod('', 'python')).toEqual([]);
    expect(parcalaKod('   \n  \n', 'python')).toEqual([]);
  });

  it('tek satırlık dosya tek parça', () => {
    const p = parcalaKod('print("merhaba")', 'python');
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ startLine: 1, endLine: 1 });
  });

  it('küçük bloklar öncesine katılır — dekoratör tek başına parça olmaz', () => {
    const kaynak = [
      '@dekorator',
      'def islev(x):',
      '    """Bu fonksiyonun govdesi yeterince uzun olsun diye birkac satir var."""',
      '    a = x * 2',
      '    b = a + 1',
      '    return b',
    ].join('\n');
    const p = parcalaKod(kaynak, 'python');
    expect(p).toHaveLength(1);
    expect(p[0].content).toContain('@dekorator');
    expect(p[0].content).toContain('return b');
  });

  it('C dosyasında fonksiyonlar ayrılır, denetim yapıları bölmez', () => {
    const c = [
      '#include <stdio.h>',
      '',
      'int topla(int a, int b) {',
      '    if (a > b) {',
      '        return a + b;',
      '    }',
      '    return b - a;',
      '}',
      '',
      'void yazdir(const char *s) {',
      '    printf("%s\\n", s);',
      '}',
    ].join('\n');
    const p = parcalaKod(c, 'c');
    const adlar = p.map((x) => x.symbol).filter(Boolean);
    expect(adlar).toContain('topla');
    expect(adlar).toContain('yazdir');
    // "if" bir parça başlatmamalı
    const toplaParcasi = p.find((x) => x.symbol === 'topla')!;
    expect(toplaParcasi.content).toContain('if (a > b)');
    expect(toplaParcasi.content).toContain('return b - a;');
  });

  it('içerik hiç KAYBOLMAZ — tüm satırlar bir parçada geçer', () => {
    const kaynak = [
      'class A:',
      '    def bir(self):',
      '        return 1',
      '',
      'class B:',
      '    def iki(self):',
      '        return 2',
    ].join('\n');
    const p = parcalaKod(kaynak, 'python');
    const hepsi = p.map((x) => x.content).join('\n');
    for (const satir of kaynak.split('\n').filter((s) => s.trim())) {
      expect(hepsi, satir).toContain(satir.trim());
    }
  });
});

describe('parcalaKod — gövdesiz başlık (gerçek dosyada çıktı)', () => {
  it('tek satırlık sınıf başlığı KENDİ BAŞINA parça olmaz', () => {
    // Gerçek bir Python dosyasında "class Analizci:" satır 11-11 olarak kendi
    // parçası oluyordu. Gömülünce işe yaramaz: o sorgu gövdesiz başlık getirir.
    const kaynak = [
      'class Analizci:',
      '    def __init__(self, esik):',
      '        self.esik = esik',
      '',
      '    def calistir(self, satirlar):',
      '        """Esigin ustundekileri sayar ve toplami dondurur."""',
      '        toplam = 0',
      '        for s in satirlar:',
      '            toplam += 1',
      '        return toplam',
    ].join('\n');
    const p = parcalaKod(kaynak, 'python');

    const yalnizBaslik = p.find((x) => x.content.trim() === 'class Analizci:');
    expect(yalnizBaslik).toBeUndefined();
    // Başlık ilk metodun parçasına katılmış ve etiketi SINIF adı olmuş
    const ilk = p[0];
    expect(ilk.content).toContain('class Analizci:');
    expect(ilk.content).toContain('__init__');
    expect(ilk.symbol).toBe('Analizci');
  });

  it('gövdeli kısa fonksiyon YUTULMAZ', () => {
    // Karşı taraf: kısa ama gerçek bir fonksiyon kendi parçası kalmalı
    const c = [
      'int topla(int a, int b) {',
      '    return a + b;',
      '}',
      '',
      'void yazdir(const char *s) {',
      '    printf("%s", s);',
      '}',
    ].join('\n');
    const adlar = parcalaKod(c, 'c').map((x) => x.symbol);
    expect(adlar).toContain('topla');
    expect(adlar).toContain('yazdir');
  });
});
