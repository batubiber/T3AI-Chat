/**
 * Kullanım dökümünün xlsx olarak dışa aktarılması.
 *
 * `Blob` DEĞİL `Uint8Array` döndürüyor: `Blob` tarayıcı API'si ve bu dosyayı
 * `node` ortamında test edilemez yapardı. Blob'a sarma ve indirme tetikleme
 * çağıran bileşenin işi.
 */
import * as XLSX from 'xlsx';
import type { KirilimSatiri, HaftaDokumu } from './usageStats';

type Hucre = string | number;

function sayfa(basliklar: string[], satirlar: Hucre[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet([basliklar, ...satirlar]);
}

export function xlsxBaytlari(
  haftalar: HaftaDokumu[],
  modeller: KirilimSatiri[],
  uygulamalar: KirilimSatiri[],
): Uint8Array {
  const kitap = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    kitap,
    sayfa(['Hafta', 'İstek'], haftalar.map((h) => [h.haftaBasi, h.istek])),
    'Haftalık',
  );
  XLSX.utils.book_append_sheet(
    kitap,
    sayfa(['Model', 'İstek'], modeller.map((m) => [m.ad, m.istek])),
    'Model',
  );
  XLSX.utils.book_append_sheet(
    kitap,
    sayfa(['Uygulama', 'İstek'], uygulamalar.map((u) => [u.ad, u.istek])),
    'Uygulama',
  );

  // type:'array' → ArrayBuffer; Uint8Array'e sarılıyor ki hem test hem Blob
  // aynı şeyi alsın
  return new Uint8Array(XLSX.write(kitap, { type: 'array', bookType: 'xlsx' }));
}
