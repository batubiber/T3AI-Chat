/**
 * Bir turda MODELE NE GİTTİĞİNİN kaydı.
 *
 * NEDEN VAR: bağlamı üç ayrı yerde sıkıştırıyoruz — eski yanıtları çökertme,
 * pencereye sığmayanları düşürme, uzun geçmişi özetleme — ve üçü de kullanıcıya
 * görünmüyor. "Dive into Claude Code" (arXiv 2604.14228, §12.3) bunu mimarinin
 * kabul edilmiş bedeli olarak yazıyor: sıkıştırma etkili ama görünmez, kullanıcının
 * NEYİN KAYBOLDUĞUNU inceleyecek kolay bir yolu yok.
 *
 * Bizim kurulumda bu daha da ağır: uygulama internetsiz bir ağda çalışıyor ve
 * içerik oradan çıkamıyor. Bir tur bozulduğunda elimizdeki tek teşhis yolu
 * kullanıcının ekrana bakıp anlatması; bakacak bir şey yoksa kimse bir şey
 * öğrenemiyor. Bu kayıt tamamen YEREL — hiçbir yere gönderilmiyor, kullanıcının
 * kendi verisini kendisine gösteriyor.
 *
 * Sayılar zaten hesaplanıyordu; tek yaptığımız onları atmak yerine saklamak.
 */

import type { TurOzeti } from './harness/tipler';

export interface TurBilgisi {
  /** Pilot döngünün yerel durma nedeni ve sınırlı bütçe özeti. */
  harness?: TurOzeti;
  /** Modele gönderilen mesaj sayısı (sistem mesajı hariç). */
  gonderilenMesaj: number;
  /** Sohbetteki toplam mesaj. */
  toplamMesaj: number;
  /** Pencereye sığmadığı için hiç gönderilmeyen mesaj. */
  dusenMesaj: number;
  /** İçeriği kısaltılan eski mesaj sayısı ve kazanılan karakter. */
  cokertilenMesaj: number;
  cokertmeKazanci: number;
  /** Geçmişin yerine özet gönderildi mi, kaç mesajın yerine. */
  ozetVarMi: boolean;
  ozetlenenMesaj: number;
  /** Belge/arama sonucu olarak eklenen parça sayısı. */
  belgeParcasi: number;
  /** Bütçeye sığdırma sırasında yapılan kırpmaların açıklamaları. */
  kirpmalar: string[];
  /** Tahmini girdi token'ı, modelin penceresi, yanıt için ayrılan bütçe. */
  girdiToken: number;
  pencere: number;
  ciktiButcesi: number;
  /** Cevabı gerçekte veren model ve seçili kademe. */
  model: string;
  kademe: string | null;
}

const sayi = (n: number) => new Intl.NumberFormat('tr-TR').format(Math.round(n));

/** Pencerenin yüzde kaçı doldu. Pencere bilinmiyorsa 0. */
export function doluluk(b: TurBilgisi): number {
  if (!b.pencere || b.pencere <= 0) return 0;
  return Math.min(100, Math.round((b.girdiToken / b.pencere) * 100));
}

/**
 * Bu turda bağlamdan bir şey ÇIKARILDI mı?
 *
 * Arayüz bunu kullanıcıyı uyarmak için kullanıyor, o yüzden eşik yüksek
 * tutuldu: yalnız mesaj DÜŞTÜĞÜNDE, geçmişin yerine ÖZET geçtiğinde ya da bir
 * şey bütçeye SIĞMADIĞINDA doğru.
 *
 * ÇÖKERTME BİLEREK DIŞARIDA. Son sekiz turdan eskisinde 800 karakteri aşan
 * her mesaj kısaltılıyor; model yanıtları çoğu zaman bundan uzun, yani sohbet
 * biraz uzayınca çökertme HER TURDA çalışıyor. İlk sürümde işareti o da
 * çıkarıyordu ve işaret sürekli yanıyordu — sürekli yanan uyarı kullanıcıya
 * yok saymayı öğretir, tam kaçınmak istediğimiz şey. Kısaltma panelde
 * görünmeye devam ediyor; yalnız alarm vermiyor.
 */
export function sikistirmaVarMi(b: TurBilgisi): boolean {
  return b.dusenMesaj > 0 || b.ozetVarMi || b.kirpmalar.length > 0;
}

