/**
 * Depo (zip / klasör) alma: hangi dosyalar indekslenecek, hangileri neden
 * atlanacak.
 *
 * NEDEN FİLTRELEME ÇEKİRDEKTE: embedding istekleri 10'luk gruplar hâlinde ve
 * SIRALI atılıyor (embeddingService, eşzamanlılık yok). 2000 parçalık bir depo
 * 200 ardışık istek demek. Bir zip'in içine `node_modules` girerse on binlerce
 * dosya gelir ve işlem hiç bitmez. Filtre sonradan eklenecek bir iyileştirme
 * değil, bu özelliğin çalışabilmesinin ön koşulu.
 *
 * SESSİZ KESME YOK: sınıra takılan her dosya sebebiyle raporlanır. Bu projede
 * daha önce sessiz kesme sorun çıkardı.
 *
 * Zip okuma ayrı (repoZip.ts); burada yalnız saf karar mantığı var, testi de
 * öyle.
 */
import { dosyaDili, type CodeLanguage } from './codeLanguages';

export type AtlamaSebebi =
  | 'dislanan-dizin'
  | 'ikili'
  | 'cok-buyuk'
  | 'kod-degil'
  | 'bos'
  | 'dosya-siniri'
  | 'boyut-siniri';

export interface DepoDosyasi {
  path: string;
  content: string;
  language: CodeLanguage;
}

export interface AtlananDosya {
  path: string;
  sebep: AtlamaSebebi;
}

export interface DepoSonucu {
  dosyalar: DepoDosyasi[];
  atlanan: AtlananDosya[];
  toplamKarakter: number;
}

export interface DepoSecenekleri {
  /** En fazla kaç dosya indekslenecek */
  maxDosya?: number;
  /** Dosya başına bayt/karakter üst sınırı */
  maxDosyaBoyutu?: number;
  /** Tüm depo için karakter bütçesi — embedding maliyetinin asıl ölçüsü */
  maxToplamKarakter?: number;
}

/**
 * Muhafazakâr başlangıç değerleri.
 *
 * ÖLÇÜLMEDİ: istek başına gerçek embedding süresi (geliştirme makinesinde
 * servis yok). Gerçek bir depoyla ölçüldükten sonra ayarlanacak; o yüzden
 * dışarıdan geçilebilir.
 */
export const VARSAYILAN: Required<DepoSecenekleri> = {
  maxDosya: 300,
  maxDosyaBoyutu: 256 * 1024,
  maxToplamKarakter: 1_500_000,
};

/** Yol parçası olarak geçerse dosya hiç alınmaz. */
const DISLANAN_DIZINLER = [
  '.git', '.svn', '.hg',
  'node_modules', 'bower_components', 'vendor', 'third_party',
  '__pycache__', '.venv', 'venv', 'env', 'site-packages', '.tox',
  'dist', 'build', 'out', 'target', 'bin', 'obj', '.next', '.nuxt',
  'coverage', '.pytest_cache', '.mypy_cache', '.gradle', '.idea', '.vscode',
  'Pods', 'DerivedData', '.terraform',
];

/** Ada göre dışlananlar — kilit dosyaları ve üretilmiş çıktı. */
const DISLANAN_DESENLER = [
  /\.min\.(js|css)$/i,
  /\.map$/i,
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|composer\.lock|Gemfile\.lock)$/i,
  /\.(snap|generated|g)\.(ts|js|cs|go|py)$/i,
];

/** Yol dışlanıyor mu — dizin adı ya da desen. */
export function yolDislandiMi(path: string): boolean {
  const parcalar = path.split('/').filter(Boolean);
  // Son parça dosya adı; dizin kontrolü ondan öncekilerde
  if (parcalar.slice(0, -1).some((p) => DISLANAN_DIZINLER.includes(p))) return true;
  return DISLANAN_DESENLER.some((re) => re.test(path));
}

/**
 * İçerik ikili mi.
 *
 * Uzantıya güvenmek yetmiyor: zip'in içinden `.ts` uzantılı bir TypeScript
 * dosyası da, MPEG transport stream de çıkabilir. NUL baytı metin dosyalarında
 * bulunmaz, ikili dosyalarda neredeyse her zaman bulunur — ilk 8 KB yeterli.
 */
export function ikiliMi(icerik: string): boolean {
  const bak = icerik.slice(0, 8192);
  // '\u0000' KAÇIŞ dizisiyle: ham NUL baytı kaynakta görünmez, diff'te ve
  // kopyalamada sessizce kaybolur
  if (bak.includes('\u0000')) return true;
  // Replacement character yığılması = yanlış çözümlenmiş ikili
  const bozuk = (bak.match(/�/g) || []).length;
  return bak.length > 0 && bozuk / bak.length > 0.05;
}

