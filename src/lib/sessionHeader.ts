/**
 * Modele giden isteklere konan oturum başlığı.
 *
 * BAŞLIK ADI BİR KARARDIR, tesadüf değil: `X-Claude-Code-Session-Id` adı
 * kullanıcı tarafından belirlendi. Ad, bu uygulamanın kendi adıyla
 * eşleşmiyor — gateway/ara katman tarafında bu adın beklendiği varsayılıyor.
 * Değiştirmeden önce o tarafla teyit edin; burayı "düzeltmek" isteyen biri
 * loglarda korelasyonu koparabilir.
 *
 * Ad TEK YERDE: aşağıdaki sabit. Beş ayrı fetch çağrısına elle yazılsaydı,
 * ad değiştiğinde biri mutlaka geride kalırdı.
 */
export const SESSION_HEADER = 'X-Claude-Code-Session-Id';

/** Router'ın beklediği anahtar uzunluğu. */
export const ANAHTAR_UZUNLUGU = 24;

/** djb2 — ragService'teki içerik karmasıyla aynı yöntem. */
function karma(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Sohbet kimliğinden SABİT 24 karakterlik yönlendirme anahtarı üretir.
 *
 * NEDEN 24 VE NEDEN SABİT: bu anahtar GLM router'ının hangi node'a
 * yönlendireceğini belirliyor. Aynı konuşma aynı node'a düşerse node'un KV
 * (prefix) cache'i tutuyor; başka node'a düşerse tüm prompt BAŞTAN prefill
 * ediliyor. Yani anahtarın konuşma boyunca DEĞİŞMEMESİ maliyet meselesi.
 *
 * Ham `generateId()` çıktısı bunun için uygun değildi: `Date.now()` + rastgele
 * biçiminde ve uzunluğu SABİT DEĞİL — `Math.random().toString(36)` bazen kısa
 * çıkıyor, kimlik 15 karaktere kadar inebiliyor.
 *
 * Üretim tamamen deterministik: aynı sohbet kimliği her zaman aynı anahtarı
 * verir. Rastgelelik olsaydı sayfa yenilendiğinde konuşma başka node'a düşer,
 * tam da kaçınmak istediğimiz prefill'i tetiklerdi.
 */
export function oturumAnahtari(conversationId: string): string {
  // Yalnız harf/rakam: başlık değerinde güvenli, router tarafında sürprizsiz
  const sade = conversationId.replace(/[^a-zA-Z0-9]/g, '');
  if (sade.length >= ANAHTAR_UZUNLUGU) return sade.slice(0, ANAHTAR_UZUNLUGU);

  // Kısaysa: kimliğin karmasından türetilen dolgu. Sabit bir dizeyle doldurmak
  // kısa kimliklerin ayırt ediciliğini azaltırdı.
  let dolgu = '';
  let tohum = karma(conversationId);
  while (sade.length + dolgu.length < ANAHTAR_UZUNLUGU) {
    dolgu += tohum.toString(36);
    tohum = karma(dolgu);
  }
  return (sade + dolgu).slice(0, ANAHTAR_UZUNLUGU);
}

/** Sohbeti olmayan isteklerin paylaştığı anahtarın localStorage anahtarı. */
const YEDEK_DEPO_ANAHTARI = 't3ai-oturum-yedek';

/** Aynı sekmede tekrar tekrar localStorage'a gitmemek için. */
let bellektekiYedek: string | null = null;

/**
 * Sohbete bağlı OLMAYAN istekler için sabit yedek anahtar.
 *
 * localStorage'da saklanıyor: sayfa yenilendiğinde aynı anahtar dönsün, yoksa
 * her yenilemede yeni bir anahtar üretilir ve o istekler her seferinde başka
 * node'a düşerdi. localStorage yoksa (test ortamı, gizli mod, kapalı depolama)
 * bellek kopyası kullanılıyor — süreç boyunca yine sabit.
 */
export function yedekOturumAnahtari(): string {
  if (bellektekiYedek) return bellektekiYedek;

  try {
    const kayitli = localStorage.getItem(YEDEK_DEPO_ANAHTARI);
    if (kayitli && /^[a-zA-Z0-9]{24}$/.test(kayitli)) {
      bellektekiYedek = kayitli;
      return kayitli;
    }
  } catch {
    // localStorage erişilemiyor — bellek yoluna düş
  }

  // "yedek-" öneki: gerçek sohbet kimlikleriyle aynı anahtarı üretme ihtimali yok
  const uretilen = oturumAnahtari(`yedek-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  bellektekiYedek = uretilen;
  try {
    localStorage.setItem(YEDEK_DEPO_ANAHTARI, uretilen);
  } catch {
    // yazılamadıysa bellek kopyası yeterli
  }
  return uretilen;
}

/**
 * Modele giden isteğe oturum başlığını ekler. HER ZAMAN bir değer koyar.
 *
 * NEDEN HER ZAMAN: gateway "reject mode"da çalışıyor — `/v1/chat/completions`
 * isteği bu başlık olmadan gelirse 400 dönüyor. Yani başlığı atlamak isteği
 * tamamen kaybettirir.
 *
 * Bu, önceki davranışın TERSİ. Başlık bir ipucuyken (yalnız KV-cache
 * yönlendirmesi) sohbetsiz isteklerde bilerek boş bırakılıyordu: uydurma değer
 * var olmayan bir oturuma yapışmak demekti. Başlık zorunlu hâle gelince o
 * gerekçe geçersiz kaldı; sohbetsiz istekler artık sabit bir yedek anahtar
 * paylaşıyor (tutarlılık şartı da böylece sağlanıyor).
 *
 * Muaf uçlar (`/v1/models`, `/health`, `/metrics`) bu fonksiyonu zaten
 * çağırmıyor — onlarda başlık gerekmiyor.
 */
export function sessionHeaders(conversationId?: string | null): Record<string, string> {
  return {
    [SESSION_HEADER]: conversationId ? oturumAnahtari(conversationId) : yedekOturumAnahtari(),
  };
}
