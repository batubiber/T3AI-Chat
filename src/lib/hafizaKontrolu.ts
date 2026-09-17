import type { TurButcesi } from './harness/turButcesi';
/**
 * Proje belleği önerisini ANA CEVAPTAN AYRI, küçük bir istekle sorar.
 *
 * NEDEN AYRI. Araç çağırmak modelin turunu bitiriyor. `belge_uret`'te sorun
 * yok — orada araç çağrısı zaten cevabın kendisi, panel açılıyor. Bellek
 * önerisi ise bir YAN NOT; ana istekte durduğunda model turu ona harcayıp
 * hiç cevap üretmiyordu ve kullanıcı yalnızca akıl yürütme metnini görüyordu.
 *
 * Sektörde iki cevap var. ChatGPT ve Claude Code araç çağrısından sonra
 * DÖNGÜYE devam ediyor: araç çalıştırılıyor, sonucu isteğe ekleniyor, model
 * yeniden çağrılıyor ve asıl cevabını o zaman üretiyor. Bizim uygulama bir
 * ajan değil, tek atımlık akışlı bir istek — o döngü yok.
 *
 * Cursor ikisini de denemiş ve ana modelin sohbet ortasında hafıza aracı
 * çağırmasından VAZGEÇİP arkadan izleyen küçük bir modele geçmiş. Gerekçeleri
 * bizimkine ek: ana model kalıcı bilgi yerine göreve özel günlük üretiyor ve
 * yanlış bir kayıt oluştuğunda düzeltmeye çalışınca diretiyor.
 *
 * Bu yüzden yan model: cevabın yenmesi yapısal olarak imkânsız. Değerlendirme
 * setimiz de aracı zaten yalıtılmış tek turlarla ölçüyor — yani ölçtüğümüz
 * kurulum tam olarak burada kullanılan kurulum.
 */
import { istekOmru } from './harness/iptal';
import { modelUcunaGonder } from './modelIstegi';
import { sessionHeaders } from './sessionHeader';
import { aracCagrisiCoz, type AracBirikimi } from './aracAkisi';
import { hafizaAraci, oneriGecerliMi } from './hafizaOnerisi';

/** Yan istek kullanıcıyı bekletmiyor ama sonsuza kadar da asılı kalmamalı. */
const ZAMAN_ASIMI_MS = 20000;

/**
 * Modele gönderilen tur sayısı.
 *
 * Tüm konuşma GÖNDERİLMİYOR: karar son turda geçen kalıcı bir bilginin olup
 * olmadığı ve bunun için son alışveriş yetiyor. Bütün geçmişi göndermek her
 * turda tam bir ön-doldurma demek olurdu — yan istek ucuz kalmalı.
 */
export const TUR_SAYISI = 2;

export interface KontrolMesaji {
  role: string;
  content: string;
}

/**
 * Kalıcı bir bilgi geçtiyse öneriyi, geçmediyse `null` döner.
 *
 * HİÇBİR DURUMDA FIRLATMAZ: bu çağrı sohbet turunun dışında, cevap zaten
 * ekranda. Buradaki bir hata kullanıcının gördüğü hiçbir şeyi bozmamalı.
 */
export async function hafizaOnerisiniSor(
  modelId: string,
  mesajlar: KontrolMesaji[],
  conversationId?: string,
  signal?: AbortSignal,
  butce?: TurButcesi,
): Promise<string | null> {
  const sonTurlar = mesajlar.slice(-TUR_SAYISI).filter((m) => m.content?.trim());
  if (sonTurlar.length === 0) return null;

  if (signal?.aborted) return null;
  const omur = istekOmru(signal, ZAMAN_ASIMI_MS);
  try {
    const yanit = await modelUcunaGonder(
      modelId,
      {
        messages: sonTurlar,
        // Yalnız bellek aracı tanıtılıyor: başka bir araç çağırma ihtimali yok.
        tools: [hafizaAraci()],
        temperature: 0,
        max_tokens: 300,
        stream: false,
        // Karar iki seçenekli; akıl yürütme burada boşa gider ve yan isteği
        // ana cevap kadar pahalı hâle getirirdi.
        chat_template_kwargs: { enable_thinking: false },
      },
      { headers: sessionHeaders(conversationId), signal: omur.signal, butce },
    );
    if (!yanit.ok) return null;

    const veri = await yanit.json();
    if (omur.signal.aborted) return null;
    const cagrilar = veri?.choices?.[0]?.message?.tool_calls;
    if (!Array.isArray(cagrilar) || cagrilar.length === 0) return null;

    /* Akış birikimiyle AYNI çözücü kullanılıyor: argümanların parça parça mı
       yoksa tek seferde mi geldiği fark etmesin, tek bir ayrıştırma yolu
       olsun. */
    const birikim: AracBirikimi[] = cagrilar.map(
      (c: { id?: string; function?: { name?: string; arguments?: string } }, i: number) => ({
        index: i,
        id: c?.id,
        ad: c?.function?.name ?? '',
        argumanlar: c?.function?.arguments ?? '',
      }),
    );
    const cozulen = aracCagrisiCoz(birikim, 'proje_hafizasi_ekle');
    if (!cozulen) return null;

    const bilgi = typeof cozulen.bilgi === 'string' ? cozulen.bilgi : '';
    /* Geçersiz öneri (çok kısa / çok uzun) sessizce atılıyor: kullanıcıya
       anlamsız bir kart göstermek onu kartı görmezden gelmeye alıştırırdı. */
    return oneriGecerliMi(bilgi) ? bilgi.trim() : null;
  } catch {
    return null; // ağ, zaman aşımı, bozuk gövde — hepsi sessiz
  } finally {
    omur.temizle();
  }
}
