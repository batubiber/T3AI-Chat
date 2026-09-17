import type { TurButcesi } from './harness/turButcesi';
/**
 * Modelden yapılandırılmış DOCX düzenleme listesi ister.
 *
 * Modele "belgeyi yeniden yaz" DENMEZ — o yol sessizce başka yerleri de
 * değiştirir ve diff'e güvenilemez. Bunun yerine {paragraph, find, replace}
 * listesi istenir; her öğe docxEditor.validateEdits ile tek tek doğrulanır,
 * uydurma veya belirsiz olan dosyaya bulaşmadan reddedilir.
 */
import { resolveChatApiUrl } from './modelConfig';
import { modelUcunaGonder } from './modelIstegi';
import { sessionHeaders } from './sessionHeader';
import { kullanimBildir } from './kullanimBildir';
import type { DocxEdit } from './docxEditor';
import { modelAkisiniOku } from './harness/akis';
import { iptaliKontrolEt, istekOmru } from './harness/iptal';
import { modelGirdisiniKur } from './harness/modelGirdisi';

/** Yanıt gelmezse panel sonsuza kadar dönmesin.
 *  600sn: cluster nginx'inin proxy_read_timeout değeriyle aynı — daha uzun
 *  beklemenin anlamı yok, nginx zaten orada keser. 120sn yetmiyordu; GLM uzun
 *  belgede ayrıntılı akıl yürütüyor ve bu normal. */
const REQUEST_TIMEOUT_MS = 600000;

/** Düzenleme listesi için kelime bütçesi. 4000'di; çok slaytlı sunumlarda
 *  "yazım hatalarını düzelt" gibi genel bir talep bunu doldurup diziyi
 *  ortadan kesiyordu. Takılırsa artık kullanıcıya söyleniyor. */
const EDIT_MAX_TOKENS = 8000;

export interface StreamEditsResult {
  edits: DocxEdit[];
  /** Model bütçeye/süreye takıldı: liste EKSİK olabilir */
  truncated: boolean;
}

/**
 * PDF'e özel ek kural.
 *
 * Taban prompt "paragrafı yeniden yaz" biçimini TERCİH EDİLEN yol olarak
 * sunuyor. Word/PowerPoint/Excel'de doğru: metin yeniden dizilir. PDF'te ise
 * satırlar SABİT — yeniden yazılan satır ya kutuya sığmaz (düzenleme
 * tamamen düşer) ya da tamamı yedek fonta döner ve çevresindeki satırlardan
 * görünür şekilde ayrılır.
 *
 * Canlıda ölçüldü: model satırları yeniden yazınca 14 düzenlemenin 12'si
 * reddedildi; geçen ikisi de görsel olarak bozuktu.
 */
const PDF_EK_KURAL = `

PDF İÇİN ÖZEL KURAL — YUKARIDAKİ TERCİHİ TERSİNE ÇEVİR:
PDF'te satırlar YENİDEN DİZİLEMEZ. Satırın tamamını yeniden yazarsan yeni
metin kutuya sığmayabilir ve düzenleme TAMAMEN DÜŞER; sığsa bile satırın
tümü farklı bir yazı tipine döner ve göze batar.

Bu yüzden PDF'te:
- HER ZAMAN B biçimini (find/replace) kullan.
- "find" alanına yalnız GERÇEKTEN DEĞİŞEN en kısa metni yaz. Tarih
  düzeltiyorsan yalnız tarihi yaz, cümlenin tamamını değil.
- Cümleyi yeniden ifade etme, kelime ekleme/çıkarma. Yalnız istenen
  değişikliği yap.
- "replace" metni "find" metninden belirgin şekilde uzunsa düzenleme
  reddedilir; mümkün olduğunca aynı uzunlukta tut.`;

/** Test için: PDF ek kuralının prompta girip girmediği. */
export function pdfPromptKuraliVarMi(format?: string): boolean {
  return systemPrompt('X', format).includes('PDF İÇİN ÖZEL KURAL');
}

