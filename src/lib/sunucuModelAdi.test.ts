import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { modelAdiSec, sunucuModelAdi, modelAdiniCoz, modelAdiniUnut } from './sunucuModelAdi';

/** vLLM'in /v1/models yanıtı gibi bir kart üretir. */
function kart(id: string, parent: string | null = null) {
  return { id, object: 'model', created: 1700000000, owned_by: 'vllm', parent };
}

function liste(...kartlar: ReturnType<typeof kart>[]) {
  return { object: 'list', data: kartlar };
}

describe('modelAdiSec', () => {
  it('tam eşleşmeyi olduğu gibi döndürür', () => {
    expect(modelAdiSec(liste(kart('gemma-4-31b')), 'gemma-4-31b')).toBe('gemma-4-31b');
  });

  it('CANLI VAKA: tiresiz ada eşler (gemma4-31b ↔ gemma-4-31b)', () => {
    // 2026-09-01'de üretim sunucusunda gerçekten olan şey: ad `gemma4-31b` yapıldı ve
    // yanına `baska-model` eklendi; uygulama `gemma-4-31b` gönderiyordu.
    const veri = liste(kart('gemma4-31b'), kart('baska-model'));
    expect(modelAdiSec(veri, 'gemma-4-31b')).toBe('gemma4-31b');
  });

  it('takma ad listesinde sıra fark etmez', () => {
    const veri = liste(kart('baska-model'), kart('gemma4-31b'));
    expect(modelAdiSec(veri, 'gemma-4-31b')).toBe('gemma4-31b');
  });

  it('hiçbiri eşleşmezse ilk taban modeli seçer', () => {
    // Tek vLLM portu aynı ağırlıkları servis eder; herhangi biri gider.
    expect(modelAdiSec(liste(kart('bambaska-ad')), 'gemma-4-31b')).toBe('bambaska-ad');
  });

  it('eşleşme yokken LoRA adaptörünü taban modele tercih ETMEZ', () => {
    const veri = liste(kart('hukuk-lora', 'taban-model'), kart('taban-model'));
    expect(modelAdiSec(veri, 'gemma-4-31b')).toBe('taban-model');
  });

  it('adaptör eşleşiyorsa yine de onu seçer', () => {
    // Kullanıcı bilerek adaptörü yapılandırmışsa tercihi ezilmemeli.
    const veri = liste(kart('taban-model'), kart('hukuk-lora', 'taban-model'));
    expect(modelAdiSec(veri, 'hukuk_lora')).toBe('hukuk-lora');
  });

  it('boş / bozuk yanıtta null döner', () => {
    expect(modelAdiSec(null, 'gemma-4-31b')).toBeNull();
    expect(modelAdiSec({}, 'gemma-4-31b')).toBeNull();
    expect(modelAdiSec({ data: 'liste değil' }, 'gemma-4-31b')).toBeNull();
    expect(modelAdiSec(liste(), 'gemma-4-31b')).toBeNull();
    expect(modelAdiSec({ data: [{ nesne: 'id yok' }] }, 'gemma-4-31b')).toBeNull();
    expect(modelAdiSec({ data: [{ id: '   ' }] }, 'gemma-4-31b')).toBeNull();
  });
});

describe('sunucuModelAdi / modelAdiniCoz', () => {
  beforeEach(() => {
    modelAdiniUnut();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    modelAdiniUnut();
  });

  it('çözülmemişken yapılandırmadaki kimliği döndürür', () => {
    expect(sunucuModelAdi('gemma-4-31b')).toBe('gemma-4-31b');
  });

  it('çözdükten sonra yeni adı döndürür ve saklar', async () => {
    const sahte = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => liste(kart('gemma4-31b'), kart('baska-model')),
    });
    vi.stubGlobal('fetch', sahte);

    await expect(modelAdiniCoz('gemma-4-31b')).resolves.toBe('gemma4-31b');
    expect(sunucuModelAdi('gemma-4-31b')).toBe('gemma4-31b');
    expect(sahte).toHaveBeenCalledWith('/vllm-8000/v1/models', expect.anything());
  });

  it('zaten kullandığımız ad çıkarsa null döner (yenileme yapılmasın)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => liste(kart('gemma-4-31b')) }),
    );
    await expect(modelAdiniCoz('gemma-4-31b')).resolves.toBeNull();
  });

  it('liste ucu 404/500 dönerse sessizce vazgeçer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(modelAdiniCoz('gemma-4-31b')).resolves.toBeNull();
  });

  it('ağ hatasında patlamaz', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('bağlantı yok')));
    await expect(modelAdiniCoz('gemma-4-31b')).resolves.toBeNull();
  });

  it('eşzamanlı iki çağrı sunucuya TEK istek atar', async () => {
    const sahte = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => liste(kart('gemma4-31b')),
    });
    vi.stubGlobal('fetch', sahte);

    const [a, b] = await Promise.all([modelAdiniCoz('gemma-4-31b'), modelAdiniCoz('gemma-4-31b')]);
    expect(a).toBe('gemma4-31b');
    expect(b).toBe('gemma4-31b');
    expect(sahte).toHaveBeenCalledTimes(1);
  });

  it('unutulduktan sonra yeniden yapılandırmadaki kimliğe döner', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => liste(kart('gemma4-31b')) }),
    );
    await modelAdiniCoz('gemma-4-31b');
    expect(sunucuModelAdi('gemma-4-31b')).toBe('gemma4-31b');
    modelAdiniUnut('gemma-4-31b');
    expect(sunucuModelAdi('gemma-4-31b')).toBe('gemma-4-31b');
  });
});
