import { useEffect, useRef } from "react";
import anime from "animejs";

const blob1a = "M45,-51.1C57.2,-40.3,65.2,-24.3,68.4,-6.8C71.6,10.7,69.9,29.7,60.2,43.5C50.5,57.3,32.7,65.9,14.1,68.4C-4.5,70.9,-23.9,67.3,-39.8,57.5C-55.7,47.7,-68.1,31.7,-72.1,13.6C-76.1,-4.5,-71.7,-24.7,-60.5,-36.3C-49.3,-47.9,-31.3,-50.9,-14.7,-55.1C1.9,-59.3,32.8,-61.9,45,-51.1Z";
const blob1b = "M39.9,-44.2C52.6,-34.6,64.3,-21.5,67.2,-6.2C70.1,9.1,64.2,26.6,53.4,39.9C42.6,53.2,26.9,62.3,9.3,66C-8.3,69.7,-27.8,68,-42.6,58.7C-57.4,49.4,-67.5,32.5,-71.8,13.8C-76.1,-4.9,-74.6,-25.4,-64.1,-38.3C-53.6,-51.2,-34.1,-56.5,-17.1,-58.5C-0.1,-60.5,27.2,-53.8,39.9,-44.2Z";

const blob2a = "M43.3,-50.5C55.9,-39.4,65.5,-25.2,69.2,-8.7C72.9,7.8,70.7,26.6,61.2,40.5C51.7,54.4,34.9,63.4,17,67.1C-0.9,70.8,-19.9,69.2,-35.5,60.4C-51.1,51.6,-63.3,35.6,-68.2,17.5C-73.1,-0.6,-70.7,-20.8,-60.7,-33.8C-50.7,-46.8,-33.1,-52.6,-17.1,-55.4C-1.1,-58.2,30.7,-61.6,43.3,-50.5Z";
const blob2b = "M35.5,-40.1C47,-29.4,57.7,-17.5,62.3,-2.5C66.9,12.5,65.4,30.6,55.7,43C46,55.4,28.1,62.1,10.5,63.8C-7.1,65.5,-24.4,62.2,-38.3,52.7C-52.2,43.2,-62.7,27.5,-66.4,10C-70.1,-7.5,-67,-26.8,-56.3,-37.7C-45.6,-48.6,-27.3,-51.1,-10.7,-53.1C5.9,-55.1,24,-50.8,35.5,-40.1Z";

const blob3a = "M41.3,-46.5C53.5,-36.6,63.3,-23.3,67.3,-7.7C71.3,7.9,69.5,25.8,60.1,38.7C50.7,51.6,33.7,59.5,16.1,63C-1.5,66.5,-19.7,65.6,-35.2,57.8C-50.7,50,-63.5,35.3,-68.5,18.2C-73.5,1.1,-70.7,-18.4,-60.5,-31.4C-50.3,-44.4,-32.7,-50.9,-17,-55.1C-1.3,-59.3,29.1,-56.4,41.3,-46.5Z";
const blob3b = "M38.8,-43.1C50.4,-33.4,59.8,-20.4,63.4,-5.3C67,9.8,64.8,27,55.3,39.2C45.8,51.4,29,58.6,11.8,62C-5.4,65.4,-23,65,-37.2,56.7C-51.4,48.4,-62.2,32.2,-67.4,13.7C-72.6,-4.8,-72.2,-25.6,-62.1,-38.1C-52,-50.6,-32.2,-54.8,-15.4,-56.7C1.4,-58.6,27.2,-52.8,38.8,-43.1Z";

export function MorphBlobs() {
  const svg1 = useRef<SVGPathElement>(null);
  const svg2 = useRef<SVGPathElement>(null);
  const svg3 = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const anims: anime.AnimeInstance[] = [];
    try {
      if (svg1.current) {
        anims.push(
          anime({
            targets: svg1.current,
            d: [{ value: blob1a }, { value: blob1b }],
            duration: 6000,
            easing: "easeInOutQuad",
            direction: "alternate",
            loop: true,
          })
        );
      }
      if (svg2.current) {
        anims.push(
          anime({
            targets: svg2.current,
            d: [{ value: blob2a }, { value: blob2b }],
            duration: 8000,
            easing: "easeInOutSine",
            direction: "alternate",
            loop: true,
          })
        );
      }
      if (svg3.current) {
        anims.push(
          anime({
            targets: svg3.current,
            d: [{ value: blob3a }, { value: blob3b }],
            duration: 7000,
            easing: "easeInOutQuad",
            direction: "alternate",
            loop: true,
          })
        );
      }
    } catch {}

    return () => anims.forEach((a) => a.pause());
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <svg
        className="absolute -top-40 -left-40 w-[600px] h-[600px] opacity-[0.07] blur-3xl will-change-transform"
        viewBox="-100 -100 200 200"
      >
        <path ref={svg1} d={blob1a} fill="hsl(var(--primary))" />
      </svg>
      <svg
        className="absolute -bottom-32 -right-32 w-[500px] h-[500px] opacity-[0.05] blur-3xl will-change-transform"
        viewBox="-100 -100 200 200"
      >
        <path ref={svg2} d={blob2a} fill="hsl(var(--accent))" />
      </svg>
      <svg
        className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[450px] h-[450px] opacity-[0.04] blur-3xl will-change-transform"
        viewBox="-100 -100 200 200"
      >
        <path ref={svg3} d={blob3a} fill="hsl(var(--secondary))" />
      </svg>
    </div>
  );
}
