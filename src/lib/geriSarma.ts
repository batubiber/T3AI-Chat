/**
 * Geri sarma — sohbette bir noktaya dönüp sonrasını bırakmak.
 *
 * "Dive into Claude Code" (arXiv 2604.14228, §9.2) append-only kaydın
 * sağladığı üç şeyi sayıyor: devam ettirme, GERİ SARMA, dallanma. İlkesi de
 * şu: "bir oturum tek bir doğrusal yörüngeye hapsolmamalı".
 *
 * Bizde dallanma vardı: bir mesajdan YENİ bir sohbet açılıyor ve oraya
 * geçiliyor. Geri sarma aynı sohbette kalıyor — üç tur önce yanlış sorulmuş
 * bir soru yüzünden yeni bir sohbet biriktirmek gerekmiyor.
 *
 * SİLMİYOR, İŞARETLİYOR. Makalenin vurgusu "önceki işi kaybetmeden"; mesajlar
 * veritabanında duruyor, yalnız görünmez ve modele gönderilmez oluyor. Böylece
 * geri alma da mümkün kalıyor. Yıkıcı bir silme, yanlışlıkla basıldığında
 * telafisi olmayan bir kayıp olurdu.
 */

export interface GeriSarmaMesaji {
  id: string;
  geriSarildi?: boolean;
}

/**
 * Geri sarılacak mesajların kimlikleri: seçilen mesaj DAHİL sonrası.
 *
 * Seçilen mesaj da dahil, çünkü kullanıcı "buradan geri sar" derken o mesajı
 * yeniden yazmak istiyor; metni girdi kutusuna geri konuyor.
 *
 * Bilinmeyen kimlikte BOŞ dönüyor: tahmin etmek, konuşmayı kullanıcının
 * beklemediği bir yerden kesmek olurdu.
 */
export function geriSarilacakIdler<T extends GeriSarmaMesaji>(
  mesajlar: T[],
  mesajId: string,
): string[] {
  const yer = mesajlar.findIndex((m) => m.id === mesajId);
  if (yer < 0) return [];
  return mesajlar
    .slice(yer)
    .filter((m) => !m.geriSarildi)
    .map((m) => m.id);
}

/** Ekranda ve modele giden bağlamda görünecek mesajlar. */
export function gorunurMesajlar<T extends GeriSarmaMesaji>(mesajlar: T[]): T[] {
  return mesajlar.filter((m) => !m.geriSarildi);
}
