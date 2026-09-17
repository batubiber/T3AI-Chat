import { describe, it, expect } from 'vitest';
import { markdownBloklara } from './belgeIcerik';

describe('markdownBloklara', () => {
  it('başlıkları seviyesiyle çözer', () => {
    const { bloklar } = markdownBloklara('# Birinci\n\n## İkinci\n\n### Üçüncü');
    expect(bloklar).toEqual([
      { tip: 'baslik', seviye: 1, metin: 'Birinci' },
      { tip: 'baslik', seviye: 2, metin: 'İkinci' },
      { tip: 'baslik', seviye: 3, metin: 'Üçüncü' },
    ]);
  });

  it('4. seviye ve altını 3 ile sınırlar — styles.xml üç başlık tanımlıyor', () => {
    const { bloklar } = markdownBloklara('#### Dört\n\n##### Beş');
    expect(bloklar).toEqual([
      { tip: 'baslik', seviye: 3, metin: 'Dört' },
      { tip: 'baslik', seviye: 3, metin: 'Beş' },
    ]);
  });

  it('başlıkta çok çocuklu metni düz birleştirir — biçim atılır, metin kalır', () => {
    const { bloklar } = markdownBloklara('# Bir **iki**');
    expect(bloklar).toEqual([{ tip: 'baslik', seviye: 1, metin: 'Bir iki' }]);
  });

  it('paragrafta kalın ve italik parçaları AYIRIR', () => {
    const { bloklar } = markdownBloklara('Bu **kalın** ve *italik* metin.');
    expect(bloklar).toEqual([{
      tip: 'paragraf',
      parcalar: [
        { metin: 'Bu ' },
        { metin: 'kalın', kalin: true },
        { metin: ' ve ' },
        { metin: 'italik', italik: true },
        { metin: ' metin.' },
      ],
    }]);
  });

  it('iç içe biçimlendirmede bayraklar BİRLEŞİR — kalın içindeki italik ikisini de taşır', () => {
    const { bloklar } = markdownBloklara('**kalın *ve italik***');
    expect(bloklar).toEqual([{
      tip: 'paragraf',
      parcalar: [
        { metin: 'kalın ', kalin: true },
        { metin: 've italik', kalin: true, italik: true },
      ],
    }]);
  });

  it('iç içe listede SEVİYE korunur', () => {
    const { bloklar } = markdownBloklara('- birinci\n- ikinci\n  - iç madde');
    expect(bloklar).toEqual([{
      tip: 'liste',
      sirali: false,
      ogeler: [
        { metin: 'birinci', seviye: 0 },
        { metin: 'ikinci', seviye: 0 },
        { metin: 'iç madde', seviye: 1 },
      ],
    }]);
  });

  it('sıralı listeyi işaretler', () => {
    const { bloklar } = markdownBloklara('1. bir\n2. iki');
    expect(bloklar).toEqual([{
      tip: 'liste',
      sirali: true,
      ogeler: [{ metin: 'bir', seviye: 0 }, { metin: 'iki', seviye: 0 }],
    }]);
  });

  it('tabloyu başlık ve satır olarak ayırır', () => {
    const { bloklar } = markdownBloklara('| Kalem | Tutar |\n|---|---:|\n| Motor | 1250 |\n| Kanat | 90 |');
    expect(bloklar).toEqual([{
      tip: 'tablo',
      basliklar: ['Kalem', 'Tutar'],
      satirlar: [['Motor', '1250'], ['Kanat', '90']],
    }]);
  });

  it('kod bloğunu ATMAZ, paragrafa çevirir — model kod yazarsa kaybolmasın', () => {
    const { bloklar, atlanan } = markdownBloklara('```js\nconst a = 1;\n```');
    expect(bloklar).toEqual([{ tip: 'paragraf', parcalar: [{ metin: 'const a = 1;' }] }]);
    expect(atlanan).toBe(0);
  });

  it('desteklenmeyen düğümü atlar ve SAYAR', () => {
    const { bloklar, atlanan } = markdownBloklara('Metin\n\n![alt](resim.png)\n\n---');
    // görsel satır-içi sayaçtan (1), yatay çizgi blok düzeyinden (1) gelir — ÖLÇÜLDÜ: 2
    expect(atlanan).toBe(2);
    expect(bloklar.some((b) => b.tip === 'paragraf')).toBe(true);
  });

  it('metinle karışık satır-içi görseli düşürür ama SAYAR — sessiz kayıp yok', () => {
    const { bloklar, atlanan } = markdownBloklara('Önce metin ![alt](resim.png) sonra metin.');
    expect(bloklar).toEqual([{
      tip: 'paragraf',
      parcalar: [{ metin: 'Önce metin ' }, { metin: ' sonra metin.' }],
    }]);
    expect(atlanan).toBe(1);
  });

  it('bağlantı ve üstü çizili gibi kapsayıcıları SAYMAZ — görünür metinleri korunur', () => {
    const { bloklar, atlanan } = markdownBloklara('[bağlantı](https://x.example) ve ~~üstü çizili~~ metin');
    expect(bloklar).toEqual([{
      tip: 'paragraf',
      parcalar: [
        { metin: 'bağlantı' },
        { metin: ' ve ' },
        { metin: 'üstü çizili' },
        { metin: ' metin' },
      ],
    }]);
    expect(atlanan).toBe(0);
  });

  it('boş girdide boş sonuç, çökme yok', () => {
    expect(markdownBloklara('')).toEqual({ bloklar: [], atlanan: 0 });
    expect(markdownBloklara('   \n\n  ')).toEqual({ bloklar: [], atlanan: 0 });
  });

  it('Türkçe karakterler bozulmadan geçer', () => {
    const { bloklar } = markdownBloklara('# Çeyrek Değerlendirmesi ğüşıöç İĞÜŞÖÇ');
    expect(bloklar[0]).toEqual({ tip: 'baslik', seviye: 1, metin: 'Çeyrek Değerlendirmesi ğüşıöç İĞÜŞÖÇ' });
  });
});
