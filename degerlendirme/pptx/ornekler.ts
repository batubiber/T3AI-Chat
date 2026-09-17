import type { Blok } from '../../src/lib/belgeIcerik';
const paragraf = (metin: string): Blok => ({ tip: 'paragraf', parcalar: [{ metin }] });

/** Sentetik veriler; gerçek model veya kullanıcı belgesi gerektirmez. */
export const ORNEKLER: Record<string, Blok[]> = {
  kisa: [
    { tip: 'baslik', seviye: 2, metin: 'Turna projesi' },
    paragraf('Pilot uygulama için ayrılan bütçe 17,42 milyon TL. Çalışma 12 tesisi kapsıyor.'),
    { tip: 'liste', sirali: false, ogeler: [
      { metin: 'İlk aşamada veri kalitesi ve mevcut süreçler incelenecek.', seviye: 0 },
      { metin: 'Tesis sorumluları haftalık ilerleme raporu hazırlayacak.', seviye: 0 },
      { metin: 'Riskler aylık değerlendirme toplantısında ele alınacak.', seviye: 1 },
    ] },
    { tip: 'baslik', seviye: 2, metin: 'Uygulama sırası' },
    { tip: 'liste', sirali: true, ogeler: ['İhtiyaçları topla', 'Verileri doğrula', 'Sonuçları değerlendir'].map((metin) => ({ metin, seviye: 0 })) },
  ],
  yogun: [
    { tip: 'baslik', seviye: 2, metin: 'Bölgesel tesislerde veri kalitesinin artırılması ve operasyonel süreçlerin iyileştirilmesi için uygulama planı' },
    ...Array.from({ length: 3 }, (_, i) => paragraf(`Bölüm ${i + 1}. ` + 'Ekipler, saha incelemesinde kayıtların güncelliğini ve raporlama düzenini kontrol edecek. Bulgular tesis sorumlularıyla paylaşılacak; eksik kayıtlar tamamlanıp ortak değerlendirme toplantısında gözden geçirilecek. '.repeat(3))),
    { tip: 'baslik', seviye: 3, metin: 'Takip edilecek adımlar' },
    { tip: 'liste', sirali: true, ogeler: Array.from({ length: 12 }, (_, i) => ({ metin: `ADIM${i + 1}: Veri kaynağını incele, sorumlu ekiple bulguları paylaş ve tamamlanan işi rapora kaydet.`, seviye: 0 })) },
  ],
  tablo: [
    { tip: 'baslik', seviye: 2, metin: 'Tesis değerlendirmeleri' },
    paragraf('Her tesisin bulgusu ve takip sorumluluğu aşağıda yer alıyor.'),
    { tip: 'tablo', basliklar: ['Tesis', 'Bulgu ve yapılacak işlem', 'Sorumlu'], satirlar: Array.from({ length: 15 }, (_, i) => [
      `TESİS${i + 1}`, 'Kayıt tarihleri kontrol edildi. Eksik alanlar saha ekibiyle tamamlanacak; sonuçlar gelecek toplantıda değerlendirilecek.', `EKİP${i + 1}`,
    ]) },
    paragraf('TABLOSONU: Tüm tesislerin sonuçları aylık raporda birleştirilecek.'),
  ],
};
