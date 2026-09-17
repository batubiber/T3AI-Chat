/**
 * Uzun yapıştırmaları girdi kutusundan çıkarıp bir karta alma kararı.
 *
 * Yarım sayfalık bir metin yapıştırıldığında yazı alanı beş satırda durup
 * kaydırma çubuğu çıkarıyordu: ne yapıştırdığın görünmüyor, kutu da ekranın
 * altını kaplıyordu. Artık uzun yapıştırma, ilk satırlarını gösteren küçük bir
 * karta dönüyor; tıklayınca tamamı ayrı bir pencerede okunuyor.
 *
 * MODELE GİDEN METİN DEĞİŞMİYOR. Çip yalnız görsel bir katman; gönderirken
 * içerik, kullanıcı elle yapıştırmış gibi mesajın başına konuyor. Ayırıcı
 * etiket de EKLENMİYOR — prompt bugünküyle birebir aynı kalsın diye. Yapıştırma
 * RAG'e indekslenmiyor; belge eklemekten farkı bu. Kart bu yüzden metnin
 * KENDİSİNİ gösteriyor — dosya çipi taklidi yapan ilk tasarım, altına
 * "sohbete eklenmedi" yazmayı gerektiriyordu ve o not kafa karıştırıyordu.
 */

/** Bu uzunluğu AŞAN yapıştırma karta dönüyor. */
export const ESIK_KARAKTER = 600;

/**
 * Bu satır sayısını AŞAN yapıştırma da karta dönüyor.
 *
 * Yalnız karakter saymak yetmiyor: 40 karakterlik ama yirmi satırlık bir liste
 * kutuyu yine taşırıyor.
 */
export const ESIK_SATIR = 10;

export function cipeDonsunMu(metin: string): boolean {
  if (!metin.trim()) return false;
  return metin.length > ESIK_KARAKTER || metin.split('\n').length > ESIK_SATIR;
}

/**
 * Gönderilecek metin: yapıştırmalar sırayla önce, yazılan mesaj sonra.
 *
 * Yapıştırma yoksa yazılan metne HİÇ dokunulmuyor — mevcut davranış aynen
 * korunuyor.
 */
export function mesajiBirlestir(yapistirilanlar: string[], yazilan: string): string {
  const parcalar = [...yapistirilanlar, yazilan.trim()].filter((p) => p.length > 0);
  return parcalar.join('\n\n');
}
