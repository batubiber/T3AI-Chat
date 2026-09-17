/**
 * Uzun süren işler için piksel-ızgara yükleme göstergesi.
 *
 * Kaynak fikir beautifului.dev'den; buraya uyarlanırken üç şey değişti:
 *   - Next.js'e özgü "use client" yok (bu proje Vite).
 *   - Kendi tasarım token'ları (--ink, --ink-3) burada YOK; projenin shadcn
 *     token'larına bağlandı (foreground / muted-foreground). Böylece açık ve
 *     koyu temada kendiliğinden doğru görünüyor.
 *   - Keyframe'ler index.css'te. tailwind.config'e konsa satır-içi `animation`
 *     ile kullanıldığı için purge edilirdi (Tailwind yalnız utility ile
 *     kullanılan keyframe'leri çıktıya koyar).
 *
 * Neden bu tasarım: dönen çember "ne kadar sürecek" hakkında hiçbir şey
 * söylemiyor. Buradaki dalga cephesi işin sürdüğünü, geçen süre de ne kadar
 * beklendiğini gösteriyor — GLM uzun belgede dakikalarca akıl yürütüyor ve
 * kullanıcının bunu kesinti sanmaması gerekiyor.
 *
 * Azaltılmış hareket: index.css'teki genel kural animasyonları durduruyor,
 * ızgara sönük hâlinde kalıyor. Sayaç yine işliyor — o bilgi hareket değil.
 */
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/** 3x3 ızgarada sağa doğru ilerleyen chevron dalgası (sütun + satır mesafesi) */
const chevron = Array.from({ length: 9 }, (_, i) => {
  const r = Math.floor(i / 3);
  const c = i % 3;
  return (c + Math.abs(r - 1)) * 90;
});

/** Çevre turu: saat yönünde köşeler, orta hücre boş kalır */
const ORBIT_ORDER = [0, 1, 2, 5, 8, 7, 6, 3];
const orbit = Array.from({ length: 9 }, (_, i) => {
  const k = ORBIT_ORDER.indexOf(i);
  return k === -1 ? null : k * 110;
});

export type LoadingVariant = 'drive' | 'dots' | 'orbit';

const PATTERNS: Record<
  LoadingVariant,
  { delays: (number | null)[]; dur: number; round: boolean }
> = {
  // 650ms döngü, dalganın ızgarayı geçme süresinden KISA: her an iki cephe uçuyor
  drive: { delays: chevron, dur: 650, round: false },
  dots: { delays: chevron, dur: 650, round: true },
  orbit: { delays: orbit, dur: 950, round: false },
};

/** Saniyenin onda biri hassasiyetinde geçen süre. */
function useElapsed(startAt?: number) {
  const [ds, setDs] = useState(0);
  useEffect(() => {
    // Dışarıdan başlangıç verilmişse ondan say — bileşen sonradan monte
    // edilse bile süre baştan başlamasın
    const base = startAt ?? Date.now();
    const t = setInterval(() => setDs(Math.round((Date.now() - base) / 100)), 100);
    return () => clearInterval(t);
  }, [startAt]);

  const total = ds / 10;
  if (total < 60) return `${total.toFixed(1)}s`;
  return `${Math.floor(total / 60)}dk ${(total % 60).toFixed(1)}s`;
}

export function PixelGrid({
  variant = 'drive',
  className,
}: {
  variant?: LoadingVariant;
  className?: string;
}) {
  const { delays, dur, round } = PATTERNS[variant] ?? PATTERNS.drive;
  return (
    <span
      aria-hidden
      className={cn('grid shrink-0 grid-cols-[repeat(3,4px)] gap-[1.5px]', className)}
    >
      {delays.map((d, i) => (
        <span
          key={i}
          className={cn('size-[4px] bg-foreground', round ? 'rounded-full' : 'rounded-[1px]')}
          style={{
            // Boş hücre ve dinlenme durumu aynı sönüklükte: animasyon durduğunda
            // (azaltılmış hareket) ızgara kasıtlı görünüyor, bozuk değil
            opacity: d === null ? 0.07 : 0.15,
            animation: d === null ? 'none' : `pixel-on ${dur}ms ease-in-out ${d}ms infinite`,
          }}
        />
      ))}
    </span>
  );
}

/** Parlayan metin — yükleme etiketleri için. */
export function ShimmerText({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn('bg-clip-text text-transparent', className)}
      style={{
        backgroundImage:
          'linear-gradient(90deg, hsl(var(--muted-foreground)) 35%, hsl(var(--foreground)) 50%, hsl(var(--muted-foreground)) 65%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer-text 1.4s linear infinite',
      }}
    >
      {children}
    </span>
  );
}

export function LoadingState({
  label = 'Çalışıyor',
  variant = 'drive',
  startAt,
  className,
}: {
  label?: string;
  variant?: LoadingVariant;
  /** Date.now() — işin GERÇEK başlangıcı; verilmezse montaj anı */
  startAt?: number;
  className?: string;
}) {
  const elapsed = useElapsed(startAt);
  return (
    <div
      className={cn('flex w-fit items-center gap-2.5', className)}
      role="status"
      aria-live="polite"
      aria-label={`${label} — ${elapsed}`}
    >
      <PixelGrid variant={variant} />
      <ShimmerText className="text-[13px] font-medium">{label}</ShimmerText>
      <span className="font-mono text-[12px] tabular-nums text-muted-foreground">{elapsed}</span>
    </div>
  );
}
