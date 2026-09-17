/**
 * Modelden gelen başlığı güvenli bir dosya adına çevirir.
 *
 * Ad MODELDEN geliyor, yani güvenilmez girdi: dizin kaçışı ("../../"),
 * Windows'ta açılamayan adlar (CON, COM1) ve dosya sisteminde yasak
 * karakterler gelebiliyor. Hepsi burada temizleniyor.
 */

import type { UretimTuru } from './belgeUretimKapisi';

/** Windows'ta CİHAZ adı; "CON.docx" dosyası oluşturulamaz/açılamaz. */
const AYRILMIS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Ad + uzantı birlikte makul kalsın; kimi eski paylaşımlarda uzun ad sorun. */
const EN_UZUN = 60;

function temizle(baslik: string): string {
  return (
    baslik
      // Dizin ayırıcıları tireye: "2026/Q3" bilgi taşıyor, atmak yerine koru
      .replace(/[/\\]+/g, '-')
      // Dosya sisteminde yasak olanlar + kontrol karakterleri. Kaçış dizisiyle
      // yazılıyor: ham kontrol baytları kaynak dosyada araçları bozuyor.
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"|?*\x00-\x1F]/g, '')
      // ".." kalıntısı kalmasın (dizin kaçışı)
      .replace(/\.{2,}/g, '')
      .replace(/\s+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, EN_UZUN)
      // Kırpma tam tirenin üstüne denk gelirse sonda tire kalmasın
      .replace(/[-.]+$/, '')
  );
}

export function dosyaAdi(baslik: string, tur: UretimTuru, bugun: Date = new Date()): string {
  const temiz = temizle(baslik ?? '');
  if (!temiz) return `belge-${bugun.toISOString().slice(0, 10)}.${tur}`;
  // Ayrılmış adı atmıyoruz — kullanıcının istediği başlık o olabilir; önüne
  // ek koyunca hem açılır hem anlamı korunur.
  if (AYRILMIS.test(temiz)) return `belge-${temiz}.${tur}`;
  return `${temiz}.${tur}`;
}
