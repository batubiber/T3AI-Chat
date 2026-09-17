/**
 * Zip'ten depo okuma — repoIngest'in saf karar mantığına girdi hazırlar.
 *
 * Ayrı dosya: burada I/O var (JSZip, async), orada yok. Süzme mantığı testte
 * dosya sistemine dokunmadan koşabilsin diye ayrıldı.
 *
 * JSZip zaten bağımlılık (DOCX/PPTX/XLSX için) — yeni paket eklenmedi.
 */
import JSZip from 'jszip';
import { suzDosyalar, yolDislandiMi, type DepoSecenekleri, type DepoSonucu } from './repoIngest';
import { dosyaDili } from './codeLanguages';

/** Zip girdilerinin ortak kök klasörü — "proje-main/" gibi. */
export function ortakKok(yollar: string[]): string {
  if (yollar.length === 0) return '';
  const ilkParcalar = yollar[0].split('/');
  if (ilkParcalar.length < 2) return '';
  const aday = ilkParcalar[0] + '/';
  return yollar.every((y) => y.startsWith(aday)) ? aday : '';
}

export interface ZipOkumaIlerlemesi {
  okunan: number;
  toplam: number;
}

/**
 * Zip'i açar, metin girdilerini çıkarır ve süzer.
 *
 * ÖNEMLİ — okuma sırası: önce YOL süzmesi, sonra içerik okuma. node_modules
 * içindeki on binlerce dosyanın içeriğini okuyup sonra atmak, tarayıcıyı
 * gereksiz yere dakikalarca meşgul ederdi.
 */
export async function zipDepoOku(
  buf: ArrayBuffer,
  secenekler: DepoSecenekleri = {},
  onProgress?: (p: ZipOkumaIlerlemesi) => void,
): Promise<DepoSonucu> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    throw new Error('Zip dosyası okunamadı veya bozuk.');
  }

  const girisler = Object.values(zip.files).filter((f) => !f.dir);
  const kok = ortakKok(girisler.map((f) => f.name));

  // Yolu bilinen ama içeriği HENÜZ okunmamış girdiler
  const yolListesi = girisler.map((f) => ({
    dosya: f,
    path: kok ? f.name.slice(kok.length) : f.name,
  }));

  // Yol süzmesini içerik okumadan uygula: elenecek dosyayı okumanın anlamı yok
  const okunacak = yolListesi.filter(
    (y) => y.path && !yolDislandiMi(y.path) && dosyaDili(y.path) !== null,
  );
  // Set: okunacak listesi binlerce girdi olabiliyor, includes() O(n²) yapardı
  const okunacakKume = new Set(okunacak);
  const yolNedeniyleElenen = yolListesi.filter((y) => !okunacakKume.has(y));

  const girdiler: { path: string; content: string }[] = [];
  for (let i = 0; i < okunacak.length; i++) {
    const y = okunacak[i];
    try {
      girdiler.push({ path: y.path, content: await y.dosya.async('string') });
    } catch {
      /* bozuk girdi atlanır, zip'in tamamı düşmesin */
    }
    onProgress?.({ okunan: i + 1, toplam: okunacak.length });
  }

  const sonuc = suzDosyalar(girdiler, secenekler);

  // Yol yüzünden hiç okunmayanlar da rapora girsin — kullanıcı neyin neden
  // alınmadığını görmeli
  const ekAtlanan = yolNedeniyleElenen
    .filter((y) => y.path)
    .map((y) => ({
      path: y.path,
      sebep: yolDislandiMi(y.path) ? ('dislanan-dizin' as const) : ('kod-degil' as const),
    }));

  return { ...sonuc, atlanan: [...ekAtlanan, ...sonuc.atlanan] };
}
