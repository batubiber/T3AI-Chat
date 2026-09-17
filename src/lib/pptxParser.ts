/**
 * PPTX Parser — PowerPoint sunumlarını RAG'e uygun metne çevirir.
 *
 * Kapsam: slayt metni (şekiller, gruplar), tablolar, GRAFİK VERİLERİ, SmartArt,
 * konuşmacı notları ve görsel OCR'ı (mevcut DOCX hattının aynısı).
 *
 * Slide master/layout metni BİLEREK okunmaz: her slaytta tekrar eden altbilgi,
 * logo yazısı ve şablon başlıkları RAG'i kirletir — yalnız slayt seviyesindeki
 * spTree gezilir.
 *
 * XML API KISITI: testler Node'da @xmldom/xmldom ile çalışır; orada `.children`
 * ve `querySelector` YOKTUR. Bu dosya yalnız getElementsByTagName / childNodes /
 * nodeType / nodeName / getAttribute / textContent kullanabilir.
 */
import JSZip from 'jszip';
import { ParsedFile, XmlParse, domXmlParse, readFileAsArrayBuffer } from './parsedFile';
import { ocrImage, mapWithConcurrency, OCR_CONCURRENCY, injectOcrResults, isOcrOff, isOcrAvailable } from './ocrService';

/** Element çocukları — xmldom'da `.children` yok, childNodes + nodeType filtresi şart. */
export function elementChildren(el: Element): Element[] {
  const out: Element[] = [];
  const nodes = el.childNodes;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.nodeType === 1) out.push(n as Element);
  }
  return out;
}

/** Namespace prefix'ini atar: "c:barChart" → "barChart". */
export function local(el: Element): string {
  return el.nodeName.replace(/^[^:]+:/, '');
}

