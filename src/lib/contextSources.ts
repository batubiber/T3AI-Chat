/**
 * Kaynak künyelerini gösterime hazırlayan saf fonksiyonlar.
 *
 * Bileşenden AYRI dosya: aynı dosyadan hem bileşen hem yardımcı fonksiyon
 * dışa açılınca React Fast Refresh çalışmıyor (react-refresh/only-export-components).
 * Bu repoda aynı ayrım DocumentEditContext/documentEditStore'da da yapılmış.
 */
import type { RagSource } from './ragService';

/** Aynı dosyanın birden çok parçası tek satırda toplanır. */
interface Grup {
  fileName: string;
  parcaSayisi: number;
  sayfalar: number[];
  /** Kod dosyalarında satır aralıkları — künyede "sat.120-180" olarak çıkar */
  satirAraliklari: { bas: number; son: number }[];
  enIyiSkor: number | null;
  dogrudanEklendi: boolean;
}

export function gruplaKaynaklar(sources: RagSource[]): Grup[] {
  const harita = new Map<string, Grup>();
  for (const s of sources) {
    const mevcut = harita.get(s.fileName);
    const skor = s.retrieval === "search" ? s.score : null;
    if (!mevcut) {
      harita.set(s.fileName, {
        fileName: s.fileName,
        parcaSayisi: 1,
        sayfalar: s.pageNumber ? [s.pageNumber] : [],
        satirAraliklari:
          s.startLine !== undefined ? [{ bas: s.startLine, son: s.endLine ?? s.startLine }] : [],
        enIyiSkor: skor,
        dogrudanEklendi: s.retrieval === "conversation",
      });
      continue;
    }
    mevcut.parcaSayisi++;
    if (s.pageNumber && !mevcut.sayfalar.includes(s.pageNumber)) {
      mevcut.sayfalar.push(s.pageNumber);
    }
    if (s.startLine !== undefined) {
      mevcut.satirAraliklari.push({ bas: s.startLine, son: s.endLine ?? s.startLine });
    }
    if (skor !== null) mevcut.enIyiSkor = Math.max(mevcut.enIyiSkor ?? 0, skor);
    if (s.retrieval === "conversation") mevcut.dogrudanEklendi = true;
  }
  return [...harita.values()]
    .map((g) => ({
      ...g,
      sayfalar: g.sayfalar.sort((a, b) => a - b),
      satirAraliklari: birlestirAraliklar(g.satirAraliklari),
    }))
    // Skorlu olanlar önce, sonra dosya adına göre
    .sort((a, b) => (b.enIyiSkor ?? -1) - (a.enIyiSkor ?? -1) || a.fileName.localeCompare(b.fileName, "tr"));
}

/** "3, 4, 5" → "3-5"; kopuk sayfalar virgülle kalır. */
export function sayfaAraligi(sayfalar: number[]): string {
  if (sayfalar.length === 0) return "";
  const parcalar: string[] = [];
  let bas = sayfalar[0];
  let son = sayfalar[0];
  for (let i = 1; i <= sayfalar.length; i++) {
    if (i < sayfalar.length && sayfalar[i] === son + 1) {
      son = sayfalar[i];
      continue;
    }
    parcalar.push(bas === son ? String(bas) : `${bas}-${son}`);
    if (i < sayfalar.length) {
      bas = sayfalar[i];
      son = sayfalar[i];
    }
  }
  return parcalar.join(", ");
}

/**
 * Bitişik/örtüşen satır aralıklarını birleştirir.
 *
 * Kod parçalayıcı örtüşmeli pencere kullanıyor; "120-180, 178-240" iki ayrı
 * aralık gibi görünüyordu. Kullanıcı için tek aralık daha okunur.
 */
export function birlestirAraliklar(
  araliklar: { bas: number; son: number }[],
): { bas: number; son: number }[] {
  if (araliklar.length === 0) return [];
  const sirali = [...araliklar].sort((a, b) => a.bas - b.bas);
  const out = [{ ...sirali[0] }];
  for (const a of sirali.slice(1)) {
    const son = out[out.length - 1];
    // +1: "10-20" ve "21-30" bitişik sayılır
    if (a.bas <= son.son + 1) son.son = Math.max(son.son, a.son);
    else out.push({ ...a });
  }
  return out;
}

/** "120-180, 240-260" */
export function satirAraligiMetni(araliklar: { bas: number; son: number }[]): string {
  return araliklar.map((a) => (a.bas === a.son ? `${a.bas}` : `${a.bas}-${a.son}`)).join(', ');
}
