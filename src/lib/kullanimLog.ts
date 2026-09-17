/**
 * Merkezî kullanım logu — nginx'in yazdığı satırları okur.
 *
 * Neden nginx: kurum geneli sayı, sunucu tarafında bir yere yazmadan elde
 * edilemez; her tarayıcı yalnız kendi kaydını bilir. nginx özel başlıklı bir
 * POST'u tek satır olarak yazabiliyor ve aynı dosyayı geri sunabiliyor — yeni
 * servis, yeni imaj ve backend değişikliği gerekmiyor.
 *
 * Satır: zaman|uygulama|model
 * HER SATIR BİR İSTEK. Ayrı sayaç alanı yok; sayım satır sayımıdır.
 * Mesaj içeriği, kullanıcı kimliği ve oturum anahtarı YOK.
 */

/** Tarayıcının kullanım satırı yazdırdığı uç (nginx `return 204`). */
export const KAYIT_YOLU = '/kullanim-kayit';

/**
 * Panelin ham logu çektiği uç — BACKEND, jeton ister.
 *
 * Eskiden nginx `alias` ile parolasız servis ediliyordu: iç ağdaki herkes
 * curl ile okuyabiliyordu. O uç kaldırıldı.
 */
export const LOG_YOLU = `${import.meta.env.VITE_API_URL || '/api'}/admin/kullanim-log`;

export interface KullanimKaydi {
  zaman: Date;
  /** İsteği hangi uygulama attı — "t3ai", ileride "claude-code" vb. */
  uygulama: string;
  model: string;
}

export interface LogSonucu {
  kayitlar: KullanimKaydi[];
  /** Çözülemeyen satır sayısı — panel bunu söyler, sessizce yutmaz */
  bozukSatir: number;
}

/**
 * nginx bir değişkeni dolduramazsa oraya "-" yazar. Bunu geçerli bir ad saymak
 * panelde "-" diye sahte bir uygulama/model satırı üretirdi.
 */
function adGecerliMi(s: string): boolean {
  return s.length > 0 && s !== '-';
}

export function logAyristir(ham: string): LogSonucu {
  const kayitlar: KullanimKaydi[] = [];
  let bozukSatir = 0;

  for (const hamSatir of ham.split('\n')) {
    const satir = hamSatir.trim();
    if (!satir) continue; // sondaki boş satır bozuk değildir

    const parca = satir.split('|');
    if (parca.length !== 3) {
      bozukSatir++;
      continue;
    }

    const [zamanMetni, uygulama, model] = parca;
    if (!adGecerliMi(uygulama) || !adGecerliMi(model)) {
      bozukSatir++;
      continue;
    }

    const zaman = new Date(zamanMetni);
    if (Number.isNaN(zaman.getTime())) {
      bozukSatir++;
      continue;
    }

    kayitlar.push({ zaman, uygulama, model });
  }

  return { kayitlar, bozukSatir };
}
