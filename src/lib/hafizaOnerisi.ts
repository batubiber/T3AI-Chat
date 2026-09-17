/**
 * Proje hafızasına ekleme ÖNERİSİ.
 *
 * Proje hafızası bugün yalnız elle yazılıyor: kullanıcı proje panelindeki
 * metin alanına girip kaydediyor. Sonuç olarak çoğu projede boş kalıyor ve
 * konuşmalarda ortaya çıkan kalıcı bilgi ("raporlar hep İngilizce olacak")
 * her yeni sohbette yeniden anlatılıyor.
 *
 * "Dive into Claude Code" (arXiv 2604.14228, §7.2) hafızayı ayrı bir katman
 * olarak sayıyor ve tasarım ilkesini şöyle koyuyor: saklanan bağlam kullanıcı
 * tarafından İNCELENEBİLİR ve DÜZENLENEBİLİR olmalı — bu yüzden gömülü vektör
 * yerine düz metin dosyası. Bizim hafıza alanı zaten öyle; eksik olan yazma
 * tarafı.
 *
 * OTOMATİK YAZMIYORUZ, ÖNERİYORUZ. Kullanıcının kendi düzenlediği bir alana
 * habersiz müdahale, o alana duyduğu güveni bitirirdi. Model aracı çağırıyor,
 * kullanıcı sohbette çıkan kartla onaylıyor ya da yoksayıyor. Karar modelde,
 * yetki kullanıcıda.
 */

/** Hafıza alanının tavanı (karakter). */
export const AZAMI_HAFIZA = 4000;

/** Tek bir önerinin tavanı: hafıza kullanıcının GÖZLE okuduğu bir alan. */
export const AZAMI_ONERI = 400;

/**
 * Satır başındaki madde işareti. Kullanıcı elle `-`, `*` ya da `•` yazmış
 * olabilir; hepsi aynı şeyi kastediyor.
 */
const ISARET_DESENI = /^\s*[-–—*•]\s*/;

/** Yeni eklenen satırların başına konan işaret. */
export const MADDE_ONEKI = '- ';

/**
 * Karşılaştırma için sadeleştirme: madde işareti, boşluk ve harf büyüklüğü
 * farkı sayılmaz.
 *
 * İŞARET DE AYIKLANIYOR: aynı bilgi bir kez elle işaretsiz, bir kez de
 * öneriyle işaretli yazılırsa iki ayrı satır sanılırdı.
 */
const sadelestir = (s: string) =>
  s.replace(ISARET_DESENI, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr');

/**
 * Bellek metnini maddelere ayırır — GÖSTERİM için.
 *
 * Saklanan biçim düz metin olarak kalıyor ("Dive into Claude Code" §7.2:
 * saklanan bağlam kullanıcı tarafından incelenebilir ve düzenlenebilir
 * olmalı). Liste yalnız ekranda kuruluyor, veri modeli değişmiyor.
 *
 * Satır başındaki işaret ayıklanıyor ki listede iki kez çizilmesin.
 */
export function maddeleriCoz(metin: string | undefined | null): string[] {
  if (!metin) return [];
  return metin
    .split('\n')
    .map((satir) => satir.replace(ISARET_DESENI, '').trim())
    .filter((satir) => satir.length > 0);
}

export function oneriGecerliMi(bilgi: string): boolean {
  const t = bilgi.trim();
  return t.length >= 8 && t.length <= AZAMI_ONERI;
}

/**
 * Araç tanımı.
 *
 * Açıklama aşırı tetiklenmenin TEK freni: her turda öneri çıkarsa kullanıcı
 * kartı görmezden gelmeyi öğrenir ve özellik ölür. Bu yüzden hem ne olduğu hem
 * ne OLMADIĞI örnekle yazılı.
 */
export function hafizaAraci() {
  return {
    type: 'function',
    function: {
      name: 'proje_hafizasi_ekle',
      description:
        'Konuşmada, bu projenin BÜTÜN sohbetlerinde geçerli olacak KALICI bir ' +
        'bilgi ortaya çıktığında çağrılır. Örnekler: "raporlar hep İngilizce ' +
        'hazırlanacak", "şirket adı belgelerde Örnek Teknoloji olarak geçecek", ' +
        '"ölçü birimi metrik". Tek seferlik istekler, soruların cevapları ve ' +
        'konuşmanın kendi içeriği için ÇAĞIRMA. Emin değilsen çağırma.',
      parameters: {
        type: 'object',
        properties: {
          bilgi: {
            type: 'string',
            description: 'Hafızaya eklenecek tek cümlelik kalıcı bilgi',
          },
        },
        required: ['bilgi'],
      },
    },
  };
}

export type EklemeDurumu = 'eklendi' | 'zaten-var' | 'dolu' | 'gecersiz';

/**
 * Öneriyi hafızanın ALTINA ekler.
 *
 * Üstüne yazmıyor: hafıza kullanıcının kendi düzenlediği bir alan ve oradaki
 * satırları silmek onun yazdığını yok etmek olurdu.
 */
export function hafizayaEkle(
  mevcut: string,
  bilgi: string,
  azami: number = AZAMI_HAFIZA,
): { metin: string; durum: EklemeDurumu } {
  if (!oneriGecerliMi(bilgi)) return { metin: mevcut, durum: 'gecersiz' };
  const temiz = bilgi.trim();

  const satirlar = mevcut.split('\n').map(sadelestir);
  if (satirlar.includes(sadelestir(temiz))) return { metin: mevcut, durum: 'zaten-var' };

  /* Madde işaretiyle ekleniyor. Modelin de işine yarıyor: bellek isteğe tek
     blok olarak giriyor ve satır satır olunca her satır ayrı bir KURAL gibi
     okunuyor, düz paragrafta arka plan anlatısına karışıyor. Maliyeti satır
     başına iki token.

     Kullanıcının ELLE yazdığı mevcut metne dokunulmuyor: kendi yazdığını
     yeniden biçimlendirmek, bu alana duyduğu güveni bozardı. */
  const satir = `${MADDE_ONEKI}${temiz}`;
  const yeni = mevcut.trim() ? `${mevcut.trimEnd()}\n${satir}` : satir;
  if (yeni.length > azami) return { metin: mevcut, durum: 'dolu' };
  return { metin: yeni, durum: 'eklendi' };
}
