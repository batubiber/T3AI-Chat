/**
 * Blok modelindeki tablolardan Excel dosyası kurar.
 *
 * SheetJS zaten kurulu ve yazabiliyor; kullanım panelinde (usageExport.ts)
 * aynı deseni kullandık.
 *
 * `Blob` DEĞİL `Uint8Array` döndürüyor: Blob tarayıcı API'si ve bu dosyayı
 * node ortamında test edilemez yapardı.
 */
import * as XLSX from 'xlsx';
import type { Blok } from './belgeIcerik';

/** Hücreye sayı yazılırsa Excel toplayabiliyor; metin yazılırsa yazamıyor. */
function hucreDegeri(ham: string): string | number {
  const kirp = ham.trim();
  if (kirp === '') return '';
  // Yalnız tam sayı/ondalık; "1.250,50" gibi biçimli metinlere dokunmuyoruz
  // çünkü ayraç yorumu ülkeye göre değişiyor ve yanlış sayı üretme riski var.
  // Nokta + TAM ÜÇ hane ("1.250") Türkçede büyük olasılıkla binlik ayraçtır:
  // 1.25 sayısına çevirmek sessiz ve geri dönüşsüz bir 1000 kat hata olur.
  // Belirsizlikte metin tarafına düşüyoruz — metin toplanamaz ama gözle doğru
  // görünür; yanlış sayı ise fark edilmeden rapora girer.
  if (/^-?\d+\.\d{3}$/.test(kirp)) return ham;
  if (/^-?\d+(\.\d+)?$/.test(kirp)) return Number(kirp);
  return ham;
}

export function tabloVarMi(bloklar: Blok[]): boolean {
  return bloklar.some((b) => b.tip === 'tablo');
}

export function xlsxBaytlari(bloklar: Blok[]): Uint8Array {
  const kitap = XLSX.utils.book_new();
  let sira = 0;

  for (const b of bloklar) {
    if (b.tip !== 'tablo') continue;
    sira++;
    const aoa = [b.basliklar, ...b.satirlar].map((satir) => satir.map(hucreDegeri));
    XLSX.utils.book_append_sheet(kitap, XLSX.utils.aoa_to_sheet(aoa), `Tablo ${sira}`);
  }

  return new Uint8Array(XLSX.write(kitap, { type: 'array', bookType: 'xlsx' }));
}