/**
 * Sıralama önceliği — sınıra takılırsa NE alınacağını belirler.
 *
 * Rastgele kesmek yerine: önce sığ yollar (üst düzey `src/` derin bir yardımcı
 * dizinden daha çok şey anlatır), sonra alfabetik. Deterministik olması önemli:
 * aynı zip iki kez yüklenince aynı sonuç çıksın, embedding önbelleği tutsun.
 */
export function oncelikSirasi(a: string, b: string): number {
  const derinlik = (p: string) => p.split('/').length;
  return derinlik(a) - derinlik(b) || a.localeCompare(b);
}

/**
 * Girdileri süzer ve sınırları uygular.
 *
 * @param girdiler zip ya da klasörden gelen ham dosyalar
 */
export function suzDosyalar(
  girdiler: { path: string; content: string }[],
  secenekler: DepoSecenekleri = {},
): DepoSonucu {
  const { maxDosya, maxDosyaBoyutu, maxToplamKarakter } = { ...VARSAYILAN, ...secenekler };

  const atlanan: AtlananDosya[] = [];
  const adaylar: DepoDosyasi[] = [];

  for (const g of girdiler) {
    if (yolDislandiMi(g.path)) {
      atlanan.push({ path: g.path, sebep: 'dislanan-dizin' });
      continue;
    }
    const dil = dosyaDili(g.path);
    if (!dil) {
      atlanan.push({ path: g.path, sebep: 'kod-degil' });
      continue;
    }
    if (g.content.length === 0 || g.content.trim().length === 0) {
      atlanan.push({ path: g.path, sebep: 'bos' });
      continue;
    }
    if (g.content.length > maxDosyaBoyutu) {
      atlanan.push({ path: g.path, sebep: 'cok-buyuk' });
      continue;
    }
    if (ikiliMi(g.content)) {
      atlanan.push({ path: g.path, sebep: 'ikili' });
      continue;
    }
    adaylar.push({ path: g.path, content: g.content, language: dil });
  }

  adaylar.sort((a, b) => oncelikSirasi(a.path, b.path));

  const secilen: DepoDosyasi[] = [];
  let toplam = 0;
  for (const d of adaylar) {
    if (secilen.length >= maxDosya) {
      atlanan.push({ path: d.path, sebep: 'dosya-siniri' });
      continue;
    }
    if (toplam + d.content.length > maxToplamKarakter) {
      atlanan.push({ path: d.path, sebep: 'boyut-siniri' });
      continue;
    }
    secilen.push(d);
    toplam += d.content.length;
  }

  return { dosyalar: secilen, atlanan, toplamKarakter: toplam };
}

const SEBEP_METNI: Record<AtlamaSebebi, string> = {
  'dislanan-dizin': 'derleme/bağımlılık dizini',
  ikili: 'ikili dosya',
  'cok-buyuk': 'dosya çok büyük',
  'kod-degil': 'kod dosyası değil',
  bos: 'boş',
  'dosya-siniri': 'dosya sınırı doldu',
  'boyut-siniri': 'boyut sınırı doldu',
};

/**
 * Kullanıcıya gösterilecek atlama özeti.
 *
 * Sebep bazında gruplanıyor: 4000 satırlık bir liste kimseye bir şey anlatmaz,
 * "3812 dosya: derleme/bağımlılık dizini" anlatır.
 */
export function atlamaOzeti(atlanan: AtlananDosya[]): { sebep: string; sayi: number }[] {
  const sayac = new Map<AtlamaSebebi, number>();
  for (const a of atlanan) sayac.set(a.sebep, (sayac.get(a.sebep) ?? 0) + 1);
  return [...sayac.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([sebep, sayi]) => ({ sebep: SEBEP_METNI[sebep], sayi }));
}

/**
 * Modele verilecek dosya ağacı.
 *
 * "Depo" ile "çok dosya" arasındaki farkı bu kuruyor: yalnız benzerlikle parça
 * getirilirse, ilgili dosya getirilmediğinde model onun VARLIĞINI bile bilmiyor.
 * İçerik yok, yalnız yol ve satır sayısı — birkaç yüz satırlık maliyetle model
 * neyin var olduğunu görüyor.
 */
export function dosyaAgaci(dosyalar: DepoDosyasi[], maxSatir = 200): string {
  const satirlar = dosyalar
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((d) => `${d.path} (${d.content.split('\n').length} satır)`);

  if (satirlar.length <= maxSatir) return satirlar.join('\n');
  const kalan = satirlar.length - maxSatir;
  return [...satirlar.slice(0, maxSatir), `… ve ${kalan} dosya daha`].join('\n');
}
