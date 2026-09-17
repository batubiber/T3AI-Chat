import { useEffect, useRef, useCallback } from "react";
import anime from "animejs";

// Check if user prefers reduced motion
const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Stagger reveal animation for list items
 */
export function useStaggerReveal(
  selector: string,
  deps: any[] = [],
  options?: { delay?: number; duration?: number; staggerDelay?: number }
) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion() || !containerRef.current) return;

    const targets = containerRef.current.querySelectorAll(selector);
    if (targets.length === 0) return;

    try {
      anime({
        targets,
        translateY: [16, 0],
        opacity: [0, 1],
        duration: options?.duration ?? 400,
        delay: anime.stagger(options?.staggerDelay ?? 50, { start: options?.delay ?? 0 }),
        easing: "easeOutCubic",
      });
    } catch (e) {
      console.warn("Stagger animation error:", e);
      targets.forEach((el) => ((el as HTMLElement).style.opacity = "1"));
    }
  }, deps);

  return containerRef;
}

/**
 * Elastic entry animation (bounce effect)
 */
export function useElasticEntry(deps: any[] = [], options?: { delay?: number; duration?: number }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (prefersReducedMotion() || !ref.current) return;

    try {
      anime({
        targets: ref.current,
        scale: [0.6, 1],
        opacity: [0, 1],
        duration: options?.duration ?? 700,
        delay: options?.delay ?? 0,
        easing: "easeOutElastic(1, .6)",
      });
    } catch (e) {
      console.warn("Elastic animation error:", e);
      if (ref.current) ref.current.style.opacity = "1";
    }
  }, deps);

  return ref;
}

/**
 * Slide-in animation from a direction
 */
export function useSlideIn(
  direction: "left" | "right" | "up" | "down" = "left",
  deps: any[] = [],
  options?: { delay?: number; duration?: number }
) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion() || !ref.current) return;

    const distance = 30;
    const propMap = {
      left: { translateX: [-distance, 0] },
      right: { translateX: [distance, 0] },
      up: { translateY: [-distance, 0] },
      down: { translateY: [distance, 0] },
    };

    try {
      anime({
        targets: ref.current,
        ...propMap[direction],
        opacity: [0, 1],
        duration: options?.duration ?? 450,
        delay: options?.delay ?? 0,
        easing: "easeOutCubic",
      });
    } catch (e) {
      console.warn("SlideIn animation error:", e);
      if (ref.current) ref.current.style.opacity = "1";
    }
  }, deps);

  return ref;
}

/**
 * Welcome screen timeline animation
 */
export function useWelcomeTimeline(shouldAnimate: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const logo = container.querySelector(".welcome-logo");
    const letters = container.querySelectorAll(".welcome-letter");
    const subtitle = container.querySelector(".welcome-subtitle");
    const cards = container.querySelectorAll(".welcome-card");

    const showAll = () => {
      if (logo) (logo as HTMLElement).style.opacity = "1";
      letters.forEach((el) => ((el as HTMLElement).style.opacity = "1"));
      if (subtitle) (subtitle as HTMLElement).style.opacity = "1";
      cards.forEach((el) => ((el as HTMLElement).style.opacity = "1"));
    };

    // If animation is disabled (or reduced motion is enabled), keep content visible.
    if (!shouldAnimate || prefersReducedMotion()) {
      showAll();
      return;
    }

    if (logo) (logo as HTMLElement).style.opacity = "0";
    letters.forEach((el) => ((el as HTMLElement).style.opacity = "0"));
    if (subtitle) (subtitle as HTMLElement).style.opacity = "0";
    cards.forEach((el) => ((el as HTMLElement).style.opacity = "0"));

    try {
      const tl = anime.timeline({ easing: "easeOutExpo" });

      tl.add({
        targets: logo,
        scale: [0, 1],
        opacity: [0, 1],
        rotate: [45, 0],
        duration: 700,
        easing: "easeOutElastic(1, .6)",
      });

      tl.add(
        {
          targets: letters,
          translateY: [30, 0],
          opacity: [0, 1],
          duration: 400,
          delay: anime.stagger(50),
          easing: "easeOutBack",
        },
        "-=400"
      );

      tl.add(
        {
          targets: subtitle,
          translateY: [15, 0],
          opacity: [0, 1],
          duration: 350,
        },
        "-=200"
      );

      tl.add(
        {
          targets: cards,
          scale: [0.85, 1],
          translateY: [20, 0],
          opacity: [0, 1],
          duration: 450,
          delay: anime.stagger(80),
          easing: "easeOutCubic",
        },
        "-=200"
      );

      return () => {
        tl.pause();
      };
    } catch (e) {
      console.warn("Welcome timeline error:", e);
      showAll();
    }
  }, [shouldAnimate]);

  return containerRef;
}

