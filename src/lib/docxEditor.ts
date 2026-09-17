/**
 * DOCX cerrahi düzenleme.
 *
 * Orijinal zip açılır, word/document.xml'de hedef metin değiştirilir, yeniden
 * zip'lenir. Diğer part'lar (stiller, görseller, [Content_Types].xml) BİT BİT
 * korunur — belge yeniden ÜRETİLMEZ, sadece o metin değişir.
 *
 * ASIL ZORLUK — run parçalanması: Word bir cümleyi kelime kelime ayrı <w:r>
 * run'larına bölebilir (yazım denetimi/dil işaretleri yüzünden). Ölçümde gerçek
 * bir docx'te paragraf başına 82 run görüldü. Bu yüzden "bir <w:t> içinde ara"
 * çalışmaz; paragrafın run'ları birleştirilip hedef orada bulunur, sonra
 * değişiklik run sınırlarına göre dağıtılır.
 *
 * XML API KISITI: testler Node'da @xmldom/xmldom ile çalışır; `.children` ve
 * `querySelector` YOKTUR.
 */
import JSZip from 'jszip';
import { XmlParse, domXmlParse } from './parsedFile';
import { allParagraphs, paragraphText } from './docxEditableText';
import {
  countOccurrences,
  replaceInParagraphTagged,
  replaceParagraphTextTagged,
} from './ooxmlEdit';

/** DOCX'te metin düğümü etiketi (PPTX'te 'a:t') */
const W_TEXT = 'w:t';

export interface DocxEdit {
  /** EditableParagraph.index — word/document.xml'deki <w:p> sırası */
  paragraph: number;
  /**
   * Değişecek metin. BOŞ/YOK ise paragrafın TAMAMI `replace` ile değiştirilir.
   *
   * İki biçim olmasının sebebi: birebir eşleşme zorunluluğu modelin metni
   * harfi harfine kopyalamasını gerektiriyor ve model bunu sık sık beceremiyor
   * ("bulunamadı" reddi). Claude'un artifact'lerinde de aynı sorun var; oradaki
   * çözüm `update` yanında bir `rewrite` komutu bulundurmak. ChatGPT Canvas ise
   * tablo/liste söz konusuysa doğrudan yeniden yazmaya geçiyor.
   *
   * Bizdeki karşılığı paragraf bazında yeniden yazmak: paragraf DIŞINDAKİ her
   * şey korunur, model hiçbir metni kopyalamak zorunda kalmaz.
   */
  find?: string;
  replace: string;
  /** Modelin gerekçesi; panelde kullanıcıya gösterilir */
  reason?: string;
}

/** Doğrulamayı geçmiş düzenleme + panelin göstereceği karşılaştırma. */
export interface AcceptedEdit {
  edit: DocxEdit;
  /** Panelde solda gösterilecek eski metin */
  before: string;
  /** Panelde sağda gösterilecek yeni metin */
  after: string;
  /** Paragrafta kaç yerde geçiyor (tam-paragraf yazımında 1) */
  occurrences: number;
  /** true ise paragrafın tamamı yeniden yazılıyor */
  wholeParagraph: boolean;
}

export type RejectionReason = 'paragraf-yok' | 'bulunamadi';

export interface EditRejection {
  edit: DocxEdit;
  reason: RejectionReason;
  /** Kullanıcıya gösterilecek Türkçe açıklama */
  message: string;
}

export interface EditValidation {
  accepted: AcceptedEdit[];
  rejected: EditRejection[];
}

const REJECTION_MESSAGES: Record<RejectionReason, string> = {
  'paragraf-yok': 'Belgede bu numarada bir paragraf yok.',
  bulunamadi: 'Aranan metin bu paragrafta bulunamadı.',
};

/**
 * Düzenlemeleri UYGULAMADAN doğrular. Panel bunu gösterir: kabul edilebilir
 * olanlar ile modelin uydurdukları ayrışır.
 *
 * ÖNCEDEN aranan metin paragrafta birden fazla geçiyorsa REDDEDİLİYORDU
 * ("hangisi belirsiz" gerekçesiyle). Bu yanlıştı: kullanıcı "HA 1'leri HA 3
 * yap" dediğinde HEPSİNİN değişmesini istiyor ve model zaten hangi geçiş
 * olduğunu belirtecek bir yol sunmuyor. Artık hepsi değiştiriliyor, kaç yerde
 * geçtiği panelde gösteriliyor.
 */
