/**
 * Markdown'ı belge üretiminde kullanılan dar bir blok modeline çevirir.
 *
 * NEDEN MARKDOWN: model markdown'da zaten çok iyi — başlık, madde, kalın,
 * tablo hepsini doğru üretiyor. Yapılandırılmış JSON denendi diye değil,
 * düzenleme motorunda modelin JSON'da belirgin şekilde daha çok hata yaptığı
 * görüldüğü için seçilmedi (spec §3.1).
 *
 * NEDEN mdast DOĞRUDAN KULLANILMIYOR: mdast remark'ın iç yapısı, 70'ten fazla
 * düğüm tipi var ve sürümle değişebiliyor. Üreticiler (docxOlustur,
 * xlsxOlustur) bu dar modelden besleniyor, remark'a bağlı kalmıyorlar.
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

export interface Parca {
  metin: string;
  kalin?: boolean;
  italik?: boolean;
}

export interface ListeOgesi {
  metin: string;
  /** İç içe listede derinlik; 0 en dış */
  seviye: number;
}

export type Blok =
  | { tip: 'baslik'; seviye: 1 | 2 | 3; metin: string }
  | { tip: 'paragraf'; parcalar: Parca[] }
  | { tip: 'liste'; sirali: boolean; ogeler: ListeOgesi[] }
  | { tip: 'tablo'; basliklar: string[]; satirlar: string[][] };

export interface IcerikSonucu {
  bloklar: Blok[];
  /** Aktarılamayan düğüm sayısı — panel bunu kullanıcıya söyler, sessizce yutmaz */
  atlanan: number;
}

/** mdast düğümü — yalnız kullandığımız alanlar. */
interface Dugum {
  type: string;
  depth?: number;
  ordered?: boolean;
  value?: string;
  children?: Dugum[];
}

/**
 * Satır içi düğümleri parçalara çevirir; kalın/italik korunur.
 * Çıktı üretmeyen ve kapsayıcı da olmayan düğümler (görsel, satır sonu, html
 * gibi) `sayac.atlanan`a yazılır — duzlestirListe'deki gibi biriktirici
 * parametre. Bağlantı, üstü çizili gibi kapsayıcılar SAYILMAZ: görünür
 * metinleri çocuklarından aynen korunur.
 */
function parcalaSatirIci(
  dugumler: Dugum[],
  sayac: { atlanan: number },
  kalin = false,
  italik = false,
): Parca[] {
  const cikti: Parca[] = [];
  for (const d of dugumler) {
    if (d.type === 'text' || d.type === 'inlineCode') {
      if (d.value) cikti.push({ metin: d.value, ...(kalin && { kalin }), ...(italik && { italik }) });
    } else if (d.type === 'strong') {
      cikti.push(...parcalaSatirIci(d.children ?? [], sayac, true, italik));
    } else if (d.type === 'emphasis') {
      cikti.push(...parcalaSatirIci(d.children ?? [], sayac, kalin, true));
    } else if (d.children) {
      // bağlantı, üstü çizili gibi kapsayıcılar: görünür metin çocuklarda
      cikti.push(...parcalaSatirIci(d.children, sayac, kalin, italik));
    } else {
      // görsel, satır sonu, html gibi çıktısız düğüm: sessizce düşmesin
      sayac.atlanan++;
    }
  }
  return cikti;
}

/** Düğümün tüm metnini düz olarak toplar (başlık ve tablo hücresi için). */
function duzMetin(d: Dugum): string {
  if (d.value) return d.value;
  return (d.children ?? []).map(duzMetin).join('');
}

/** listItem'ları seviyeleriyle düzleştirir; iç içe list listItem'ın çocuğu olarak gelir. */
function duzlestirListe(dugum: Dugum, seviye: number, cikti: ListeOgesi[]): void {
  for (const oge of dugum.children ?? []) {
    if (oge.type !== 'listItem') continue;
    for (const cocuk of oge.children ?? []) {
      if (cocuk.type === 'list') duzlestirListe(cocuk, seviye + 1, cikti);
      else {
        const metin = duzMetin(cocuk).trim();
        if (metin) cikti.push({ metin, seviye });
      }
    }
  }
}

export function markdownBloklara(md: string): IcerikSonucu {
  const kok = unified().use(remarkParse).use(remarkGfm).parse(md) as unknown as Dugum;
  const bloklar: Blok[] = [];
  let atlanan = 0;

  for (const d of kok.children ?? []) {
    switch (d.type) {
      case 'heading': {
        // styles.xml üç başlık stili tanımlıyor; daha derini 3'e sıkıştırılıyor
        const seviye = Math.min(d.depth ?? 1, 3) as 1 | 2 | 3;
        bloklar.push({ tip: 'baslik', seviye, metin: duzMetin(d) });
        break;
      }
      case 'paragraph': {
        const sayac = { atlanan: 0 };
        const parcalar = parcalaSatirIci(d.children ?? [], sayac);
        // Satır içi kayıplar (görsel, satır sonu gibi) sayaçtan gelir; parçasız
        // kalan paragraf blok üretmez. Kaybı sayılmadan boşalan paragraf (ör.
        // boş bağlantı) tek atlanan sayılır — hiçbir düğüm iz bırakmadan düşmez.
        atlanan += sayac.atlanan;
        if (parcalar.length > 0) bloklar.push({ tip: 'paragraf', parcalar });
        else if (sayac.atlanan === 0) atlanan++;
        break;
      }
      case 'list': {
        const ogeler: ListeOgesi[] = [];
        duzlestirListe(d, 0, ogeler);
        if (ogeler.length > 0) bloklar.push({ tip: 'liste', sirali: !!d.ordered, ogeler });
        break;
      }
      case 'table': {
        const satirlar = (d.children ?? []).map((r) =>
          (r.children ?? []).map((h) => duzMetin(h).trim()),
        );
        if (satirlar.length > 0) {
          bloklar.push({ tip: 'tablo', basliklar: satirlar[0], satirlar: satirlar.slice(1) });
        }
        break;
      }
      case 'code':
        // ATILMIYOR: model kod yazdıysa kaybolmamalı. Tek renkli gösterim
        // kapsam dışı; metin korunuyor.
        if (d.value) bloklar.push({ tip: 'paragraf', parcalar: [{ metin: d.value }] });
        break;
      default:
        atlanan++;
    }
  }

  return { bloklar, atlanan };
}
