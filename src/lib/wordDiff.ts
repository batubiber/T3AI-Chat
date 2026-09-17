/**
 * Kelime bazlı fark — düzenleme panelinde eski/yeni metni vurgulamak için.
 *
 * Kütüphane EKLENMEDİ: girdi tek cümle mertebesinde (bir düzenlemenin find/replace
 * metni), klasik LCS fazlasıyla yeterli ve bağımlılık maliyeti yok.
 */

export type DiffOp = 'same' | 'removed' | 'added';

export interface DiffPart {
  op: DiffOp;
  text: string;
}

/**
 * Metni "kelime + kendisine bitişik boşluk" parçalarına böler.
 *
 * Boşluk AYRI token yapılmıyor: yapılsaydı iki metnin arasındaki boşluk ortak
 * sayılır ve tamamen değişmiş bir ifadeyi ikiye bölerdi — panelde
 * "elma → kalem" ve "armut → defter" diye parçalı görünürdü. Boşluğu kelimeye
 * iliştirince değişiklikler tek blok kalıyor. Bölme kayıpsızdır (baştaki
 * boşluk ilk parçaya girer).
 */
function tokenize(s: string): string[] {
  return s.match(/\s*\S+\s*/g) || [];
}

/**
 * İki metnin kelime bazlı farkı. Ortak alt dizi (LCS) üzerinden yürünür;
 * çıktı sırayla 'same' / 'removed' / 'added' parçalarıdır.
 */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokenize(before);
  const b = tokenize(after);

  // LCS uzunluk tablosu
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const parts: DiffPart[] = [];
  const push = (op: DiffOp, text: string) => {
    const last = parts[parts.length - 1];
    if (last && last.op === op) last.text += text;
    else parts.push({ op, text });
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('same', a[i]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push('removed', a[i]);
      i++;
    } else {
      push('added', b[j]);
      j++;
    }
  }
  while (i < n) push('removed', a[i++]);
  while (j < m) push('added', b[j++]);

  return parts;
}
