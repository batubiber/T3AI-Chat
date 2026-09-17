/**
 * Belge ÜRETME aracı ve içerik çağrısı.
 *
 * Karar ana modelde: akış sırasında `belge_uret` aracını çağırıyor. Ayrı bir
 * kapı modeli yok — düzenleme tarafı da aynı desene geçti
 * (bkz. belgeDuzenlemeAraci.ts).
 *
 * İÇERİK NEDEN AYRI ÇAĞRIDAN: sohbet yanıtı sohbet dili taşıyor ("Tabii, işte
 * raporunuz…", "Umarım yardımcı olmuştur!") ve bu metin resmî bir belgeye
 * olduğu gibi giremez. Ayıklamaya çalışmak kırılgan.
 */
import { modelUcunaGonder } from './modelIstegi';
import { sessionHeaders } from './sessionHeader';
import { kullanimBildir } from './kullanimBildir';
import { istekOmru, iptaliKontrolEt } from './harness/iptal';
import { modelGirdisiniKur } from './harness/modelGirdisi';
import type { TurButcesi } from './harness/turButcesi';
import type { Mesaj } from './baglamButcesi';

export type UretimTuru = 'docx' | 'xlsx' | 'pptx';

/**
 * Bekleme göstergesinde kullanıcıya ne hazırlandığını söyler.
 *
 * `Record<UretimTuru, ...>` BİLEREK: yeni bir tür eklenince (sıradaki iş PDF)
 * buraya etiket yazılmazsa tsc patlar. Aksi hâlde kullanıcı "undefined"
 * yazan bir bildirim görürdü ve bunu kimse fark etmezdi.
 */
export const TUR_ETIKETI: Record<UretimTuru, string> = {
  docx: 'Word belgesi',
  xlsx: 'Excel dosyası',
  pptx: 'PowerPoint sunumu',
};

// Üretim çağrısının süresi: kapıdan uzun (tam bir belge yazılıyor) ama
// docxEditService'teki 600 sn'lik düzenleme akışından kısa — burada tek
// seferlik bir yanıt var ve kullanıcı ekran başında bekliyor.
const URETIM_ZAMAN_ASIMI_MS = 120000;

/**
 * `belge_uret` araç şeması — TEK KAYNAK.
 *
 * Hem kapı çağrısı hem ana sohbet akışı bunu kullanıyor. İki yere ayrı
 * yazılsaydı biri güncellenip diğeri geride kalırdı; `tur` enum'una pptx
 * eklenip açıklamanın güncellenmemesi tam olarak böyle bir hataydı.
 */
export const BELGE_URET_ARACI = {
  type: 'function',
  function: {
    name: 'belge_uret',
    // ÜÇ FORMAT DA BURADA SAYILMALI: model önce bu açıklamayı okuyup aracın
    // uygulanıp uygulanmadığına karar veriyor. `tur` enum'una pptx eklemek
    // tek başına yetmez — açıklama sunumdan bahsetmezse "bana sunum hazırla"
    // isteğinde araç hiç çağrılmaz ve özellik erişilemez kalır.
    // "SIFIRDAN" KELİMESİ KALDIRILDI. Değerlendirme seti yakaladı: belge ekliyken
    // "bundan ayrı bir sunum çıkar" denince model üç koşudan birinde hiçbir aracı
    // çağırmıyordu. Sebep mekanik — açıklama "sıfırdan" diyordu, istek ise mevcut
    // bir belgeden TÜRETME. Model, aracın uygulanmadığına açıklamaya bakarak
    // karar veriyor.
    description:
      'Kullanıcı yeni bir Word belgesi, Excel dosyası ya da PowerPoint sunumu ' +
      'istediğinde çağrılır. İstenen dosya sıfırdan yazılabilir ya da konuşmadaki ' +
      'veya ekli bir belgedeki bilgiden türetilebilir.',
    parameters: {
      type: 'object',
      properties: {
        tur: { type: 'string', enum: ['docx', 'xlsx', 'pptx'], description: 'docx: rapor/yazı. xlsx: tablo/veri. pptx: sunum/slayt.' },
        talimat: { type: 'string', description: 'Kullanıcının istediği belgenin özeti' },
        baslik: {
          type: 'string',
          description:
            'Dosya adı için kısa Türkçe başlık, en fazla 5 kelime. ' +
            'Uzantı, tarih ve noktalama YAZMA. Örnek: "Savunma Sanayii Raporu".',
        },
      },
      required: ['tur', 'talimat', 'baslik'],
    },
  },
};

