import { afterEach, expect, it, vi } from 'vitest';
import { uretimIcerigiIste } from '../belgeUretimKapisi';
import { modelUcunaGonder } from '../modelIstegi';
vi.mock('../modelIstegi', () => ({ modelUcunaGonder: vi.fn() }));
vi.mock('../kullanimBildir', () => ({ kullanimBildir: vi.fn() }));
afterEach(() => { vi.resetAllMocks(); vi.useRealTimers(); });

it('kaynak metni, asıl istek ve proje talimatı üreticiye ulaşır', async () => {
  vi.mocked(modelUcunaGonder).mockResolvedValue(Response.json({ choices: [{ message: { content: '## Sonuç\n17,42 milyon TL' }, finish_reason: 'stop' }] }));
  await uretimIcerigiIste('Sunum hazırla', 'pptx', 'glm-5.2', 'sohbet-A', {
    baglam: { kullaniciIstegi: 'Bu rapordaki bütçeden 6 slayt hazırla', projeTalimatlari: 'Para birimi TL',
      ekBaglam: ['Kaynak: faaliyet.txt, parça 3\nBütçe: 17,42 milyon TL'],
      gecmis: [{ role: 'user', content: 'Kısa başlıklar kullan' }] },
  });
  const govde = vi.mocked(modelUcunaGonder).mock.calls[0][1];
  expect(JSON.stringify(govde.messages)).toContain('17,42 milyon TL');
  expect(JSON.stringify(govde.messages)).toContain('6 slayt');
  expect(JSON.stringify(govde.messages)).toContain('Para birimi TL');
});

it('önceden iptal edilmiş iş hiç model isteği yapmaz', async () => {
  const c = new AbortController(); c.abort();
  vi.mocked(modelUcunaGonder).mockResolvedValue(Response.json({ choices: [] }));
  await expect(uretimIcerigiIste('rapor', 'docx', 'glm-5.2', 'A', { signal: c.signal })).rejects.toMatchObject({ name: 'AbortError' });
  expect(modelUcunaGonder).not.toHaveBeenCalled();
});
