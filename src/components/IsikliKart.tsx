import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

/**
 * İmleci takip eden yumuşak bir ışık lekesi taşıyan sarmalayıcı.
 *
 * Kartın GÖRÜNÜŞÜNÜ dayatmıyor — zemin, kenarlık, köşe ve iç boşluk çağırana
 * ait. Örnek aldığımız kaynak bunları (`#111` zemin, `2rem` boşluk, `1.5rem`
 * köşe) bileşene gömüyordu; bizim kullandığımız yerde kart 13 piksel yazıyla
 * çok daha küçük ve o ölçüler onu ezerdi.
 *
 * Işık rengi CSS'ten geliyor (`--isik-rengi`, index.css) ve TEMAYA göre
 * değişiyor: kaynak koyu tema için yazılmış beyaz bir ışık kullanıyor, bu
 * bizim açık temadaki beyaz kartta hiç görünmezdi.
 */
interface IsikliKartProps {
  children: ReactNode;
  className?: string;
  /** Işık rengini bu örnek için ezer. Verilmezse temanın rengi kullanılır. */
  isikRengi?: string;
}

export function IsikliKart({ children, className = '', isikRengi }: IsikliKartProps) {
  const kutu = useRef<HTMLDivElement>(null);
  const bekleyenKare = useRef<number | null>(null);
  const konum = useRef({ x: 0, y: 0 });

  /* İmleç konumu KARE BAŞINA bir kez yazılıyor. Kaynak her `mousemove`
     olayında üç özel değeri birden yazıyordu; ikisi hiç değişmiyor, üçüncüsü
     de saniyede yüzlerce kez stil yeniden hesabı tetikliyordu. */
  const imlecOynadi = useCallback((olay: React.MouseEvent<HTMLDivElement>) => {
    const el = kutu.current;
    if (!el) return;
    const alan = el.getBoundingClientRect();
    konum.current = { x: olay.clientX - alan.left, y: olay.clientY - alan.top };
    if (bekleyenKare.current !== null) return;
    bekleyenKare.current = requestAnimationFrame(() => {
      bekleyenKare.current = null;
      const hedef = kutu.current;
      if (!hedef) return;
      hedef.style.setProperty('--isik-x', `${konum.current.x}px`);
      hedef.style.setProperty('--isik-y', `${konum.current.y}px`);
    });
  }, []);

  // Bileşen imleç kartın üstündeyken kaldırılabilir (öneri onaylanınca tam
  // olarak bu oluyor); bekleyen kare iptal edilmezse ölü ref'e yazardı.
  useEffect(
    () => () => {
      if (bekleyenKare.current !== null) cancelAnimationFrame(bekleyenKare.current);
    },
    [],
  );

  return (
    <div
      ref={kutu}
      onMouseMove={imlecOynadi}
      style={isikRengi ? ({ '--isik-rengi': isikRengi } as CSSProperties) : undefined}
      className={`isikli-kart ${className}`}
    >
      {children}
    </div>
  );
}
