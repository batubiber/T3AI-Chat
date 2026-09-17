/**
 * PDF düzenleme sürücüsü — MuPDF'e dokunan TEK yer.
 *
 * MuPDF 10 MB WASM taşıyor; `await import('mupdf')` ile tembel yükleniyor,
 * böylece PDF düzenlemeyen kullanıcı indirmiyor. Buradaki `import type`
 * bildirimleri derlemede tamamen siliniyor, yani tembelliği bozmuyor.
 *
 * Değiştirme yöntemi: eski metin REDAKSİYONLA siliniyor (üstünü boyamak
 * değil — altında seçilebilir metin kalmıyor), yerine FreeText yazılıp
 * `bake` ile sayfa içeriğine gömülüyor. `bake` olmadan yeni metin annotation
 * kalır: görünür ama aranamaz, kopyalanamaz ve okuyucuda silinebilir.
 */
import type { PDFDocument } from 'mupdf';
import type {
  LoadedDocument, DocumentEdit, AcceptedDocumentEdit, DocumentEditRejection, ChangedUnit,
} from './documentEditing';
import { enKucukFark, metinGenisligi, quadDikdortgene, satirlariNumarala, sigacakBoyut, type PdfSatir } from './pdfMetin';

/** Önizleme ölçeği: 1x okunmuyor, 2x dosyayı gereksiz büyütüyor. */
const ONIZLEME_OLCEGI = 1.5;

async function mupdfYukle(): Promise<typeof import('mupdf')> {
  return await import('mupdf');
}

/**
 * `StructuredText.asJSON()` şeması — mupdf 1.28.0'da yerinde doğrulandı:
 * `blocks[].lines[]` altında `text`, `bbox {x,y,w,h}` ve `font.size` var.
 * Alanlar isteğe bağlı yazıldı; sürüm değişirse `??` yedekleri devreye girer.
 */
interface MupdfKutuJson { x?: number; y?: number; w?: number; h?: number }
interface MupdfSatirJson { text?: string; bbox?: MupdfKutuJson; font?: { size?: number } }
interface MupdfBlokJson { lines?: MupdfSatirJson[] }
interface MupdfMetinJson { blocks?: MupdfBlokJson[] }

function satirlariCikar(belge: PDFDocument): PdfSatir[] {
  const satirlar: PdfSatir[] = [];
  let birim = 0;
  for (let i = 0; i < belge.countPages(); i += 1) {
    const sayfa = belge.loadPage(i);
    const st = sayfa.toStructuredText('preserve-whitespace');
    const veri = JSON.parse(st.asJSON()) as MupdfMetinJson;
    for (const blok of veri.blocks ?? []) {
      for (const s of blok.lines ?? []) {
        const metin = (s.text ?? '').trim();
        if (!metin) continue;
        const b = s.bbox ?? {};
        satirlar.push({
          birim,
          sayfa: i + 1,
          metin,
          dikdortgen: [b.x ?? 0, b.y ?? 0, (b.x ?? 0) + (b.w ?? 0), (b.y ?? 0) + (b.h ?? 0)],
          // Satır yüksekliği font boyutuna yakın; MuPDF JSON'unda doğrudan
          // boyut yoksa buradan türetiliyor.
          boyut: s.font?.size ?? Math.max(6, b.h ?? 11),
        });
        birim += 1;
      }
    }
  }
  return satirlar;
}

/**
 * MuPDF'ten gelen vuruş gerçekten SEKİZ SAYI mı?
 *
 * `quadDikdortgene` uzunluk doğrulamıyor: eksik ya da sayı olmayan bir quad
 * `Math.min(...)` üzerinden NaN üretir, redaksiyon BOZUK bir dikdörtgene
 * uygulanır ve YANLIŞ YER silinir. Kullanıcı bunu ancak PDF'i açınca fark
 * eder. Sessizce bozmak yerine o düzenlemeyi başarısız sayıyoruz.
 */
function quadSaglamMi(quad: unknown): quad is number[] {
  if (!Array.isArray(quad) || quad.length < 8) return false;
  return quad.slice(0, 8).every((n) => typeof n === 'number' && Number.isFinite(n));
}

