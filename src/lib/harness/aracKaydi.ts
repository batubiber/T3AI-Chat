import { z } from 'zod';
import { BELGE_URET_ARACI } from '../belgeUretimKapisi';
import { belgeDuzenleAraci, type DuzenlemeHedefi } from '../belgeDuzenlemeAraci';
import type { AracBirikimi } from '../aracAkisi';
import { aracHatasi, type AracSonucu } from './tipler';

const TALIMAT_SINIRI = 12000, BASLIK_SINIRI = 160;
const uretim = z.object({ tur: z.enum(['docx', 'xlsx', 'pptx']), talimat: z.string().trim().min(1).max(TALIMAT_SINIRI), baslik: z.string().trim().min(1).max(BASLIK_SINIRI) }).strict();
const duzenleme = z.object({ talimat: z.string().trim().min(1).max(TALIMAT_SINIRI) }).strict();
export type UretimArgumanlari = z.infer<typeof uretim>;

/** Yetki yalnız çağıranın sabitlediği kapsamdan gelir; model yeni hedef/araç ekleyemez. */
export function belgeAracKaydi(g: {
  hedef?: DuzenlemeHedefi;
  uret: (arg: UretimArgumanlari, modelId: string) => Promise<AracSonucu>;
  duzenle: (hedef: DuzenlemeHedefi, talimat: string, modelId: string) => Promise<AracSonucu>;
}) {
  const tanimlar = [BELGE_URET_ARACI, ...(g.hedef ? [belgeDuzenleAraci(g.hedef.ad, g.hedef.turEtiketi)] : [])];
  const semalar = tanimlar.map((t) => {
    const p = t.function.parameters;
    const properties = Object.fromEntries(Object.entries(p.properties).map(([ad, deger]) => [ad,
      ad === 'talimat' || ad === 'baslik' ? { ...deger, minLength: 1, maxLength: ad === 'talimat' ? TALIMAT_SINIRI : BASLIK_SINIRI } : deger]));
    return { ...t, function: { ...t.function, parameters: { ...p, properties, additionalProperties: false } } };
  });
  return {
    semalar,
    async calistir(cagri: AracBirikimi, modelId: string): Promise<AracSonucu> {
      if (!tanimlar.some((t) => t.function.name === cagri.ad)) return aracHatasi('kapsam', 'Bu araç işlem kapsamında değil.');
      let arg: unknown;
      try { arg = JSON.parse(cagri.argumanlar); }
      catch { return aracHatasi('arguman', 'Araç argümanları geçerli bir JSON nesnesi olmalı.', true); }
      if (cagri.ad === 'belge_uret') {
        const parsed = uretim.safeParse(arg);
        if (!parsed.success) return aracHatasi('arguman', 'Belge türü docx/xlsx/pptx olmalı; başlık ve talimat boş bırakılamaz. Başlık en fazla 160, talimat 12000 karakter olmalı. Ek alan kullanmayın.', true);
        return g.uret(parsed.data, modelId);
      }
      const parsed = duzenleme.safeParse(arg);
      if (!parsed.success) return aracHatasi('arguman', 'Düzenleme yalnız dolu bir talimat alanı alır (en fazla 12000 karakter); hedef kimliği verilemez.', true);
      const ad = g.hedef.tur === 'dosya' ? g.hedef.dosya.name : g.hedef.ad;
      if (!/\.(docx|xlsx|pptx|pdf)$/i.test(ad)) return aracHatasi('bicim', 'Bu belge türü düzenlenemiyor.');
      return g.duzenle(g.hedef, parsed.data.talimat, modelId);
    },
  };
}
