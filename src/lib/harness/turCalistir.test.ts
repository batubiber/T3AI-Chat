import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { turCalistir } from './turCalistir';
import { TurButcesi } from './turButcesi';
import type { AracSonucu, DevamMesaji, ModelTuruSonucu } from './tipler';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const ok: AracSonucu = { durum: 'basarili', artifactId: 'dosya-1', dosyaAdi: 'Rapor.docx', kaynaklar: [], uygulanan: 1, reddedilen: 0, uyarilar: [] };
const hata: AracSonucu = { durum: 'hata', kaynaklar: [], uygulanan: 0, reddedilen: 0, uyarilar: [], hata: { kod: 'arguman', mesaj: 'tur geçersiz', onarilabilir: true } };
const cagri = (id = 'c1', args = '{}') => ({ index: 0, id, ad: 'belge_uret', argumanlar: args });
const yanit = (cagrilar = [], metin = '', bitis = 'tool_calls'): ModelTuruSonucu => ({ metin, cagrilar, bitis, modelId: 'glm-5.2' });
const kur = (yanitlar: ModelTuruSonucu[], calistir = vi.fn(async (_call: import('../aracAkisi').AracBirikimi) => ok)) => {
  const butce = new TurButcesi(new AbortController().signal);
  const model = vi.fn(async (_devam: DevamMesaji[]) => yanitlar.shift()!);
  return { butce, model, calistir, run: () => turCalistir({ runId: 'r1', butce, model, calistir }) };
};

