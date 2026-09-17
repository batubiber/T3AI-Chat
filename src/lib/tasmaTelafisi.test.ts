import { describe, it, expect } from 'vitest';
import { baglamTasmasiMi, govdedeTasmaVarMi, telafiTavani, TELAFI_ORANI } from './tasmaTelafisi';
import { butceyeSigdir } from './baglamButcesi';

describe('baglamTasmasiMi', () => {
  it('vLLM\'in gerçek hata metnini tanıyor', () => {
    expect(baglamTasmasiMi(
      "This model's maximum context length is 32768 tokens. However, you requested 35120 tokens",
    )).toBe(true);
  });

  it('OpenAI uyumlu hata kodunu tanıyor', () => {
    expect(baglamTasmasiMi('context_length_exceeded')).toBe(true);
  });

  it('Anthropic biçimini tanıyor', () => {
    expect(baglamTasmasiMi('prompt is too long: 210000 tokens > 200000 maximum')).toBe(true);
  });

  it('büyük/küçük harf farkı gözetmiyor', () => {
    expect(baglamTasmasiMi('MAXIMUM CONTEXT LENGTH exceeded')).toBe(true);
  });

  it('ALAKASIZ hatalarda telafi denemiyor', () => {
    // Yanlış tanıma, isteği ikinci kez göndermek ve kullanıcıya yanlış
    // gerekçe söylemek demek olurdu.
    expect(baglamTasmasiMi('Unknown error')).toBe(false);
    expect(baglamTasmasiMi('validation_failed')).toBe(false);
    expect(baglamTasmasiMi('HTTP error 502')).toBe(false);
    expect(baglamTasmasiMi('Model şu anda meşgul')).toBe(false);
  });

  it('boş gövdede telafi yok', () => {
    expect(baglamTasmasiMi('')).toBe(false);
    expect(baglamTasmasiMi(null)).toBe(false);
    expect(baglamTasmasiMi(undefined)).toBe(false);
  });
});

describe('telafiTavani', () => {
  it('tavanı belirgin şekilde daraltıyor', () => {
    expect(telafiTavani(100000)).toBe(Math.floor(100000 * TELAFI_ORANI));
  });

  it('ORANI 1\'den küçük — yoksa aynı istek tekrar gider', () => {
    expect(TELAFI_ORANI).toBeLessThan(1);
    expect(TELAFI_ORANI).toBeGreaterThan(0);
  });

  it('anlamsız derecede küçük tavan üretmiyor', () => {
    // Çok küçük tavan sistem promptunu bile kesip modele boş bağlam
    // gönderirdi; taşmayı çözer ama cevabı işe yaramaz hale getirirdi.
    expect(telafiTavani(1000)).toBeGreaterThanOrEqual(4000);
    expect(telafiTavani(0)).toBeGreaterThanOrEqual(4000);
  });
});

describe('telafi tavanı bütçeye bağlandığında', () => {
  // Kablolamayı tarayıcıda ölçtük (taşma -> tek ek istek -> uyarı). Burada
  // ölçülen şey mekanizma: daraltılmış tavan GERÇEKTEN daha çok kırpıyor mu.
  const uzunMetin = (n: number) => 'x'.repeat(n);
  const girdi = {
    sistem: uzunMetin(200),
    kararsizParcalar: [uzunMetin(4000), uzunMetin(4000)],
    gecmis: Array.from({ length: 10 }, (_, i) => ({ role: 'user', content: uzunMetin(2000) + i })),
  };
  const uzunluk = (s: { kararsizParcalar: string[]; gecmis: { content: string }[] }) =>
    s.kararsizParcalar.join('').length + s.gecmis.reduce((t, m) => t + m.content.length, 0);

  it('daraltılmış tavan daha çok kırpıyor', () => {
    const TAVAN = 20000;
    const normal = butceyeSigdir({ ...girdi, tavan: TAVAN }, (m) => m.length);
    const telafi = butceyeSigdir({ ...girdi, tavan: telafiTavani(TAVAN) }, (m) => m.length);
    expect(telafiTavani(TAVAN)).toBeLessThan(TAVAN);
    expect(uzunluk(telafi)).toBeLessThan(uzunluk(normal));
  });

  it('daraltmaya rağmen SON kullanıcı mesajı büsbütün atılmıyor', () => {
    // Taşmayı çözmek uğruna kullanıcının az önce yazdığı şeyi silmek,
    // taşmanın kendisinden kötü olurdu.
    const telafi = butceyeSigdir({ ...girdi, tavan: telafiTavani(20000) }, (m) => m.length);
    expect(telafi.gecmis.length).toBeGreaterThan(0);
    expect(telafi.gecmis[telafi.gecmis.length - 1].content.length).toBeGreaterThan(0);
  });
});

describe('govdedeTasmaVarMi — GERÇEK yanıt biçimleri', () => {
  it('backend sarmalayıcısında taşmayı buluyor', () => {
    // server/index.js taşmayı böyle sarıyor: `error` sabit bir Türkçe metin,
    // vLLM'in söylediği şey `details` içinde. İlk sürüm yalnız `error`a
    // bakıyordu ve telafi gerçek dağıtımda HİÇ tetiklenmezdi.
    expect(govdedeTasmaVarMi({
      error: 'AI servisi hatası',
      details: "This model's maximum context length is 32768 tokens. However, you requested 41000",
    })).toBe(true);
  });

  it('doğrudan vLLM biçiminde de buluyor (nginx üzerinden model yolu)', () => {
    expect(govdedeTasmaVarMi({
      error: { message: 'This model\'s maximum context length is 131072 tokens', type: 'invalid_request_error', code: null },
    })).toBe(true);
  });

  it('düz dizge hatada da buluyor', () => {
    expect(govdedeTasmaVarMi({ error: 'context_length_exceeded' })).toBe(true);
  });

  it('BAŞKA bir servis hatasında telafi denemiyor', () => {
    expect(govdedeTasmaVarMi({ error: 'AI servisi hatası', details: 'CUDA out of memory' })).toBe(false);
    expect(govdedeTasmaVarMi({ error: 'validation_failed', message: 'Bu talebi işleyemedim.' })).toBe(false);
  });

  it('okunamayan gövdede telafi yok', () => {
    expect(govdedeTasmaVarMi(null)).toBe(false);
    expect(govdedeTasmaVarMi(undefined)).toBe(false);
    expect(govdedeTasmaVarMi({})).toBe(false);
  });

  it('döngüsel gövdede çökmüyor', () => {
    const a: Record<string, unknown> = { error: 'x' };
    a.kendisi = a;
    expect(govdedeTasmaVarMi(a)).toBe(false);
  });
});
