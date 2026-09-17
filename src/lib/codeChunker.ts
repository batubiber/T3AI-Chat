/**
 * Kod dosyalarını ANLAMLI parçalara böler.
 *
 * NEDEN AYRI BİR PARÇALAYICI: mevcut `chunkText` düzyazı için ayarlı ve ayırıcı
 * sırası şöyle:
 *     '\n## ' → '\n\n' → '\n' → '. ' → ', ' → ' '
 * Koda uygulandığında `. ` ayırıcısı `foo.bar()` çağrısını ve ondalık sayıyı
 * ortadan böler, `, ` argüman listesini böler. Dosya yüklenir ama fonksiyonlar
 * ortadan bölünmüş hâlde indekslenir; "bu fonksiyon ne yapıyor" sorusuna yarım
 * gövdeyle cevap verilir.
 *
 * BURADAKİ YOL: üst düzey bildirimlerden böl (fonksiyon, sınıf, impl…),
 * sığmayanı SATIR penceresine düşür. Cümle/kelime ayırıcısı hiç kullanılmaz.
 *
 * Deseni tutmayan dosya (ini, sql, düz betik) doğrudan satır penceresine gider
 * — bölmeye zorlanmaz, uydurma sınır çizilmez.
 *
 * Her parça satır aralığı taşır: alıntı `dosya.py:120-180` olabilsin diye.
 */
import type { CodeLanguage } from './codeLanguages';

export interface KodParcasi {
  content: string;
  /** 1-tabanlı, dahil */
  startLine: number;
  /** 1-tabanlı, dahil */
  endLine: number;
  /** İçinde bulunduğu bildirimin adı — çıkarılabildiyse */
  symbol?: string;
}

/** Bir satırın YENİ bildirim başlatıp başlatmadığı. */
type BildirimDeseni = { re: RegExp; adGrubu?: number };

/**
 * C ailesinde fonksiyon imzasını denetim yapılarından ayırmak için.
 * `if (x) {` bir bildirim değil.
 */
const C_DENETIM = /^(if|for|while|switch|else|do|catch|return|case|default)\b/;