describe('sınırlı araç döngüsü', () => {
  it('araç-only yanıttan sonra eşleşen OpenAI çağrı/sonuç çiftiyle son yanıt ister', async () => {
    const t = kur([yanit([cagri()]), yanit([], 'Dosya hazır.', 'stop')]);
    const r = await t.run();
    expect(r.durma).toBe('tamamlandi'); expect(r.metin).toBe('Dosya hazır.');
    expect(t.model.mock.calls[1][0]).toEqual([
      { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'belge_uret', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: JSON.stringify(ok) },
    ]);
    expect(t.calistir).toHaveBeenCalledTimes(1);
  });
  it('normal sohbeti ikinci model turuna zorlamaz', async () => {
    const t = kur([yanit([], 'Merhaba', 'stop')]);
    expect((await t.run()).metin).toBe('Merhaba'); expect(t.model).toHaveBeenCalledTimes(1);
  });
  it('aynı kimlik tekrarlandığında dosyayı yeniden yazmaz', async () => {
    const t = kur([yanit([cagri()]), yanit([cagri()]), yanit([], 'Hazır', 'stop')]);
    const r = await t.run(); expect(t.calistir).toHaveBeenCalledTimes(1);
    expect(r.sonuclar).toHaveLength(1); expect(r.durma).toBe('tamamlandi');
  });
  it('aynı kimlik başka argümanla yeniden kullanılamaz', async () => {
    const t = kur([yanit([cagri()]), yanit([cagri('c1', '{"x":1}')])]);
    expect((await t.run()).durma).toBe('arac-hatasi'); expect(t.calistir).toHaveBeenCalledTimes(1);
  });
  it('araç hatası modele gider; tek onarımdan sonra başarıyla bitebilir', async () => {
    const exec = vi.fn().mockResolvedValueOnce(hata).mockResolvedValueOnce(ok);
    const t = kur([yanit([cagri()]), yanit([cagri('c2')]), yanit([], 'Hazır', 'stop')], exec);
    expect((await t.run()).durma).toBe('tamamlandi');
    expect(t.model.mock.calls[1][0][1].content).toContain('tur geçersiz');
  });
  it('onarım da başarısızsa üçüncü araç denemesi başlamaz', async () => {
    const t = kur([yanit([cagri()]), yanit([cagri('c2')]), yanit([cagri('c3')])], vi.fn(async () => hata));
    expect((await t.run()).durma).toBe('arac-hatasi'); expect(t.calistir).toHaveBeenCalledTimes(2);
  });
  it.each(['length', null])('yarım araç akışında (%s) hiçbir yazma başlamaz', async (bitis) => {
    const t = kur([yanit([cagri()], 'Hazırlıyorum', bitis)]);
    expect((await t.run()).durma).toBe('akis-kesildi'); expect(t.calistir).not.toHaveBeenCalled();
  });
  it('kimliksiz ya da belirsiz çoklu çağrıda hiçbir araç başlamaz', async () => {
    for (const calls of [[{ ...cagri(), id: undefined }], [cagri(), { ...cagri(), index: 1 }]]) {
      const t = kur([yanit(calls)]); expect((await t.run()).durma).toBe('arac-hatasi'); expect(t.calistir).not.toHaveBeenCalled();
    }
  });
  it('farklı araçlar sırayla çalışır; her sonuç kendi kimliğini taşır', async () => {
    const order: string[] = [];
    const exec = vi.fn(async (call) => { order.push(call.id); await Promise.resolve(); return ok; });
    const t = kur([yanit([cagri('a'), { ...cagri('b'), index: 1 }]), yanit([], 'İkisi de hazır', 'stop')], exec);
    await t.run(); expect(order).toEqual(['a', 'b']);
    expect(t.model.mock.calls[1][0].slice(1).map((m) => m.tool_call_id)).toEqual(['a', 'b']);
  });
  it('parçalar ters sırada gelse de araçlar modelin index sırasıyla uygulanır', async () => {
    const exec = vi.fn(async (_call) => ok);
    const t = kur([yanit([{ ...cagri('ikinci'), index: 1 }, cagri('ilk')]), yanit([], 'Hazır', 'stop')], exec);
    await t.run(); expect(exec.mock.calls.map(([c]) => c.id)).toEqual(['ilk', 'ikinci']);
  });
  it('iptalden sonra başka araç ve model çağrısı başlamaz', async () => {
    const c = new AbortController(), butce = new TurButcesi(c.signal);
    const model = vi.fn(async () => yanit([cagri('a'), { ...cagri('b'), index: 1 }]));
    const exec = vi.fn(async () => { c.abort(); return ok; });
    const r = await turCalistir({ runId: 'r1', butce, model, calistir: exec });
    expect(r.durma).toBe('iptal'); expect(exec).toHaveBeenCalledTimes(1); expect(model).toHaveBeenCalledTimes(1);
  });
  it('dört ana tur sınırında beşinci tur ve yeni yazma başlamaz', async () => {
    const t = kur([1, 2, 3, 4, 5].map((i) => yanit([cagri('c' + i)])));
    expect((await t.run()).durma).toBe('sinir'); expect(t.model).toHaveBeenCalledTimes(4); expect(t.calistir).toHaveBeenCalledTimes(3);
  });
  /* Kullanıcı "selam naber" yazıp yanıtı durdurunca ekranda "Tamamlanan
     belgeler korunuyor." yazıyordu — ortada hiç belge yokken. Bildirim, o turda
     gerçekten belge işi olup olmadığına göre değişmeli. */
  describe('durma bildirimi belgeden yalnız belge varsa söz eder', () => {
    it('sıradan sohbette durdurulunca yalnız "İşlem durduruldu." der', async () => {
      const c = new AbortController(), butce = new TurButcesi(c.signal);
      const model = vi.fn(async () => { c.abort(); return yanit([], 'Selam, ben', 'stop'); });
      const exec = vi.fn();
      const r = await turCalistir({ runId: 'r1', butce, model, calistir: exec });
      expect(r.durma).toBe('iptal');
      expect(r.metin).toBe('İşlem durduruldu.');
      expect(exec).not.toHaveBeenCalled();
    });
    it('belge üretildikten sonra durdurulunca da belgeden söz etmez — belge zaten panelde', async () => {
      const c = new AbortController(), butce = new TurButcesi(c.signal);
      const model = vi.fn(async () => yanit([cagri('a')]));
      const exec = vi.fn(async () => { c.abort(); return ok; });
      const r = await turCalistir({ runId: 'r1', butce, model, calistir: exec });
      expect(r.durma).toBe('iptal');
      expect(r.metin).toBe('İşlem durduruldu.');
    });
    it('sıradan sohbet uzunluk sınırına takılırsa belge cümlesi eklenmez', async () => {
      const r = await kur([yanit([], 'Uzun cevabın yarısı', 'length')]).run();
      expect(r.durma).toBe('akis-kesildi');
      expect(r.metin).toBe('Uzun cevabın yarısı\n\nYanıt akışı tamamlanamadı.');
    });
    it('araç çağrısı yarım kalırsa belge cümlesi KALIR', async () => {
      const r = await kur([yanit([cagri()], '', 'length')]).run();
      expect(r.durma).toBe('akis-kesildi');
      expect(r.metin).toContain('Bu adımdaki belge işlemleri başlatılmadı.');
    });
    /* `belge_uret` her turda modele gönderiliyor (aracKaydi.ts), yani sıradan
       sohbette de model 'tool_calls' bildirip ayrıştırılabilir çağrı üretmeyebilir.
       O hâlde henüz hiçbir belge işi yok — "belge" demek yanlış. */
    it('ayrıştırılamayan araç çağrısında belge işi yoksa belgeden söz etmez', async () => {
      const r = await kur([yanit([], '', 'tool_calls')]).run();
      expect(r.durma).toBe('arac-hatasi');
      expect(r.metin).toBe('Model araç çağrısını tamamlayamadı.');
    });
    it('adım sınırında belge işi varsa korunduğunu söyler', async () => {
      const r = await kur([1, 2, 3, 4, 5].map((i) => yanit([cagri('c' + i)]))).run();
      expect(r.durma).toBe('sinir');
      expect(r.metin).toBe('Yanıt adımı sınırına ulaşıldı. Tamamlanan belgeler korunuyor; yeni bir işlem başlatılmadı.');
    });
  });

  it('araç hatasından sonraki model başarı iddiası hata durumunu değiştiremez', async () => {
    const t = kur([yanit([cagri()]), yanit([], 'Her şey hazır', 'stop')], vi.fn(async () => hata));
    const r = await t.run(); expect(r.durma).toBe('arac-hatasi'); expect(r.metin).toContain('tur geçersiz');
  });
});
