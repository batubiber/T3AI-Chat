/**
 * Akıl yürütme metnini adımlara böler.
 *
 * NEDEN: GLM dakikalarca düşünüyor ve çıktısı tek blok halinde geliyordu;
 * kullanıcı nerede olduğunu göremiyordu.
 *
 * NE YAPMIYOR — ÖNEMLİ: faz UYDURMUYOR. Referans tasarımda "arama", "kodlama"
 * gibi fazlar var; bizde araç izi YOK, o etiketleri yazmak yalan olurdu.
 * Burada yalnız MODELİN KENDİ ürettiği yapı görünür kılınıyor: boş satırla
 * ayırdığı bloklar, numaralandırdığı maddeler, "Önce/Sonra/Şimdi" gibi kendi
 * geçiş sözcükleri. Model düz bir blok yazdıysa tek adım kalır — bölmeye
 * zorlanmaz.
 */

export interface ReasoningStep {
  /** 1-tabanlı sıra */
  no: number;
  text: string;
  /** İlk satırdan çıkarılan kısa özet — kapalı görünümde gösterilir */
  ozet: string;
}

/** Modelin kendi geçiş sözcükleri — satır BAŞINDA geçerse yeni adım sayılır. */
const GECIS = /^(önce|ilk olarak|sonra|ardından|şimdi|son olarak|özetle|sonuç olarak|peki|ama|ancak|first|then|next|now|finally)\b/i;

/** "1." / "1)" / "- " / "Adım 3" gibi kendi numaralandırması */
const MADDE = /^(\d{1,2}[.)]\s|[-*•]\s|adım\s*\d+|step\s*\d+)/i;

const MIN_ADIM_UZUNLUK = 40; // bundan kısa parça kendi başına adım olmaz
/**
 * Üst sınır. 12'ydi ve YANLIŞTI: gerçek GLM çıktısı ölçüldü — 4520 karakterlik
 * bir akıl yürütme 21 blok üretti. 12 sınırı 1-11. adımları ~215 karakterlik
 * parçalar, 12. adımı ise kalan 10 bloğun tamamından oluşan ~2150 karakterlik
 * bir duvar yapıyordu.
 *
 * Bloklar BİRLEŞTİRİLMİYOR (modelin kendi yapısını bozmak istemiyoruz); uzun
 * liste bunun yerine tek satırlık ÖZETLERLE çiziliyor, adım tıklanınca açılıyor.
 * O yüzden yüksek adım sayısı artık sorun değil; sınır yalnız uç durum freni.
 */
const MAX_ADIM = 30;

function ozetle(text: string): string {
  const ilk = text.split('\n').find((l) => l.trim().length > 0)?.trim() ?? '';
  // Numara/madde işaretini özetten at — sırayı zaten no veriyor
  const temiz = ilk.replace(MADDE, '').trim();
  if (temiz.length <= 80) return temiz;
  // Cümle sınırından kes, ortadan kesip "..." koymaktan iyi
  const nokta = temiz.slice(0, 80).lastIndexOf('. ');
  return nokta > 30 ? temiz.slice(0, nokta + 1) : temiz.slice(0, 77).trimEnd() + '…';
}

export function parseReasoningSteps(raw: string): ReasoningStep[] {
  const metin = (raw ?? '').trim();
  if (!metin) return [];

  // 1) Boş satır blokları — modelin en güçlü kendi sinyali
  let bloklar = metin
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  // 2) Tek blok geldiyse, satır başındaki madde/geçiş işaretlerinden dene
  if (bloklar.length === 1) {
    const satirlar = metin.split('\n');
    const yeni: string[] = [];
    for (const satir of satirlar) {
      const t = satir.trim();
      const yeniAdim = t.length > 0 && (MADDE.test(t) || GECIS.test(t));
      if (yeniAdim || yeni.length === 0) yeni.push(satir);
      else yeni[yeni.length - 1] += '\n' + satir;
    }
    const temizlenmis = yeni.map((b) => b.trim()).filter(Boolean);
    if (temizlenmis.length > 1) bloklar = temizlenmis;
  }

  // 3) Çok kısa parçalar tek başına adım olmasın — "Plan:" gibi bir başlık
  //    satırı kendi başına adım sayılırsa liste anlamsız uzuyor.
  //    İlk blok kısaysa geriye yapıştıracak blok YOK; ileriye katılıyor.
  const birlesik: string[] = [];
  let bekleyen = '';
  for (const b of bloklar) {
    const parca = bekleyen ? bekleyen + '\n\n' + b : b;
    bekleyen = '';
    if (parca.length < MIN_ADIM_UZUNLUK) {
      if (birlesik.length > 0) birlesik[birlesik.length - 1] += '\n\n' + parca;
      else bekleyen = parca; // henüz adım yok → sonraki bloğa taşı
      continue;
    }
    birlesik.push(parca);
  }
  // Sona kalan kısa parça kaybolmasın
  if (bekleyen) {
    if (birlesik.length > 0) birlesik[birlesik.length - 1] += '\n\n' + bekleyen;
    else birlesik.push(bekleyen);
  }

  // 4) Üst sınır: kalanı son adıma kat, bilgi kaybı olmasın
  const sinirli =
    birlesik.length <= MAX_ADIM
      ? birlesik
      : [...birlesik.slice(0, MAX_ADIM - 1), birlesik.slice(MAX_ADIM - 1).join('\n\n')];

  return sinirli.map((text, i) => ({ no: i + 1, text, ozet: ozetle(text) }));
}