/**
 * Message entry animation (slide from left/right)
 */
export function useMessageEntry(role: "user" | "assistant") {
  const ref = useRef<HTMLDivElement>(null);
  const animated = useRef(false);

  useEffect(() => {
    if (animated.current || prefersReducedMotion() || !ref.current) return;
    animated.current = true;

    const isUser = role === "user";

    try {
      anime({
        targets: ref.current,
        translateX: [isUser ? 25 : -25, 0],
        opacity: [0, 1],
        scale: [0.97, 1],
        duration: 400,
        easing: "easeOutCubic",
      });
    } catch (e) {
      console.warn("Message animation error:", e);
      if (ref.current) ref.current.style.opacity = "1";
    }
  }, [role]);

  return ref;
}

/**
 * Dropdown stagger animation - call imperatively
 */
export function useDropdownStagger() {
  const animate = useCallback((containerEl: HTMLElement | null, selector: string) => {
    if (prefersReducedMotion() || !containerEl) return;

    const items = containerEl.querySelectorAll(selector);
    if (items.length === 0) return;

    try {
      anime({
        targets: items,
        scale: [0.9, 1],
        opacity: [0, 1],
        translateY: [8, 0],
        duration: 300,
        delay: anime.stagger(40),
        easing: "easeOutCubic",
      });
    } catch (e) {
      console.warn("Dropdown stagger error:", e);
      items.forEach((el) => ((el as HTMLElement).style.opacity = "1"));
    }
  }, []);

  return animate;
}

/**
 * Copy success animation - elastic bounce for checkmark icon
 */
export function useCopySuccess() {
  const animate = useCallback((element: HTMLElement | null) => {
    if (prefersReducedMotion() || !element) return;

    try {
      anime({
        targets: element,
        scale: [0, 1.3, 1],
        rotate: [-45, 0],
        duration: 500,
        easing: "easeOutElastic(1, .5)",
      });
    } catch (e) {
      console.warn("Copy success animation error:", e);
    }
  }, []);

  return animate;
}

/**
 * Count up animation - smooth number transition
 */
export function useCountUp(targetValue: number, duration: number = 600) {
  const ref = useRef<HTMLSpanElement>(null);
  const currentValue = useRef({ val: 0 });

  useEffect(() => {
    if (prefersReducedMotion() || !ref.current) {
      if (ref.current) ref.current.textContent = String(targetValue);
      return;
    }

    const startVal = currentValue.current.val;
    if (startVal === targetValue) return;

    try {
      anime({
        targets: currentValue.current,
        val: [startVal, targetValue],
        round: 1,
        duration,
        easing: "easeOutExpo",
        update: () => {
          if (ref.current) {
            ref.current.textContent = String(currentValue.current.val);
          }
        },
      });
    } catch (e) {
      console.warn("CountUp animation error:", e);
      if (ref.current) ref.current.textContent = String(targetValue);
    }
  }, [targetValue, duration]);

  return ref;
}

/**
 * Ripple effect - creates expanding circle on click
 */
