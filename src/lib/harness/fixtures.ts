/** Tamamen sentetik vLLM protokol örnekleri; gerçek model/veri/ağ gerektirmez. */
export const olay = (delta: Record<string, unknown>, finish_reason: string | null = null) =>
  `data: ${JSON.stringify({ choices: [{ delta, finish_reason }] })}\n\n`;
export const ornekAkis = olay({ reasoning_content: 'Önce düşün 🤖' })
  + olay({ content: 'İstanbul: 17,42 milyon TL.\n' })
  + olay({ tool_calls: [{ index: 0, id: 'uret-A', function: { name: 'belge_uret', arguments: '{"tur":"pptx",' } }] })
  + olay({ tool_calls: [{ index: 1, id: 'edit-B', function: { name: 'belge_duzenle', arguments: '{"talimat":' } }] })
  + olay({ tool_calls: [{ index: 0, function: { arguments: '"talimat":"Özetle"}' } }, { index: 1, function: { arguments: '"Başlığı düzelt"}' } }] })
  + olay({}, 'tool_calls') + 'data: {"usage":{"total_tokens":123}}\n\ndata: [DONE]\n\n';
export function baytAkisi(metin: string, sinirlar: number[] = []) {
  const baytlar = new TextEncoder().encode(metin);
  const parcalar = [0, ...sinirlar.filter((n) => n > 0 && n < baytlar.length), baytlar.length];
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 1; i < parcalar.length; i++) c.enqueue(baytlar.slice(parcalar[i - 1], parcalar[i]));
      c.close();
    },
  });
}
export const hataYaniti = (status: 400 | 404 | 503) => Response.json({ error: { message: status === 400 ? 'maximum context length exceeded' : status === 404 ? 'model does not exist' : 'unavailable' } }, { status });