/**
 * Düğme gösterilsin mi?
 *
 * Sıradan bir turda panelde söylenecek bir şey yok — "6/6 mesaj, pencerenin
 * %3'ü" kimseye bir şey anlatmıyor ve her yanıtın altında boş yere bir düğme
 * duruyor. Düğme yalnız bağlama GERÇEKTEN bir şey olduğunda çıkıyor:
 * bir şey çıkarıldıysa, eski mesajlar kısaltıldıysa ya da belge parçası
 * eklendiyse.
 *
 * Üç kademe oluyor: hiçbir şey olmadıysa düğme yok, rutin bakım olduysa düğme
 * var ama sessiz, gerçek kayıp olduysa düğmenin üstünde nokta da var.
 */
export function gosterilmeliMi(b: TurBilgisi): boolean {
  return sikistirmaVarMi(b) || b.cokertilenMesaj > 0 || b.belgeParcasi > 0 || !!(b.harness && (b.harness.arac || b.harness.durma !== 'tamamlandi'));
}

export interface BilgiSatiri {
  etiket: string;
  deger: string;
  /** Ek açıklama — yalnız söyleyecek bir şey varsa. */
  ipucu?: string;
  /** Bir şeyin düştüğünü/sıkıştığını anlatan satır; arayüz vurguluyor. */
  vurgu?: boolean;
}

/**
 * Panelde gösterilecek satırlar. Arayüz bunu olduğu gibi çiziyor — biçimlendirme
 * kararları burada, testte kilitli.
 */
export function bilgiSatirlari(b: TurBilgisi): BilgiSatiri[] {
  const satirlar: BilgiSatiri[] = [];
  if (b.harness) {
    const h = b.harness;
    const durumlar = { tamamlandi: 'Tamamlandı', iptal: 'Durduruldu', sinir: 'İşlem sınırına ulaşıldı', 'arac-hatasi': 'Belge işlemi tamamlanamadı', 'akis-kesildi': 'Yanıt kesildi' };
    satirlar.push({ etiket: 'İşlem durumu', deger: durumlar[h.durma], vurgu: h.durma !== 'tamamlandi' });
    satirlar.push({ etiket: 'Adımlar', deger: `${h.anaAdim} yanıt · ${h.arac} belge işlemi` });
    satirlar.push({ etiket: 'Toplam bütçe', deger: `${h.modelIstegi} çağrı · ~${sayi(h.ayrilanToken)} token`, ipucu: 'Tahmini girdi ve ayrılan çıktı; yardımcı istekler dahil. Özetleme için iki çağrılık üst sınır ayrılır.' });
  }

  satirlar.push({
    etiket: 'Mesaj',
    deger: `${b.gonderilenMesaj} / ${b.toplamMesaj}`,
    ipucu: b.dusenMesaj > 0 ? `${b.dusenMesaj} mesaj pencereye girmedi` : undefined,
    vurgu: b.dusenMesaj > 0,
  });

  if (b.ozetVarMi) {
    satirlar.push({
      etiket: 'Özet',
      deger: 'açık',
      ipucu: b.ozetlenenMesaj > 0
        ? `ilk ${b.ozetlenenMesaj} mesajın yerine özet gönderildi`
        : 'eski geçmişin yerine özet gönderildi',
      vurgu: true,
    });
  }

  if (b.cokertilenMesaj > 0) {
    satirlar.push({
      etiket: 'Kısaltma',
      deger: `${b.cokertilenMesaj} eski mesaj`,
      ipucu: `${sayi(b.cokertmeKazanci)} karakter kısaltıldı`,
      vurgu: true,
    });
  }

  if (b.belgeParcasi > 0) {
    satirlar.push({ etiket: 'Belge parçası', deger: `${b.belgeParcasi} parça` });
  }

  satirlar.push({
    etiket: 'Girdi',
    deger: `~${sayi(b.girdiToken)} / ${sayi(b.pencere)}`,
    // Tahmin olduğu AÇIKÇA yazılıyor: ölçüm karakter sayısından türüyor ve
    // Türkçe beklenenden kötü tokenize oluyor. Kesin sanılırsa yanıltır.
    ipucu: `tahmini, pencerenin %${doluluk(b)}'i`,
  });

  satirlar.push({ etiket: 'Yanıt bütçesi', deger: `${sayi(b.ciktiButcesi)} token` });

  satirlar.push({
    etiket: 'Model',
    deger: b.kademe ? `${b.model} · ${b.kademe}` : b.model,
  });

  return satirlar;
}