export function validateEdits(doc: Document, edits: DocxEdit[]): EditValidation {
  const paras = allParagraphs(doc);
  const accepted: AcceptedEdit[] = [];
  const rejected: EditRejection[] = [];

  const reject = (edit: DocxEdit, reason: RejectionReason) =>
    rejected.push({ edit, reason, message: REJECTION_MESSAGES[reason] });

  for (const edit of edits) {
    const p = paras[edit.paragraph];
    if (!p) {
      reject(edit, 'paragraf-yok');
      continue;
    }
    const current = paragraphText(p);

    // find YOK → paragrafın tamamı yeniden yazılıyor. Eşleşme aranmadığı için
    // 'bulunamadı' ile reddedilmesi MÜMKÜN DEĞİL — bu biçimin varlık sebebi bu.
    if (!edit.find) {
      accepted.push({
        edit,
        before: current,
        after: edit.replace,
        occurrences: 1,
        wholeParagraph: true,
      });
      continue;
    }

    const hits = countOccurrences(current, edit.find);
    if (hits === 0) {
      reject(edit, 'bulunamadi');
      continue;
    }
    accepted.push({
      edit,
      before: edit.find,
      after: edit.replace,
      occurrences: hits,
      wholeParagraph: false,
    });
  }

  return { accepted, rejected };
}

/**
 * Tek paragrafta, run sınırlarına yayılmış olsa bile metni değiştirir.
 *
 * Algoritma:
 *  1. Paragrafın tüm <w:t> metinlerini birleştir, her birinin birleşik metindeki
 *     [başlangıç, bitiş) aralığını tut
 *  2. Hedefi birleşik metinde bul
 *  3. Kesişen her <w:t> için aralık DIŞINDA kalan ön/arka parçaları koru
 *  4. Değişikliği İLK etkilenen <w:t>'ye yaz, sonrakilerin kesişen kısmını sil
 *
 * Değiştirilen metin ilk run'ın biçimini alır — yazım hatası düzeltmede
 * istenen davranış budur.
 *
 * Metin paragrafta birden çok geçiyorsa HEPSİ değiştirilir: kullanıcı
 * "X'leri Y yap" dediğinde kastettiği budur ve model hangi geçiş olduğunu
 * belirtecek bir yol sunmuyor.
 *
 * @returns en az bir değişiklik yapıldıysa true
 */
export function replaceInParagraph(p: Element, find: string, replace: string): boolean {
  return replaceInParagraphTagged(p, W_TEXT, find, replace);
}

/**
 * Paragrafın TÜM metnini `text` ile değiştirir: ilk <w:t>'ye yazılır, kalanlar
 * boşaltılır. Paragraf dışındaki her şey (stil, tablo yapısı, komşu paragraflar)
 * korunur; paragraf İÇİ biçim farkları (ortadaki kalın kelime gibi) ilk run'ın
 * biçimine düşer.
 */
export function replaceParagraphText(p: Element, text: string): boolean {
  return replaceParagraphTextTagged(p, W_TEXT, text);
}

export interface ApplyResult {
  blob: Blob;
  applied: DocxEdit[];
  /** Uygulanamayan düzenlemeler — kullanıcıya BİLDİRİLMELİ */
  failed: DocxEdit[];
}

/**
 * Kabul edilen düzenlemeleri uygulayıp YENİ bir .docx üretir.
 * Orijinal buffer değiştirilmez.
 *
 * Düzenlemeler SIRAYLA uygulanır ve her biri o ANKİ paragraf metninde aranır.
 * Bu yüzden bir düzenleme, kendinden öncekinin değiştirdiği metni arıyorsa
 * artık bulamaz (ör. "HA 1 ve HA 2" hücresinde önce "HA 1" değişirse, sonraki
 * "HA 1 ve HA 2" araması boşa düşer).
 *
 * validateEdits bunu YAKALAYAMAZ: o, ORİJİNAL belgeye bakar. Bu yüzden
 * uygulanamayanlar burada toplanıp döndürülür — sessizce düşmeleri, kullanıcının
 * kabul ettiği bir değişikliğin dosyada olmamasına ve bunu fark etmemesine
 * yol açıyordu.
 */
export async function applyEdits(
  buf: ArrayBuffer,
  edits: DocxEdit[],
  xmlParse: XmlParse = domXmlParse,
  serialize: (doc: Document) => string = (doc) => new XMLSerializer().serializeToString(doc),
): Promise<ApplyResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    throw new Error('Word dosyası okunamadı veya şifre korumalı.');
  }

  const file = zip.file('word/document.xml');
  if (!file) throw new Error('Geçerli bir Word belgesi değil.');

  const doc = xmlParse(await file.async('string'));
  const paras = allParagraphs(doc);

  const applied: DocxEdit[] = [];
  const failed: DocxEdit[] = [];
  for (const edit of edits) {
    const p = paras[edit.paragraph];
    // Sonuç YOK SAYILMAZ — düşen düzenleme raporlanır
    const ok = p
      ? edit.find
        ? replaceInParagraph(p, edit.find, edit.replace)
        : replaceParagraphText(p, edit.replace)
      : false;
    if (ok) applied.push(edit);
    else failed.push(edit);
  }

  zip.file('word/document.xml', serialize(doc));
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  return { blob, applied, failed };
}
