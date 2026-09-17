import { expect, it, vi } from 'vitest';
import { belgeAracKaydi } from './aracKaydi';

it('bilinmeyen araç, hafıza yazımı ve hedefsiz düzenleme çalıştırılmaz', async () => {
  const uret = vi.fn(), duzenle = vi.fn(), kayit = belgeAracKaydi({ uret, duzenle });
  for (const ad of ['bilinmeyen', 'proje_hafizasi_ekle', 'belge_duzenle']) {
    expect((await kayit.calistir({ index: 0, id: 'c', ad, argumanlar: '{}' }, 'glm-5.2')).hata.kod).toBe('kapsam');
  }
  expect(uret).not.toHaveBeenCalled(); expect(duzenle).not.toHaveBeenCalled();
});
it.each([
  '{', '[]', 'null', '{"tur":"pdf","baslik":"Rapor","talimat":"yaz"}',
  '{"tur":"docx","baslik":"Rapor","talimat":" "}',
  '{"tur":"docx","baslik":"Rapor","talimat":"yaz","artifactId":"diger"}',
])('geçersiz argüman (%s) dosya yazmaz', async (argumanlar) => {
  const uret = vi.fn(), kayit = belgeAracKaydi({ uret, duzenle: vi.fn() });
  expect((await kayit.calistir({ index: 0, id: 'c', ad: 'belge_uret', argumanlar }, 'glm-5.2')).durum).toBe('hata');
  expect(uret).not.toHaveBeenCalled();
});
it('hedef model argümanından seçilemez; izinli hedef çağırandan gelir', async () => {
  const hedef = { tur: 'artifact' as const, ad: 'Rapor.docx', turEtiketi: 'Word belgesi', artifactId: 'izinli' };
  const duzenle = vi.fn(), kayit = belgeAracKaydi({ hedef, uret: vi.fn(), duzenle });
  const c = { index: 0, id: 'c', ad: 'belge_duzenle', argumanlar: '{"talimat":"Düzelt","artifactId":"diger"}' };
  expect((await kayit.calistir(c, 'gemma-4-31b')).durum).toBe('hata'); expect(duzenle).not.toHaveBeenCalled();
  await kayit.calistir({ ...c, argumanlar: '{"talimat":" Düzelt "}' }, 'gemma-4-31b');
  expect(duzenle).toHaveBeenCalledWith(hedef, 'Düzelt', 'gemma-4-31b');
});
