/**
 * Yanıtın uzunluk sınırına takılıp yarım kalıp kalmadığı.
 *
 * NEDEN: sohbet akışı bugüne kadar yalnız `delta` okuyor, `finish_reason`'a
 * hiç bakmıyordu. Model `max_tokens`'a çarpınca cevap cümlenin ortasında
 * kesiliyor ve kullanıcı bunu TAM cevap sanıyor — çökme yok, hata mesajı yok,
 * yalnız sessizce eksik bir cevap. Belge üretiminde bu zaten yakalanıyordu
 * (`belgeUretimKapisi`), sohbette yakalanmıyordu.
 *
 * Tespit, sunucunun bildirdiği bitiş sebebine dayanıyor; metne bakıp "cümle
 * yarım mı" diye tahmin etmiyoruz — Türkçede o tahmin sık yanılır ve yanlış
 * uyarı, uyarı olmamasından beter.
 */

/** Kesilme sayılan bitiş sebepleri. */
const KESILME_SEBEPLERI = new Set(['length', 'max_tokens']);

/**
 * Bu bitiş sebebi "yanıt yarım kaldı" demek mi?
 *
 * `tool_calls` KESİK DEĞİL: belge üretme ve düzenleme turları normal olarak
 * böyle bitiyor. Kesik sayılsaydı her belge isteğinde kullanıcıya yanlışlıkla
 * "yanıt yarım kaldı" derdik.
 *
 * Tanınmayan sebeplerde de uyarı yok: uydurma uyarı, uyarı olmamasından kötü.
 */
export function kesildiMi(bitisSebebi: string | null | undefined): boolean {
  return !!bitisSebebi && KESILME_SEBEPLERI.has(bitisSebebi);
}

/**
 * Akış parçasından bitiş sebebini çıkarır; henüz yoksa `null`.
 *
 * Sebep akışın SON parçasında geliyor; aradaki parçalarda alan ya hiç yok ya
 * da null. Çağıran taraf gördüğü son boş olmayan değeri saklıyor.
 */
export function bitisSebebiniOku(parca: unknown): string | null {
  if (!parca || typeof parca !== 'object') return null;
  const secimler = (parca as { choices?: unknown }).choices;
  if (!Array.isArray(secimler) || secimler.length === 0) return null;
  const sebep = (secimler[0] as { finish_reason?: unknown })?.finish_reason;
  return typeof sebep === 'string' && sebep ? sebep : null;
}
