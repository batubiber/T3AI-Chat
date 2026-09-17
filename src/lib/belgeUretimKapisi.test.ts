import { describe, it, expect } from 'vitest';
import { TUR_ETIKETI, BELGE_URET_ARACI } from './belgeUretimKapisi';

describe('TUR_ETIKETI', () => {
  it('her tür için boş olmayan bir etiket verir', () => {
    // Boş etiket bildirimde açıklamayı görünmez yapar — tsc bunu yakalamaz,
    // Record<UretimTuru,string> yalnız ANAHTARIN varlığını zorunlu kılıyor.
    for (const tur of ['docx', 'xlsx', 'pptx'] as const) {
      expect(TUR_ETIKETI[tur].trim().length).toBeGreaterThan(0);
    }
  });
});


describe('BELGE_URET_ARACI', () => {
  it('ÜÇ FORMAT DA enum\'da', () => {
    // Eksik kalan format erişilemez oluyor: model şemayı okuyup karar veriyor.
    expect(BELGE_URET_ARACI.function.parameters.properties.tur.enum)
      .toEqual(['docx', 'xlsx', 'pptx']);
  });

  it('AÇIKLAMADA da üçü geçiyor — enum tek başına yetmiyor', () => {
    // Gerçekten yaşandı: enum'a pptx eklendi ama açıklama sunumdan
    // bahsetmiyordu ve "bana sunum hazırla" isteğinde araç hiç çağrılmadı.
    // Model önce açıklamayı okuyup aracın uygulanıp uygulanmadığına karar
    // veriyor.
    const a = BELGE_URET_ARACI.function.description.toLocaleLowerCase('tr');
    expect(a).toContain('word');
    expect(a).toContain('excel');
    expect(a).toContain('sunum');
  });

  it('dosya adı için başlık İSTENİYOR ve kısa tutulması söyleniyor', () => {
    // Başlık gelmezse dosya adı "belge-2026-08-26" gibi anlamsız çıkıyordu.
    expect(BELGE_URET_ARACI.function.parameters.required).toContain('baslik');
    expect(BELGE_URET_ARACI.function.parameters.properties.baslik.description)
      .toMatch(/5 kelime/);
  });

  it('araç adı akıştaki çözümleyiciyle AYNI', () => {
    // ChatContext bu adı arıyor; ad değişirse araç çağrısı sessizce
    // görmezden gelinir ve belge hiç üretilmez.
    expect(BELGE_URET_ARACI.function.name).toBe('belge_uret');
  });
});
