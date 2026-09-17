/**
 * Uzun kullanıcı mesajlarını katlama kararı.
 *
 * Bu üründe insanlar belge metni yapıştırıyor ve tek bir mesaj ekranın
 * tamamını yiyor. Gönderilmiş mesaj altı satırda kesiliyor, kalanı okla
 * açılıyor.
 *
 * Karar KARAKTER SAYISIYLA DEĞİL ÖLÇÜMLE veriliyor: "iiii" ile "WWWW" aynı
 * sayıda karakter ama farklı yükseklik, üstelik balon genişledikçe aynı metin
 * daha az satıra sığıyor. Girdi kutusunda da aynı sebeple ölçüm kullanılıyor
 * (bkz. girdiDuzeni.ts).
 */

/** Katlamanın devreye girdiği satır sayısı. */
export const AZAMI_SATIR = 6;

/**
 * Katlanmış hâlin yüksekliği — katlamaya gerek yoksa `null`.
 *
 * TOLERANS ŞART: satır yüksekliği kesirli (14px × 1.625 = 22.75) ama
 * `scrollHeight` tam sayı döner. Tam altı satırlık bir mesaj 136.5 yerine 137
 * ölçülüyor ve toleranssız karşılaştırmada "katlanabilir" çıkıyordu — gizlenen
 * hiçbir şey yokken ok işareti beliriyordu.
 *
 * `satirPx` ölçülemediğinde (line-height: normal → NaN) katlama YAPILMIYOR:
 * tavan NaN olurdu ve mesaj tamamen kaybolurdu.
 */
export function katlamaTavani(
  icerikPx: number,
  satirPx: number,
  azamiSatir: number = AZAMI_SATIR,
): number | null {
  if (!(satirPx > 0)) return null;
  const tavan = azamiSatir * satirPx;
  return icerikPx > tavan + 1 ? tavan : null;
}
