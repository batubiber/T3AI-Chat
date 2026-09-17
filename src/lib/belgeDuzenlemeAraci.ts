/**
 * Belge DÜZENLEME aracı — ana modelin akışında tanıtılıyor.
 *
 * Önce ayrı bir kapı modeli (Gemma) "bu bir düzenleme talebi mi" diye
 * sınıflandırıyordu. Üç sorunu vardı:
 *
 *  1. Mesaj gönderilmeden ÖNCE bloke ediyordu — kullanıcı belge her ekliyken
 *     ikinci bir modele gidip gelmeyi bekliyordu.
 *  2. Kapı yalnız DOSYA ADINI ve son mesajı görüyordu; konuşmanın geri kalanını
 *     görmediği için "peki şunu da düzelt" gibi devam cümlelerini kaçırıyordu.
 *  3. Düzenleme turu sohbet turunun YERİNE geçtiği için yanlış tetiklenme
 *     kullanıcının mesajını sohbete hiç göndermeden siliyordu; bu yüzden kapı
 *     kararsızlıkta ÇAĞIRMAMA yönünde eğimliydi ve gerçek istekleri kaçırıyordu.
 *
 * Artık karar cevabı yazan modelde ve tur sohbette KALIYOR: model kısa bir
 * cevap yazıp aracı çağırıyor, panel de değişikliği gösteriyor. Yanlış
 * tetiklenme artık mesaj kaybettirmediği için "kararsızsan çağırma" eğimine de
 * gerek kalmadı.
 *
 * Belge üretme aracının (`BELGE_URET_ARACI`) simetriği; ondan farkı, aracın
 * ancak düzenlenecek bir hedef VARKEN tanıtılması.
 */
import { BELGE_URET_ARACI } from './belgeUretimKapisi';

/** Düzenlenecek belge. Hedef yoksa araç modele hiç tanıtılmıyor. */
export type DuzenlemeHedefi =
  /** Bu turda eklenen belge. */
  | { tur: 'dosya'; ad: string; turEtiketi: string; dosya: File }
  /** Bu sohbette daha önce üretilmiş/düzenlenmiş belge — düzenlemeler üst üste birikir. */
  | { tur: 'artifact'; ad: string; turEtiketi: string; artifactId: string };

/**
 * Araç tanımı.
 *
 * Dosya adı ve tür açıklamanın İÇİNDE: eski kapıda tür sabit "Word belgesi"
 * yazılıyordu ve PPTX'te modeli yanıltıyordu — ölçülmüştü.
 */
export function belgeDuzenleAraci(ad: string, turEtiketi: string) {
  return {
    type: 'function',
    function: {
      name: 'belge_duzenle',
      description:
        `"${ad}" adlı ${turEtiketi}nin İÇERİĞİNDE değişiklik yapmak için çağrılır: ` +
        `düzeltme, yeniden yazma, terim değiştirme, ekleme, çıkarma. Belge ` +
        `hakkında SORU sorulduğunda (özetleme, sayım, "ne anlatıyor") çağırma.`,
      parameters: {
        type: 'object',
        properties: {
          talimat: {
            type: 'string',
            description: 'Belgede istenen değişikliğin tek cümlelik özeti',
          },
        },
        required: ['talimat'],
      },
    },
  };
}

/**
 * Sistem mesajına eklenen not.
 *
 * "Belgeyi cevabının içinde yeniden YAZMA" şart: not olmadığında model
 * belgenin tamamını sohbete döküyordu — kullanıcının indiremediği, biçimi
 * kaybolmuş bir metin yığını (ölçüldü, `documentEditHandoffHint`in de çözdüğü
 * sorun buydu).
 */
export function belgeDuzenlemeIpucu(hedef: DuzenlemeHedefi): string {
  const giris =
    hedef.tur === 'dosya'
      ? `KULLANICI DÜZENLENEBİLİR BİR BELGE EKLEDİ: "${hedef.ad}" (${hedef.turEtiketi}).`
      : `BU SOHBETTE ÜZERİNDE ÇALIŞILAN BİR BELGE VAR: "${hedef.ad}" (${hedef.turEtiketi}).`;
  return (
    `${giris}\n` +
    `Kullanıcı bu belgenin içeriğinin DEĞİŞTİRİLMESİNİ istiyorsa belge_duzenle ` +
    `aracını çağır; düzenlenmiş dosyayı ayrı bir panel üretir ve kullanıcı ` +
    `oradan indirir. Belgeyi cevabının içinde yeniden YAZMA. Aracı çağırdığında ` +
    `cevabında yalnızca ne değiştirdiğini kısaca söyle. Belge hakkında soru ` +
    `sorulduysa aracı çağırma, normal şekilde cevap ver.`
  );
}

