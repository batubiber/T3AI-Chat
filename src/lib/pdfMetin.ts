/**
 * PDF düzenlemenin SAF kısmı: ölçüm, sığma kontrolü, koordinat ve
 * numaralandırma.
 *
 * MuPDF'ten AYRI tutuluyor çünkü 10 MB WASM yüklemeden test edilebilsin.
 * Ölçüm fonksiyonu dışarıdan enjekte ediliyor; burada glif metriği yok,
 * yalnız aritmetik var.
 */

/** Bir metnin 1 punto font için genişliği. Gerçekte MuPDF font metriği verir. */
export type OlcFn = (metin: string) => number;

export interface PdfSatir {
  /** Model'e giden birim numarası — DocumentEdit.paragraph ile aynı. */
  birim: number;
  /** 1'den başlayan sayfa numarası. */
  sayfa: number;
  metin: string;
  /** Sayfadaki konumu: [x0, y0, x1, y1] */
  dikdortgen: [number, number, number, number];
  /** Orijinal font boyutu — yeni metin de bu boyutla yazılıyor. */
  boyut: number;
}

export function metinGenisligi(metin: string, boyut: number, olc: OlcFn): number {
  return olc(metin) * boyut;
}

/**
 * Yeni metin eski metnin kutusuna sığıyor mu?
 *
 * PDF'te satırlar YENİDEN DİZİLMEZ; sığmayan metin komşu kelimelerin üstüne
 * taşar. Sığmıyorsa düzenleme reddediliyor — sessizce bozuk bir PDF vermek
 * yerine neyin uygulanamadığını söylüyoruz.
 */
/**
 * Ölçüm toleransı.
 *
 * Karakter genişliklerini TEK TEK toplamak, yuvarlama yüzünden gerçek metin
 * genişliğinden sistematik olarak BÜYÜK çıkıyor (PyMuPDF dokümantasyonu bunu
 * açıkça uyarıyor). Üstelik ölçüm Helvetica ile yapılıyor ama kutu belgenin
 * kendi fontuyla dizilmiş; ölçülen gerçek belgede %±7 sapıyor.
 *
 * Tolerans olmadan tam sığan metinler yanlışlıkla reddediliyordu.
 */
export const OLCUM_TOLERANSI = 1.05;

export function sigarMi(yeni: string, boyut: number, kutuGenisligi: number, olc: OlcFn): boolean {
  return metinGenisligi(yeni, boyut, olc) <= kutuGenisligi * OLCUM_TOLERANSI;
}

/**
 * Bir metnin sigdirilabilecegi EN KUCUK oran.
 *
 * Bunun altinda punto o kadar kuculuyor ki satir cevresindeki metinden
 * gorunur sekilde kopuyor ve okunmaz hale geliyor; oyle bir PDF vermektense
 * duzenlemeyi reddetmek daha durust.
 */
export const EN_AZ_OLCEK = 0.75;

/**
 * Yeni metnin yazilacagi font boyutu; sigdirilamiyorsa `null`.
 *
 * PDF'te satirlar yeniden dizilmedigi icin tasan metin komsu kelimelerin
 * ustune biner. Uretimdeki standart cozum metni REDDETMEK degil, kutuya
 * sigacak kadar KUCULTMEK -- PyMuPDF'in kendi ornegi de boyle yapiyor.
 *
 * Zaten siganda orijinal boyut aynen donuyor: gereksiz kucultme yok.
 *
 * Kucultme hedefi kutunun KENDISI, tolerans dahil degil. Tolerans olcum
 * gurultusu icin "kabul" esigini gevsetiyor; boyutu biz secerken bilerek
 * %5 tasan bir metin uretmenin anlami olmaz.
 */
export function sigacakBoyut(
  yeni: string,
  boyut: number,
  kutuGenisligi: number,
  olc: OlcFn,
  enAzOlcek: number = EN_AZ_OLCEK,
): number | null {
  if (sigarMi(yeni, boyut, kutuGenisligi, olc)) return boyut;
  const olcek = kutuGenisligi / metinGenisligi(yeni, boyut, olc);
  if (!(olcek >= enAzOlcek)) return null;
  return boyut * olcek;
}

