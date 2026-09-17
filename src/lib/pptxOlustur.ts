/**
 * Blok modelinden pptxgenjs ile sıfırdan PowerPoint sunumu kurar.
 *
 * docxOlustur/xlsxOlustur elle OOXML kuruyordu (şablon yok); burada pptxgenjs
 * var — o yüzden XML'i biz yazmıyoruz, kütüphaneye addText/addTable/write
 * çağrılarıyla anlatıyoruz. XML kaçırma (& < >) da kütüphanenin işi: kendi
 * ürettiğimiz elle escape YOK (docxOlustur.ts'teki xmlKacir'in eşdeğeri
 * burada gerekmiyor, ÖLÇÜLDÜ — bkz. pptxOlustur.test.ts).
 *
 * SLAYT BÖLÜMLEME (task-6-brief.md):
 * - seviye 1/2 başlık YENİ SLAYT açar, metni slaydın başlığı olur.
 * - seviye 3 başlık slayt açmaz; slayt içinde ara başlık gibi İÇERİK sayılır.
 * - İlk başlıktan önce içerik varsa "Sunum" başlıklı slayta düşer.
 * - Bir slayda SLAYT_BLOK_SINIRI kadar içerik bloğu (başlığın kendisi hariç)
 *   yerleştirilir; alan hesabı daha erken devam slaydı açabilir. Taşan blok "<kök başlık> (devam)" başlıklı yeni slayta geçer.
 *   Sınırsız bırakmak 20 maddelik okunmaz slaytlar üretirdi. "kök başlık"
 *   HER ZAMAN son GERÇEK başlık bloğunun metni — ikinci taşmada "X (devam)
 *   (devam)" DEĞİL yine "X (devam)" çıkar (bkz. pptxOlustur.test.ts).
 *
 * NEDEN 'arraybuffer': tarayıcıda 'blob', node'da 'nodebuffer' çalışıyor ama
 * 'arraybuffer' ikisinde de çalışıyor (doğrulandı) — tek kod yolu, sonra
 * Uint8Array'e sarılıyor. `Blob` DEĞİL: bu üretici node ortamında (vitest)
 * test ediliyor, Blob orada da var ama proje genelinde docx/xlsx
 * üreticileriyle aynı sözleşmeyi (Uint8Array) koruyoruz.
 */
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import type { Blok, Parca } from './belgeIcerik';

/** Bir slayda sığan içerik bloğu sayısı (başlığın kendisi hariç). */
export const SLAYT_BLOK_SINIRI = 8;

const VARSAYILAN_BASLIK = 'Sunum';
const YAZI_RENGI = '1F2937';

interface SlaytTaslagi {
  baslik: string;
  icerik: Blok[];
}

/** seviye 1/2 başlık yeni slayt açar; seviye 3 içerik gibi davranır. */
function slaytAcanBaslikMi(b: Blok): b is Extract<Blok, { tip: 'baslik' }> {
  return b.tip === 'baslik' && b.seviye !== 3;
}

/**
 * Blokları slaytlara böler. Kurallar için dosya başındaki yorum bkz.
 * `kokBaslik` son GERÇEK başlığı tutar (üretilen "(devam)" başlığını DEĞİL) —
 * ardışık taşmalarda "(devam) (devam)" birikmesin diye.
 */
function slaytlaraBol(bloklar: Blok[]): SlaytTaslagi[] {
  const slaytlar: SlaytTaslagi[] = [];
  let kokBaslik = VARSAYILAN_BASLIK;
  let mevcut: SlaytTaslagi | null = null;

  const yeniSlayt = (baslik: string): SlaytTaslagi => {
    const s: SlaytTaslagi = { baslik, icerik: [] };
    slaytlar.push(s);
    return s;
  };

  for (const b of bloklar) {
    if (slaytAcanBaslikMi(b)) {
      kokBaslik = b.metin;
      mevcut = yeniSlayt(kokBaslik);
      continue;
    }
    if (!mevcut) mevcut = yeniSlayt(kokBaslik);
    if (mevcut.icerik.length >= SLAYT_BLOK_SINIRI) mevcut = yeniSlayt(`${kokBaslik} (devam)`);
    mevcut.icerik.push(b);
  }

  // Boş girdide bile geçerli bir dosya için en az bir slayt gerekir.
  if (slaytlar.length === 0) yeniSlayt(kokBaslik);
  return slaytlar;
}

