/**
 * Seçili modelin ucu düştüğünde öteki modele bir kez düşme.
 *
 * Üretimde GLM dört düğümlü bir router'ın arkasında, Gemma ayrı bir
 * makinede. Seçili modelin ucu düşerse tur ölüyor ve kullanıcı yalnız "AI
 * servisi hatası" görüyordu; internetsiz kurulumda kimse anında müdahale
 * edemediği için o tur büsbütün kayıp oluyordu.
 *
 * "Dive into Claude Code" (arXiv 2604.14228, §4.4) bunu kurtarma
 * mekanizmalarından biri olarak sayıyor (`fallbackModel`): birincil model
 * başarısız olduğunda alternatife geçiş.
 *
 * Düşme SESSİZ DEĞİL: cevabı hangi modelin verdiği kullanıcıya söyleniyor ve
 * mesaja o modelin kimliği yazılıyor. Farklı model farklı cevap demek; bunu
 * gizlemek kullanıcının yanlış modele güvenmesine yol açardı.
 */

export interface YedekAdayi {
  id: string;
  disabled?: boolean;
  supportsVision?: boolean;
}

/**
 * Bu HTTP durumu yedeğe düşmeyi hak ediyor mu? `null` = ağ hatası, uç hiç
 * cevap vermedi.
 *
 * YALNIZ 5xx ve ağ hatası. İstemci hataları (4xx) model değiştirerek
 * çözülmez: 400 bizde girdi doğrulama ve bağlam taşması için kullanılıyor,
 * taşmanın kendi telafisi var ve öteki model de aynı 400'ü döndürürdü.
 */
export function yedekDenensinMi(durum: number | null): boolean {
  if (durum === null) return true;
  return durum >= 500 && durum < 600;
}

/**
 * Düşülecek model; yoksa `null`.
 *
 * Turda RESİM varsa yalnız görsel anlayan bir modele düşülüyor. Anlamayana
 * düşmek resimleri sessizce kaybettirirdi: kullanıcı resmi sorduğu cevabı
 * alır ama model resmi hiç görmemiştir — bu paketin karşı durduğu türden bir
 * sessiz hata.
 */
export function yedekModelSec(
  seciliId: string,
  modeller: YedekAdayi[],
  resimVar: boolean,
): string | null {
  const aday = modeller.find(
    (m) => m.id !== seciliId && !m.disabled && (!resimVar || m.supportsVision),
  );
  return aday ? aday.id : null;
}
