/**
 * Kullanım kayıtlarının sayılması — saf fonksiyonlar.
 *
 * Bileşenden ayrı duruyor ki tarayıcı olmadan, vitest'in `node` ortamında test
 * edilebilsin.
 *
 * Ölçüm birimi İSTEK: her kayıt bir istektir, ayrı bir sayaç alanı yoktur.
 */
import type { KullanimKaydi } from './kullanimLog';

/** Uygulama ve model kırılımı aynı şekli paylaşıyor: bir ad ve bir sayı. */
export interface KirilimSatiri {
  ad: string;
  istek: number;
}

export interface HaftaDokumu {
  haftaBasi: string;
  istek: number;
}

export interface KullanimOzeti {
  istek: number;
  ilkKayit: Date | null;
  sonKayit: Date | null;
  uygulamaSayisi: number;
}

/** YYYY-AA-GG, YEREL saate göre. */
function yerelTarih(t: Date): string {
  const y = t.getFullYear();
  const a = String(t.getMonth() + 1).padStart(2, '0');
  const g = String(t.getDate()).padStart(2, '0');
  return `${y}-${a}-${g}`;
}

/**
 * Tarihin ait olduğu haftanın PAZARTESİsi.
 *
 * `localDb.ts`'teki getWeekStart KOPYALANMADI, iki nedenle:
 * 1) O yardımcı pazara gidiyor (`getDate() - getDay()`) ve kendi yorumu
 *    bunu DOĞRU söylüyor ("Get Sunday of the current week"); yanlış olan,
 *    `LocalUsageLog.weekStart` alanının docstring'i ("Monday of the week").
 *    Yani tutarsızlık alan tanımı ile gerçek davranış arasında — biz burada
 *    haftayı gerçekten pazartesiden başlatıyoruz.
 * 2) `toISOString()` kullandığı için UTC+3'te yerel gece yarısı bir önceki
 *    güne kayıyor; burada yerel tarih kullanıldığından kaymıyor.
 */
export function haftaBasi(d: Date): string {
  const t = new Date(d);
  const gun = t.getDay();                  // 0 = Pazar
  const fark = gun === 0 ? -6 : 1 - gun;   // pazarı biten haftaya bağla
  t.setDate(t.getDate() + fark);
  t.setHours(0, 0, 0, 0);
  return yerelTarih(t);
}

export function ozetle(kayitlar: KullanimKaydi[]): KullanimOzeti {
  if (kayitlar.length === 0) {
    return { istek: 0, ilkKayit: null, sonKayit: null, uygulamaSayisi: 0 };
  }

  let ilk = kayitlar[0].zaman;
  let son = kayitlar[0].zaman;
  const uygulamalar = new Set<string>();

  for (const k of kayitlar) {
    uygulamalar.add(k.uygulama);
    if (k.zaman < ilk) ilk = k.zaman;
    if (k.zaman > son) son = k.zaman;
  }

  return {
    istek: kayitlar.length,
    ilkKayit: ilk,
    sonKayit: son,
    uygulamaSayisi: uygulamalar.size,
  };
}

/** Ad başına istek sayısı, çoktan aza. Uygulama ve model aynı mantığı paylaşıyor. */
function sayarakGrupla(adlar: string[]): KirilimSatiri[] {
  const harita = new Map<string, number>();
  for (const ad of adlar) harita.set(ad, (harita.get(ad) ?? 0) + 1);
  return [...harita.entries()]
    .map(([ad, istek]) => ({ ad, istek }))
    .sort((a, b) => b.istek - a.istek);
}

/**
 * Uygulama kırılımı — YALNIZ logda görünenler.
 *
 * Sabit bir uygulama listesi üzerinden sıfırlarla doldurmuyoruz: bizim ters
 * vekilimiz Claude Code'un trafiğini göremiyor ve "Claude Code: 0" satırı
 * "kullanılmıyor" anlamına gelirdi (spec §5.3).
 */
export function uygulamaBazinda(kayitlar: KullanimKaydi[]): KirilimSatiri[] {
  return sayarakGrupla(kayitlar.map((k) => k.uygulama));
}

export function modelBazinda(kayitlar: KullanimKaydi[]): KirilimSatiri[] {
  return sayarakGrupla(kayitlar.map((k) => k.model));
}

export function haftaBazinda(kayitlar: KullanimKaydi[]): HaftaDokumu[] {
  const harita = new Map<string, number>();
  for (const k of kayitlar) {
    const hafta = haftaBasi(k.zaman);
    harita.set(hafta, (harita.get(hafta) ?? 0) + 1);
  }
  // Yeniden eskiye: panelde en güncel hafta üstte
  return [...harita.entries()]
    .map(([haftaBasi, istek]) => ({ haftaBasi, istek }))
    .sort((a, b) => b.haftaBasi.localeCompare(a.haftaBasi));
}
