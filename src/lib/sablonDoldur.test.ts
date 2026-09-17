import { describe, it, expect } from 'vitest';
import { yerTutuculariBul, degerleriDuzenlemeyeCevir, degerleriCoz } from './sablonDoldur';

describe('yerTutuculariBul', () => {
  it('tek yer tutucuyu birim numarasıyla bulur', () => {
    expect(yerTutuculariBul('[3] Sayın {{musteri_adi}},')).toEqual([
      { ad: 'musteri_adi', gecisler: [{ birim: 3, hamMetin: '{{musteri_adi}}' }] },
    ]);
  });

  it('aynı ad iki birimde geçerse TEK yer tutucu, iki geçiş', () => {
    // Şablonların en yaygın hâli: müşteri adı hem başlıkta hem gövdede.
    const m = '[3] {{musteri_adi}} A.Ş.\n[17] Saygılarımızla, {{musteri_adi}}';
    expect(yerTutuculariBul(m)).toEqual([
      {
        ad: 'musteri_adi',
        gecisler: [
          { birim: 3, hamMetin: '{{musteri_adi}}' },
          { birim: 17, hamMetin: '{{musteri_adi}}' },
        ],
      },
    ]);
  });

  it('aynı birimde AYNI yazım iki kez geçerse tek geçiş', () => {
    // Uygulama katmanı bir birimdeki tüm eşleşmeleri birlikte değiştiriyor,
    // ikinci bir düzenleme üretmek gereksiz.
    const s = yerTutuculariBul('[5] {{ad}} ve yine {{ad}}');
    expect(s[0].gecisler).toEqual([{ birim: 5, hamMetin: '{{ad}}' }]);
  });

  it('aynı birimde FARKLI yazım iki geçiş üretir', () => {
    // "{{ad}}" ve "{{ ad }}" aynı alan ama farklı ham metin: ayrı `find` şart,
    // yoksa biri sessizce doldurulmadan kalır.
    const s = yerTutuculariBul('[5] {{ad}} ve {{ ad }}');
    expect(s).toHaveLength(1);
    expect(s[0].ad).toBe('ad');
    expect(s[0].gecisler).toEqual([
      { birim: 5, hamMetin: '{{ad}}' },
      { birim: 5, hamMetin: '{{ ad }}' },
    ]);
  });

  it('adı kırpar, ham metni olduğu gibi saklar', () => {
    const s = yerTutuculariBul('[1] {{  musteri adi  }}');
    expect(s[0].ad).toBe('musteri adi');
    expect(s[0].gecisler[0].hamMetin).toBe('{{  musteri adi  }}');
  });

  it('Türkçe harf ve boşluk içeren adı kabul eder', () => {
    expect(yerTutuculariBul('[2] {{Müşteri Adı}}')[0].ad).toBe('Müşteri Adı');
  });

  it('boş yer tutucuyu yok sayar', () => {
    expect(yerTutuculariBul('[1] {{}} ve {{   }}')).toEqual([]);
  });

  it('pptx ve xlsx başlık satırlarını atlar', () => {
    const m = '--- Slayt 2 ---\n[7] {{baslik}}\n--- Sayfa: Ocak ---\n[4] B2 = {{ad}}';
    expect(yerTutuculariBul(m).map((y) => y.ad)).toEqual(['baslik', 'ad']);
  });

  it('xlsx satırında hücre adresini değil BİRİM numarasını kullanır', () => {
    expect(yerTutuculariBul('[4] B2 = {{ad}}')[0].gecisler[0].birim).toBe(4);
  });

  it('yer tutucusuz metinde boş dizi döner', () => {
    expect(yerTutuculariBul('[1] Düz metin\n[2] Başka satır')).toEqual([]);
  });

  it('ilk görülme sırasını korur', () => {
    const m = '[1] {{b}}\n[2] {{a}}';
    expect(yerTutuculariBul(m).map((y) => y.ad)).toEqual(['b', 'a']);
  });
});