export function useRipple() {
  const animate = useCallback((button: HTMLElement, event: React.MouseEvent) => {
    if (prefersReducedMotion()) return;

    try {
      const rect = button.getBoundingClientRect();
      const ripple = document.createElement("span");
      const size = Math.max(rect.width, rect.height) * 2;
      
      ripple.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background: currentColor;
        opacity: 0.3;
        pointer-events: none;
        left: ${event.clientX - rect.left - size / 2}px;
        top: ${event.clientY - rect.top - size / 2}px;
        transform: scale(0);
      `;
      
      button.style.position = "relative";
      button.style.overflow = "hidden";
      button.appendChild(ripple);

      anime({
        targets: ripple,
        scale: [0, 1],
        opacity: [0.3, 0],
        duration: 400,
        easing: "easeOutCubic",
        complete: () => {
          ripple.remove();
        },
      });
    } catch (e) {
      console.warn("Ripple animation error:", e);
    }
  }, []);

  return animate;
}

/**
 * 3D tilt effect for cards on mouse move
 */
export function use3DTilt() {
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (prefersReducedMotion()) return;

    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    const rotateX = ((y - centerY) / centerY) * -6;
    const rotateY = ((x - centerX) / centerX) * 6;

    try {
      anime({
        targets: card,
        rotateX,
        rotateY,
        duration: 200,
        easing: "easeOutQuad",
      });
    } catch (e2) {
      console.warn("3D tilt animation error:", e2);
    }
  }, []);

  const handleMouseLeave = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (prefersReducedMotion()) return;

    try {
      anime({
        targets: e.currentTarget,
        rotateX: 0,
        rotateY: 0,
        duration: 400,
        easing: "easeOutElastic(1, .6)",
      });
    } catch (e2) {
      console.warn("3D tilt reset error:", e2);
    }
  }, []);

  return { handleMouseMove, handleMouseLeave };
}

/**
 * Launch effect - text flies up and fades out on submit
 */
export function useLaunchEffect() {
  const animate = useCallback((element: HTMLElement | null) => {
    if (prefersReducedMotion() || !element) return;

    try {
      anime({
        targets: element,
        translateY: [0, -20],
        opacity: [1, 0],
        duration: 200,
        easing: "easeInCubic",
        complete: () => {
          // Reset after animation
          anime.set(element, { translateY: 0, opacity: 1 });
        },
      });
    } catch (e) {
      console.warn("Launch animation error:", e);
    }
  }, []);

  return animate;
}

/**
 * Thinking pulse animation with orbiting particles
 */
export function useThinkingAnimation() {
  const containerRef = useRef<HTMLDivElement>(null);
  const animationsRef = useRef<anime.AnimeInstance[]>([]);

  useEffect(() => {
    if (prefersReducedMotion() || !containerRef.current) return;

    const container = containerRef.current;
    const brainIcon = container.querySelector(".thinking-brain");
    const particles = container.querySelectorAll(".thinking-particle");

    try {
      // Brain pulse
      if (brainIcon) {
        const pulse = anime({
          targets: brainIcon,
          scale: [1, 1.15, 1],
          duration: 1500,
          loop: true,
          easing: "easeInOutSine",
        });
        animationsRef.current.push(pulse);
      }

      // Orbiting particles
      particles.forEach((particle, i) => {
        const orbitAnim = anime({
          targets: particle,
          rotate: [i * 90, i * 90 + 360],
          duration: 2000 + i * 300,
          loop: true,
          easing: "linear",
        });
        
        const scaleAnim = anime({
          targets: particle,
          scale: [0.5, 1, 0.5],
          opacity: [0.3, 1, 0.3],
          duration: 1500 + i * 200,
          loop: true,
          easing: "easeInOutSine",
        });
        
        animationsRef.current.push(orbitAnim, scaleAnim);
      });
    } catch (e) {
      console.warn("Thinking animation error:", e);
    }

    return () => {
      animationsRef.current.forEach((a) => a.pause());
      animationsRef.current = [];
    };
  }, []);

  return containerRef;
}
