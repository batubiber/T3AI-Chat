import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { YENILIKLER } from '@/lib/yenilikler';

interface Props {
  acik: boolean;
  onAcikDegisti: (acik: boolean) => void;
}

/** "2026-08-25" → "25 Ağustos 2026" */
function tarihYaz(iso: string): string {
  const [yil, ay, gun] = iso.split('-').map(Number);
  const aylar = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  return `${gun} ${aylar[ay - 1]} ${yil}`;
}

/**
 * Sürüm sürüm "neler değişti" listesi.
 *
 * En yeni üstte. İçerik yenilikler.ts'te; burada yalnız gösterim var.
 */
export function YeniliklerDialog({ acik, onAcikDegisti }: Props) {
  return (
    <Dialog open={acik} onOpenChange={onAcikDegisti}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader className="shrink-0">
          {/* İKON YOK: parıltı simgesi "yapay zekâ" göstergesi olarak o kadar
              çok kullanıldı ki artık ucuz duruyor. Başlık zaten ne olduğunu
              söylüyor. */}
          <DialogTitle>Yenilikler</DialogTitle>
          <DialogDescription>
            T3AI’a eklenen özellikler ve iyileştirmeler.
          </DialogDescription>
        </DialogHeader>

        {/* Liste uzuyor; başlık sabit kalsın diye kaydırma burada. */}
        <div className="overflow-y-auto pr-1 -mr-1 space-y-6">
          {YENILIKLER.map((y) => (
            <section key={y.surum}>
              <div className="flex items-baseline gap-2 mb-1.5">
                <h3 className="text-sm font-semibold text-foreground">{y.baslik}</h3>
                {/* Sürüm numarası GÖSTERİLMİYOR: aradaki atlanan numaralar
                    (2.35, 2.32…) kullanıcıya "ne oldu bunlara" dedirtiyordu.
                    Veride duruyor — rozetin yanma kuralı ve sıralama ona bağlı. */}
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {tarihYaz(y.tarih)}
                </span>
              </div>
              <ul className="space-y-1">
                {y.maddeler.map((m) => (
                  <li key={m} className="text-xs text-muted-foreground leading-relaxed flex gap-2">
                    <span aria-hidden className="text-[hsl(var(--primary))] dark:text-[#C41718] shrink-0">•</span>
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
