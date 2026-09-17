import { expect, it, vi } from 'vitest';
import { modelAkisiniOku } from './akis';
import { olay, ornekAkis, baytAkisi } from './fixtures';
import { aracParcasiEkle, aracCagrisiCoz, type AracBirikimi } from '../aracAkisi';
const oku = async (s: ReadableStream<Uint8Array>, signal?: AbortSignal) => {
  const sonuc = [];
  for await (const e of modelAkisiniOku(s, signal)) sonuc.push(e);
  return sonuc;
};
it('JSON, Türkçe, emoji ve çoklu tool_calls HER byte sınırında aynı sonucu verir', async () => {
  const beklenen = await oku(baytAkisi(ornekAkis));
  const boy = new TextEncoder().encode(ornekAkis).length;
  for (let i = 1; i < boy; i++) expect(await oku(baytAkisi(ornekAkis, [i])), `byte=${i}`).toEqual(beklenen);
  expect(await oku(baytAkisi(ornekAkis, Array.from({ length: boy - 1 }, (_, i) => i + 1)))).toEqual(beklenen);
  let birikim: AracBirikimi[] = [];
  for (const e of beklenen) for (const t of e.choices?.[0]?.delta?.tool_calls ?? []) birikim = aracParcasiEkle(birikim, t);
  expect(birikim.map((a) => a.id)).toEqual(['uret-A', 'edit-B']);
  expect(aracCagrisiCoz(birikim, 'belge_uret')).toEqual({ tur: 'pptx', talimat: 'Özetle' });
  expect(aracCagrisiCoz(birikim, 'belge_duzenle')).toEqual({ talimat: 'Başlığı düzelt' });
});
it('CRLF, yorum, event alanı, çok satırlı data ve sonda newline olmayan EOF', async () => {
  const metin = ': keepalive\r\nevent: message\r\ndata: {"choices":\r\ndata: [{"delta":{"content":"ş"},"finish_reason":"stop"}]}';
  const boy = new TextEncoder().encode(metin).length;
  for (let i = 1; i < boy; i++) expect((await oku(baytAkisi(metin, [i])))[0].choices[0].delta.content).toBe('ş');
});
it.each(['data: nope\n\n', 'data: {"error":"failed"}\n\n', olay({ content: 'yarım' })])('bozuk veya tamamlanmamış akış hata verir: %s', async (s) => {
  await expect(oku(baytAkisi(s))).rejects.toThrow();
});
it('[DONE] geldiğinde bağlantı açık kalsa da döner ve okuyucuyu bırakır', async () => {
  const cancel = vi.fn();
  const body = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: [DONE]\n\n')); }, cancel });
  expect(await oku(body)).toEqual([]);
  expect(cancel).toHaveBeenCalledOnce();
  expect(body.locked).toBe(false);
});
it('okuma beklerken iptal reader.cancel çağırır ve başarıya dönüşmez', async () => {
  const controller = new AbortController(), cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({ cancel });
  const sonuc = oku(body, controller.signal);
  controller.abort();
  await expect(sonuc).rejects.toMatchObject({ name: 'AbortError' });
  expect(cancel).toHaveBeenCalled();
  expect(body.locked).toBe(false);
});