const DESENLER: Partial<Record<CodeLanguage, BildirimDeseni[]>> = {
  python: [
    { re: /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/, adGrubu: 1 },
    { re: /^\s*class\s+([A-Za-z_]\w*)/, adGrubu: 1 },
    { re: /^\s*@[A-Za-z_]/ }, // dekoratör: altındaki def ile aynı parçaya girsin
  ],
  rust: [
    { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+([A-Za-z_]\w*)/, adGrubu: 1 },
    { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum|trait|union)\s+([A-Za-z_]\w*)/, adGrubu: 1 },
    { re: /^\s*impl(?:<[^>]*>)?\s+([A-Za-z_][\w:<>, ]*)/, adGrubu: 1 },
    { re: /^\s*(?:pub\s+)?mod\s+([A-Za-z_]\w*)/, adGrubu: 1 },
  ],
  csharp: [
    { re: /^\s*(?:public|private|protected|internal|static|abstract|sealed|partial|\s)*\s*(?:class|interface|struct|enum|record)\s+([A-Za-z_]\w*)/, adGrubu: 1 },
    { re: /^\s*(?:public|private|protected|internal|static|virtual|override|async|sealed|\s)+[\w<>[\],.?]+\s+([A-Za-z_]\w*)\s*\(/, adGrubu: 1 },
  ],
  java: [
    { re: /^\s*(?:public|private|protected|static|final|abstract|\s)*\s*(?:class|interface|enum|record)\s+([A-Za-z_]\w*)/, adGrubu: 1 },
    { re: /^\s*(?:public|private|protected|static|final|synchronized|abstract|\s)+[\w<>[\],.?]+\s+([A-Za-z_]\w*)\s*\(/, adGrubu: 1 },
  ],
  kotlin: [
    { re: /^\s*(?:public|private|internal|open|abstract|sealed|data|\s)*\s*(?:class|interface|object)\s+([A-Za-z_]\w*)/, adGrubu: 1 },
    { re: /^\s*(?:public|private|internal|open|override|suspend|\s)*fun\s+([A-Za-z_]\w*)/, adGrubu: 1 },
  ],
  swift: [
    { re: /^\s*(?:public|private|internal|open|fileprivate|final|\s)*\s*(?:class|struct|enum|protocol|extension)\s+([A-Za-z_]\w*)/, adGrubu: 1 },
    { re: /^\s*(?:public|private|internal|open|static|override|\s)*func\s+([A-Za-z_]\w*)/, adGrubu: 1 },
  ],
  go: [
    { re: /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/, adGrubu: 1 },
    { re: /^type\s+([A-Za-z_]\w*)/, adGrubu: 1 },
  ],
  javascript: [
    { re: /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/, adGrubu: 1 },
    { re: /^\s*(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/, adGrubu: 1 },
    { re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/, adGrubu: 1 },
  ],
  php: [
    { re: /^\s*(?:abstract\s+|final\s+)?class\s+([A-Za-z_]\w*)/, adGrubu: 1 },
    { re: /^\s*(?:public|private|protected|static|\s)*function\s+([A-Za-z_]\w*)/, adGrubu: 1 },
  ],
  ruby: [
    { re: /^\s*(?:class|module)\s+([A-Za-z_]\w*)/, adGrubu: 1 },
    { re: /^\s*def\s+([A-Za-z_][\w.?!]*)/, adGrubu: 1 },
  ],
};

// TypeScript, JS ile aynı desenleri kullanır + tip bildirimleri
DESENLER.typescript = [
  ...(DESENLER.javascript ?? []),
  { re: /^\s*(?:export\s+)?(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/, adGrubu: 1 },
];

/** C ve C++: fonksiyon imzası regexle tam yakalanamaz, sezgiyle gidiliyor. */
function cAilesiBildirimMi(satir: string): { eslesti: boolean; ad?: string } {
  const t = satir.trim();
  if (!t || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) {
    return { eslesti: false };
  }
  // Tür/ad bildirimleri
  const tur = /^(?:template\s*<[^>]*>\s*)?(?:typedef\s+)?(?:struct|class|union|enum|namespace)\s+([A-Za-z_]\w*)/.exec(t);
  if (tur) return { eslesti: true, ad: tur[1] };

  // Fonksiyon tanımı sezgisi: '(' var, '{' ile bitiyor, denetim yapısı değil,
  // ve satır ';' ile bitmiyor (o bildirim değil, prototip).
  if (C_DENETIM.test(t)) return { eslesti: false };
  if (!t.includes('(') || t.endsWith(';')) return { eslesti: false };
  if (!t.endsWith('{') && !t.endsWith(')')) return { eslesti: false };
  const fn = /([A-Za-z_]\w*)\s*\(/.exec(t);
  return fn ? { eslesti: true, ad: fn[1] } : { eslesti: false };
}

/** Satır bir bildirim başlatıyor mu; başlatıyorsa adı ne. */
export function bildirimBasi(
  satir: string,
  dil: CodeLanguage,
): { eslesti: boolean; ad?: string } {
  if (dil === 'c' || dil === 'cpp') return cAilesiBildirimMi(satir);

  const desenler = DESENLER[dil];
  if (!desenler) return { eslesti: false };
  for (const d of desenler) {
    const m = d.re.exec(satir);
    if (m) return { eslesti: true, ad: d.adGrubu ? m[d.adGrubu]?.trim() : undefined };
  }
  return { eslesti: false };
}

/**
 * "Önemsiz" blok eşiği.
 *
 * DİKKAT — ilk hâli yanlıştı: kısa olan HER blok öncesine katılıyordu ve
 * `void yazdir(...)` gibi KISA AMA GERÇEK bir fonksiyon, bir öncekinin içinde
 * kayboluyordu (sembolü de kayboluyordu). Kısa fonksiyon anlamlı bir birimdir.
 *
 * Doğru ölçüt uzunluk değil, BİLDİRİM OLUP OLMAMASI: sembolü olan blok asla
 * yutulmaz. Yalnız sembolsüz ve kısa parçalar (dekoratör, öznitelik satırı,
 * bildirim öncesi yorum başlığı) komşusuna katılır.
 */
const ONEMSIZ_BLOK = 120;

/**
 * Uzun bloğu SATIR penceresine böler. Kelime/cümle ayırıcısı kullanılmaz;
 * koda uygulanınca ifadeyi ortadan kesiyorlar.
 */
function satirPenceresi(
  satirlar: string[],
  ilkSatirNo: number,
  chunkSize: number,
  ortusme: number,
  symbol?: string,
): KodParcasi[] {
  const out: KodParcasi[] = [];
  let i = 0;
  while (i < satirlar.length) {
    let uzunluk = 0;
    let j = i;
    while (j < satirlar.length && uzunluk + satirlar[j].length + 1 <= chunkSize) {
      uzunluk += satirlar[j].length + 1;
      j++;
    }
    if (j === i) j = i + 1; // tek satır bile sığmıyorsa yine de ilerle
    out.push({
      content: satirlar.slice(i, j).join('\n'),
      startLine: ilkSatirNo + i,
      endLine: ilkSatirNo + j - 1,
      ...(symbol ? { symbol } : {}),
    });
    if (j >= satirlar.length) break;
    // Örtüşme satır sayısıyla: bağlam kopmasın
    const geri = Math.min(ortusme, j - i - 1);
    i = j - geri;
  }
  return out;
}

export interface KodParcalamaSecenekleri {
  chunkSize?: number;
  /** Satır cinsinden örtüşme (karakter değil) */
  overlapLines?: number;
}

/**
 * Kod metnini parçalara böler.
 *
 * @returns satır aralıklı parçalar; içerik ASLA kaybolmaz (bloklar birleşir ya
 *          da pencerelenir, atılmaz)
 */
export function parcalaKod(
  content: string,
  dil: CodeLanguage,
  secenekler: KodParcalamaSecenekleri = {},
): KodParcasi[] {
  const chunkSize = secenekler.chunkSize ?? 1500;
  const ortusme = secenekler.overlapLines ?? 3;

  const satirlar = content.split('\n');
  if (content.trim().length === 0) return [];

  // 1) Bildirim başlangıçlarını bul
  const basliklar: { satir: number; ad?: string }[] = [];
  for (let i = 0; i < satirlar.length; i++) {
    const { eslesti, ad } = bildirimBasi(satirlar[i], dil);
    if (eslesti) basliklar.push({ satir: i, ad });
  }

  // 2) Desen hiç tutmadıysa: zorlamadan satır penceresine düş
  if (basliklar.length === 0) {
    return satirPenceresi(satirlar, 1, chunkSize, ortusme);
  }

  // 3) Bildirimler arası blokları kur (ilk bildirimden ÖNCEsi de bir blok:
  //    import'lar, lisans başlığı, sabitler)
  const bloklar: { bas: number; son: number; ad?: string }[] = [];
  if (basliklar[0].satir > 0) {
    bloklar.push({ bas: 0, son: basliklar[0].satir - 1 });
  }
  basliklar.forEach((b, k) => {
    const son = k + 1 < basliklar.length ? basliklar[k + 1].satir - 1 : satirlar.length - 1;
    bloklar.push({ bas: b.satir, son, ad: b.ad });
  });

  // 4) Önemsiz blokları komşusuna kat.
  //    İLERİ birleştirme: dekoratör/öznitelik satırı KENDİNDEN SONRAKİNE aittir
  //    (`@dekorator` + `def islev` tek parça olmalı). Geriye katmak yanlış
  //    olurdu, ayrıca ilk blokta geriye katacak komşu da yok.
  const onemsizMi = (b: { bas: number; son: number; ad?: string }) => {
    const metin = satirlar.slice(b.bas, b.son + 1).join('\n');
    const doluSatir = metin.split('\n').filter((x) => x.trim().length > 0).length;
    // GÖVDESİZ BAŞLIK da ileri katılır. Gerçek bir Python dosyasında
    // "class Analizci:" tek satırlık kendi parçası oluyordu; sembolü var diye
    // korunuyordu ama gömülünce hiçbir işe yaramıyor — o sorgu gövdesiz bir
    // başlık getirir. Bir sonraki bloğa (ilk metoda) katılması doğru.
    if (doluSatir <= 1) return true;
    return !b.ad && metin.trim().length < ONEMSIZ_BLOK;
  };

  const birlesik: { bas: number; son: number; ad?: string }[] = [];
  let bekleyen: { bas: number; son: number; ad?: string } | null = null;
  for (const b of bloklar) {
    // Sembol: bekleyen başlığınki öncelikli — "class Analizci" etiketi
    // "__init__"ten daha bilgilendirici
    const parca = bekleyen
      ? { ...b, bas: bekleyen.bas, ad: bekleyen.ad ?? b.ad }
      : { ...b };
    bekleyen = null;
    if (onemsizMi(parca)) {
      bekleyen = parca; // sonraki bloğa taşı
      continue;
    }
    birlesik.push(parca);
  }
  // Sona kalan önemsiz parça kaybolmasın: son bloğa kat, o da yoksa tek başına
  if (bekleyen) {
    const son = birlesik[birlesik.length - 1];
    if (son) son.son = bekleyen.son;
    else birlesik.push(bekleyen);
  }

  // 5) Büyük blokları pencerele, küçükleri olduğu gibi bırak
  const parcalar: KodParcasi[] = [];
  for (const b of birlesik) {
    const blokSatirlari = satirlar.slice(b.bas, b.son + 1);
    const metin = blokSatirlari.join('\n');
    if (metin.length <= chunkSize) {
      parcalar.push({
        content: metin,
        startLine: b.bas + 1,
        endLine: b.son + 1,
        ...(b.ad ? { symbol: b.ad } : {}),
      });
      continue;
    }
    parcalar.push(...satirPenceresi(blokSatirlari, b.bas + 1, chunkSize, ortusme, b.ad));
  }

  return parcalar.filter((p) => p.content.trim().length > 0);
}
