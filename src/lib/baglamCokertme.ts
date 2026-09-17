/**
 * Bağlam çökertme — eski asistan yanıtlarının OKUMA ZAMANI izdüşümü.
 *
 * "Dive into Claude Code" (arXiv 2604.14228, §4.3) modelden önce beş katman
 * sayıyor ve ucuzdan pahalıya sıralıyor: bütçe kırpma, snip, mikrosıkıştırma,
 * ÇÖKERTME, özetleme. Bizde birinci (butceyeSigdir) ve beşinci (özetleme)
 * vardı; aradaki ucuz katmanlar yoktu. Sonuç: pencereden mesaj düştüğü anda
 * doğrudan en pahalı katmana, model çağrısı gerektiren özetlemeye gidiliyordu.
 *
 * Çökertme deterministik ve bedava: eski asistan yanıtlarının baş tarafı
 * bırakılıp gerisi kırpılıyor. Aynı bütçeyle daha çok tur pencerede kalıyor,
 * özetleme daha geç devreye giriyor.
 *
 * YIKICI DEĞİL. Makalenin ayrımı burada: çökertme saklanan geçmişi
 * değiştirmiyor, yalnız modele GÖNDERİLEN diziyi kısaltıyor. Kullanıcının
 * ekranındaki ve veritabanındaki metin olduğu gibi duruyor.
 */

/** Son bu kadar mesaj olduğu gibi kalıyor. */
export const KORUNAN_TUR = 8;

/** Eski asistan yanıtlarında bu uzunluğu aşan kısım kırpılıyor (karakter). */
export const AZAMI_ESKI_UZUNLUK = 800;

const ISARET = '\n\n[… kısaltıldı]';

export interface CokertmeMesaji {
  role: string;
  content: string;
}

export interface CokertmeSonucu<T extends CokertmeMesaji> {
  mesajlar: T[];
  /** Kırpılan karakter sayısı. 0 ise çökertme bir şey yapmadı. */
  kazanc: number;
}

/**
 * Eski asistan yanıtlarını kısaltılmış hâliyle döndürür.
 *
 * MESAJ SAYISI VE SIRASI KORUNUYOR: çağıran taraf özetlenecek aralığı
 * indeksle kesiyor; bir mesaj düşseydi indeksler kayar ve yanlış aralık
 * özetlenirdi.
 *
 * KULLANICI MESAJLARINA DOKUNULMUYOR: kısalar ve konuşmanın ne hakkında
 * olduğunu onlar taşıyor — kırpmanın kazancı düşük, kaybı yüksek.
 *
 * İdempotent: kırpılmış bir metin zaten eşiğin altında kaldığı için ikinci
 * çağrı hiçbir şey yapmıyor.
 */
export function cokert<T extends CokertmeMesaji>(
  mesajlar: T[],
  korunanTur: number = KORUNAN_TUR,
  azamiUzunluk: number = AZAMI_ESKI_UZUNLUK,
): CokertmeSonucu<T> {
  const sinir = mesajlar.length - korunanTur;
  if (sinir <= 0) return { mesajlar, kazanc: 0 };

  let kazanc = 0;
  const cikti = mesajlar.map((m, i) => {
    if (i >= sinir) return m;
    if (m.role !== 'assistant') return m;
    if (m.content.length <= azamiUzunluk) return m;
    const kisa = m.content.slice(0, azamiUzunluk) + ISARET;
    kazanc += m.content.length - kisa.length;
    return { ...m, content: kisa };
  });

  return { mesajlar: kazanc > 0 ? cikti : mesajlar, kazanc };
}