/**
 * MuPDF quad'ı (dört köşe, sekiz sayı) → dikdörtgen.
 *
 * min/max ŞART: döndürülmüş sayfalarda köşeler sıralı gelmiyor, ilk ve son
 * çifti almak yanlış kutu üretiyor.
 */
export function quadDikdortgene(quad: number[]): [number, number, number, number] {
  const xler = [quad[0], quad[2], quad[4], quad[6]];
  const yler = [quad[1], quad[3], quad[5], quad[7]];
  return [Math.min(...xler), Math.min(...yler), Math.max(...xler), Math.max(...yler)];
}

/**
 * Modele gidecek numaralı metin.
 *
 * Biçim pptx/xlsx ile BİREBİR AYNI (`--- ... ---` başlığı + `[N] metin`).
 * Bu sayede `yerTutuculariBul` ve model promptları formattan habersiz kalıyor
 * ve şablon doldurma PDF'te de bedava çalışıyor.
 */
export function satirlariNumarala(satirlar: PdfSatir[]): string {
  const cikti: string[] = [];
  let sonSayfa = -1;
  for (const s of satirlar) {
    if (s.sayfa !== sonSayfa) {
      cikti.push(`--- Sayfa ${s.sayfa} ---`);
      sonSayfa = s.sayfa;
    }
    cikti.push(`[${s.birim}] ${s.metin}`);
  }
  return cikti.join('\n');
}

/**
 * İki metin arasındaki EN KÜÇÜK değişen parçayı bulur.
 *
 * NEDEN: model çoğu zaman satırın TAMAMINI gönderiyor (tarih düzeltmede bile).
 * Tamamını değiştirmek iki şeyi birden bozuyordu:
 *
 *  1. Satırın tümü yedek fonta (Helvetica) dönüyordu — çevresindeki
 *     satırlardan görünür şekilde farklı çıkıyordu.
 *  2. İki yana yaslı metinde satır kutuyu tam doldurduğu için boşluk payı
 *     sıfır; "sığar mı" kararı ölçüm gürültüsüne kalıyordu.
 *
 * Ortak ön ek ve son ek atılınca geriye yalnız değişen parça kalıyor: satırın
 * geri kalanı ORİJİNAL fontuyla yerinde kalıyor ve sığma kontrolü anlamlı
 * hale geliyor.
 *
 * Kod noktası bazında çalışıyor (Türkçe harfler ve yüzey biçimleri için
 * dizinin kendisi değil `[...metin]` kullanılıyor).
 *
 * Metinler aynıysa `null` döner — uygulanacak bir şey yok.
 */
export function enKucukFark(eski: string, yeni: string): { find: string; replace: string } | null {
  if (eski === yeni) return null;
  const a = [...eski];
  const b = [...yeni];

  let on = 0;
  while (on < a.length && on < b.length && a[on] === b[on]) on += 1;

  let arka = 0;
  while (arka < a.length - on && arka < b.length - on
    && a[a.length - 1 - arka] === b[b.length - 1 - arka]) arka += 1;

  // KELİME SINIRINA genişlet. Karakter seviyesinde kesmek ("11" -> "26")
  // gömülen metni ayrı bir parçaya düşürüyor ve "2026" ARANAMAZ hale geliyor
  // — ölçüldü. Kelimenin tamamını değiştirmek hem aranabilirliği koruyor hem
  // de satırın geri kalanını orijinal fontunda bırakıyor.
  while (on > 0 && !/\s/.test(a[on - 1])) on -= 1;
  while (arka > 0 && !/\s/.test(a[a.length - arka])) arka -= 1;

  return {
    find: a.slice(on, a.length - arka).join(''),
    replace: b.slice(on, b.length - arka).join(''),
  };
}
