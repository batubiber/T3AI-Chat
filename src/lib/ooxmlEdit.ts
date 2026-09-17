/**
 * OOXML paragraf düzenleme çekirdeği — DOCX ve PPTX ortak.
 *
 * İki format aynı yapıyı kullanıyor: paragraf içinde metin run'ları.
 *   DOCX  <w:p> … <w:t>metin</w:t> …
 *   PPTX  <a:p> … <a:t>metin</a:t> …
 * Tek fark etiket adı. Bu yüzden algoritma burada, formata özgü sarmalayıcılar
 * yalnız etiketi veriyor.
 *
 * ASIL ZORLUK — run parçalanması: Office bir cümleyi kelime kelime ayrı
 * run'lara bölebiliyor (yazım denetimi/dil işaretleri). Ölçümde gerçek bir
 * docx'te paragraf başına 82 run görüldü. "Bir metin düğümü içinde ara"
 * çalışmaz; paragrafın run'ları birleştirilip hedef orada bulunur, değişiklik
 * run sınırlarına göre dağıtılır.
 *
 * Bu mantık DOCX'te üç tur düzeltme aldı (çoklu geçiş, sonsuz döngü, boşluk
 * korunumu). PPTX için kopyalanmadı — aynı hatalar yeniden yaşanmasın.
 *
 * XML API KISITI: testler Node'da @xmldom/xmldom ile çalışır; `.children` ve
 * `querySelector` YOKTUR.
 */

/** Element çocukları — xmldom'da `.children` yok, childNodes + nodeType şart. */
export function elementChildren(el: Element): Element[] {
  const out: Element[] = [];
  const nodes = el.childNodes;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.nodeType === 1) out.push(n as Element);
  }
  return out;
}

/** Paragrafın metin düğümleri (run sırasında). */
export function textNodes(p: Element, textTag: string): Element[] {
  const ts = p.getElementsByTagName(textTag);
  const out: Element[] = [];
  for (let i = 0; i < ts.length; i++) out.push(ts[i]);
  return out;
}

/** Paragrafın birleşik metni — run'lara bölünmüş olsa da tek string. */
export function paragraphTextOf(p: Element, textTag: string): string {
  return textNodes(p, textTag)
    .map((t) => t.textContent || '')
    .join('');
}

/** Bir metnin kaç kez geçtiğini sayar (örtüşmesiz). */
export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    n++;
    at = haystack.indexOf(needle, at + needle.length);
  }
  return n;
}

/** Tek geçişi `from` konumundan itibaren değiştirir; bulunan konumu döndürür (-1 = yok). */
function replaceOneFrom(
  p: Element,
  textTag: string,
  find: string,
  replace: string,
  from: number,
): number {
  const nodes = textNodes(p, textTag);
  if (nodes.length === 0) return -1;

  const texts = nodes.map((t) => t.textContent || '');
  const full = texts.join('');
  const at = full.indexOf(find, from);
  if (at < 0) return -1;
  const end = at + find.length;

  // her metin düğümünün birleşik metindeki aralığı
  let pos = 0;
  const spans = texts.map((s) => {
    const start = pos;
    pos += s.length;
    return [start, pos] as const;
  });

  let written = false;
  for (let i = 0; i < nodes.length; i++) {
    const [a, b] = spans[i];
    if (b <= at || a >= end) continue; // bu run hedefin dışında — dokunulmaz
    const before = at > a ? texts[i].slice(0, at - a) : '';
    const after = end < b ? texts[i].slice(end - a) : '';
    const next = before + (written ? '' : replace) + after;
    nodes[i].textContent = next;
    written = true;
    // Baş/son boşluk varsa XML'de korunması için işaretle (yoksa Office yer)
    if (next !== next.trim()) nodes[i].setAttribute('xml:space', 'preserve');
  }
  return written ? at : -1;
}

/**
 * Paragrafta, run sınırlarına yayılmış olsa bile metni değiştirir.
 * TÜM geçişler değiştirilir: kullanıcı "X'leri Y yap" derken kastettiği budur
 * ve model hangi geçiş olduğunu belirtecek bir yol sunmuyor.
 *
 * @returns en az bir değişiklik yapıldıysa true
 */
export function replaceInParagraphTagged(
  p: Element,
  textTag: string,
  find: string,
  replace: string,
): boolean {
  if (!find) return false;
  let changed = false;
  // Sonsuz döngü koruması: replace, find'ı içeriyorsa (ör. "a"→"aa") arama
  // konumu ilerletilerek devam edilir.
  let searchFrom = 0;
  for (;;) {
    const done = replaceOneFrom(p, textTag, find, replace, searchFrom);
    if (done < 0) break;
    changed = true;
    searchFrom = done + replace.length;
  }
  return changed;
}

/**
 * Paragrafın TÜM metnini değiştirir: ilk metin düğümüne yazılır, kalanlar
 * boşaltılır. Paragraf dışındaki her şey korunur; paragraf İÇİ biçim farkları
 * ilk run'ın biçimine düşer.
 */
export function replaceParagraphTextTagged(p: Element, textTag: string, text: string): boolean {
  const nodes = textNodes(p, textTag);
  if (nodes.length === 0) return false;
  nodes.forEach((n, i) => {
    n.textContent = i === 0 ? text : '';
    if (i === 0 && text !== text.trim()) n.setAttribute('xml:space', 'preserve');
  });
  return true;
}
