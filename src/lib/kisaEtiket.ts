/**
 * Dar ekranlar için kısa etiketler.
 *
 * Telefonda sohbet girdisindeki model ve preset düğmeleri üç satıra kırılıp
 * kutuyu taşırıyordu. Masaüstünde uzun ad bilgi taşıyor, o yüzden etiketler
 * kaldırılmıyor — yalnız dar ekranda kısası gösteriliyor.
 */

/**
 * Preset adının parantezli açıklamasını atar.
 *
 * "Parantez İÇİNİ al" kuralı ters teperdi: "Hızlı (Düşünme Kapalı)" örneğinde
 * parantez içi asıl addan uzun. Parantezi ATMAK her durumda kısaltıyor.
 */
export function kisaPresetAdi(ad: string): string {
  return ad.replace(/\s*\(.*$/, '').trim();
}
