/**
 * Sohbet listesi araması — SAF kısım.
 *
 * Bilerek yalnız BAŞLIKTA arıyor: başlıklar zaten bellekte, filtreleme anında.
 * Mesaj içeriğinde arama IndexedDB'yi taramak demek; ayrı bir iş.
 */

/**
 * Türkçe duyarlı sadeleştirme.
 *
 * İKİ AYRI SORUN çözülüyor:
 *
 * 1. `.toLowerCase()` İ harfini "i" + BİRLEŞEN NOKTA (U+0307) yapıyor —
 *    ölçüldü. Yani "İstanbul" başlığı "istanbul" aramasıyla eşleşmiyor ve
 *    bunu kimse fark etmiyor. `toLocaleLowerCase('tr')` doğru davranıyor.
 *
 * 2. Kullanıcılar şapkasız yazıyor: "sirket" yazıp "Şirket"i bulmak istiyor.
 *    Türkçeye özgü harfler ASCII karşılığına indiriliyor.
 *
 * Sıra ÖNEMLİ: önce tr küçültme (I→ı, İ→i), sonra ı→i eşlemesi. Böylece
 * "ISTANBUL" ve "istanbul" aynı yere düşüyor.
 */
const TR_HARITA: Record<string, string> = {
  ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u',
};

export function trNormalize(metin: string): string {
  return metin
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşüâîû]/g, (h) => TR_HARITA[h] ?? h);
}

/**
 * Metin sorguyu içeriyor mu? Türkçe duyarlı.
 *
 * Sohbet listesi ve proje listesi AYNI yüklemi kullanıyor: iki yerde ayrı
 * `.toLowerCase()` yazmak, birinin düzelip diğerinin bozuk kalmasına yol
 * açıyordu — proje aramasında tam olarak bu oldu.
 */
export function eslesiyorMu(metin: string | undefined, sorgu: string): boolean {
  const s = trNormalize(sorgu.trim());
  if (!s) return true;
  return trNormalize(metin ?? '').includes(s);
}

/**
 * Başlığı sorguyla eşleşen sohbetler; sıra korunuyor.
 *
 * Boş sorguda AYNI DİZİ döner (kopya değil): arama kutusu çoğu zaman boş ve
 * her tuşta yeni bir dizi üretmek listenin tamamını yeniden çizdirir.
 */
export function sohbetleriSuz<T extends { title?: string }>(liste: T[], sorgu: string): T[] {
  if (!trNormalize(sorgu.trim())) return liste;
  return liste.filter((k) => eslesiyorMu(k.title, sorgu));
}
