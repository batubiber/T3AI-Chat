/**
 * Markdown tablolarında kolon hizalaması.
 *
 * İki kaynak var, öncelik sırasıyla:
 *
 * 1. MODELİN KENDİ hizalaması — markdown'da `---:` yazdıysa ona uyulur.
 *    Mevcut kodda bu bilgi TAMAMEN DÜŞÜYORDU: th/td bileşenleri yalnız
 *    `children` alıyordu, remark-gfm'in ürettiği hizalama atılıyordu. Yani
 *    model doğru yazsa bile sayılar sola yaslı kalıyordu.
 *
 * 2. Model hizalama yazmadıysa SAYISAL kolon sezgisi. Sayılar sola yaslıyken
 *    basamaklar hizalanmıyor ve tablo okunmuyor; sağa yaslandığında binler
 *    basamağı alt alta geliyor.
 *
 * Sezgi bilinçli olarak muhafazakâr: kolonun boş olmayan hücrelerinin
 * çoğunluğu sayı değilse sola yaslı kalır. Metin kolonunu yanlışlıkla sağa
 * yaslamak, sayı kolonunu sola bırakmaktan daha rahatsız edici.
 */

export type Hiza = 'left' | 'right' | 'center';

/** Sayısal kolon eşiği — bunun altında kalırsa metin kolonu sayılır. */
const SAYISAL_ORAN = 0.6;

/**
 * Türkçe biçimli sayı mı?
 *
 * Kapsanan biçimler: `12`, `1.240`, `45.000 TL`, `%18`, `+%9`, `-3,5`, `0`.
 * Kapsanmayan (bilerek): `Stokta`, `Elektronik`, `3 adet stok kaldı` gibi
 * içinde sayı GEÇEN ama sayı OLMAYAN metinler.
 */
export function sayisalMi(deger: string): boolean {
  const t = deger.trim();
  if (!t) return false;

  const temiz = t
    .replace(/^[+\-−–]/, '') // baştaki işaret
    .replace(/%/g, '')
    .replace(/\s*(TL|TRY|₺|\$|€|£|adet|kg|gr?|lt?|m|cm|mm|km|saat|dk|sn|ad\.)\.?$/i, '')
    .trim();

  if (!temiz) return false;

  // 1.234.567,89  |  1234,89  |  1234.89  |  42
  return /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(temiz) || /^\d+([.,]\d+)?$/.test(temiz);
}

/**
 * Her kolon için hiza.
 *
 * @param acikHizalar remark-gfm'den gelen hizalar (yoksa null)
 * @param satirlar    gövde satırları, her biri hücre METİNLERİ
 */
export function kolonHizalari(
  acikHizalar: (Hiza | null)[],
  satirlar: string[][],
): Hiza[] {
  const kolonSayisi = Math.max(
    acikHizalar.length,
    ...satirlar.map((s) => s.length),
    0,
  );

  return Array.from({ length: kolonSayisi }, (_, k) => {
    // 1) Model kendisi söylediyse tartışma yok
    const acik = acikHizalar[k];
    if (acik) return acik;

    // 2) Sayısal kolon sezgisi
    const hucreler = satirlar.map((s) => s[k] ?? '').filter((h) => h.trim().length > 0);
    if (hucreler.length === 0) return 'left';
    const sayisal = hucreler.filter(sayisalMi).length;
    return sayisal / hucreler.length >= SAYISAL_ORAN ? 'right' : 'left';
  });
}