const systemPrompt = (belgeTuru: string, format?: string) => `Sen bir ${belgeTuru} düzenleme yardımcısısın. Sana numaralı paragraflardan oluşan bir belge ve bir düzenleme talebi verilecek.

Görevin, talebi karşılayan düzenlemeleri JSON dizisi olarak döndürmek. BAŞKA HİÇBİR ŞEY YAZMA — açıklama, giriş cümlesi, kod çiti yok, sadece JSON.

İKİ BİÇİM VAR. Her düzenleme için birini seç:

A) PARAGRAFI YENİDEN YAZ — tercih edilen yol
   {"paragraph": <numara>, "replace": "<paragrafın YENİ TAM METNİ>", "reason": "<gerekçe>"}
   Paragrafın tamamını yeniden yazarsın. Hiçbir metni kopyalamak zorunda değilsin.
   ŞU DURUMLARDA BUNU KULLAN: tablo hücreleri, başlıklar, kısa paragraflar
   (200 karakterden az), ve paragrafta birden fazla yeri değiştirdiğin her durum.

B) PARÇA DEĞİŞTİR — yalnız uzun paragrafta tek küçük düzeltme için
   {"paragraph": <numara>, "find": "<değişecek metin>", "replace": "<yeni metin>", "reason": "<gerekçe>"}
   "find" metni o paragrafta AYNEN geçmeli — harfi harfine kopyala. Emin değilsen
   A biçimini kullan; yanlış kopyalanan "find" düzenlemenin tamamen düşmesine yol açar.

Kurallar:
- Emin olmadığın her durumda A biçimini seç. A hiçbir zaman eşleşme hatası vermez.
- Sadece talebin gerektirdiği yerleri değiştir. Talep edilmeyen düzeltme önerme.
- Bir paragrafta birden çok değişiklik varsa TEK bir A düzenlemesi yaz, birden çok B yazma.
- Değişiklik gerekmiyorsa boş dizi döndür: []
- "reason" alanı Türkçe ve kısa olsun (ör. "yazım hatası", "anlatım bozukluğu").
- Sunumlarda "--- Slayt N ---", tablolarda "--- Sayfa: X ---" satırları yalnız
  BAĞLAM içindir; onlara düzenleme yazma.
- EXCEL TABLOLARINDA her satır bir HÜCREdir: "[12] B4 = Kalem". Adres (B4) yalnız
  bağlamdır, sen numarayı kullan. Sayı tutan bir hücreye sayı yaz. Formül hücreleri
  listede HİÇ YOKTUR — atlanan numaralar onlardır, onlara düzenleme yazma.${format === 'pdf' ? PDF_EK_KURAL : ''}`;

export interface EditRequestResult {
  edits: DocxEdit[];
  /** Ham model çıktısı — hata ayıklama ve kullanıcıya gösterme için */
  raw: string;
}

/**
 * Model çıktısından JSON dizisini çıkarır. Model kod çiti veya giriş cümlesi
 * eklemiş olabilir; ilk '[' ile son ']' arası alınır.
 */
