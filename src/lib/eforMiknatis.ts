/**
 * Efor kaydırıcısında "her yerde hareket et, duraklara kitlen" davranışı.
 *
 * Kaydırıcı ince adımlarla (0.01) çalışıyor, yani sürüklerken bar parmağı
 * kesintisiz takip ediyor. Ama duraklara yaklaşınca tam durağa oturuyor —
 * kullanıcı milimetrik nişan almak zorunda kalmıyor.
 *
 * Adım 1 olsaydı bar duraktan durağa SIÇRARDI; mıknatıs olmasaydı bar
 * duraklar arasında asılı kalabilirdi.
 */

/** Bir durağa bu kadar yakınsa tam durağa oturuyor. */
export const MIKNATIS_ESIGI = 0.18;

/** Sürükleme değerini duraklara mıknatıslar; arada serbest bırakır. */
export function miknatisla(ham: number, esik = MIKNATIS_ESIGI): number {
  if (!Number.isFinite(ham)) return 0;
  const durak = Math.round(ham);
  return Math.abs(ham - durak) <= esik ? durak : ham;
}

/** Sürükleme değerinin karşılık geldiği durak (seçili preset'in indeksi). */
export function durakIndeksi(ham: number, adet: number): number {
  if (adet <= 0) return 0;
  return Math.min(adet - 1, Math.max(0, Math.round(ham)));
}