// 13.333 × 7.5 inç. Kütüphanenin örtük metin yüksekliğine veya otomatik
// tablo sayfalamasına güvenmeyiz: her nesnenin alanını kendimiz ayırırız.
const SLAYT_GENISLIK = 12.1;
const SLAYT_ALT_SINIRI = 6.95;
const X = 0.6;
const FONT = 'Arial';
const GOVDE_PUNTO = 18;
const TABLO_PUNTO = 14;
const BOSLUK = 0.14;
const SATIR_CARPANI = 1.25;
type Satir = { bas: number; son: number };

/** Font ikamesi/kalın metin için paylı genişlik tahmini; Node ve tarayıcı aynı
 * sonucu verir. Satır sonlarını dosyaya da yazarız, yalnız autofit'e dayanmayız.
 * PowerPoint autofit'i dosya açılırken hesaplamak zorunda değildir. */
function harfEni(harf: string): number {
  if (/\p{Mark}/u.test(harf)) return 0;
  if (/\s/u.test(harf)) return 0.34;
  if (/[ilıIİj.,:;'!|]/u.test(harf)) return 0.34;
  if (/[MWmw@%]/u.test(harf)) return 0.96;
  if (harf.codePointAt(0)! > 0x024f) return 1.05;
  return /[A-ZÇĞÖŞÜ]/u.test(harf) ? 0.78 : 0.64;
}

function metinSatirlari(metin: string, genislik: number, punto: number): Satir[] {
  const sonuc: Satir[] = [];
  const sinir = Math.max(1, genislik * 72 / punto);
  let bas = 0;
  while (bas < metin.length) {
    let son = bas, sonBosluk = -1, en = 0;
    while (son < metin.length && metin[son] !== '\n') {
      const harf = String.fromCodePoint(metin.codePointAt(son)!);
      const yeniEn = en + harfEni(harf);
      if (yeniEn > sinir && son > bas) break;
      en = yeniEn;
      son += harf.length;
      if (/\s/u.test(harf)) sonBosluk = son;
    }
    if (son < metin.length && metin[son] !== '\n' && sonBosluk > bas) son = sonBosluk;
    sonuc.push({ bas, son });
    bas = son + (metin[son] === '\n' ? 1 : 0);
  }
  return sonuc.length ? sonuc : [{ bas: 0, son: 0 }];
}

function satirYuksekligi(sayi: number, punto: number): number {
  return sayi * punto * SATIR_CARPANI / 72 + 0.06;
}

/** Satır/sayfa sınırında kalın ve italik koşuları korur. Soft break liste
 * maddesinin ortasında yeni madde/numara üretmez. */
function satirKosulari(parcalar: Parca[], satirlar: Satir[]): PptxGenJS.TextProps[] {
  const sonuc: PptxGenJS.TextProps[] = [];
  for (const [i, satir] of satirlar.entries()) {
    if (i > 0 && satir.bas > satirlar[i - 1].son && sonuc.length) sonuc[sonuc.length - 1].text += ' ';
    let ofset = 0, ilk = true;
    for (const p of parcalar) {
      const bas = Math.max(0, satir.bas - ofset), son = Math.min(p.metin.length, satir.son - ofset);
      if (son > bas) {
        sonuc.push({ text: p.metin.slice(bas, son), options: {
          ...(p.kalin && { bold: true }), ...(p.italik && { italic: true }),
          ...(i > 0 && ilk && { softBreakBefore: true }),
        } });
        ilk = false;
      }
      ofset += p.metin.length;
    }
    if (ilk) sonuc.push({ text: ' ', options: { softBreakBefore: i > 0 } });
  }
  return sonuc;
}

// Paragraf özelliklerinin kaynağı ilk koşudur. Yazımdan sonra kütüphanenin
// diğer koşulara eklediği varsayılan pPr'ler de temizlenir (aşağıya bakın).
function paragrafBicimi(kosular: PptxGenJS.TextProps[], punto: number, options: PptxGenJS.TextPropsOptions = {}) {
  kosular[0].options = { ...kosular[0].options, ...options, lineSpacing: punto * SATIR_CARPANI, paraSpaceAfter: 0 };
  return kosular;
}

function slaytCiz(pptx: PptxGenJS, taslak: SlaytTaslagi): number {
  let slayt: PptxGenJS.Slide;
  let y = 0, govdeY = 0;
  let devam = false;
  let slaytSayisi = 0;
  const yeniSlayt = () => {
    const baslik = devam && !taslak.baslik.endsWith(' (devam)') ? `${taslak.baslik} (devam)` : taslak.baslik;
    let punto = 32;
    let satirlar = metinSatirlari(baslik, SLAYT_GENISLIK, punto);
    while (satirYuksekligi(satirlar.length, punto) > 1.8 && punto > 20) {
      punto -= 2;
      satirlar = metinSatirlari(baslik, SLAYT_GENISLIK, punto);
    }
    const h = satirYuksekligi(satirlar.length, punto);
    if (h > 2.8) throw new Error('Sunum başlığı slayta sığmayacak kadar uzun. Başlığı kısaltarak yeniden deneyin.');
    slayt = pptx.addSlide();
    slaytSayisi++;
    slayt.addText(paragrafBicimi(satirKosulari([{ metin: baslik, kalin: true }], satirlar), punto), {
      x: X, y: 0.4, w: SLAYT_GENISLIK, h, fontFace: FONT, fontSize: punto,
      bold: true, color: YAZI_RENGI, margin: 0, valign: 'top',
    });
    govdeY = Math.max(1.35, 0.4 + h + 0.25);
    y = govdeY;
    devam = true;
  };
  yeniSlayt();

  const metinEkle = (parcalar: Parca[], punto: number, options: PptxGenJS.TextPropsOptions = {}) => {
    const girinti = Number(options.indentLevel ?? 0) * 0.25;
    const genislik = SLAYT_GENISLIK - girinti;
    const metin = parcalar.map((p) => p.metin).join('');
    const satirlar = metinSatirlari(metin, genislik - (options.bullet ? (typeof options.bullet === 'object' ? (options.bullet.indent ?? 18) : 18) / 72 + 0.1 : 0), punto);
    let ofset = 0;
    while (ofset < satirlar.length) {
      let kapasite = Math.floor((SLAYT_ALT_SINIRI - y - 0.06) * 72 / (punto * SATIR_CARPANI));
      if (kapasite < 1) { yeniSlayt(); continue; }
      // Kısa bloğu ortadan bölmek yerine sonraki slaytta bütün tut.
      if (ofset === 0 && satirlar.length > kapasite &&
          satirYuksekligi(satirlar.length, punto) <= SLAYT_ALT_SINIRI - govdeY && y > govdeY) {
        yeniSlayt(); continue;
      }
      kapasite = Math.min(kapasite, satirlar.length - ofset);
      const h = satirYuksekligi(kapasite, punto);
      const kosular = paragrafBicimi(satirKosulari(parcalar, satirlar.slice(ofset, ofset + kapasite)), punto,
        { ...options, ...(ofset > 0 && { bullet: false }) });
      slayt.addText(kosular, {
        x: X + girinti, y, w: genislik, h, fontFace: FONT, fontSize: punto,
        margin: 0, valign: 'top', color: YAZI_RENGI,
      });
      y += h + BOSLUK;
      ofset += kapasite;
      if (ofset < satirlar.length) yeniSlayt();
    }
  };

  const tabloEkle = (b: Extract<Blok, { tip: 'tablo' }>) => {
    const sutunSayisi = Math.max(1, b.basliklar.length, ...b.satirlar.map((s) => s.length));
    const sutunEni = SLAYT_GENISLIK / sutunSayisi;
    const hucreSatirlari = (satir: string[]) => Array.from({ length: sutunSayisi }, (_, i) => {
      const metin = satir[i] ?? '';
      return metinSatirlari(metin, sutunEni - 0.18, TABLO_PUNTO).map((s) => metin.slice(s.bas, s.son));
    });
    const basliklar = hucreSatirlari(b.basliklar);
    const hucreYuksekligi = (satir: string[][]) => satirYuksekligi(Math.max(...satir.map((s) => s.length)), TABLO_PUNTO) + 0.12;
    const baslikH = hucreYuksekligi(basliklar);
    const satirlar = b.satirlar.map(hucreSatirlari);
    let bekleyen = satirlar.length ? satirlar : [];
    // Tabloyu kendimiz parçalarız; kütüphane ilave başlıksız slayt açamaz.
    do {
      const asgari = baslikH + (bekleyen.length ? satirYuksekligi(1, TABLO_PUNTO) + 0.12 : 0);
      if (y + asgari > SLAYT_ALT_SINIRI) yeniSlayt();
      if (y + asgari > SLAYT_ALT_SINIRI) throw new Error('Tablo başlıkları slayta sığmıyor. Daha kısa sütun başlıkları kullanın.');
      const parca = [basliklar];
      const yukseklikler = [baslikH];
      let kalan = SLAYT_ALT_SINIRI - y - baslikH;
      while (bekleyen.length) {
        const satir = bekleyen[0], h = hucreYuksekligi(satir);
        if (h <= kalan) {
          parca.push(satir); yukseklikler.push(h); kalan -= h;
          bekleyen = bekleyen.slice(1);
          continue;
        }
        // Tek satır bile bir slayttan uzunsa hücreleri aynı satır aralığında
        // böl; hiçbir hücreyi kesip atma ve sonraki parçada başlıkları yinele.
        if (h > SLAYT_ALT_SINIRI - govdeY - baslikH) {
          const adet = Math.floor((kalan - 0.18) * 72 / (TABLO_PUNTO * SATIR_CARPANI));
          if (adet > 0) {
            const ilk = satir.map((s) => s.slice(0, adet));
            parca.push(ilk); yukseklikler.push(hucreYuksekligi(ilk));
            bekleyen = [satir.map((s) => s.slice(adet)), ...bekleyen.slice(1)];
          }
        }
        break;
      }
      // Başlık sığsa da ilk veri satırı sığmıyorsa boş bir tablo çizme.
      if (parca.length === 1 && bekleyen.length) { yeniSlayt(); continue; }
      const h = yukseklikler.reduce((a, b) => a + b, 0);
      slayt.addTable(parca.map((satir, i) => satir.map((hucre) => ({ text: hucre.join('\n'), options: {
        bold: i === 0, ...(i === 0 && { fill: { color: 'EEF2F6' } }),
      } }))), {
        x: X, y, w: SLAYT_GENISLIK, h, colW: sutunEni, rowH: yukseklikler,
        autoPage: false, fontFace: FONT, fontSize: TABLO_PUNTO, color: YAZI_RENGI,
        margin: [4, 6, 4, 6], valign: 'top',
        border: { type: 'solid', color: 'CBD5E1', pt: 0.5 },
      });
      y += h + BOSLUK;
      if (bekleyen.length) yeniSlayt();
    } while (bekleyen.length);
  };

  for (const b of taslak.icerik) {
    switch (b.tip) {
      case 'baslik': metinEkle([{ metin: b.metin, kalin: true }], 22); break;
      case 'paragraf': metinEkle(b.parcalar, GOVDE_PUNTO); break;
      case 'liste':
        b.ogeler.forEach((o, i) => metinEkle([{ metin: o.metin }], GOVDE_PUNTO, {
          indentLevel: Math.min(8, Math.max(0, o.seviye)),
          bullet: b.sirali ? { type: 'number', startAt: i + 1, indent: Math.max(24, String(i + 1).length * 11 + 8) } : { indent: 18 },
        }));
        break;
      case 'tablo': tabloEkle(b); break;
    }
  }
  return slaytSayisi;
}

export async function pptxOlustur(bloklar: Blok[]): Promise<{ baytlar: Uint8Array; ekSlaytSayisi: number }> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  const taslaklar = slaytlaraBol(bloklar);
  let slaytSayisi = 0;
  for (const taslak of taslaklar) slaytSayisi += slaytCiz(pptx, taslak);
  const baslikSayisi = bloklar.filter(slaytAcanBaslikMi).length + (bloklar[0] && !slaytAcanBaslikMi(bloklar[0]) ? 1 : 0);
  const arabelek = await pptx.write({ outputType: 'arraybuffer' });
  const zip = await JSZip.loadAsync(arabelek as ArrayBuffer);
  // PptxGenJS 4.0.1, zengin metnin her koşusuna a:pPr yazıyor. OOXML'de
  // paragraf başına bir pPr olabilir; sonraki buNone önceki numarayı da ezer.
  // Yalnız BU üreticinin kaçırılmış XML çıktısını işleriz, yüklenen dosyaları
  // regex ile düzenlemeyiz. Metin, koşu biçimleri ve yumuşak satır sonları kalır.
  for (const dosya of Object.keys(zip.files).filter((ad) => /^ppt\/slides\/slide\d+\.xml$/.test(ad))) {
    const xml = await zip.file(dosya)!.async('string');
    zip.file(dosya, xml.replace(/<a:p>([\s\S]*?)<\/a:p>/g, (_, govde: string) => {
      let ilk = true;
      return '<a:p>' + govde.replace(/<a:pPr\b[^>]*(?:\/>|>[\s\S]*?<\/a:pPr>)/g, (pr) => {
        if (!ilk) return '';
        ilk = false;
        return pr;
      }) + '</a:p>';
    }));
  }
  return { baytlar: await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), ekSlaytSayisi: slaytSayisi - Math.max(1, baslikSayisi) };
}

export async function pptxBaytlari(bloklar: Blok[]): Promise<Uint8Array> {
  return (await pptxOlustur(bloklar)).baytlar;
}
