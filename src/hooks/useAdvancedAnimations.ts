import { useEffect, useRef, useCallback, useState } from "react";
import anime from "animejs";

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Text Scramble / Decode - Matrix-style text reveal
 */
export function useTextScramble(text: string, trigger: boolean = true) {
  const [displayText, setDisplayText] = useState(text);
  const animRef = useRef<{ obj: { progress: number } } | null>(null);
  const chars = "█▓░▒╗╔╚╝║═╬╩╠╣┃━┗┛┏┓";

  useEffect(() => {
    if (prefersReducedMotion() || !trigger) {
      setDisplayText(text);
      return;
    }

    const obj = { progress: 0 };
    animRef.current = { obj };

    try {
      anime({
        targets: obj,
        progress: [0, 1],
        duration: text.length * 40 + 300,
        easing: "easeInOutQuad",
        update: () => {
          const p = obj.progress;
          const result = text
            .split("")
            .map((char, i) => {
              if (char === " ") return " ";
              const threshold = i / text.length;
              if (p > threshold + 0.1) return char;
              if (p > threshold - 0.1) {
                return chars[Math.floor(Math.random() * chars.length)];
              }
              return chars[Math.floor(Math.random() * chars.length)];
            })
            .join("");
          setDisplayText(result);
        },
        complete: () => setDisplayText(text),
      });
    } catch {
      setDisplayText(text);
    }

    return () => {
      animRef.current = null;
    };
  }, [text, trigger]);

  return displayText;
}

/**
 * Delete animation - smooth fade+slide+collapse effect
 */
export function useShatterEffect() {
  const shatter = useCallback((element: HTMLElement, onComplete?: () => void) => {
    try {
      const currentHeight = element.offsetHeight;
      if (currentHeight === 0) {
        onComplete?.();
        return;
      }

      // Lock the element dimensions to prevent layout shift during animation
      element.style.overflow = "hidden";
      element.style.height = currentHeight + "px";
      element.style.pointerEvents = "none";

      anime({
        targets: element,
        translateX: [0, -60],
        opacity: [1, 0],
        scale: [1, 0.9],
        duration: prefersReducedMotion() ? 150 : 350,
        easing: "easeInCubic",
        complete: () => {
          anime({
            targets: element,
            height: [currentHeight, 0],
            marginTop: 0,
            marginBottom: 0,
            paddingTop: 0,
            paddingBottom: 0,
            duration: 250,
            easing: "easeInCubic",
            complete: () => onComplete?.(),
          });
        },
      });
    } catch {
      onComplete?.();
    }
  }, []);

  return shatter;
}

