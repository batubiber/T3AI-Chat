import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hafizaOnerisiniSor, TUR_SAYISI } from './hafizaKontrolu';

const SOHBET = '/vllm-8000/v1/chat/completions';

function aracliYanit(bilgi: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: null, tool_calls: [
        { id: 'c1', type: 'function', function: { name: 'proje_hafizasi_ekle', arguments: JSON.stringify({ bilgi }) } },
      ] } }],
    }),
  };
}

function govde(sahte: ReturnType<typeof vi.fn>) {
  const cagri = sahte.mock.calls.find((c) => c[0] === SOHBET);
  return cagri ? JSON.parse((cagri[1] as { body: string }).body) : null;
}

const TURLAR = [
  { role: 'user', content: 'Merhaba' },
  { role: 'assistant', content: 'Merhaba, nasıl yardımcı olabilirim?' },
  { role: 'user', content: 'Bundan sonra raporları İngilizce hazırla.' },
  { role: 'assistant', content: 'Anladım, İngilizce hazırlayacağım.' },
];

describe('hafizaOnerisiniSor', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('model aracı çağırırsa öneriyi döndürüyor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(aracliYanit('Raporlar İngilizce hazırlanacak.')));
    await expect(hafizaOnerisiniSor('gemma-4-31b', TURLAR)).resolves.toBe('Raporlar İngilizce hazırlanacak.');
  });

  it('araç çağrılmazsa null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: 'Tamam.' } }] }),
    }));
    await expect(hafizaOnerisiniSor('gemma-4-31b', TURLAR)).resolves.toBeNull();
  });

  it('geçersiz öneri (çok kısa) kartı doğurmuyor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(aracliYanit('ok')));
    await expect(hafizaOnerisiniSor('gemma-4-31b', TURLAR)).resolves.toBeNull();
  });

  it('yalnız SON turlar gönderiliyor — yan istek ucuz kalmalı', async () => {
    const sahte = vi.fn().mockResolvedValue(aracliYanit('Raporlar İngilizce hazırlanacak.'));
    vi.stubGlobal('fetch', sahte);
    await hafizaOnerisiniSor('gemma-4-31b', TURLAR);

    const g = govde(sahte);
    expect(g.messages).toHaveLength(TUR_SAYISI);
    expect(g.messages[0].content).toBe('Bundan sonra raporları İngilizce hazırla.');
    expect(g.stream).toBe(false);
  });

  it('YALNIZ bellek aracı tanıtılıyor — başka araç çağrılamaz', async () => {
    const sahte = vi.fn().mockResolvedValue(aracliYanit('Raporlar İngilizce hazırlanacak.'));
    vi.stubGlobal('fetch', sahte);
    await hafizaOnerisiniSor('gemma-4-31b', TURLAR);
    expect(govde(sahte).tools.map((t: { function: { name: string } }) => t.function.name))
      .toEqual(['proje_hafizasi_ekle']);
  });

  it('boş konuşmada istek bile atmıyor', async () => {
    const sahte = vi.fn();
    vi.stubGlobal('fetch', sahte);
    await expect(hafizaOnerisiniSor('gemma-4-31b', [{ role: 'user', content: '   ' }])).resolves.toBeNull();
    expect(sahte).not.toHaveBeenCalled();
  });

  it('sunucu hatasında sessizce null — sohbet turu etkilenmemeli', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(hafizaOnerisiniSor('gemma-4-31b', TURLAR)).resolves.toBeNull();
  });

  it('ağ hatasında FIRLATMIYOR', async () => {
    // Bu çağrı beklenmiyor (`void`); fırlatırsa yakalanmayan söz reddi olur.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('bağlantı yok')));
    await expect(hafizaOnerisiniSor('gemma-4-31b', TURLAR)).resolves.toBeNull();
  });

  it('bozuk gövdede null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => { throw new Error('JSON değil'); },
    }));
    await expect(hafizaOnerisiniSor('gemma-4-31b', TURLAR)).resolves.toBeNull();
  });
});
