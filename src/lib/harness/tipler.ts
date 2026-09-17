import type { AracBirikimi } from '../aracAkisi';

export type DurmaNedeni = 'tamamlandi' | 'iptal' | 'sinir' | 'arac-hatasi' | 'akis-kesildi';

/**
 * Bu durma, mesajın altındaki "yanıt yarım kaldı" uyarısını hak ediyor mu?
 *
 * YALNIZ `akis-kesildi`. Bu, modelin uzunluk sınırına takıldığı
 * (`finish_reason: 'length'`), bitiş sebebinin hiç gelmediği ya da akışın
 * koptuğu durum — yani cevabın KİMSENİN TERCİHİ OLMADAN kesildiği hâl.
 *
 * `iptal` BİLEREK DIŞARIDA. Kullanıcı durdurma düğmesine kendisi bastı; ona
 * "yanıt uzunluk sınırına takıldı" demek düpedüz yanlış bilgi. Üstelik aynı
 * dal `yanit-kesildi` telemetrisini de tetikliyordu, yani canlıdaki tek
 * kesilme sinyalimiz her kullanıcı durdurmasıyla kirleniyordu.
 *
 * `sinir` ve `arac-hatasi` da dışarıda: ikisinde de sebep yanıt metninin
 * İÇİNE yazılıyor (bkz. turCalistir), üstüne bir de uzunluk uyarısı koymak
 * hem tekrar hem yanlış olurdu.
 */
export function kesikSayilirMi(durma: DurmaNedeni): boolean {
  return durma === 'akis-kesildi';
}
export interface AracSonucu {
  durum: 'basarili' | 'uyari' | 'hata';
  artifactId?: string;
  dosyaAdi?: string;
  kaynaklar: string[];
  uygulanan: number;
  reddedilen: number;
  uyarilar: string[];
  hata?: { kod: string; mesaj: string; onarilabilir: boolean };
}
export interface AracCagrisi {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}
/** Mevcut vLLM/OpenAI protokolü. İçerik hiçbir zaman talimat rolüne yükseltilmez. */
export interface DevamMesaji {
  role: 'assistant' | 'tool';
  content: string;
  tool_calls?: AracCagrisi[];
  tool_call_id?: string;
}
export interface ModelTuruSonucu {
  metin: string;
  modelId: string;
  cagrilar: AracBirikimi[];
  bitis: string | null;
  eksik?: boolean;
}
export interface TurOzeti {
  durma: DurmaNedeni;
  anaAdim: number;
  arac: number;
  modelIstegi: number;
  /** Tahmini girdi + ayrılan çıktı. Gerçek tokenizer/usage ölçümü değildir. */
  ayrilanToken: number;
  sureMs: number;
}
export const aracHatasi = (kod: string, mesaj: string, onarilabilir = false): AracSonucu => ({
  durum: 'hata', uygulanan: 0, reddedilen: 0, kaynaklar: [], uyarilar: [], hata: { kod, mesaj, onarilabilir },
});