describe('degerleriDuzenlemeyeCevir', () => {
  const YT = [
    {
      ad: 'musteri_adi',
      gecisler: [
        { birim: 3, hamMetin: '{{musteri_adi}}' },
        { birim: 17, hamMetin: '{{musteri_adi}}' },
      ],
    },
    { ad: 'tarih', gecisler: [{ birim: 5, hamMetin: '{{ tarih }}' }] },
  ];

  it('her geçiş için bir düzenleme üretir', () => {
    const d = degerleriDuzenlemeyeCevir(YT, { musteri_adi: 'Örnek A.Ş.', tarih: '20.08.2026' });
    expect(d).toEqual([
      { paragraph: 3, find: '{{musteri_adi}}', replace: 'Örnek A.Ş.', reason: 'musteri_adi' },
      { paragraph: 17, find: '{{musteri_adi}}', replace: 'Örnek A.Ş.', reason: 'musteri_adi' },
      { paragraph: 5, find: '{{ tarih }}', replace: '20.08.2026', reason: 'tarih' },
    ]);
  });

  it('find olarak HAM metni kullanır, kırpılmış adı değil', () => {
    // Kırpılmış ad kullanılsaydı "{{ tarih }}" eşleşmez, alan sessizce boş kalırdı.
    const d = degerleriDuzenlemeyeCevir(YT, { tarih: '20.08.2026' });
    expect(d[0].find).toBe('{{ tarih }}');
  });

  it('karşılığı olmayan alanı atlar — belgede yer tutucu görünür kalır', () => {
    const d = degerleriDuzenlemeyeCevir(YT, { tarih: '20.08.2026' });
    expect(d.map((e) => e.reason)).toEqual(['tarih']);
  });

  it('değeri boş dize olan alanı atlar', () => {
    // Yer tutucuyu silmek yerine görünür bırakmak daha dürüst: kullanıcı
    // neyin doldurulmadığını görür.
    expect(degerleriDuzenlemeyeCevir(YT, { musteri_adi: '', tarih: '  ' })).toEqual([]);
  });

  it('şablonda olmayan anahtarı yok sayar', () => {
    const d = degerleriDuzenlemeyeCevir(YT, { alakasiz: 'X', tarih: '1.1.2026' });
    expect(d).toHaveLength(1);
    expect(d[0].reason).toBe('tarih');
  });

  it('yer tutucu yoksa boş dizi döner', () => {
    expect(degerleriDuzenlemeyeCevir([], { a: 'b' })).toEqual([]);
  });
});

describe('degerleriCoz', () => {
  const yanit = (args: string) => ({
    choices: [{ message: { tool_calls: [{ function: { name: 'sablon_doldur', arguments: args } }] } }],
  });

  it('araç argümanından değer eşlemesini çıkarır', () => {
    expect(degerleriCoz(yanit('{"degerler":{"ad":"Örnek A.Ş.","tarih":"20.08.2026"}}')))
      .toEqual({ ad: 'Örnek A.Ş.', tarih: '20.08.2026' });
  });

  it('dize olmayan değerleri atar', () => {
    // Model sayı/null üretebiliyor; DocumentEdit.replace dize olmak zorunda.
    expect(degerleriCoz(yanit('{"degerler":{"a":"X","b":5,"c":null}}'))).toEqual({ a: 'X' });
  });

  it('bozuk JSON argümanda çökmez, boş döner', () => {
    expect(degerleriCoz(yanit('{bozuk'))).toEqual({});
  });

  it('degerler alanı yoksa boş döner', () => {
    expect(degerleriCoz(yanit('{"baska":1}'))).toEqual({});
  });

  it('araç çağrılmadıysa boş döner', () => {
    expect(degerleriCoz({ choices: [{ message: { content: 'merhaba' } }] })).toEqual({});
  });

  it('başka bir araç çağrıldıysa boş döner', () => {
    const y = { choices: [{ message: { tool_calls: [{ function: { name: 'baska', arguments: '{}' } }] } }] };
    expect(degerleriCoz(y)).toEqual({});
  });

  it('null/undefined girdide çökmez', () => {
    expect(degerleriCoz(null)).toEqual({});
    expect(degerleriCoz(undefined)).toEqual({});
  });
});
