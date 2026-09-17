import { describe, it, expect } from 'vitest';
import { aracParcasiEkle, aracCagrisiCoz, type AracBirikimi } from './aracAkisi';

/** Akıştan gelen bir delta parçası. */
const parca = (o: unknown) => o as Record<string, unknown>;

describe('aracParcasiEkle', () => {
  it('aynı index farklı kimliklerle gelirse belirsizliği işaretler', () => {
    const ilk = aracParcasiEkle([], { index: 0, id: 'a', function: { name: 'belge_uret', arguments: '{}' } });
    const son = aracParcasiEkle(ilk, { index: 0, id: 'b', function: { name: 'belge_uret' } });
    expect(son[0].hata).toBeTruthy();
  });
  it('sınırsız araç argümanı biriktirmez', () => {
    const b = aracParcasiEkle([], { index: 0, id: 'a', function: { name: 'belge_uret', arguments: 'x'.repeat(100000) } });
    expect(b[0].hata).toBeTruthy(); expect(b[0].argumanlar.length).toBeLessThanOrEqual(32769);
  });
  it('argümanları PARÇA PARÇA biriktiriyor', () => {
    // vLLM argümanları harf harf bölebiliyor; tek parça beklemek en yaygın hata.
    let b: AracBirikimi[] = [];
    b = aracParcasiEkle(b, parca({ index: 0, id: 'c1', function: { name: 'belge_uret', arguments: '{"tur"' } }));
    b = aracParcasiEkle(b, parca({ index: 0, function: { arguments: ':"docx",' } }));
    b = aracParcasiEkle(b, parca({ index: 0, function: { arguments: '"talimat":"rapor"}' } }));
    expect(b).toHaveLength(1);
    expect(b[0].ad).toBe('belge_uret');
    expect(b[0].argumanlar).toBe('{"tur":"docx","talimat":"rapor"}');
  });

  it('ad YALNIZ ilk parçada gelse de korunuyor', () => {
    let b: AracBirikimi[] = [];
    b = aracParcasiEkle(b, parca({ index: 0, function: { name: 'belge_uret', arguments: '{' } }));
    b = aracParcasiEkle(b, parca({ index: 0, function: { arguments: '}' } }));
    expect(b[0].ad).toBe('belge_uret');
  });

  it('index YOKSA parçalar yine BİRLEŞİYOR — bazı sunucular alanı hiç yollamıyor', () => {
    // Tek parçayı saymak yetmiyordu: index undefined kalsa da dizi uzunluğu 1
    // çıkıyor ve test geçiyordu. Asıl kontrol, İKİ parçanın aynı çağrıda
    // birleşmesi.
    let b: AracBirikimi[] = [];
    b = aracParcasiEkle(b, parca({ function: { name: 'belge_uret', arguments: '{"tur"' } }));
    b = aracParcasiEkle(b, parca({ function: { arguments: ':"docx"}' } }));
    expect(b).toHaveLength(1);
    expect(b[0].ad).toBe('belge_uret');
    expect(b[0].argumanlar).toBe('{"tur":"docx"}');
  });

  it('KARIŞIK gelirse de birleşiyor: bir parçada index yok, ötekinde 0', () => {
    // Asıl kontrol bu. Hepsi index'siz olunca undefined === undefined ile
    // tesadüfen birleşiyorlardı; normalleştirme ancak karışık durumda görünür.
    let b: AracBirikimi[] = [];
    b = aracParcasiEkle(b, parca({ function: { name: 'belge_uret', arguments: '{"tur"' } }));
    b = aracParcasiEkle(b, parca({ index: 0, function: { arguments: ':"docx"}' } }));
    expect(b).toHaveLength(1);
    expect(b[0].argumanlar).toBe('{"tur":"docx"}');
  });

  it('FARKLI index ayrı çağrı — birbirine karışmıyor', () => {
    let b: AracBirikimi[] = [];
    b = aracParcasiEkle(b, parca({ index: 0, function: { name: 'a', arguments: '{"x":1}' } }));
    b = aracParcasiEkle(b, parca({ index: 1, function: { name: 'b', arguments: '{"y":2}' } }));
    expect(b.map((x) => x.ad)).toEqual(['a', 'b']);
    expect(b[1].argumanlar).toBe('{"y":2}');
  });

  it('çöp parçada çökmüyor ve birikimi bozmuyor', () => {
    let b: AracBirikimi[] = [];
    b = aracParcasiEkle(b, parca({ index: 0, function: { name: 'a', arguments: '{}' } }));
    for (const cop of [null, undefined, 'metin', 42, {}, { function: null }]) {
      b = aracParcasiEkle(b, cop as never);
    }
    expect(b).toHaveLength(1);
    expect(b[0].argumanlar).toBe('{}');
  });

  it('birikim DEĞİŞTİRİLMİYOR, yenisi dönüyor', () => {
    // React durumunda tutuluyor; yerinde değiştirmek yeniden çizimi kaçırtır.
    const ilk: AracBirikimi[] = [];
    const sonra = aracParcasiEkle(ilk, parca({ index: 0, function: { name: 'a', arguments: '{}' } }));
    expect(ilk).toHaveLength(0);
    expect(sonra).not.toBe(ilk);
  });
});

describe('aracCagrisiCoz', () => {
  it('tamamlanmış çağrıyı çözüyor', () => {
    const b: AracBirikimi[] = [{ index: 0, ad: 'belge_uret', argumanlar: '{"tur":"docx","talimat":"rapor","baslik":"Test"}' }];
    expect(aracCagrisiCoz(b, 'belge_uret')).toEqual({ tur: 'docx', talimat: 'rapor', baslik: 'Test' });
  });

  it('YARIM json geldiyse null — kesilen akışta çökmemeli', () => {
    // max_tokens'a takılan akış argümanları yarıda bırakabiliyor.
    const b: AracBirikimi[] = [{ index: 0, ad: 'belge_uret', argumanlar: '{"tur":"do' }];
    expect(aracCagrisiCoz(b, 'belge_uret')).toBeNull();
  });

  it('BAŞKA araç çağrıldıysa null', () => {
    const b: AracBirikimi[] = [{ index: 0, ad: 'baska_arac', argumanlar: '{}' }];
    expect(aracCagrisiCoz(b, 'belge_uret')).toBeNull();
  });

  it('hiç çağrı yoksa null', () => {
    expect(aracCagrisiCoz([], 'belge_uret')).toBeNull();
  });

  it('json nesne değilse null', () => {
    const b: AracBirikimi[] = [{ index: 0, ad: 'belge_uret', argumanlar: '"metin"' }];
    expect(aracCagrisiCoz(b, 'belge_uret')).toBeNull();
  });
});
