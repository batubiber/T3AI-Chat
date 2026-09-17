import { useEffect, useRef, useState } from "react";
import anime from "animejs";
import chatLogo from "@/assets/chat-logo.png";

const SPLASH_SHOWN_KEY = "t3ai-splash-shown";

export function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    try {
      const tl = anime.timeline({
        easing: "easeOutExpo",
        complete: () => {
          anime({
            targets: containerRef.current,
            opacity: 0,
            duration: 350,
            easing: "easeInQuad",
            complete: () => {
              setVisible(false);
              sessionStorage.setItem(SPLASH_SHOWN_KEY, "true");
              onComplete();
            },
          });
        },
      });

      // 1. Grid + glow together
      tl.add({
        targets: ".splash-grid-line",
        opacity: [0, 0.15],
        duration: 400,
        delay: anime.stagger(20),
      });

      tl.add({
        targets: ".splash-glow",
        scale: [0, 1.5],
        opacity: [0, 0.6],
        duration: 500,
        easing: "easeOutQuad",
      }, "-=300");

      // 2. Logo + title nearly simultaneous
      tl.add({
        targets: ".splash-logo",
        scale: [0, 1],
        rotate: [120, 0],
        opacity: [0, 1],
        duration: 600,
        easing: "easeOutElastic(1, .7)",
      }, "-=300");

      tl.add({
        targets: ".splash-letter",
        translateY: [40, 0],
        opacity: [0, 1],
        duration: 400,
        delay: anime.stagger(40),
        easing: "easeOutBack",
      }, "-=400");

      // 3. Tagline + particles together
      tl.add({
        targets: ".splash-tagline",
        translateY: [20, 0],
        opacity: [0, 1],
        duration: 350,
      }, "-=200");

      tl.add({
        targets: ".splash-particle",
        translateX: () => anime.random(-300, 300),
        translateY: () => anime.random(-300, 300),
        scale: [0, () => anime.random(5, 15) / 10],
        opacity: [1, 0],
        duration: 600,
        delay: anime.stagger(15),
        easing: "easeOutQuad",
      }, "-=200");

      // 4. Brief hold
      tl.add({ duration: 300 });

      return () => {
        tl.pause();
      };
    } catch (error) {
      console.error("Splash animation error:", error);
      setVisible(false);
      sessionStorage.setItem(SPLASH_SHOWN_KEY, "true");
      onComplete();
    }
  }, [onComplete]);

  if (!visible) return null;

  const title = "T3 AI";
  const gridLines = Array.from({ length: 20 });
  const particles = Array.from({ length: 30 });

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      style={{ background: "hsl(0 0% 2%)" }}
    >
      {/* Grid lines background */}
      <div className="absolute inset-0">
        {gridLines.map((_, i) => (
          <div
            key={`h-${i}`}
            className="splash-grid-line absolute left-0 right-0 opacity-0"
            style={{
              top: `${(i + 1) * 5}%`,
              height: "1px",
              background: "linear-gradient(90deg, transparent, hsl(0 85% 50% / 0.3), transparent)",
            }}
          />
        ))}
        {gridLines.map((_, i) => (
          <div
            key={`v-${i}`}
            className="splash-grid-line absolute top-0 bottom-0 opacity-0"
            style={{
              left: `${(i + 1) * 5}%`,
              width: "1px",
              background: "linear-gradient(180deg, transparent, hsl(0 85% 50% / 0.3), transparent)",
            }}
          />
        ))}
      </div>

      {/* Center glow */}
      <div
        className="splash-glow absolute rounded-full opacity-0"
        style={{
          width: "400px",
          height: "400px",
          background: "radial-gradient(circle, hsl(0 85% 50% / 0.4) 0%, hsl(0 85% 50% / 0.1) 40%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />

      {/* Particles */}
      {particles.map((_, i) => (
        <div
          key={`p-${i}`}
          className="splash-particle absolute rounded-full opacity-0"
          style={{
            width: `${Math.random() * 6 + 2}px`,
            height: `${Math.random() * 6 + 2}px`,
            background: `hsl(${Math.random() * 20 - 10} 85% ${50 + Math.random() * 30}%)`,
            boxShadow: "0 0 6px hsl(0 85% 50% / 0.6)",
          }}
        />
      ))}

      {/* Center content */}
      <div className="relative flex flex-col items-center gap-6 z-10">
        {/* Logo */}
        <img
          src={chatLogo}
          alt="T3AI Logo"
          className="splash-logo w-24 h-24 md:w-32 md:h-32 opacity-0"
          style={{ filter: "drop-shadow(0 0 30px hsl(0 85% 50% / 0.6))" }}
        />

        {/* Title */}
        <div className="flex items-center gap-1">
          {title.split("").map((char, i) => (
            <span
              key={i}
              className="splash-letter text-5xl md:text-7xl font-black opacity-0"
              style={{
                color: "hsl(0 0% 98%)",
                textShadow: "0 0 40px hsl(0 85% 50% / 0.5), 0 0 80px hsl(0 85% 50% / 0.3)",
                display: char === " " ? "inline-block" : undefined,
                width: char === " " ? "0.3em" : undefined,
              }}
            >
              {char}
            </span>
          ))}
        </div>

        {/* Tagline */}
        <p
          className="splash-tagline text-sm md:text-lg tracking-[0.3em] uppercase opacity-0"
          style={{ color: "hsl(0 0% 60%)" }}
        >
          Türkiye'nin Büyük Dil Modeli
        </p>
      </div>
    </div>
  );
}

export function useSplashScreen() {
  const [showSplash, setShowSplash] = useState(() => {
    return !sessionStorage.getItem(SPLASH_SHOWN_KEY);
  });

  const handleComplete = () => {
    setShowSplash(false);
  };

  return { showSplash, handleComplete };
}
