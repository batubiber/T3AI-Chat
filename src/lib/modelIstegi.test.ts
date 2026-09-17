import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { modelUcunaGonder } from './modelIstegi';
import { modelAdiniUnut } from './sunucuModelAdi';

const SOHBET = '/vllm-8000/v1/chat/completions';
const LISTE = '/vllm-8000/v1/models';

function yanit(status: number, govde: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => govde };
}

/** Yalnız model ucuna giden POST'lar — telemetri istekleri sayıma karışmasın. */
function sohbetCagrilari(sahte: ReturnType<typeof vi.fn>) {
  return sahte.mock.calls.filter((c) => c[0] === SOHBET);
}

function gonderilenModel(cagri: unknown[]): string {
  return JSON.parse((cagri[1] as { body: string }).body).model;
}

describe('modelUcunaGonder', () => {
  beforeEach(() => {
    modelAdiniUnut();
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => modelAdiniUnut());

  it('mutlu yolda TEK istek atar ve fazladan sorgu yapmaz', async () => {
    const sahte = vi.fn().mockResolvedValue(yanit(200));
    vi.stubGlobal('fetch', sahte);

    const r = await modelUcunaGonder('gemma-4-31b', { messages: [] });

    expect(r.status).toBe(200);
    expect(sohbetCagrilari(sahte)).toHaveLength(1);
    expect(gonderilenModel(sohbetCagrilari(sahte)[0])).toBe('gemma-4-31b');
    // Gecikme şartı: liste ucu mutlu yolda HİÇ sorulmuyor.
    expect(sahte.mock.calls.some((c) => c[0] === LISTE)).toBe(false);
  });

  it('404 gelince gerçek adı öğrenip isteği bir kez yeniler', async () => {
    const sahte = vi.fn().mockImplementation((url: string) => {
      if (url === LISTE) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: [{ id: 'gemma4-31b' }, { id: 'baska-model' }] }),
        });
      }
      const cagri = sohbetCagrilari(sahte).length;
      return Promise.resolve(cagri === 1 ? yanit(404) : yanit(200, { ok: true }));
    });
    vi.stubGlobal('fetch', sahte);

    const r = await modelUcunaGonder('gemma-4-31b', { messages: [] });

    expect(r.status).toBe(200);
    const cagrilar = sohbetCagrilari(sahte);
    expect(cagrilar).toHaveLength(2);
    expect(gonderilenModel(cagrilar[0])).toBe('gemma-4-31b');
    expect(gonderilenModel(cagrilar[1])).toBe('gemma4-31b');
  });

  it('çözülen ad SAKLANIR: sonraki istek doğrudan doğru adla gider', async () => {
    const sahte = vi.fn().mockImplementation((url: string) => {
      if (url === LISTE) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [{ id: 'gemma4-31b' }] }) });
      }
      return Promise.resolve(sohbetCagrilari(sahte).length === 1 ? yanit(404) : yanit(200));
    });
    vi.stubGlobal('fetch', sahte);

    await modelUcunaGonder('gemma-4-31b', { messages: [] });
    const oncekiSorgu = sahte.mock.calls.filter((c) => c[0] === LISTE).length;

    await modelUcunaGonder('gemma-4-31b', { messages: [] });

    const cagrilar = sohbetCagrilari(sahte);
    expect(gonderilenModel(cagrilar[cagrilar.length - 1])).toBe('gemma4-31b');
    // İkinci turda liste ucu bir daha sorulmadı.
    expect(sahte.mock.calls.filter((c) => c[0] === LISTE)).toHaveLength(oncekiSorgu);
  });

  it('ad çözülemezse 404 yanıtını olduğu gibi verir, tekrar denemez', async () => {
    const sahte = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(url === LISTE ? { ok: false, status: 404 } : yanit(404)),
    );
    vi.stubGlobal('fetch', sahte);

    const r = await modelUcunaGonder('gemma-4-31b', { messages: [] });

    expect(r.status).toBe(404);
    expect(sohbetCagrilari(sahte)).toHaveLength(1);
  });

  it('404 DIŞINDAKİ hatada liste ucunu hiç sormaz', async () => {
    // 500 = model ayakta ama üretim patladı; taşma telafisi ve yedek model
    // devreye girecek, ad çözümlemesinin orada işi yok.
    const sahte = vi.fn().mockResolvedValue(yanit(500));
    vi.stubGlobal('fetch', sahte);

    const r = await modelUcunaGonder('gemma-4-31b', { messages: [] });

    expect(r.status).toBe(500);
    expect(sahte.mock.calls.some((c) => c[0] === LISTE)).toBe(false);
  });

  it('gövdedeki model alanını çağıran değil sarmalayıcı belirler', async () => {
    const sahte = vi.fn().mockResolvedValue(yanit(200));
    vi.stubGlobal('fetch', sahte);

    await modelUcunaGonder('gemma-4-31b', { model: 'elle-yazilmis', messages: [] });

    expect(gonderilenModel(sohbetCagrilari(sahte)[0])).toBe('gemma-4-31b');
  });

  it('çağıranın başlıklarını korur ve Content-Type ekler', async () => {
    const sahte = vi.fn().mockResolvedValue(yanit(200));
    vi.stubGlobal('fetch', sahte);

    await modelUcunaGonder('gemma-4-31b', { messages: [] }, { headers: { 'X-Deneme': 'evet' } });

    const ayar = sohbetCagrilari(sahte)[0][1] as { headers: Record<string, string>; method: string };
    expect(ayar.method).toBe('POST');
    expect(ayar.headers['Content-Type']).toBe('application/json');
    expect(ayar.headers['X-Deneme']).toBe('evet');
  });
});
