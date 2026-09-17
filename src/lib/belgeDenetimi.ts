/**
 * Üretilen belgenin kullanıcıya verilmeden önceki denetimi.
 *
 * "Dive into Claude Code" (arXiv 2604.14228, §13.1) kapanmamış boşluğu
 * ÜRETİCİ–DEĞERLENDİRİCİ AYRIMI diye adlandırıyor: üretimi yapan modelin
 * çıktısını, üretimden bağımsız bir adımın denetlemesi. Alıntıladığı gözlem
 * de bunu gerektiriyor — dağıtılmış sistemlerin baskın hata biçimi çökme
 * değil sessiz hata.
 *
 * Bizdeki karşılığı somut: panelde düzgün görünen ama açınca işe yaramaz
 * çıkan dosyalar. İki tanesi ölçüldü:
 *
 *  - Model yalnız başlık üretirse başlıklı ama içeriksiz bir Word/sunum
 *    çıkıyor. Panelde başlıklar göründüğü için sorun fark edilmiyor.
 *  - `tabloVarMi` yalnız tablonun VARLIĞINA bakıyor. Model başlık satırı
 *    döndürüp veri döndürmezse kullanıcı boş bir Excel alıyor.
 *
 * UYARIYOR, REDDETMİYOR. Dosya yine veriliyor: yalnız başlıklardan oluşan bir
 * sunum bile taslak olarak işe yarayabilir ve yanlış reddetme, vasat bir
 * dosyadan kötüdür. Amaç sorunu görünür kılmak, işi çöpe atmak değil.
 */
import type { Blok } from './belgeIcerik';
import type { UretimTuru } from './belgeUretimKapisi';

/** Başlık DIŞINDA gerçek içerik taşıyan blok var mı? */
function icerikVarMi(bloklar: Blok[]): boolean {
  return bloklar.some((b) => b.tip !== 'baslik');
}

/** Herhangi bir tabloda başlık satırı dışında veri var mı? */
function tabloVerisiVarMi(bloklar: Blok[]): boolean {
  return bloklar.some((b) => b.tip === 'tablo' && b.satirlar.length > 0);
}

/**
 * Kullanıcıya gösterilecek uyarı; sorun yoksa `null`.
 *
 * Boş blok listesi burada uyarı ÜRETMİYOR: o durumu çağıran taraf zaten ayrı
 * ele alıyor ve dosyayı hiç üretmiyor. Burada iki kez söylemek gereksiz.
 */
export function belgeUyarisi(bloklar: Blok[], tur: UretimTuru): string | null {
  if (bloklar.length === 0) return null;

  if (!icerikVarMi(bloklar)) {
    return 'Belge yalnızca başlıklardan oluşuyor, içerik üretilmemiş. İsteği biraz daha ayrıntılandırıp tekrar deneyebilirsiniz.';
  }

  /* Tablo denetimi YALNIZ xlsx'te: Word belgesinde tablo yan bir öge, boş
     kalması belgeyi işe yaramaz yapmıyor. Orada uyarmak yanlış alarm olurdu. */
  if (tur === 'xlsx' && !tabloVerisiVarMi(bloklar)) {
    return 'Tabloda başlık satırı dışında veri yok. İsteği biraz daha somutlaştırıp tekrar deneyebilirsiniz.';
  }

  return null;
}