export async function loadPdf(buf: ArrayBuffer): Promise<LoadedDocument> {
  const mupdf = await mupdfYukle();
  let belge: PDFDocument;
  try {
    const acilan = mupdf.Document.openDocument(new Uint8Array(buf), 'application/pdf');
    const pdf = acilan.asPDF();
    if (!pdf) throw new Error('PDF değil');
    belge = pdf;
  } catch {
    throw new Error('PDF açılamadı. Dosya bozuk ya da şifreli olabilir.');
  }

  const satirlar = satirlariCikar(belge);
  if (satirlar.length === 0) {
    throw new Error('Bu PDF taranmış görüntü olabilir: düzenlenebilir metin bulunamadı.');
  }

  // Ölçüm: Helvetica metrikleri. Yeni metni de bu fontla yazıyoruz, yani
  // ölçüm ile çizim aynı fontu kullanıyor.
  const font = new mupdf.Font('Helvetica');
  const olc = (m: string) => {
    let t = 0;
    for (const ch of m) t += font.advanceGlyph(font.encodeCharacter(ch.codePointAt(0)!));
    return t;
  };

  /** Red mesajı satıra sığsın; uzun metin paneli taşırıyordu. */
  const kisalt = (m: string) => (m.length > 40 ? `${m.slice(0, 37)}…` : m);

  const satirBul = (no: number) => satirlar.find((s) => s.birim === no);

  /**
   * Düzenlemeyi uygulanabilir en küçük parçaya indirger.
   *
   * Model satırın TAMAMINI gönderdiğinde (`find` yok) tamamını değiştirmek
   * satırın tümünü Helvetica'ya çevirir ve iki yana yaslı metinde sığma
   * kontrolünü gürültüye bırakır. Ortak ön ek/son ek atılınca geriye yalnız
   * değişen parça kalıyor: satırın geri kalanı ORİJİNAL fontuyla duruyor.
   *
   * `find` zaten verilmişse dokunulmuyor.
   */
  const indirge = (edit: DocumentEdit, satir: PdfSatir): { bul: string; yaz: string } | null => {
    if (edit.find) return { bul: edit.find, yaz: edit.replace };
    const fark = enKucukFark(satir.metin, edit.replace);
    if (!fark) return null;            // metin aynı: uygulanacak bir şey yok
    return { bul: fark.find, yaz: fark.replace };
  };

  /**
   * Yeni metnin yazilacagi punto; hic sigdirilamiyorsa `null`.
   *
   * validate ve apply BU fonksiyonu cagiriyor. Ayri ayri hesaplamak, panelde
   * kabul edilen bir duzenlemenin dosyada baska puntoyla cikmasina yol acardi.
   */
  const yaziBoyutu = (
    edit: DocumentEdit,
    satir: PdfSatir,
    kucuk: { bul: string; yaz: string },
  ): number | null => {
    // Kutu satirin tamami DEGIL, degistirilecek parcanin yeri: eski parca ne
    // kadar yer kapliyorsa yenisi de o kadarina sigmali. Model satirin
    // tamamini gonderdiginde (find yok) satirin kullanmadigi bos pay da
    // parcaya ekleniyor.
    const kutu = edit.find
      ? satir.dikdortgen[2] - satir.dikdortgen[0]
      : metinGenisligi(kucuk.bul, satir.boyut, olc) + (satir.dikdortgen[2] - satir.dikdortgen[0]
          - metinGenisligi(satir.metin, satir.boyut, olc));
    return sigacakBoyut(kucuk.yaz, satir.boyut, Math.max(kutu, 0), olc);
  };

  return {
    format: 'pdf',
    numberedText: satirlariNumarala(satirlar),
    unitCount: satirlar.length,

    validate(edits: DocumentEdit[]) {
      const accepted: AcceptedDocumentEdit[] = [];
      const rejected: DocumentEditRejection[] = [];
      for (const edit of edits) {
        const satir = satirBul(edit.paragraph);
        if (!satir) {
          rejected.push({ edit, message: `${edit.paragraph} numaralı satır bulunamadı.` });
          continue;
        }
        const yer = `Sayfa ${satir.sayfa}`;
        const eski = edit.find ?? satir.metin;
        if (!satir.metin.includes(eski)) {
          rejected.push({ edit, message: 'Aranan metin bu satırda yok.', locationLabel: yer });
          continue;
        }
        const kucuk = indirge(edit, satir);
        if (!kucuk) {
          rejected.push({ edit, message: 'Metin zaten aynı, değişiklik yok.', locationLabel: yer });
          continue;
        }
        // Sigmiyorsa REDDETMIYORUZ, puntoyu kucultup sigdiriyoruz. Ancak
        // okunmaz hale gelecek kadar kucultmek gerekiyorsa yine reddediyoruz.
        if (yaziBoyutu(edit, satir, kucuk) === null) {
          rejected.push({
            edit,
            // NEYİ değiştirmeye çalıştığını da söylüyoruz: kullanıcı red
            // mesajına bakıp "bu zaten tarih değil, bölüm numarası" diyebilsin.
            // Hedefsiz mesaj teşhis edilemiyordu.
            message: `"${kisalt(kucuk.bul)}" yerine "${kisalt(kucuk.yaz)}" sığmıyor `
              + '— yeni metin okunmaz hale gelmeden küçültülemiyor. Daha kısa bir metin deneyin.',
            locationLabel: yer,
          });
          continue;
        }
        accepted.push({
          edit,
          before: satir.metin,
          after: satir.metin.replace(eski, edit.replace),
          occurrences: 1,
          wholeParagraph: !edit.find,
          locationLabel: yer,
        });
      }
      return { accepted, rejected };
    },

    async apply(edits: DocumentEdit[]) {
      let uygulanan = 0;
      let basarisiz = 0;
      for (const edit of edits) {
        const satir = satirBul(edit.paragraph);
        if (!satir) { basarisiz += 1; continue; }
        const sayfa = belge.loadPage(satir.sayfa - 1);
        const kucuk = indirge(edit, satir);
        if (!kucuk) { basarisiz += 1; continue; }
        const boyut = yaziBoyutu(edit, satir, kucuk);
        if (boyut === null) { basarisiz += 1; continue; }
        const vurus = sayfa.search(kucuk.bul, 1);
        if (!vurus.length) { basarisiz += 1; continue; }

        // Bir eşleşme BİRDEN FAZLA quad taşıyabiliyor: arama satır sınırını
        // aştığında search() parçalı döndürüyor (ölçüldü: iki satıra yayılan
        // arama 2 quad veriyor).
        //
        // DİKKAT — bu SAVUNMA amaçlı, testsiz: bizim akışımızda aranan metin
        // tek bir satırın alt dizisi olduğu için buraya ulaşan bir durum
        // kurulamadı. Tek satır içinde, metin iki ayrı parça hâlinde çizilse
        // bile MuPDF tek quad döndürüyor. Yine de ucuz sigorta: ulaşılırsa
        // yalnız ilk parçayı silmek metnin geri kalanını sayfada bırakırdı.
        const quadlar = (vurus[0] ?? []).filter((q: unknown) => quadSaglamMi(q));
        if (quadlar.length === 0) { basarisiz += 1; continue; }

        for (const q of quadlar) {
          const kirmizi = sayfa.createAnnotation('Redact');
          kirmizi.setRect(quadDikdortgene(q as unknown as number[]));
          kirmizi.update();
        }
        sayfa.applyRedactions(false);   // false: siyah kutu çizme

        // Yeni metin İLK parçanın yerine yazılıyor; bölünmüş metin tek parça
        // hâlinde geri geliyor.
        const dikd = quadDikdortgene(quadlar[0] as unknown as number[]);
        const yazi = sayfa.createAnnotation('FreeText');
        yazi.setRect(dikd);
        yazi.setContents(kucuk.yaz);
        yazi.setDefaultAppearance('Helv', boyut, [0, 0, 0]);
        yazi.update();
        uygulanan += 1;
      }
      // ŞART: annotation'ları gerçek sayfa içeriğine gömer. Onsuz yeni metin
      // aranamaz/kopyalanamaz ve okuyucuda silinebilir.
      belge.bake(true, true);
      const baytlar = belge.saveToBuffer('').asUint8Array();
      return {
        blob: new Blob([baytlar], { type: 'application/pdf' }),
        appliedCount: uygulanan,
        failedCount: basarisiz,
      };
    },

    async renderPreview(b: ArrayBuffer, changed: ChangedUnit[]) {
      const m = await mupdfYukle();
      const d = m.Document.openDocument(new Uint8Array(b), 'application/pdf');
      // YALNIZ değişen sayfalar: tüm belgeyi basmak IndexedDB'ye megabaytlarca
      // base64 yazardı.
      const sayfalar = [...new Set(
        changed.map((c) => Number(/Sayfa (\d+)/.exec(c.locationLabel ?? '')?.[1]))
          .filter((n) => Number.isFinite(n)),
      )].sort((x, y) => x - y);
      const hedef = sayfalar.length ? sayfalar : [1];

      const parcalar: string[] = [];
      for (const no of hedef) {
        if (no < 1 || no > d.countPages()) continue;
        const px = d.loadPage(no - 1).toPixmap(
          m.Matrix.scale(ONIZLEME_OLCEGI, ONIZLEME_OLCEGI), m.ColorSpace.DeviceRGB, false, true,
        );
        // PARÇA PARÇA: PNG'yi tek seferde yaymak (String.fromCharCode(...dizi))
        // yüz binlerce argüman demek ve çağrı yığınını TAŞIRIR (RangeError).
        const png = px.asPNG();
        let ham = '';
        for (let k = 0; k < png.length; k += 0x8000) {
          ham += String.fromCharCode(...png.subarray(k, k + 0x8000));
        }
        const b64 = btoa(ham);
        parcalar.push(
          `<p class="t3ai-pdf-sayfa-no">Sayfa ${no}</p>` +
          `<img alt="Sayfa ${no}" style="max-width:100%" src="data:image/png;base64,${b64}" />`,
        );
      }
      return parcalar.join('\n');
    },
  };
}