/**
 * Bir sohbet turunda modele tanıtılan araçların TAMAMI.
 *
 * Düzenleme aracı ancak hedef varken listeye giriyor; yoksa model ortada belge
 * yokken `belge_duzenle` çağırabilir ve panel açacak bir dosya bulamaz.
 *
 * Üretme aracı her durumda duruyor: ekli bir belge varken de "bundan bir sunum
 * çıkar" denebilir ve o istek düzenleme değil üretimdir.
 */
export function sohbetAraclari(hedef?: DuzenlemeHedefi) {
  /* Araçların parametre şemaları farklı (talimat / tur+baslik), o yüzden
     ortak tip vLLM'in beklediği kadar gevşek tutuluyor. */
  const araclar: {
    type: string;
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }[] = [BELGE_URET_ARACI];
  if (hedef) araclar.push(belgeDuzenleAraci(hedef.ad, hedef.turEtiketi));
  /* BELLEK ARACI BURADA YOK — bilerek. Araç çağırmak modelin turunu bitiriyor;
     belge araçlarında sorun değil (çağrı zaten cevabın kendisi, panel açılıyor)
     ama bellek önerisi bir yan not ve model turu ona harcayıp hiç cevap
     üretmiyordu. Öneri artık cevap bittikten sonra ayrı, küçük bir istekle
     soruluyor: hafizaKontrolu.ts. */
  return araclar;
}

/** `duzenlemeHedefiCoz` girdisi. */
export interface HedefGirdisi {
  /** Bu turda AYRIŞTIRILMASI bitmiş belgeler. */
  hazirBelgeler: { ad: string; dosya: File }[];
  /** Kutudaki TÜM belgeler — hatalı durumda duranlar dahil. */
  secilenBelgeSayisi: number;
  mesajVar: boolean;
  /** Sohbetin son üretilmiş/düzenlenmiş belgesi. */
  sonArtifact?: { id: string; ad: string } | null;
  /** Ad → tür etiketi ("Word belgesi"), düzenlenemiyorsa null. Enjekte
   *  ediliyor: gerçek çözücü JSZip ve mupdf'i içeri çekiyor, bu modülün
   *  formatları bilmesine gerek yok. */
  bicimCoz: (ad: string) => string | null;
}

/**
 * Bu turda düzenlenebilecek belge — YOKSA `undefined`.
 *
 * Karar "düzenleme mi değil mi" DEĞİL; onu model veriyor. Burada yalnız
 * "ortada tek ve belirli bir belge var mı" sorusuna bakılıyor.
 */
export function duzenlemeHedefiCoz(g: HedefGirdisi): DuzenlemeHedefi | undefined {
  if (!g.mesajVar) return undefined;

  // Tek belge ekli ve düzenlenebilir. Yanında BAŞKA bir dosya varsa hedef
  // yok: kullanıcı iki dosya hakkında konuşuyordur, birini sessizce
  // değiştirmek yanlış olur.
  if (g.hazirBelgeler.length === 1) {
    const tek = g.hazirBelgeler[0];
    const etiket = g.bicimCoz(tek.ad);
    if (etiket) return { tur: 'dosya', ad: tek.ad, turEtiketi: etiket, dosya: tek.dosya };
    return undefined;
  }
  if (g.hazirBelgeler.length > 1) return undefined;

  /* Hiç belge EKLENMEMİŞ: sohbetin son belgesi hedef. Kullanıcı paneli kapatıp
     "şunu da düzelt" dediğinde belgeyi yeniden eklemek zorunda kalmıyor ve
     düzenlemeler üst üste birikiyor.

     `secilenBelgeSayisi` (hazır olan değil): hatalı durumda duran bir dosya
     kutuda dururken kullanıcı ONU düzenlediğini sanır; eski belgeye düşmek
     bambaşka bir dosyayı değiştirirdi. */
  if (g.secilenBelgeSayisi > 0 || !g.sonArtifact) return undefined;
  const etiket = g.bicimCoz(g.sonArtifact.ad);
  if (!etiket) return undefined;
  return { tur: 'artifact', ad: g.sonArtifact.ad, turEtiketi: etiket, artifactId: g.sonArtifact.id };
}
