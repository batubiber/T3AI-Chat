import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { modelUcunaGonder } from '../modelIstegi';
import { modelAdiniCoz, modelAdiniUnut } from '../sunucuModelAdi';
import { streamDocumentEdits } from '../docxEditService';
import { uretimIcerigiIste } from '../belgeUretimKapisi';
import { sablonDegerleriIste } from '../sablonDoldur';
import { istekOmru } from './iptal';
import { baytAkisi, olay, hataYaniti } from './fixtures';
vi.mock('../kullanimBildir', () => ({ kullanimBildir: vi.fn(), harnessOlayiBildir: vi.fn() }));
beforeEach(() => modelAdiniUnut());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const bekle = (signal: AbortSignal) => new Promise<Response>((_resolve, reject) => {
  signal.addEventListener('abort', () => reject(signal.reason), { once: true });
});
const edit = { paragraph: 0, find: 'yanlş', replace: 'yanlış' };

it.each([400, 404, 503] as const)('%i yanıtı sonrasında iptal olursa keşif/retry yapılmaz', async (status) => {
  const c = new AbortController();
  const fetch = vi.fn(async () => { c.abort(); return hataYaniti(status); });
  vi.stubGlobal('fetch', fetch);
  await expect(modelUcunaGonder('glm-5.2', {}, { signal: c.signal })).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetch).toHaveBeenCalledOnce();
});
it('404 keşfi iptal edilir; diğer sohbetin keşfi bağımsız tamamlanır', async () => {
  const a = new AbortController(), b = new AbortController();
  let n = 0;
  const fetch = vi.fn((_url, init) => ++n === 1 ? bekle(init.signal) : Promise.resolve(Response.json({ data: [{ id: 'gemma4-31b' }] })));
  vi.stubGlobal('fetch', fetch);
  const ilk = modelAdiniCoz('gemma-4-31b', a.signal);
  const ikinci = modelAdiniCoz('gemma-4-31b', b.signal);
  a.abort();
  await expect(ilk).rejects.toMatchObject({ name: 'AbortError' });
  expect(await ikinci).toBe('gemma4-31b');
  expect(b.signal.aborted).toBe(false);
});
it('404 keşfi gövde okunurken de 10 saniyede sonlanır', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn((_url, init) => Promise.resolve({ ok: true, json: () => bekle(init.signal) })));
  const sonuc = modelAdiniCoz('gemma-4-31b');
  await vi.advanceTimersByTimeAsync(10000);
  expect(await sonuc).toBeNull();
});
it('belge üretiminin gövdesi beklerken iptal geç yanıtı kabul etmez', async () => {
  const c = new AbortController();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => {
    c.abort(); return { choices: [{ message: { content: '# Geç sonuç' } }] };
  } })));
  await expect(uretimIcerigiIste('rapor', 'docx', 'glm-5.2', 'A', { signal: c.signal })).rejects.toMatchObject({ name: 'AbortError' });
});
it('üretim gövdesi beklerken süre dolar ve timer temizlenir', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => ({ ok: true, status: 200, json: () => bekle(init.signal) })));
  const sonuc = expect(uretimIcerigiIste('rapor', 'docx', 'glm-5.2')).rejects.toThrow('120 saniyede');
  await vi.advanceTimersByTimeAsync(120000);
  await sonuc;
  expect(vi.getTimerCount()).toBe(0);
});
it('şablon çağrısı iptal edilince yedek model denenmez', async () => {
  const c = new AbortController();
  const fetch = vi.fn(async () => { c.abort(); return hataYaniti(503); });
  vi.stubGlobal('fetch', fetch);
  await expect(sablonDegerleriIste(['ad'], 'Ali', 'glm-5.2', 'A', c.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetch).toHaveBeenCalledOnce();
});
it('düzenleme SSE EOF kuyruğundaki son öneriyi de işler', async () => {
  const s = olay({ content: '[' + JSON.stringify(edit) + ']' }, 'stop').trimEnd();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(baytAkisi(s, [7, 19, 37]))));
  const onEdit = vi.fn();
  expect(await streamDocumentEdits('[0] yanlş', 'Düzelt', 'glm-5.2', onEdit)).toEqual({ edits: [edit], truncated: false });
  expect(onEdit).toHaveBeenCalledWith(edit);
});
it('bitiş işareti gelmeyen düzenleme listesi eksik olarak döner', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(baytAkisi(olay({ content: '[' + JSON.stringify(edit) + ',' })))));
  expect(await streamDocumentEdits('[0] yanlş', 'Düzelt', 'glm-5.2', () => {})).toEqual({ edits: [edit], truncated: true });
});
it('öneri geldikten sonra kullanıcı iptali kısmi başarı olarak kaydedilmez', async () => {
  const c = new AbortController();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(baytAkisi(olay({ content: JSON.stringify([edit]) }, 'stop')))));
  await expect(streamDocumentEdits('[0] yanlş', 'Düzelt', 'glm-5.2', () => c.abort(), 'Word', 'A', 'docx', c.signal)).rejects.toMatchObject({ name: 'AbortError' });
});
it('ömür temizlenince ana sinyalin dinleyicisi ve süre bırakılır', () => {
  vi.useFakeTimers();
  const c = new AbortController();
  const remove = vi.spyOn(c.signal, 'removeEventListener');
  const omur = istekOmru(c.signal, 1000);
  omur.temizle();
  c.abort();
  expect(omur.signal.aborted).toBe(false);
  expect(remove).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