/** Zip yolunu normalize eder: "ppt/slides" + "../media/x.png" → "ppt/media/x.png" */
function resolvePath(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = baseDir.split('/').filter(Boolean);
  for (const seg of target.split('/')) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

/** .rels dosyasını rId → çözülmüş zip yolu eşlemesine çevirir. */
export function parseRels(relsXml: string, xmlParse: XmlParse, baseDir: string): Map<string, string> {
  const map = new Map<string, string>();
  const doc = xmlParse(relsXml);
  const rels = doc.getElementsByTagName('Relationship');
  for (let i = 0; i < rels.length; i++) {
    const id = rels[i].getAttribute('Id');
    const target = rels[i].getAttribute('Target');
    if (!id || !target) continue;
    // Dış bağlantılar (TargetMode="External") zip'te yok — atla
    if (rels[i].getAttribute('TargetMode') === 'External') continue;
    // Target bir URI referansı: boşluklu part adı %20 olarak gelir
    let decoded = target;
    try {
      decoded = decodeURIComponent(target);
    } catch {
      /* bozuk yüzde-kaçışı: ham hali kullanılır */
    }
    map.set(id, resolvePath(baseDir, decoded));
  }
  return map;
}

/**
 * Slaytları SUNUM SIRASINDA döndürür. Slaytlar yeniden sıralandığında dosya
 * adları değişmez (slide3.xml ilk sırada olabilir) — bu yüzden sldIdLst şart.
 * sldIdLst yoksa boş dizi döner; çağıran sayısal fallback uygular.
 */
export function resolveSlideOrder(
  presentationXml: string,
  presRelsXml: string,
  xmlParse: XmlParse,
): string[] {
  const rels = parseRels(presRelsXml, xmlParse, 'ppt');
  const doc = xmlParse(presentationXml);
  const ids = doc.getElementsByTagName('p:sldId');
  const out: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    const rid = ids[i].getAttribute('r:id') || '';
    const path = rels.get(rid);
    if (path) out.push(path);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Slayt metni
// ---------------------------------------------------------------------------

export interface SlideContext {
  slideW: number;                  // <p:sldSz cx> — EMU
  slideH: number;                  // <p:sldSz cy> — EMU
  rels: Map<string, string>;       // rId → zip yolu
  charts: Map<string, Document>;   // zip yolu → parse edilmiş chartN.xml
  diagrams: Map<string, Document>; // zip yolu → parse edilmiş dataN.xml
}

export interface SlideExtract {
  text: string;
  /** placeholder indeksi (%%OCR_IMG_k%% içindeki k) → ppt/media/... yolu.
   *  Aynı yol birden çok kez görünebilir; dedupe OCR aşamasında yapılır. */
  mediaPaths: string[];
}

/** Tek bir <a:p> paragrafının metni. <a:fld type="slidenum"> hariç tutulur:
 *  her slaytta tekrar eden slayt numarası RAG'e çöp olarak girerdi. */
function paragraphText(p: Element): string {
  let out = '';
  const walk = (el: Element) => {
    for (const child of elementChildren(el)) {
      const name = local(child);
      if (name === 'fld' && child.getAttribute('type') === 'slidenum') continue;
      if (name === 'br') { out += '\n'; continue; }
      if (name === 't') { out += child.textContent || ''; continue; }
      walk(child);
    }
  };
  walk(p);
  return out;
}

/** Bir şeklin (<p:sp>) tüm paragraflarını satır satır verir. */
export function shapeText(sp: Element): string {
  const paras = sp.getElementsByTagName('a:p');
  const lines: string[] = [];
  for (let i = 0; i < paras.length; i++) {
    const line = paragraphText(paras[i]).trim();
    if (line) lines.push(line);
  }
  return lines.join('\n');
}

/** <a:tbl> → markdown pipe tablosu. İlk satır başlık kabul edilir.
 *  Hücre içi satır sonları boşluğa çevrilir (pipe tablosu tek satırlık olmalı). */
export function tableToMarkdown(tbl: Element): string {
  const rows: string[][] = [];
  const trs = tbl.getElementsByTagName('a:tr');
  for (let i = 0; i < trs.length; i++) {
    const cells: string[] = [];
    for (const tc of elementChildren(trs[i])) {
      if (local(tc) !== 'tc') continue;
      const text = shapeText(tc).replace(/\s*\n\s*/g, ' ').trim();
      cells.push(text.replace(/\|/g, '\\|'));
    }
    rows.push(cells);
  }
  if (rows.length === 0) return '';

  const maxCols = Math.max(...rows.map((r) => r.length));
  if (maxCols === 0) return '';
  const norm = rows.map((r) => {
    const copy = [...r];
    while (copy.length < maxCols) copy.push('');
    return copy;
  });

  const lines: string[] = [];
  lines.push('| ' + norm[0].join(' | ') + ' |');
  lines.push('| ' + norm[0].map(() => '---').join(' | ') + ' |');
  for (let i = 1; i < norm.length; i++) lines.push('| ' + norm[i].join(' | ') + ' |');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Grafikler
// ---------------------------------------------------------------------------

const CHART_TYPE_TR: Record<string, string> = {
  barChart: 'sütun grafik',
  bar3DChart: 'sütun grafik',
  pieChart: 'pasta grafik',
  pie3DChart: 'pasta grafik',
  ofPieChart: 'pasta grafik',
  doughnutChart: 'halka grafik',
  lineChart: 'çizgi grafik',
  line3DChart: 'çizgi grafik',
  areaChart: 'alan grafik',
  area3DChart: 'alan grafik',
  scatterChart: 'dağılım grafiği',
  bubbleChart: 'kabarcık grafiği',
  radarChart: 'radar grafik',
  stockChart: 'borsa grafiği',
  surfaceChart: 'yüzey grafiği',
};

/** "120.0" → "120", "95.5" → "95.5". Office cache'i tam sayıları da .0 ile yazar. */
function cleanNumber(v: string): string {
  return /^-?\d+\.0+$/.test(v) ? v.replace(/\.0+$/, '') : v;
}

/** <c:cat>/<c:val>/<c:xVal>/<c:yVal> içindeki cache noktalarını idx sırasıyla verir. */
function cachePoints(ser: Element, tag: string): string[] {
  for (const child of elementChildren(ser)) {
    if (local(child) !== tag) continue;
    const pts = child.getElementsByTagName('c:pt');
    const byIdx: string[] = [];
    for (let i = 0; i < pts.length; i++) {
      const idx = Number(pts[i].getAttribute('idx') || i);
      const vs = pts[i].getElementsByTagName('c:v');
      byIdx[idx] = vs.length > 0 ? cleanNumber(vs[0].textContent || '') : '';
    }
    for (let i = 0; i < byIdx.length; i++) if (byIdx[i] === undefined) byIdx[i] = '';
    return byIdx;
  }
  return [];
}

/** Serinin adı: <c:tx> içindeki ilk <c:v>. */
function seriesName(ser: Element, fallback: string): string {
  for (const child of elementChildren(ser)) {
    if (local(child) !== 'tx') continue;
    const vs = child.getElementsByTagName('c:v');
    if (vs.length > 0 && (vs[0].textContent || '').trim()) return (vs[0].textContent || '').trim();
  }
  return fallback;
}

/**
 * Grafiği markdown veri tablosuna çevirir.
 *
 * Grafik bir <p:pic> DEĞİL <p:graphicFrame>'dir — gömülü görsel üretmez, yani
 * burada çevrilmezse OCR de devreye giremez ve grafik metne HİÇ dönüşmez.
 * c:*Cache değerleri PowerPoint'in ekrana çizdiği değerlerdir → kullanıcının
 * gördüğüyle birebir. Cache yoksa (dış çalışma kitabına bağlı) null döner.
 */
export function chartToMarkdown(chartDoc: Document): string | null {
  const plots = chartDoc.getElementsByTagName('c:plotArea');
  if (plots.length === 0) return null;

  let kindTag = '';
  let sers: Element[] = [];
  for (const child of elementChildren(plots[0])) {
    const name = local(child);
    if (!name.endsWith('Chart')) continue;
    const found = elementChildren(child).filter((e) => local(e) === 'ser');
    if (found.length === 0) continue;
    kindTag = name;
    sers = found;
    break;
  }
  if (sers.length === 0) return null;

  // Başlık: yalnız c:chart'ın DOĞRUDAN title çocuğu (eksen başlıkları hariç)
  let title = '';
  const charts = chartDoc.getElementsByTagName('c:chart');
  if (charts.length > 0) {
    for (const child of elementChildren(charts[0])) {
      if (local(child) !== 'title') continue;
      const ts = child.getElementsByTagName('a:t');
      for (let i = 0; i < ts.length; i++) title += ts[i].textContent || '';
      break;
    }
  }

  const kind = CHART_TYPE_TR[kindTag] || kindTag;
  const lines = [`### Grafik: ${title.trim() || 'Başlıksız'} (${kind})`, ''];

  const isScatter = cachePoints(sers[0], 'xVal').length > 0;
  if (isScatter) {
    lines.push('| Seri | X | Y |', '| --- | --- | --- |');
    sers.forEach((ser, si) => {
      const name = seriesName(ser, `Seri ${si + 1}`);
      const xs = cachePoints(ser, 'xVal');
      const ys = cachePoints(ser, 'yVal');
      const n = Math.max(xs.length, ys.length);
      for (let i = 0; i < n; i++) lines.push(`| ${name} | ${xs[i] ?? ''} | ${ys[i] ?? ''} |`);
    });
  } else {
    const names = sers.map((s, i) => seriesName(s, `Seri ${i + 1}`));
    const cols = sers.map((s) => cachePoints(s, 'val'));
    let cats = cachePoints(sers[0], 'cat');
    if (cats.length === 0) {
      const n = Math.max(0, ...cols.map((c) => c.length));
      cats = Array.from({ length: n }, (_, i) => String(i + 1));
    }
    lines.push('| Kategori | ' + names.join(' | ') + ' |');
    lines.push('| --- | ' + names.map(() => '---').join(' | ') + ' |');
    cats.forEach((cat, i) => {
      lines.push('| ' + cat + ' | ' + cols.map((c) => c[i] ?? '').join(' | ') + ' |');
    });
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// SmartArt ve konuşmacı notları
// ---------------------------------------------------------------------------

/** SmartArt metni: ppt/diagrams/dataN.xml içindeki <dgm:pt> metin noktaları.
 *  SmartArt da grafik gibi vektördür — okunmazsa metne hiç dönüşmez. */
export function diagramToText(dataDoc: Document): string {
  const pts = dataDoc.getElementsByTagName('dgm:pt');
  const lines: string[] = [];
  for (let i = 0; i < pts.length; i++) {
    const paras = pts[i].getElementsByTagName('a:p');
    for (let j = 0; j < paras.length; j++) {
      const line = paragraphText(paras[j]).trim();
      if (line) lines.push(line);
    }
  }
  return lines.join('\n');
}

/** Konuşmacı notu metni. notesSlide slayt görüntüsü placeholder'ı ve slayt
 *  numarası alanı da içerir; slidenum paragraphText tarafından zaten elenir. */
export function extractNotesText(notesDoc: Document): string {
  const trees = notesDoc.getElementsByTagName('p:spTree');
  if (trees.length === 0) return '';
  const lines: string[] = [];
  for (const child of elementChildren(trees[0])) {
    if (local(child) !== 'sp') continue;
    const t = shapeText(child);
    if (t) lines.push(t);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Görseller
// ---------------------------------------------------------------------------

/** Dekoratif ikon eşiği: slayt alanının bu oranından küçük görsel OCR'a gitmez.
 *  Gerçek deck ölçümü: dekoratif ikon %0.36, içerik görseli %24.8,
 *  tam-slayt infografik %99.2 — bayt boyutundan ~70 kat temiz ayrışma. */
const MIN_IMAGE_AREA_RATIO = 0.01;

/**
 * Görselin OCR'a gönderilip gönderilmeyeceği — ölçüt EKRANDAKİ ALAN, bayt DEĞİL.
 * Bayt eşiği yanıltıcı: 6 KB'lık dekoratif ikon da, 6 KB'lık gerçek bir çizgi
 * grafik de olabilir. Ölçü bulunamazsa güvenli tarafta kalınır (gönderilir).
 */
export function shouldOcrImage(pic: Element, slideW: number, slideH: number): boolean {
  if (!slideW || !slideH) return true;
  // DİKKAT: <a:extLst><a:ext uri="..."> de "a:ext" adını taşır ama cx/cy'si yok.
  // Bu yüzden cx VE cy taşıyan ilk a:ext aranır.
  const exts = pic.getElementsByTagName('a:ext');
  for (let i = 0; i < exts.length; i++) {
    const cx = Number(exts[i].getAttribute('cx') || 0);
    const cy = Number(exts[i].getAttribute('cy') || 0);
    if (!cx || !cy) continue;
    return (cx * cy) / (slideW * slideH) >= MIN_IMAGE_AREA_RATIO;
  }
  return true;
}

/**
 * Slaydın <p:spTree>'sini DOKÜMAN SIRASINDA gezer ve metin üretir.
 * Gruplara rekürsif inilir; graphicFrame tablo / grafik / SmartArt taşıyabilir.
 */
export function extractSlideText(slideDoc: Document, ctx: SlideContext): SlideExtract {
  const trees = slideDoc.getElementsByTagName('p:spTree');
  const mediaPaths: string[] = [];
  const blocks: string[] = [];
  if (trees.length === 0) return { text: '', mediaPaths };

  const walk = (node: Element) => {
    for (const child of elementChildren(node)) {
      switch (local(child)) {
        case 'sp': {
          const t = shapeText(child);
          if (t) blocks.push(t);
          break;
        }
        case 'grpSp':
          walk(child);
          break;
        case 'graphicFrame': {
          const tbls = child.getElementsByTagName('a:tbl');
          if (tbls.length > 0) {
            const md = tableToMarkdown(tbls[0]);
            if (md) blocks.push(md);
            break;
          }
          const chartRefs = child.getElementsByTagName('c:chart');
          if (chartRefs.length > 0) {
            const rid = chartRefs[0].getAttribute('r:id') || '';
            const path = ctx.rels.get(rid);
            const doc = path ? ctx.charts.get(path) : undefined;
            if (doc) {
              const md = chartToMarkdown(doc);
              if (md) blocks.push(md);
            }
            break;
          }
          const dgm = child.getElementsByTagName('dgm:relIds');
          if (dgm.length > 0) {
            const rid = dgm[0].getAttribute('r:dm') || '';
            const path = ctx.rels.get(rid);
            const doc = path ? ctx.diagrams.get(path) : undefined;
            if (doc) {
              const t = diagramToText(doc);
              if (t) blocks.push(t);
            }
          }
          break;
        }
        case 'pic': {
          if (!shouldOcrImage(child, ctx.slideW, ctx.slideH)) break;
          const blips = child.getElementsByTagName('a:blip');
          if (blips.length === 0) break;
          const rid = blips[0].getAttribute('r:embed') || '';
          const path = ctx.rels.get(rid);
          // Çözülemeyen rId: placeholder ÜRETİLMEZ — indeks hizası bozulmasın
          if (!path) break;
          blocks.push(`%%OCR_IMG_${mediaPaths.length}%%`);
          mediaPaths.push(path);
          break;
        }
        default:
          break;
      }
    }
  };
  walk(trees[0]);

  return { text: blocks.join('\n'), mediaPaths };
}

// ---------------------------------------------------------------------------
// Uçtan uca akış
// ---------------------------------------------------------------------------

export interface PptxOptions {
  onProgress?: (current: number, total: number) => void;
  /** Test enjeksiyonu — Node'da global DOMParser yok. */
  xmlParse?: XmlParse;
  /** Test enjeksiyonu — varsayılan gerçek OCR sağlık kontrolü. */
  ocrEnabled?: () => Promise<boolean>;
  /** Test enjeksiyonu — TEK görseli OCR'lar (varsayılan gerçek ocrImage).
   *  Dizi değil tek görsel: üretim yolu da tembel yüklüyor, test aynı yoldan geçsin. */
  ocrOne?: (dataUrl: string) => Promise<string | null>;
}

/** OCR'a gönderilebilir raster formatlar (DOCX hattıyla aynı allowlist).
 *  EMF/WMF gibi Office vektör formatları model tarafından okunamaz. */
const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
};

/** Uint8Array → data URL. Desteklenmeyen uzantıda null (OCR'a gitmez). */
function toDataUrl(bytes: Uint8Array, path: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const mime = IMAGE_MIME[ext];
  if (!mime) return null;
  // Parça parça: 1.4MB'lık tam-slayt görsellerinde tek seferlik apply yığını taşırır
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

/**
 * PPTX'i RAG'e uygun metne çevirir.
 *
 * parsePptxFile'dan ayrı tutulur: burası saf ArrayBuffer alır, FileReader'a
 * bağımlı değildir → Node'da (vitest) uçtan uca test edilebilir.
 */
export async function parsePptxBuffer(
  buf: ArrayBuffer,
  opts: PptxOptions = {},
): Promise<ParsedFile> {
  const xmlParse = opts.xmlParse || domXmlParse;
  const onProgress = opts.onProgress;

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    throw new Error('Sunum dosyası okunamadı veya şifre korumalı.');
  }

  const readText = async (path: string): Promise<string | null> => {
    const f = zip.file(path);
    return f ? f.async('string') : null;
  };

  // --- Slayt sırası ---
  const presXml = await readText('ppt/presentation.xml');
  const presRels = await readText('ppt/_rels/presentation.xml.rels');
  let slidePaths: string[] = [];
  if (presXml && presRels) {
    try {
      slidePaths = resolveSlideOrder(presXml, presRels, xmlParse);
    } catch {
      slidePaths = [];
    }
  }
  if (slidePaths.length === 0) {
    // Fallback: SAYISAL sıralama (sözlük sırası slide10'u slide2'den öne alırdı)
    slidePaths = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => Number(a.match(/slide(\d+)\.xml$/)![1]) - Number(b.match(/slide(\d+)\.xml$/)![1]));
  }
  if (slidePaths.length === 0) {
    throw new Error('Geçerli bir PowerPoint sunumu değil.');
  }

  // --- Slayt boyutu (alan oranı filtresi için) ---
  let slideW = 0;
  let slideH = 0;
  if (presXml) {
    try {
      const sz = xmlParse(presXml).getElementsByTagName('p:sldSz');
      if (sz.length > 0) {
        slideW = Number(sz[0].getAttribute('cx') || 0);
        slideH = Number(sz[0].getAttribute('cy') || 0);
      }
    } catch {
      /* boyut okunamadı → filtre fail-open davranır */
    }
  }

  // --- Slaytları gez ---
  const parts: string[] = [];
  const allMediaPaths: string[] = []; // global placeholder indeksi → medya yolu

  for (let i = 0; i < slidePaths.length; i++) {
    const slideXml = await readText(slidePaths[i]);
    if (!slideXml) {
      onProgress?.(i + 1, slidePaths.length);
      continue;
    }

    const dir = slidePaths[i].split('/').slice(0, -1).join('/');
    const base = slidePaths[i].split('/').pop()!;
    const relsXml = await readText(`${dir}/_rels/${base}.rels`);
    const rels = relsXml ? parseRels(relsXml, xmlParse, dir) : new Map<string, string>();

    // Grafik ve SmartArt part'larını önceden yükle
    const charts = new Map<string, Document>();
    const diagrams = new Map<string, Document>();
    for (const path of rels.values()) {
      if (/^ppt\/charts\/chart\d+\.xml$/.test(path)) {
        const xml = await readText(path);
        if (xml) {
          try { charts.set(path, xmlParse(xml)); } catch { /* bozuk grafik atlanır */ }
        }
      } else if (/^ppt\/diagrams\/data\d+\.xml$/.test(path)) {
        const xml = await readText(path);
        if (xml) {
          try { diagrams.set(path, xmlParse(xml)); } catch { /* bozuk diyagram atlanır */ }
        }
      }
    }

    let extract: SlideExtract;
    try {
      extract = extractSlideText(xmlParse(slideXml), { slideW, slideH, rels, charts, diagrams });
    } catch {
      onProgress?.(i + 1, slidePaths.length);
      continue;
    }

    // Slayt-yerel placeholder indekslerini GLOBAL indekse kaydır
    const offset = allMediaPaths.length;
    let text = extract.text;
    if (offset > 0 && extract.mediaPaths.length > 0) {
      text = text.replace(/%%OCR_IMG_(\d+)%%/g, (_m, n) => `%%OCR_IMG_${Number(n) + offset}%%`);
    }
    allMediaPaths.push(...extract.mediaPaths);

    // Konuşmacı notları
    const notesPath = Array.from(rels.values()).find((p) =>
      /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(p),
    );
    if (notesPath) {
      const notesXml = await readText(notesPath);
      if (notesXml) {
        try {
          const notes = extractNotesText(xmlParse(notesXml));
          if (notes) text += `\n\n### Konuşmacı Notları\n${notes}`;
        } catch {
          /* bozuk not atlanır */
        }
      }
    }

    const body = text.trim();
    if (body) parts.push(`--- Slayt ${i + 1} ---\n${body}`);

    onProgress?.(i + 1, slidePaths.length);
  }

  // --- OCR geçişi: dedupe + fail-open ---
  const warnings: string[] = [];
  let content = parts.join('\n\n');
  let ocrPages = 0;

  if (allMediaPaths.length > 0) {
    const enabled = opts.ocrEnabled
      ? await opts.ocrEnabled()
      : !isOcrOff() && (await isOcrAvailable());

    if (enabled) {
      // Dedupe: aynı medya yolu TEK OCR çağrısı. Sunumlarda her slaytta tekrar
      // eden logo/arka plan görselinin çarpımını bitirir.
      const uniquePaths = Array.from(new Set(allMediaPaths));

      // Data-URL'ler TEK TEK, OCR'a gönderileceği anda üretilir ve hemen bırakılır.
      // Hepsini önceden bir dizide tutmak büyük deck'lerde sekmeyi çökertir:
      // toDataUrl'ün ürettiği JS string'i UTF-16 (bayt başına 2 bayt) + base64
      // kopyası → 300MB görsel ~700MB bellek demek. Böylece aynı anda yalnız
      // eşzamanlılık kadar data-URL yaşıyor.
      const runOne = opts.ocrOne || ocrImage;
      const results = await mapWithConcurrency(
        uniquePaths,
        async (p) => {
          const f = zip.file(p);
          if (!f) return null;
          const url = toDataUrl(await f.async('uint8array'), p);
          return url ? runOne(url) : null;
        },
        OCR_CONCURRENCY,
      );
      const byPath = new Map<string, string | null>();
      uniquePaths.forEach((p, idx) => byPath.set(p, results[idx] ?? null));

      const perPlaceholder = allMediaPaths.map((p) => byPath.get(p) ?? null);
      ocrPages = perPlaceholder.filter((t) => t && t.trim()).length;
      content = injectOcrResults(content, perPlaceholder);

      const failed = uniquePaths.filter((p) => {
        const t = byPath.get(p);
        return !t || !t.trim();
      }).length;
      if (failed > 0) warnings.push(`${failed} görselden metin çıkarılamadı.`);
    } else {
      content = injectOcrResults(content, allMediaPaths.map(() => null));
      warnings.push(
        `Sunumda ${allMediaPaths.length} görsel var; OCR servisi kullanılamadığı için metinleri dahil edilemedi.`,
      );
    }
  }

  // OCR SONRASI boş kalan slaytları ele. Bir slaydın tek içeriği görselse ve OCR
  // başarısızsa geriye yalnız "--- Slayt N ---" işareti kalır; işareti saymak o
  // slaydı "dolu" gösterirdi. Bu yüzden işaret ÇIKARILIP gövdeye bakılır.
  const sections = content
    .split(/(?=---\s*Slayt\s+\d+\s*---)/)
    .filter((s) => s.trim().length > 0);
  const nonEmpty = sections.filter(
    (s) => s.replace(/---\s*Slayt\s+\d+\s*---/, '').trim().length > 0,
  );
  content = nonEmpty.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();

  if (nonEmpty.length === 0) {
    throw new Error(
      'Sunumdan hiç metin çıkarılamadı — tüm slaytlar görsel ve OCR servisi kullanılamıyor.',
    );
  }
  const trulyEmpty = slidePaths.length - nonEmpty.length;
  if (trulyEmpty > 0) {
    warnings.push(`${trulyEmpty} slayttan metin çıkarılamadı.`);
  }

  const wordCount = content.split(/\s+/).filter((w) => w.length > 0).length;

  return {
    content,
    metadata: {
      pageCount: slidePaths.length,
      wordCount,
      format: 'pptx',
      ...(warnings.length > 0 ? { warnings } : {}),
      ...(ocrPages > 0 ? { ocrPages } : {}),
    },
  };
}

/** Tarayıcı adaptörü — tüm mantık parsePptxBuffer'da. */
export async function parsePptxFile(
  file: File,
  onProgress?: (current: number, total: number) => void,
): Promise<ParsedFile> {
  const buf = await readFileAsArrayBuffer(file);
  return parsePptxBuffer(buf, { onProgress });
}
