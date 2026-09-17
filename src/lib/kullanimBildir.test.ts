import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { kullanimBildir, UYGULAMA_ADI, harnessOlayiBildir, HARNESS_OLAYLARI } from './kullanimBildir';
import { KAYIT_YOLU } from './kullanimLog';

const cagri = () => (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];

describe('kullanimBildir', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('uygulama ve modeli başlık olarak yollar', () => {
    kullanimBildir('glm-5.2');
    const [yol, ayar] = cagri();
    expect(yol).toBe(KAYIT_YOLU);
    expect(ayar.method).toBe('POST');
    expect(ayar.headers['X-Uygulama']).toBe(UYGULAMA_ADI);
    expect(ayar.headers['X-Model']).toBe('glm-5.2');
  });

  it('varsayılan uygulama adı t3ai', () => {
    expect(UYGULAMA_ADI).toBe('t3ai');
  });

  it('keepalive AÇIK — sekme kapanırsa istek yine gitsin', () => {
    kullanimBildir('glm-5.2');
    expect(cagri()[1].keepalive).toBe(true);
  });

  it('fetch SENKRON patlarsa ÇAĞIRANA hata sızdırmaz — dış try/catch tutuyor', () => {
    // fetch hiç yoksa ya da çağrı anında fırlatırsa ortada promise doğmaz;
    // burada devreye SADECE dış try/catch girer. Bu test onu iğneler:
    // dış try/catch silinirse bu senaryo çağırana sızar ve test kırmızıya düşer.
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('senkron patlama'); }));
    expect(() => kullanimBildir('glm-5.2')).not.toThrow();
  });

  it('fetch reddederse ÇAĞIRANA sızdırmaz, yakalanmamış red de bırakmaz — iç .catch() tutuyor', async () => {
    // Reddedilen promise dış try/catch'e TAKILMAZ; onu iç .catch() susturur.
    // not.toThrow tek başına bunu kanıtlamaz (red asenkron sızar). O yüzden
    // dinleyici kurup mikro-görev sırası boşaldıktan sonra hiç yakalanmamış
    // red kalmadığını da doğruluyoruz: iç .catch() silinirse red buraya düşer.
    //
    // DİKKAT — stub BİLEREK vi.fn DEĞİL: vi.fn, döndürülen promise'e
    // settledResults takibi için kendi red işleyicisini takıyor (@vitest/spy);
    // bu, reddi "yakalanmış" sayıp testi dişsiz bırakıyordu. Çıplak fonksiyon şart.
    vi.stubGlobal('fetch', () => Promise.reject(new Error('ağ yok')));
    const yakalanmamis: unknown[] = [];
    const dinleyici = (sebep: unknown) => { yakalanmamis.push(sebep); };
    process.on('unhandledRejection', dinleyici);
    try {
      expect(() => kullanimBildir('glm-5.2')).not.toThrow();
      // Node yakalanmamış redleri döngünün bir sonraki turunda bildirir;
      // makro-görevle o turu bekliyoruz.
      await new Promise((coz) => setTimeout(coz, 0));
      expect(yakalanmamis).toEqual([]);
    } finally {
      process.off('unhandledRejection', dinleyici);
    }
  });

  it('model adındaki boru işareti temizlenir — log satırını bölmesin', () => {
    kullanimBildir('kötü|model');
    expect(cagri()[1].headers['X-Model']).not.toContain('|');
  });

  it('model adındaki satır sonları (CR/LF) da temizlenir — log satırı tek satır kalsın', () => {
    kullanimBildir('kötü\rmodel\nadı');
    const modelBasligi = cagri()[1].headers['X-Model'];
    expect(modelBasligi).not.toContain('\r');
    expect(modelBasligi).not.toContain('\n');
    expect(modelBasligi).toBe('kötü_model_adı');
  });

  it('GİZLİLİK BEKÇİSİ: SADECE bu iki başlık gider, gövde YOK', () => {
    // Merkezî log kurum makinesinde duruyor. Oraya YALNIZ sayaç gitmeli:
    // mesaj içeriği, prompt, sohbet başlığı, kullanıcı kimliği ve oturum
    // anahtarı ASLA. Bu test, ileride "şunu da ekleyelim" diyen bir
    // değişikliği kırmızıya düşürsün diye var — silme, genişletme.
    kullanimBildir('glm-5.2');
    const [, ayar] = cagri();
    expect(Object.keys(ayar.headers).sort()).toEqual(['X-Model', 'X-Uygulama']);
    expect(ayar.body).toBeUndefined();
  });
});

describe('harnessOlayiBildir', () => {
  let cagrilar: unknown[][];
  beforeEach(() => {
    cagrilar = [];
    vi.stubGlobal('fetch', (...a: unknown[]) => { cagrilar.push(a); return Promise.resolve(); });
  });
  afterEach(() => vi.unstubAllGlobals());
  const son = () => cagrilar[cagrilar.length - 1] as [string, { headers: Record<string, string>; body?: unknown }];

  it('olayı AYRI bir uygulama adıyla yolluyor — model sayımları kirlenmesin', () => {
    // nginx log biçimi üç alanlı ve dördüncü alan eklemek ayrı bir nginx
    // dağıtımı demek. Var olan uygulama alanını ayırıcı olarak kullanınca
    // biçime hiç dokunmadan olaylar model satırlarından ayrışıyor.
    harnessOlayiBildir('yanit-kesildi');
    expect(son()[1].headers['X-Uygulama']).toBe('t3ai-harness');
    expect(son()[1].headers['X-Model']).toBe('yanit-kesildi');
  });

  it('GİZLİLİK BEKÇİSİ: sadece iki başlık, gövde YOK', () => {
    harnessOlayiBildir('tasma-telafisi');
    const [, ayar] = son();
    expect(Object.keys(ayar.headers).sort()).toEqual(['X-Model', 'X-Uygulama']);
    expect(ayar.body).toBeUndefined();
  });

  it('olay adları KAPALI kümeden — serbest metin geçemesin', () => {
    // Tip düzeyinde kapalı; burada çalışma zamanında da kapalı olduğu
    // doğrulanıyor. Serbest metne izin verilseydi bir gün oraya mesaj
    // içeriği koyan bir çağrı sızabilirdi.
    // Bu liste BİLEREK elle yazılı: yeni bir olay eklemek bu satırı da
    // değiştirmeyi gerektirsin ki küme sessizce büyümesin.
    expect(HARNESS_OLAYLARI).toEqual([
      'yanit-kesildi',
      'tasma-telafisi',
      'yedek-model',
      'model-adi-degisti',
    ]);
    harnessOlayiBildir('bilinmeyen-olay' as never);
    expect(cagrilar).toHaveLength(0);
  });

  it('fetch patlarsa çağırana sızdırmıyor', () => {
    vi.stubGlobal('fetch', () => { throw new Error('ağ yok'); });
    expect(() => harnessOlayiBildir('yanit-kesildi')).not.toThrow();
  });
});
