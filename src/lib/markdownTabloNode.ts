/**
 * Markdown tablosunun hast ağacından okuma yardımcıları.
 *
 * Bileşenden AYRI dosya: aynı dosyadan hem bileşen hem fonksiyon dışa açılınca
 * React Fast Refresh çalışmıyor (react-refresh/only-export-components). Bu
 * repoda aynı ayrım documentEditStore ve contextSources'ta da var.
 */
import type { Element as HastElement, ElementContent, Root } from 'hast';
import type { Hiza } from './tabloHizalama';

/** hast düğümünün düz metni — hiza sezgisi ve panoya kopyalama için. */
export function nodeMetni(node: ElementContent | Root): string {
  if (node.type === "text") return node.value;
  if ("children" in node && node.children) {
    return node.children.map((c) => nodeMetni(c)).join("");
  }
  return "";
}

const altElemanlar = (node: HastElement | undefined, ad: string): HastElement[] =>
  (node?.children ?? []).filter(
    (c): c is HastElement => c.type === "element" && c.tagName === ad,
  );

/** <thead>/<tbody> her zaman olmayabilir; satırları nerede olursa bul. */
export function tabloSatirlari(table: HastElement): {
  baslikHucreleri: HastElement[];
  govdeMetinleri: string[][];
} {
  const thead = altElemanlar(table, "thead")[0];
  const tbody = altElemanlar(table, "tbody")[0];
  const hucreler = (tr: HastElement | undefined) =>
    (tr?.children ?? []).filter(
      (c): c is HastElement =>
        c.type === "element" && (c.tagName === "th" || c.tagName === "td"),
    );

  const baslikSatiri = thead ? altElemanlar(thead, "tr")[0] : undefined;
  const govdeSatirlari = tbody ? altElemanlar(tbody, "tr") : altElemanlar(table, "tr");

  return {
    baslikHucreleri: hucreler(baslikSatiri),
    govdeMetinleri: govdeSatirlari.map((tr) => hucreler(tr).map(nodeMetni)),
  };
}

/** remark-gfm hizayı `style: "text-align: right"` olarak koyuyor. */
export function acikHiza(h: HastElement): Hiza | null {
  const style = h.properties?.style;
  const metin = typeof style === "string" ? style : "";
  if (metin.includes("right")) return "right";
  if (metin.includes("center")) return "center";
  if (metin.includes("left")) return "left";
  return null;
}

/** Sola yaslı kolonlar zaten varsayılan; yalnız sapanlar için kural üretilir. */
export function hizaKurallari(secici: string, hizalar: Hiza[]): string {
  return hizalar
    .map((h, i) =>
      h === "left"
        ? ""
        : `${secici} tr > :nth-child(${i + 1}){text-align:${h};font-variant-numeric:tabular-nums}`,
    )
    .filter(Boolean)
    .join("");
}
