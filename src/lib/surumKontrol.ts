/**
 * Açık sekmenin sunucudaki sürümden geri kalıp kalmadığını anlama.
 *
 * SORUN: paket sık yenileniyor ama kullanıcı sekmeyi günlerce açık tutuyor.
 * Üstelik `serve` `index.html` için hiçbir `Cache-Control` göndermiyordu;
 * direktif yokken tarayıcı sezgisel önbellekleme yapıyor ve normal yenileme
 * bile ESKİ index.html'i sunabiliyor — o da eski paketi işaret ediyor. Asıl
 * düzeltme `public/serve.json`'daki başlıklar; buradaki kontrol, sekmesini hiç
 * yenilemeyen kullanıcıya yeni sürümü haber veriyor.
 *
 * `surum.json` derleme sırasında üretiliyor (bkz. vite.config.ts) ve
 * `APP_VERSION` ile aynı kaynaktan geliyor.
 */

/** Sürüm dosyasının yolu. KÖKTE: alt yol, ters vekil arkasında kayboluyor. */
export const SURUM_YOLU = '/surum.json';

/** İki kontrol arası bekleme. Sekme öne geldiğinde de ayrıca bakılıyor. */
export const KONTROL_ARALIGI_MS = 15 * 60 * 1000;

/**
 * Sunucudan gelen gövdeden sürümü ayıklar; tanınmayan biçimde `null`.
 *
 * Yanlış yapılandırılmış bir vekil `/surum.json` yerine `index.html`
 * döndürebiliyor. Gövdeyi doğrulamadan kullanmak, kullanıcıya durmadan
 * "yeni sürüm var" demek olurdu.
 */
export function surumuAyikla(veri: unknown): string | null {
  if (!veri || typeof veri !== 'object') return null;
  const s = (veri as { surum?: unknown }).surum;
  if (typeof s !== 'string' || !s.trim()) return null;
  return s;
}

/**
 * Sekme sunucudaki sürümden farklı bir paket çalıştırıyor mu?
 *
 * SAYISAL KARŞILAŞTIRMA YOK, düpedüz eşitsizlik: dağıtım geri alındığında da
 * doğru sürüm sunucudaki olur ve kullanıcının yenilemesi gerekir. "Uzak daha
 * yeniyse" denseydi geri almalarda kullanıcı eski sekmesiyle kalırdı.
 *
 * Uzak sürüm okunamadıysa uyarı YOK: geliştirmede dosya hiç yok ve her
 * açılışta uyarı çıkması özelliği kullanılmaz hale getirirdi.
 */
export function yeniSurumVarMi(calisan: string, uzak: string | null): boolean {
  if (!calisan.trim() || !uzak) return false;
  return calisan !== uzak;
}