const uretimPromptu = (tur: 'docx' | 'xlsx' | 'pptx') => {
  if (tur === 'xlsx') {
    return 'Sana istenen veriyi YALNIZ bir markdown tablosu olarak yaz. Tablo dışında ' +
      'hiçbir şey yazma: giriş cümlesi yok, açıklama yok, başlık yok. İlk satır ' +
      'sütun başlıkları olsun.';
  }
  if (tur === 'pptx') {
    // "##" ŞART: belgeIcerik.ts seviye 1/2 başlığı yeni slayt sinyali sayıyor
    // (pptxOlustur.ts), üçüncü seviye slayt açmıyor — model üçüncü seviyeye
    // kaçarsa slaytlar birleşir.
    return 'İstenen sunumu markdown olarak yaz. Her slayt bir "##" başlıkla başlasın. ' +
      'Slayt başına en fazla 5 kısa madde yaz. Uzun paragraf yazma. Giriş cümlesi ' +
      '("işte sunumunuz" gibi) YAZMA, kapanış temennisi YAZMA. Doğrudan ilk slaytın ' +
      'başlığıyla başla.';
  }
  return 'İstenen belgeyi markdown olarak yaz. Kurallar: giriş cümlesi ("işte ' +
    'raporunuz" gibi) YAZMA, kapanış temennisi ("umarım yardımcı olur" gibi) ' +
    'YAZMA. Doğrudan belgenin kendisiyle başla. Başlık yapısı kullan (#, ##). ' +
    'Uygun yerlerde madde listesi ve tablo kullan. Resmî belge dili kullan.';
};

export interface BelgeUretimBaglami {
  kullaniciIstegi: string;
  projeTalimatlari?: string;
  projeHafizasi?: string;
  /** Yalnız bu sohbet/proje için zaten getirilmiş kaynaklar, künyeleriyle. */
  ekBaglam: string[];
  gecmis: Mesaj[];
}

export async function uretimIcerigiIste(
  talimat: string,
  tur: UretimTuru,
  modelId: string,
  conversationId?: string,
  ayarlar: { signal?: AbortSignal; baglam?: BelgeUretimBaglami; butce?: TurButcesi } = {},
): Promise<{ markdown: string; kesildi: boolean; kirpmalar: string[] }> {
  iptaliKontrolEt(ayarlar.signal);
  const omur = istekOmru(ayarlar.signal, URETIM_ZAMAN_ASIMI_MS);
  try {
    const b = ayarlar.baglam;
    const sistem = [uretimPromptu(tur), b?.projeTalimatlari, b?.projeHafizasi]
      .filter(Boolean).join('\n\n');
    const istek = b ? `KULLANICININ İSTEĞİ: ${b.kullaniciIstegi}\n\nBELGE TALİMATI: ${talimat}` : talimat;
    const girdi = modelGirdisiniKur({ modelId, sistem,
      gecmis: [...(b?.gecmis ?? []), { role: 'user', content: istek }],
      ekBaglam: b?.ekBaglam, ciktiIstegi: 8000 });
    kullanimBildir(modelId);
    const yanit = await modelUcunaGonder(modelId, {
      messages: girdi.messages, temperature: 0.3, max_tokens: girdi.maxTokens,
      stream: false, chat_template_kwargs: { enable_thinking: false },
    }, { headers: sessionHeaders(conversationId), signal: omur.signal, butce: ayarlar.butce });
    iptaliKontrolEt(omur.signal);
    if (!yanit.ok) throw new Error(`Üretim isteği başarısız (${yanit.status}).`);
    // Zaman aşımı ve iptal yalnız başlıkları değil GÖVDENİN okunmasını da kapsar.
    const veri = await yanit.json();
    iptaliKontrolEt(omur.signal);
    const secim = veri.choices?.[0];
    return {
      markdown: typeof secim?.message?.content === 'string' ? secim.message.content : '',
      kesildi: secim?.finish_reason === 'length',
      kirpmalar: girdi.kirpmalar.map(k => k.aciklama),
    };
  } catch (err) {
    iptaliKontrolEt(ayarlar.signal);
    if (omur.signal.aborted) throw new Error(`Model ${URETIM_ZAMAN_ASIMI_MS / 1000} saniyede yanıt vermedi.`);
    throw err;
  } finally { omur.temizle(); }
}
