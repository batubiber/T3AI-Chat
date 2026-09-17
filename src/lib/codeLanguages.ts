/**
 * Kod dosyası dil tanıma.
 *
 * Dil iki yerde kullanılıyor:
 *   1. Parçalama deseni — hangi satırın yeni bir bildirim başlattığı dile göre
 *      değişiyor (codeChunker).
 *   2. Modele giden kod çiti — ```rust yazılınca model dilin ne olduğunu
 *      biliyor ve cevabındaki kod bloğu da doğru renkleniyor.
 *
 * Uzantıdan gidiliyor, içerik sezgisi YOK: dosya adı elimizde ve güvenilir;
 * içerikten dil tahmin etmek yanlış tahminlerde parçalamayı sessizce bozardı.
 */

export type CodeLanguage =
  | 'python'
  | 'csharp'
  | 'c'
  | 'cpp'
  | 'rust'
  | 'javascript'
  | 'typescript'
  | 'html'
  | 'css'
  | 'java'
  | 'go'
  | 'php'
  | 'ruby'
  | 'kotlin'
  | 'swift'
  | 'bash'
  | 'sql'
  | 'dockerfile'
  | 'config';

/** Uzantı → dil. Anahtarlar küçük harf, noktasız. */
const UZANTI_DIL: Record<string, CodeLanguage> = {
  py: 'python', pyw: 'python', pyi: 'python',
  cs: 'csharp',
  c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp',
  rs: 'rust',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  html: 'html', htm: 'html',
  css: 'css', scss: 'css', sass: 'css', less: 'css',
  java: 'java',
  go: 'go',
  php: 'php',
  rb: 'ruby',
  kt: 'kotlin', kts: 'kotlin',
  swift: 'swift',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  sql: 'sql',
  toml: 'config', ini: 'config', conf: 'config', cfg: 'config', properties: 'config',
};

/** Uzantısı olmayan ama adı dili belli eden dosyalar. */
const ADA_GORE: Record<string, CodeLanguage> = {
  dockerfile: 'dockerfile',
  makefile: 'bash',
  '.env': 'config',
  '.gitignore': 'config',
  '.dockerignore': 'config',
};

/** Kod olarak indekslenecek tüm uzantılar — fileParser bu listeyi kullanır. */
export const KOD_UZANTILARI = Object.keys(UZANTI_DIL);

/**
 * Dosyanın dili; kod değilse null.
 *
 * Uzantısız dosya adları da bakılır (Dockerfile, Makefile) — bunlar depo
 * yüklemede sık ve uzantıya bakan bir kontrol onları kaçırırdı.
 */
export function dosyaDili(fileName: string): CodeLanguage | null {
  const ad = fileName.trim().toLowerCase();
  const sadeceAd = ad.split('/').pop() ?? ad;

  const adEslesme = ADA_GORE[sadeceAd];
  if (adEslesme) return adEslesme;
  // "Dockerfile.prod" gibi türevler
  if (sadeceAd.startsWith('dockerfile')) return 'dockerfile';

  const nokta = sadeceAd.lastIndexOf('.');
  if (nokta <= 0) return null; // uzantı yok ya da ".env" gibi (yukarıda ele alındı)
  const uzanti = sadeceAd.slice(nokta + 1);
  return UZANTI_DIL[uzanti] ?? null;
}

export function kodDosyasiMi(fileName: string): boolean {
  return dosyaDili(fileName) !== null;
}

/** Markdown kod çiti etiketi — modele giden bloğun dili. */
export function citEtiketi(dil: CodeLanguage): string {
  // Çoğu etiket dil adıyla aynı; ayrışanlar burada
  const ozel: Partial<Record<CodeLanguage, string>> = {
    csharp: 'csharp',
    cpp: 'cpp',
    config: 'ini',
  };
  return ozel[dil] ?? dil;
}

/** Kullanıcıya gösterilen dil adı — dosya kartındaki etiket. */
export const DIL_ADI: Record<CodeLanguage, string> = {
  python: 'Python',
  csharp: 'C#',
  c: 'C',
  cpp: 'C++',
  rust: 'Rust',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  html: 'HTML',
  css: 'CSS',
  java: 'Java',
  go: 'Go',
  php: 'PHP',
  ruby: 'Ruby',
  kotlin: 'Kotlin',
  swift: 'Swift',
  bash: 'Kabuk betiği',
  sql: 'SQL',
  dockerfile: 'Dockerfile',
  config: 'Yapılandırma',
};
