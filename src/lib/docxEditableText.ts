/**
 * DOCX düzenlenebilir metin görünümü.
 *
 * RAG için çıkardığımız metin (mammoth → HTML → düz metin) düzenlemeye UYGUN
 * DEĞİL: içinde markdown tabloları ve OCR başlıkları gibi bizim ürettiğimiz,
 * belgede karşılığı OLMAYAN şeyler var. Model onun üzerinden düzenleme önerirse
 * XML'e geri bağlayamayız.
 *
 * Bu modül word/document.xml'deki <w:p> sırasıyla BİREBİR eşleşen bir görünüm
 * üretir: model "paragraf 12" dediğinde biz de 12'yi buluruz.
 *
 * XML API KISITI: testler Node'da @xmldom/xmldom ile çalışır; orada `.children`
 * ve `querySelector` YOKTUR. Yalnız getElementsByTagName / childNodes /
 * nodeType / nodeName / getAttribute / textContent kullanılabilir.
 */

export interface EditableParagraph {
  /** word/document.xml içindeki <w:p> sırası (0-tabanlı). Boş paragraflar da sayılır. */
  index: number;
  /** Paragrafın <w:t> metinleri birleştirilmiş hali. */
  text: string;
}

/** Dokümandaki tüm <w:p> elemanları, doküman sırasında (tablo hücreleri dahil). */
export function allParagraphs(doc: Document): Element[] {
  const ps = doc.getElementsByTagName('w:p');
  const out: Element[] = [];
  for (let i = 0; i < ps.length; i++) out.push(ps[i]);
  return out;
}

/** Bir paragrafın <w:t> elemanları (run sırasında). */
export function paragraphTextNodes(p: Element): Element[] {
  const ts = p.getElementsByTagName('w:t');
  const out: Element[] = [];
  for (let i = 0; i < ts.length; i++) out.push(ts[i]);
  return out;
}

/** Bir paragrafın birleşik metni — run'lara bölünmüş olsa da tek string. */
export function paragraphText(p: Element): string {
  return paragraphTextNodes(p)
    .map((t) => t.textContent || '')
    .join('');
}

/**
 * Düzenlenebilir paragrafları verir. Metni olmayan paragraflar listeye GİRMEZ
 * ama index'ler kaydırılmaz — index her zaman gerçek <w:p> sırasıdır.
 */
export function extractEditableParagraphs(doc: Document): EditableParagraph[] {
  const out: EditableParagraph[] = [];
  allParagraphs(doc).forEach((p, index) => {
    const text = paragraphText(p);
    if (text.trim().length > 0) out.push({ index, text });
  });
  return out;
}

/**
 * Modele verilecek numaralı metin. Numara XML'e geri bağlanmanın anahtarı,
 * bu yüzden biçim sabit: satır başında köşeli parantez içinde index.
 */
export function formatForModel(paras: EditableParagraph[]): string {
  return paras.map((p) => `[${p.index}] ${p.text}`).join('\n');
}
