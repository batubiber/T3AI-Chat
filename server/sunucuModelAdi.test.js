// vitest 4 CommonJS'ten require('vitest') edilmeyi REDDEDİYOR; bu tek satır
// ESM import olmak zorunda. Test edilen modül CommonJS kaldığı için aşağıda
// require kullanılmaya devam ediliyor.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
const {
  modelAdiSec,
  sunucuModelAdi,
  modelUcunaGonder,
  modelAdiniUnut,
} = require('./sunucuModelAdi');

const SOHBET = 'http://vllm.example:8000/v1/chat/completions';
const LISTE = 'http://vllm.example:8000/v1/models';

function yanit(status) {
  return { ok: status >= 200 && status < 300, status, json: async () => ({}) };
}

function sohbetCagrilari(sahte) {
  return sahte.mock.calls.filter((c) => c[0] === SOHBET);
}

function gonderilenModel(cagri) {
  return JSON.parse(cagri[1].body).model;
}

describe('modelAdiSec (backend)', () => {
  it('CANLI VAKA: gemma-4-31b isteğini gemma4-31b adına eşler', () => {
    const veri = { data: [{ id: 'gemma4-31b' }, { id: 'baska-model' }] };
    expect(modelAdiSec(veri, 'gemma-4-31b')).toBe('gemma4-31b');
  });

  it('tam eşleşme varsa onu bırakır', () => {
    expect(modelAdiSec({ data: [{ id: 'gemma-4-31b' }] }, 'gemma-4-31b')).toBe('gemma-4-31b');
  });

  it('eşleşme yoksa ilk taban modeli seçer, LoRA adaptörünü atlar', () => {
    const veri = { data: [{ id: 'lora-x', parent: 'taban' }, { id: 'taban' }] };
    expect(modelAdiSec(veri, 'bambaska')).toBe('taban');
  });

  it('bozuk yanıtta null döner', () => {
    expect(modelAdiSec(null, 'x')).toBeNull();
    expect(modelAdiSec({ data: [] }, 'x')).toBeNull();
    expect(modelAdiSec({ data: [{}] }, 'x')).toBeNull();
  });
});

describe('modelUcunaGonder (backend)', () => {
  beforeEach(() => {
    modelAdiniUnut();
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => modelAdiniUnut());

  it('mutlu yolda tek istek, liste ucu sorulmaz', async () => {
    const sahte = vi.fn().mockResolvedValue(yanit(200));
    vi.stubGlobal('fetch', sahte);

    const r = await modelUcunaGonder(SOHBET, 'gemma-4-31b', { messages: [] });

    expect(r.status).toBe(200);
    expect(sahte).toHaveBeenCalledTimes(1);
    expect(gonderilenModel(sahte.mock.calls[0])).toBe('gemma-4-31b');
  });

  it('404 gelince adı çözüp bir kez yeniler, sonra adı hatırlar', async () => {
    const sahte = vi.fn().mockImplementation((url) => {
      if (url === LISTE) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [{ id: 'gemma4-31b' }] }) });
      }
      return Promise.resolve(sohbetCagrilari(sahte).length === 1 ? yanit(404) : yanit(200));
    });
    vi.stubGlobal('fetch', sahte);

    const r = await modelUcunaGonder(SOHBET, 'gemma-4-31b', { messages: [] });
    expect(r.status).toBe(200);
    expect(gonderilenModel(sohbetCagrilari(sahte)[1])).toBe('gemma4-31b');
    expect(sunucuModelAdi(SOHBET, 'gemma-4-31b')).toBe('gemma4-31b');

    // İkinci istek doğrudan doğru adla; liste ucu bir daha sorulmuyor.
    const listeSayisi = sahte.mock.calls.filter((c) => c[0] === LISTE).length;
    await modelUcunaGonder(SOHBET, 'gemma-4-31b', { messages: [] });
    expect(sahte.mock.calls.filter((c) => c[0] === LISTE)).toHaveLength(listeSayisi);
  });

  it('ad çözülemezse 404 yanıtını olduğu gibi verir', async () => {
    const sahte = vi.fn().mockImplementation((url) =>
      Promise.resolve(url === LISTE ? { ok: false, status: 500 } : yanit(404)),
    );
    vi.stubGlobal('fetch', sahte);

    const r = await modelUcunaGonder(SOHBET, 'gemma-4-31b', { messages: [] });
    expect(r.status).toBe(404);
    expect(sohbetCagrilari(sahte)).toHaveLength(1);
  });

  it('404 dışındaki hatada liste ucunu sormaz', async () => {
    const sahte = vi.fn().mockResolvedValue(yanit(503));
    vi.stubGlobal('fetch', sahte);

    const r = await modelUcunaGonder(SOHBET, 'gemma-4-31b', { messages: [] });
    expect(r.status).toBe(503);
    expect(sahte).toHaveBeenCalledTimes(1);
  });
});

it('iptal sonrası 404 keşfi ve ikinci model çağrısı yapılmaz', async () => {
  modelAdiniUnut();
  const controller = new AbortController();
  const sahte = vi.fn(async () => { controller.abort(); return { status: 404 }; });
  vi.stubGlobal('fetch', sahte);
  await expect(modelUcunaGonder(SOHBET, 'gemma-4-31b', {}, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  expect(sahte).toHaveBeenCalledOnce();
});

it('model listesi beklerken iptal üst çağrıya taşınır', async () => {
  modelAdiniUnut();
  const controller = new AbortController();
  let basladi;
  const baslama = new Promise((resolve) => { basladi = resolve; });
  const sahte = vi.fn(async (url, init) => {
    if (url === SOHBET) return { status: 404 };
    basladi();
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }));
  });
  vi.stubGlobal('fetch', sahte);
  const sonuc = modelUcunaGonder(SOHBET, 'gemma-4-31b', {}, { signal: controller.signal });
  await baslama;
  controller.abort();
  await expect(sonuc).rejects.toMatchObject({ name: 'AbortError' });
  expect(sahte).toHaveBeenCalledTimes(2);
});
