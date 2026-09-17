import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TurButcesi, TurSiniri } from './turButcesi';
import { modelUcunaGonder } from '../modelIstegi';
import { modelAdiniUnut } from '../sunucuModelAdi';
import { modelGirdisiniKur } from './modelGirdisi';
import type { DevamMesaji } from './tipler';

beforeEach(() => { vi.useFakeTimers(); modelAdiniUnut(); });
afterEach(() => { vi.useRealTimers(); modelAdiniUnut(); });
const govde = { messages: [{ role: 'user', content: 'Deneme' }], max_tokens: 100 };

it('bütçe dolunca yardımcı/model çağrısı ağa çıkmadan engellenir', async () => {
  const fetch = vi.fn(async () => new Response('{}'));
  vi.stubGlobal('fetch', fetch);
  const butce = new TurButcesi(new AbortController().signal, { modelIstegi: 1 });
  await modelUcunaGonder('glm-5.2', govde, { butce, signal: butce.signal });
  await expect(modelUcunaGonder('glm-5.2', govde, { butce, signal: butce.signal })).rejects.toBeInstanceOf(TurSiniri);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('404 model adı onarımı da çağrı bütçesine tabidir', async () => {
  const fetch = vi.fn(async (url: string) => url.endsWith('/models')
    ? new Response(JSON.stringify({ data: [{ id: 'gemma4-31b' }] })) : new Response('{}', { status: 404 }));
  vi.stubGlobal('fetch', fetch);
  const butce = new TurButcesi(new AbortController().signal, { modelIstegi: 1 });
  await expect(modelUcunaGonder('gemma-4-31b', govde, { butce, signal: butce.signal })).rejects.toBeInstanceOf(TurSiniri);
  expect(fetch.mock.calls.filter(([url]) => url.endsWith('/chat/completions'))).toHaveLength(1);
});
it('süre dolunca etkin sinyal kesilir; yeni araç başlayamaz', async () => {
  const butce = new TurButcesi(new AbortController().signal, { sureMs: 20 });
  await vi.advanceTimersByTimeAsync(21);
  expect(butce.signal.aborted).toBe(true); expect(() => butce.aracBaslat()).toThrow(TurSiniri);
});
it('bir turun iptali ötekinin sayacını veya sinyalini değiştirmez', () => {
  const c = new AbortController(), a = new TurButcesi(c.signal), b = new TurButcesi(new AbortController().signal);
  a.modelBaslat(govde); c.abort();
  expect(a.signal.aborted).toBe(true); expect(b.signal.aborted).toBe(false);
  expect(b.ozet('tamamlandi').modelIstegi).toBe(0);
});
it('devam çağrısının araç grubu dar bağlamda parçalanmaz ve maliyeti sayılır', () => {
  const devam: DevamMesaji[] = [
    { role: 'assistant', content: '', tool_calls: [{ id: 'a', type: 'function', function: { name: 'belge_uret', arguments: '{"talimat":"özet"}' } }] },
    { role: 'tool', tool_call_id: 'a', content: '{"durum":"basarili","artifactId":"sonuc"}' },
  ];
  const g = { modelId: 'glm-5.2', sistem: 'Sistem', gecmis: [{ role: 'assistant', content: 'eski '.repeat(3000) }, { role: 'user', content: 'Özetle' }], devam, ciktiIstegi: 1024, girdiTavani: 1000 };
  const r = modelGirdisiniKur(g);
  expect(r.messages.slice(-2)).toEqual(devam);
  expect(r.girdiToken).toBeGreaterThan(modelGirdisiniKur({ ...g, devam: [] }).girdiToken);
  expect(() => modelGirdisiniKur({ ...g, devam: [{ ...devam[1], content: 'sonuç '.repeat(20000) }], pencereTavani: 2000 })).toThrow();
});