export function extractJsonArray(raw: string): unknown {
  const text = raw.replace(/```(?:json)?/gi, '').trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error('Model yanıtında JSON dizisi bulunamadı.');
  return JSON.parse(text.slice(start, end + 1));
}

/** Şemaya uymayan öğeleri eler; kalanları DocxEdit'e çevirir. */
export function coerceEdits(parsed: unknown): DocxEdit[] {
  if (!Array.isArray(parsed)) throw new Error('Model yanıtı bir dizi değil.');
  const out: DocxEdit[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const paragraph = typeof o.paragraph === 'number' ? o.paragraph : Number(o.paragraph);
    if (!Number.isInteger(paragraph) || paragraph < 0) continue;
    if (typeof o.replace !== 'string') continue;
    // find İSTEĞE BAĞLI: yoksa paragrafın tamamı yeniden yazılır (A biçimi)
    const find = typeof o.find === 'string' && o.find.length > 0 ? o.find : undefined;
    out.push({
      paragraph,
      ...(find ? { find } : {}),
      replace: o.replace,
      ...(typeof o.reason === 'string' && o.reason ? { reason: o.reason } : {}),
    });
  }
  return out;
}

/**
 * Modele belgeyi ve talebi yollar, düzenleme listesini döndürür.
 * Bozuk JSON'da BİR kez yeniden dener (modele hatasını söyleyerek).
 */
export async function requestDocumentEdits(
  numberedText: string,
  instruction: string,
  modelId: string,
  signal?: AbortSignal,
): Promise<EditRequestResult> {
  // ChatContext ile AYNI çözümleyici — Gemma'da endpoint alanı yok, yalnız
  // port var; eski kopya bu yüzden Gemma'yı GLM adresine yolluyordu.
  const apiUrl = resolveChatApiUrl(modelId);

  const userContent = `BELGE:\n${numberedText}\n\nTALEP: ${instruction}`;

  const call = async (extraTurn?: { assistant: string; correction: string }) => {
    const timer = new AbortController();
    const timeoutId = setTimeout(() => timer.abort(), REQUEST_TIMEOUT_MS);
    // Çağıranın iptali de geçerli olsun
    if (signal) signal.addEventListener('abort', () => timer.abort(), { once: true });

    const messages: { role: string; content: string }[] = [
      { role: 'system', content: systemPrompt('Word belgesi') },
      { role: 'user', content: userContent },
    ];
    if (extraTurn) {
      messages.push({ role: 'assistant', content: extraTurn.assistant });
      messages.push({ role: 'user', content: extraTurn.correction });
    }

    let response: Response;
    try {
      response = await modelUcunaGonder(
        modelId,
        {
          messages,
          temperature: 0.2,
          max_tokens: 4000,
          stream: false,
          // Yapılandırılmış çıktı isteniyor: düşünme kapalı → JSON çok daha güvenilir
          // ve hızlı geliyor (başlık üretimindeki desenin aynısı).
          chat_template_kwargs: { enable_thinking: false },
        },
        // Sohbet kimliği almıyor: reject mode'da başlıksız istek 400 döner,
        // sessionHeaders() sohbetsiz çağrılarda sabit yedek anahtarı koyuyor.
        { headers: sessionHeaders(), signal: timer.signal },
      );
    } catch (err) {
      // AbortError'un kendi mesajı anlamsız — ne olduğunu söyle
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(
          `Model ${REQUEST_TIMEOUT_MS / 1000} saniyede yanıt vermedi. Belge çok uzun olabilir veya model meşgul.`,
        );
      }
      throw new Error(`Modele ulaşılamadı (${apiUrl}).`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) throw new Error(`Model isteği başarısız (${response.status}).`);
    const data = await response.json();
    const m = data.choices?.[0]?.message;
    const text = (m?.content || m?.reasoning_content || '') as string;
    // TANI: üretimde ham yanıtı görmenin tek yolu konsol
    console.debug('[belge-duzenleme] adres:', apiUrl, '| model:', modelId);
    console.debug('[belge-duzenleme] ham yanıt:', text);
    return text;
  };

  const raw = await call();
  try {
    return { edits: coerceEdits(extractJsonArray(raw)), raw };
  } catch {
    // Tek tur düzeltme şansı — modele ne beklendiğini hatırlat
    const retryRaw = await call({
      assistant: raw.slice(0, 500),
      correction:
        'Yanıtın geçerli JSON değildi. Sadece JSON dizisi döndür, başka hiçbir metin yazma.',
    });
    try {
      return { edits: coerceEdits(extractJsonArray(retryRaw)), raw: retryRaw };
    } catch {
      throw new Error('Model geçerli bir düzenleme listesi üretemedi. Talebi sadeleştirip tekrar deneyin.');
    }
  }
}

// ---------------------------------------------------------------------------
// Akış (SSE) — düzenlemeler geldikçe gösterilsin
// ---------------------------------------------------------------------------

/**
 * Parçalı JSON metninden TAMAMLANMIŞ nesneleri ayıklar.
 *
 * Model diziyi token token yazıyor; her `{...}` kapandığında o düzenleme
 * kullanıcıya gösterilebilir hale gelir. String içindeki süslü parantezler ve
 * kaçış karakterleri sayılmaz, yoksa `"reason": "{ }"` gibi bir değer sayacı
 * bozar.
 *
 * @returns tamamlanmış nesnelerin ham metinleri ve bir sonraki taramanın
 *          başlayacağı konum
 */
export function extractCompleteObjects(
  buffer: string,
  from: number,
): { objects: string[]; nextFrom: number } {
  const objects: string[] = [];
  let i = from;
  let nextFrom = from;

  while (i < buffer.length) {
    // Nesne başlangıcını bul
    while (i < buffer.length && buffer[i] !== '{') i++;
    if (i >= buffer.length) break;

    const start = i;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let closed = false;

    for (; i < buffer.length; i++) {
      const ch = buffer[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          objects.push(buffer.slice(start, i + 1));
          i++;
          nextFrom = i;
          closed = true;
          break;
        }
      }
    }
    if (!closed) break; // yarım nesne — bir sonraki parçada tamamlanacak
  }

  return { objects, nextFrom };
}

/** SSE gövdesindeki bir satırdan delta içeriğini çıkarır ('' = içerik yok). */
export function parseSseLine(line: string): string {
  const t = line.trim();
  if (!t.startsWith('data:')) return '';
  const payload = t.slice(5).trim();
  if (!payload || payload === '[DONE]') return '';
  try {
    const d = JSON.parse(payload);
    const delta = d.choices?.[0]?.delta;
    return (delta?.content || delta?.reasoning_content || '') as string;
  } catch {
    return '';
  }
}

/**
 * Akışın bitiş sebebi ("stop" | "length" | …), yoksa null.
 *
 * Neden gerekli: model max_tokens'a takıldığında JSON dizisi ORTADAN kesiliyor.
 * extractCompleteObjects yalnız tamamlanmış nesneleri verdiği için yarım kalan
 * sessizce düşüyordu ve eksik sonuç, tam sonuçtan ayırt edilemiyordu.
 */
export function sseFinishReason(line: string): string | null {
  const t = line.trim();
  if (!t.startsWith('data:')) return null;
  const payload = t.slice(5).trim();
  if (!payload || payload === '[DONE]') return null;
  try {
    return JSON.parse(payload).choices?.[0]?.finish_reason ?? null;
  } catch {
    return null;
  }
}

/**
 * Düzenlemeleri AKIŞLA ister: model her `{...}` nesnesini bitirdiğinde
 * `onEdit` çağrılır, böylece panel öneriler geldikçe dolar.
 *
 * Neden akış: önceki sürüm stream:false idi ve kullanıcı dakikalarca boş
 * ekrana bakıyordu. Model zaten SSE veriyor — beklemeyi tek parça hale
 * getiren bizim isteğimizdi.
 *
 * Akış kesilirse elde ne varsa o döner; yarım kalan son nesne atılır.
 */
export async function streamDocumentEdits(
  numberedText: string,
  instruction: string,
  modelId: string,
  onEdit: (edit: DocxEdit) => void,
  belgeTuru = 'Word belgesi',
  conversationId?: string,
  /** Formata özel kural için; PDF'te satırlar yeniden dizilemiyor. */
  format?: string,
  signal?: AbortSignal,
  butce?: TurButcesi,
): Promise<StreamEditsResult> {
  iptaliKontrolEt(signal);
  const omur = istekOmru(signal, REQUEST_TIMEOUT_MS);

  const all: DocxEdit[] = [];
  let truncated = false;
  try {
    const girdi = modelGirdisiniKur({ modelId, sistem: systemPrompt(belgeTuru, format),
      gecmis: [{ role: 'user', content: `BELGE:\n${numberedText}\n\nTALEP: ${instruction}` }],
      ciktiIstegi: EDIT_MAX_TOKENS });
    // Bir düzenleme isteğinde belgeyi ortadan kesmek adresleri/niyeti bozabilir.
    if (girdi.kirpmalar.length) throw new Error('Belge düzenleme bağlamına sığmıyor. Daha küçük bir bölüm seçin.');
    kullanimBildir(modelId);
    const response = await modelUcunaGonder(
      modelId,
      {
        messages: girdi.messages,
        temperature: 0.2,
        max_tokens: girdi.maxTokens,
        stream: true,
        chat_template_kwargs: { enable_thinking: false },
      },
      { headers: sessionHeaders(conversationId), signal: omur.signal, butce },
    );
    if (!response.ok) throw new Error(`Model isteği başarısız (${response.status}).`);
    if (!response.body) throw new Error('Model akışı okunamadı.');

    let json = '';
    let scanned = 0;
    for await (const event of modelAkisiniOku(response.body, omur.signal)) {
      const delta = event.choices?.[0]?.delta;
      json += delta?.content || delta?.reasoning_content || '';
      if (event.choices?.[0]?.finish_reason === 'length') truncated = true;
      const { objects, nextFrom } = extractCompleteObjects(json, scanned);
      scanned = nextFrom;
      for (const raw of objects) {
        try {
          const [edit] = coerceEdits([JSON.parse(raw)]);
          if (edit) {
            all.push(edit);
            onEdit(edit);
          }
        } catch {
          /* tek bozuk nesne akışı bozmasın */
        }
      }
    }
    return { edits: all, truncated };
  } catch (err) {
    iptaliKontrolEt(signal);
    if (omur.signal.aborted) {
      // Süre doldu: o ana kadar gelenler geçerli, boş dönmektense onları ver
      if (all.length > 0) return { edits: all, truncated: true };
      throw new Error(
        `Model ${REQUEST_TIMEOUT_MS / 1000} saniyede yanıt vermedi. Belge çok uzun olabilir.`,
      );
    }
    if (all.length > 0) return { edits: all, truncated: true };
    throw err instanceof Error ? err : new Error('Model isteği başarısız.');
  } finally {
    omur.temizle();
  }
}
