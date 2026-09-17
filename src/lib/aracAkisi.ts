/**
 * Akıştan gelen araç çağrısını biriktirir ve çözer.
 *
 * NEDEN SAF VE AYRI: asıl karmaşıklık burada. vLLM araç çağrısını akışta
 * PARÇA PARÇA yolluyor — `function.arguments` harf harf bölünebiliyor, `name`
 * genelde yalnız ilk parçada geliyor, bazı sunucular `index` alanını hiç
 * yollamıyor. Bu mantık akış döngüsünün içine gömülseydi test edilemezdi.
 *
 * Biçim `--tool-call-parser` seçiminden bağımsız: çözümleyici modelin HAM
 * çıktısını nasıl okuduğunu belirliyor, dışarı verilen akış her durumda
 * standart OpenAI biçiminde.
 */

export interface AracBirikimi {
  index: number;
  id?: string;
  ad: string;
  argumanlar: string;
  hata?: string;
}

/** Bir delta parçasını birikime ekler; birikimi DEĞİŞTİRMEZ, yenisini döner. */
export function aracParcasiEkle(birikim: AracBirikimi[], parca: unknown): AracBirikimi[] {
  if (!parca || typeof parca !== 'object') return birikim;
  const p = parca as { index?: unknown; id?: unknown; function?: unknown };
  const fn = p.function;
  if (!fn || typeof fn !== 'object') return birikim;
  const f = fn as { name?: unknown; arguments?: unknown };

  // index yoksa 0: bazı sunucular tek çağrıda alanı hiç yollamıyor.
  const index = typeof p.index === 'number' ? p.index : 0;
  const yeni = [...birikim];
  const mevcut = yeni.findIndex((x) => x.index === index);
  const taban: AracBirikimi = mevcut >= 0
    ? { ...yeni[mevcut] }
    : { index, ad: '', argumanlar: '' };

  if (typeof p.id === 'string' && p.id) {
    if (taban.id && taban.id !== p.id) taban.hata = 'Aynı index farklı çağrı kimlikleri taşıyor.';
    taban.id = p.id;
  }
  if (p.index !== undefined && (typeof p.index !== 'number' || !Number.isInteger(p.index) || p.index < 0)) taban.hata = 'Geçersiz araç index değeri.';
  if (typeof f.name === 'string' && taban.ad && f.name !== taban.ad) taban.hata = 'Aynı çağrının araç adı değişti.';
  if (typeof f.name === 'string' && f.name) taban.ad = f.name;
  if (typeof f.arguments === 'string') taban.argumanlar += f.arguments;
  if (taban.argumanlar.length > 32768) {
    taban.hata = 'Araç argümanları boyut sınırını aştı.';
    taban.argumanlar = taban.argumanlar.slice(0, 32769);
  }

  if (mevcut >= 0) yeni[mevcut] = taban;
  else yeni.push(taban);
  return yeni;
}

/**
 * Beklenen adı taşıyan çağrının argümanlarını çözer; yoksa ya da bozuksa null.
 *
 * Akış `max_tokens`'a takılırsa argümanlar YARIDA kalabiliyor; o durumda
 * çözümleme hata fırlatmak yerine null dönüyor ve akış normal cevap gibi
 * tamamlanıyor.
 */
export function aracCagrisiCoz(
  birikim: AracBirikimi[],
  beklenenAd: string,
): Record<string, unknown> | null {
  const cagri = birikim.find((x) => x.ad === beklenenAd);
  if (!cagri) return null;
  try {
    const cozulen = JSON.parse(cagri.argumanlar);
    if (!cozulen || typeof cozulen !== 'object' || Array.isArray(cozulen)) return null;
    return cozulen as Record<string, unknown>;
  } catch {
    return null;
  }
}
