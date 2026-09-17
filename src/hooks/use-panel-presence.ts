import { useLayoutEffect, useState } from 'react';
import { useMediaQuery } from './use-media-query';

/** Kapanış bitene kadar DOM'u korur. Hızlı yeniden açmada eski zamanlayıcı
 * iptal edilir; CSS geçişi o anki görünümden devam eder. */
export function usePanelPresence(open: boolean) {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [present, setPresent] = useState(open);
  const [shown, setShown] = useState(open);
  useLayoutEffect(() => {
    if (reduced) { setPresent(open); setShown(open); return; }
    let frame = 0, nextFrame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (open) {
      setPresent(true);
      frame = requestAnimationFrame(() => { nextFrame = requestAnimationFrame(() => setShown(true)); });
    } else {
      setShown(false);
      timer = setTimeout(() => setPresent(false), 260);
    }
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(nextFrame); clearTimeout(timer); };
  }, [open, reduced]);
  return { present, props: {
    hidden: !present,
    'data-visible': shown && open ? 'true' : 'false',
    'aria-hidden': !open,
    inert: open ? undefined : '',
  } };
}
