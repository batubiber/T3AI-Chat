/**
 * Düzenlenmiş DOCX'in panelde gösterilecek HTML önizlemesi.
 *
 * mammoth semantik HTML üretiyor (<p> <h1> <strong> <em> <ul> <table> …) ve
 * metni KAÇIRIYOR — belgede "<script>" yazsa `&lt;script&gt;` olarak çıkar,
 * yani çıktı doğrudan render edilebilir.
 *
 * NOT: bu bir ÖNİZLEME, WYSIWYG değil. Yazı tipi, satır aralığı, sayfa düzeni
 * gibi şeyler Word'deki gibi görünmez; yapı ve içerik görünür. İndirilen dosya
 * her zaman gerçek .docx'tir.
 */
import mammoth from 'mammoth';

/** mammoth'un metni kaçırdığı gibi kaçırır — arama dizesi HTML'de eşleşsin. */
export function escapeHtmlText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Değişen metinleri HTML içinde işaretler.
 *
 * Etiket sınırlarına DOKUNULMAZ: yalnız etiket DIŞINDAKİ metin parçalarında
 * arama yapılır, aksi halde `<p class="...">` gibi bir yere denk gelen eşleşme
 * HTML'i bozardı.
 */
export function markChanges(html: string, changed: string[]): string {
  const needles = changed
    .map((c) => escapeHtmlText(c.trim()))
    .filter((c) => c.length > 0)
    // Uzundan kısaya: kısa bir parça uzun olanın içinde kalırsa iç içe işaret olmasın
    .sort((a, b) => b.length - a.length);
  if (needles.length === 0) return html;

  // HTML'i "etiket" ve "metin" parçalarına böl; yalnız metin parçalarını işle
  return html
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (part.startsWith('<')) return part;
      let out = part;
      // İki aşama: önce YER TUTUCU koy, en sonda etikete çevir. Doğrudan <mark>
      // yazsak sonraki (daha kısa) arama, eklediğimiz işaretin İÇİNDE eşleşip
      // iç içe işaret üretiyordu. Yer tutucu NUL karakteri: belge metninde bulunamaz.
      needles.forEach((needle, i) => {
        if (!needle || !out.includes(needle)) return;
        out = out.split(needle).join(`\u0000${i}\u0000`);
      });
      needles.forEach((needle, i) => {
        out = out.split(`\u0000${i}\u0000`).join(`<mark class="t3ai-degisti">${needle}</mark>`);
      });
      return out;
    })
    .join('');
}

/**
 * Düzenlenmiş belgeyi HTML'e çevirir ve değişen metinleri işaretler.
 * `changed` boşsa işaretleme yapılmaz.
 */
/**
 * mammoth'un varsayılan eşlemesinin KAÇIRDIĞI Word biçemleri.
 *
 * Varsayılan eşleme başlıkları, listeleri, kalın/italiği ve tabloları doğru
 * çeviriyor (ölçüldü). Ama "Quote", "Title", "Caption" gibi biçemler düz <p>
 * olarak düşüyor ve belgedeki ayrım kayboluyor.
 *
 * SEÇİCİ BİÇİMİ ÖLÇÜLDÜ — dördü denendi, ikisi çalışıyor:
 *   p.Quote                     ✓ biçem KİMLİĞİ ile eşler
 *   p[style-name='Alıntı']      ✓ biçem ADI ile eşler
 *   p[style-id='Quote']         ✗ mammoth böyle bir seçici tanımıyor
 *   p[style-name='Quote']       ✗ ad yerelleştirilmişse tutmaz
 *
 * Bu yüzden ÖNCE kimlik: Word yerelleştirilmiş sürümde biçem ADINI çevirip
 * dosyaya öyle yazıyor ("Alıntı") ama KİMLİK ("Quote") değişmiyor. Ad tabanlı
 * satırlar yedek: başka araçlarla üretilmiş, kimliği farklı belgeler için.
 */
export const STYLE_MAP = [
  // dilden bağımsız (biçem kimliği)
  'p.Title => h1.t3ai-baslik:fresh',
  'p.Subtitle => p.t3ai-altbaslik:fresh',
  'p.Quote => blockquote > p:fresh',
  'p.IntenseQuote => blockquote.t3ai-guclu > p:fresh',
  'p.Caption => p.t3ai-resim-yazisi:fresh',
  // yedek: ada göre (kimliği standart olmayan belgeler)
  "p[style-name='Title'] => h1.t3ai-baslik:fresh",
  "p[style-name='Başlık'] => h1.t3ai-baslik:fresh",
  "p[style-name='Subtitle'] => p.t3ai-altbaslik:fresh",
  "p[style-name='Alt Başlık'] => p.t3ai-altbaslik:fresh",
  "p[style-name='Quote'] => blockquote > p:fresh",
  "p[style-name='Alıntı'] => blockquote > p:fresh",
  "p[style-name='Intense Quote'] => blockquote.t3ai-guclu > p:fresh",
  "p[style-name='Güçlü Alıntı'] => blockquote.t3ai-guclu > p:fresh",
  "p[style-name='Caption'] => p.t3ai-resim-yazisi:fresh",
  "p[style-name='Resim Yazısı'] => p.t3ai-resim-yazisi:fresh",
];

export async function renderDocxPreview(
  buf: ArrayBuffer,
  changed: string[] = [],
): Promise<string> {
  const result = await mammoth.convertToHtml({ arrayBuffer: buf }, { styleMap: STYLE_MAP });
  return markChanges(result.value, changed);
}
