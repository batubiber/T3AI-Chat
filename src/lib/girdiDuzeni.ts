/**
 * Sohbet girdisinin KOMPAKT / GENİŞ düzen kararı.
 *
 * Kompakt: `[+]  metin…  [efor][mikrofon][gönder]` — hepsi tek satırda.
 * Geniş:   metin tüm genişliği alır, düğmeler ALTINA iner.
 *
 * Geçiş, metin düğmelere YAKLAŞTIĞINDA oluyor. Karakter saymak yanlış olurdu:
 * "iiii" ile "WWWW" aynı sayıda karakter ama çok farklı genişlikte, üstelik
 * kutu genişliği ekrana göre değişiyor. Bu yüzden karar ÖLÇÜLEN piksel
 * genişliğine dayanıyor; ölçüm bileşende gizli bir kopya öğeyle yapılıyor.
 */

/** Metin ile düğmeler arasında bırakılan nefes payı (piksel). */
export const NEFES_PAYI = 12;

export interface DuzenGirdisi {
  metin: string;
  /** Metnin tek satırda kaplayacağı genişlik (px) — gizli kopyadan ölçülür. */
  metinPx: number;
  /** Girdi kutusunun iç genişliği (px). */
  kutuPx: number;
  /** Sol ve sağ düğme gruplarının toplam genişliği (px). */
  dugmelerPx: number;
  /**
   * Metin alanının kendi yatay iç boşluğu (px, iki yan toplamı).
   *
   * HESABA KATILMAZSA metin, biz geniş moda geçmeden ÖNCE sarıyor ve kompakt
   * satır iki satıra çıkıyor — ölçülerek yakalandı. Kompakt modun tanımı
   * "tek satır"; sarma olduğu anda zaten geç kalınmış oluyor.
   */
  metinPayiPx: number;
}

/**
 * Geniş düzene geçilmeli mi?
 *
 * Satır sonu varsa ÖLÇÜMDEN BAĞIMSIZ olarak geçiliyor: kullanıcı Shift+Enter
 * ile bilerek satır açmışsa metin kompakt satıra zaten sığmaz.
 */
export function genisModaGec(g: DuzenGirdisi): boolean {
  if (g.metin.includes('\n')) return true;
  const kullanilabilir = g.kutuPx - g.dugmelerPx - g.metinPayiPx - NEFES_PAYI;
  return g.metinPx > kullanilabilir;
}

/** Metin alanının büyüyebileceği en fazla satır sayısı; sonrası kaydırma. */
export const AZAMI_SATIR = 5;

export interface KutuYuksekligi {
  yukseklikPx: number;
  /** Tavan aşıldı mı — aşıldıysa kaydırma çubuğu açılıyor. */
  kaydirilacak: boolean;
}

/**
 * Metin alanının yüksekliği: içerik kadar büyür, tavanda durur.
 *
 * Tavan SATIR CİNSİNDEN hesaplanıyor, sabit piksel değil: yazı tipi ya da
 * satır yüksekliği değişirse tavan da kendiliğinden kayıyor. Sabit bir
 * "200px" yazsaydık, farklı yazı boyutunda 5 satır tutmazdı.
 */
export function metinKutuYuksekligi(
  icerikPx: number,
  satirPx: number,
  dikeyPayPx: number,
  azamiSatir: number = AZAMI_SATIR,
): KutuYuksekligi {
  const tavan = azamiSatir * satirPx + dikeyPayPx;
  return {
    yukseklikPx: Math.min(icerikPx, tavan),
    kaydirilacak: icerikPx > tavan,
  };
}

/** `gonderilebilirMi` girdisi — girdi çubuğundaki her şey. */
export interface GonderimGirdisi {
  metin: string;
  yapistirmaSayisi: number;
  belgeSayisi: number;
  resimSayisi: number;
}

/**
 * Gönderilecek bir şey var mı?
 *
 * TEK KAYNAK: hem gönder düğmesinin `disabled`'ı hem `handleSubmit`'in erken
 * çıkışı bunu kullanıyor. Önce iki ayrı ifadeydi ve kaçınılmaz olarak
 * ayrıştılar — yapıştırma kartı eklenince düğme etkinleşti ama gönderim hâlâ
 * "mesaj boş" sanıp geri dönüyordu, kart tek başına gönderilemiyordu. Aynı
 * kökten ikinci bir hata da resimde duruyordu: yalnız resim seçiliyken düğme
 * etkin ama gönderim sessizce iptal oluyordu.
 */
export function gonderilebilirMi(g: GonderimGirdisi): boolean {
  return (
    g.metin.trim().length > 0 ||
    g.yapistirmaSayisi > 0 ||
    g.belgeSayisi > 0 ||
    g.resimSayisi > 0
  );
}
