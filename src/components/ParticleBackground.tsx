import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  pulse: number;
  pulseSpeed: number;
  baseY: number;
  baseX: number;
  waveOffset: number;
  waveAmplitude: number;
  waveSpeed: number;
}

interface BurstParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  life: number;
  maxLife: number;
}

// Theme color configurations
const themeColors = {
  dark: {
    primary: { r: 239, g: 68, b: 68 },      // red-500
    secondary: { r: 220, g: 38, b: 38 },    // red-600
    tertiary: { r: 185, g: 28, b: 28 },     // red-700
    highlight: { r: 252, g: 165, b: 165 },  // red-300
    wave: { r: 220, g: 38, b: 38 },
  },
  light: {
    primary: { r: 220, g: 38, b: 38 },      // red-600
    secondary: { r: 185, g: 28, b: 28 },    // red-700
    tertiary: { r: 153, g: 27, b: 27 },     // red-800
    highlight: { r: 239, g: 68, b: 68 },    // red-500
    wave: { r: 185, g: 28, b: 28 },
  }
};

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const burstParticlesRef = useRef<BurstParticle[]>([]);
  const animationRef = useRef<number>();
  const timeRef = useRef(0);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const { theme } = useTheme();
  const currentTheme = theme === "dark" ? "dark" : "light";
  const colorsRef = useRef(themeColors[currentTheme]);

  // Update colors when theme changes
  useEffect(() => {
    colorsRef.current = themeColors[currentTheme];
  }, [currentTheme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      initParticles();
    };

    const initParticles = () => {
      // Reduce particles on mobile for better performance
      const isMobile = window.innerWidth < 768;
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const particleCount = prefersReducedMotion ? 30 : (isMobile ? 50 : 150);
      particlesRef.current = Array.from({ length: particleCount }, () => {
        const baseY = Math.random() * canvas.height;
        const baseX = Math.random() * canvas.width;
        return {
          x: baseX,
          y: baseY,
          baseX: baseX,
          baseY: baseY,
          vx: (Math.random() - 0.5) * 0.15,
          vy: 0,
          size: Math.random() * 2.5 + 0.5,
          opacity: Math.random() * 0.7 + 0.3,
          pulse: Math.random() * Math.PI * 2,
          pulseSpeed: Math.random() * 0.02 + 0.01,
          waveOffset: Math.random() * Math.PI * 2,
          waveAmplitude: Math.random() * 15 + 5,
          waveSpeed: Math.random() * 0.008 + 0.004,
        };
      });
    };

    const createBurst = (x: number, y: number) => {
      const burstCount = 25;
      for (let i = 0; i < burstCount; i++) {
        const angle = (Math.PI * 2 * i) / burstCount + Math.random() * 0.3;
        const speed = Math.random() * 4 + 2;
        burstParticlesRef.current.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: Math.random() * 3 + 1,
          opacity: 1,
          life: 0,
          maxLife: Math.random() * 40 + 30,
        });
      }
    };

    // Get correct mouse position accounting for transforms
    const getCanvasRelativePosition = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      // Scale coordinates to account for CSS transforms
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    };

    const handleMouseMove = (e: MouseEvent) => {
      const pos = getCanvasRelativePosition(e.clientX, e.clientY);
      // Check if mouse is within canvas bounds
      if (pos.x >= 0 && pos.x <= canvas.width && pos.y >= 0 && pos.y <= canvas.height) {
        mouseRef.current = pos;
      } else {
        mouseRef.current = { x: -1000, y: -1000 };
      }
    };

    const handleMouseLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 };
    };

    const handleClick = (e: MouseEvent) => {
      // Don't create burst if clicking on interactive elements
      const target = e.target as HTMLElement;
      if (target.closest('button, a, [role="button"], input, textarea, .cursor-pointer, [data-clickable]')) {
        return;
      }
      const pos = getCanvasRelativePosition(e.clientX, e.clientY);
      if (pos.x >= 0 && pos.x <= canvas.width && pos.y >= 0 && pos.y <= canvas.height) {
        createBurst(pos.x, pos.y);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      const pos = getCanvasRelativePosition(touch.clientX, touch.clientY);
      if (pos.x >= 0 && pos.x <= canvas.width && pos.y >= 0 && pos.y <= canvas.height) {
        mouseRef.current = pos;
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      const pos = getCanvasRelativePosition(touch.clientX, touch.clientY);
      if (pos.x >= 0 && pos.x <= canvas.width && pos.y >= 0 && pos.y <= canvas.height) {
        createBurst(pos.x, pos.y);
      }
    };

    const handleTouchEnd = () => {
      mouseRef.current = { x: -1000, y: -1000 };
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    
    // Use document-level listeners to avoid transform issues
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("click", handleClick);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("touchmove", handleTouchMove);
    canvas.addEventListener("touchstart", handleTouchStart);
    canvas.addEventListener("touchend", handleTouchEnd);

    const animate = () => {
      timeRef.current += 0.016;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const mouse = mouseRef.current;
      const mouseRadius = 120;
      const colors = colorsRef.current;

      // Draw wave gradient at bottom
      const waveGradient = ctx.createLinearGradient(0, canvas.height * 0.6, 0, canvas.height);
      waveGradient.addColorStop(0, `rgba(${colors.wave.r}, ${colors.wave.g}, ${colors.wave.b}, 0)`);
      waveGradient.addColorStop(0.5, `rgba(${colors.wave.r}, ${colors.wave.g}, ${colors.wave.b}, 0.05)`);
      waveGradient.addColorStop(1, `rgba(${colors.wave.r}, ${colors.wave.g}, ${colors.wave.b}, 0.15)`);
      
      // Draw multiple wave layers - closer to bottom
      for (let layer = 0; layer < 3; layer++) {
        ctx.beginPath();
        ctx.moveTo(0, canvas.height);
        
        for (let x = 0; x <= canvas.width; x += 5) {
          const waveY = canvas.height - 40 - layer * 15 + 
            Math.sin(x * 0.008 + timeRef.current * (0.5 + layer * 0.2) + layer) * (10 + layer * 5) +
            Math.sin(x * 0.015 + timeRef.current * 0.3) * 8;
          ctx.lineTo(x, waveY);
        }
        
        ctx.lineTo(canvas.width, canvas.height);
        ctx.closePath();
        ctx.fillStyle = `rgba(${colors.wave.r}, ${colors.wave.g}, ${colors.wave.b}, ${0.04 + layer * 0.025})`;
        ctx.fill();
      }

      // Draw mouse glow effect
      if (mouse.x > 0 && mouse.y > 0) {
        const mouseGlow = ctx.createRadialGradient(
          mouse.x, mouse.y, 0,
          mouse.x, mouse.y, mouseRadius * 1.5
        );
        mouseGlow.addColorStop(0, `rgba(${colors.primary.r}, ${colors.primary.g}, ${colors.primary.b}, 0.15)`);
        mouseGlow.addColorStop(0.5, `rgba(${colors.secondary.r}, ${colors.secondary.g}, ${colors.secondary.b}, 0.05)`);
        mouseGlow.addColorStop(1, `rgba(${colors.tertiary.r}, ${colors.tertiary.g}, ${colors.tertiary.b}, 0)`);
        
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, mouseRadius * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = mouseGlow;
        ctx.fill();
      }

      // Update and draw burst particles
      burstParticlesRef.current = burstParticlesRef.current.filter((bp) => {
        bp.x += bp.vx;
        bp.y += bp.vy;
        bp.vx *= 0.97;
        bp.vy *= 0.97;
        bp.vy += 0.05; // slight gravity
        bp.life++;
        
        const lifeRatio = 1 - bp.life / bp.maxLife;
        const opacity = bp.opacity * lifeRatio;
        
        if (opacity > 0.01) {
          // Draw burst particle with trail
          const gradient = ctx.createRadialGradient(
            bp.x, bp.y, 0,
            bp.x, bp.y, bp.size * 5
          );
          gradient.addColorStop(0, `rgba(${colors.highlight.r}, ${colors.highlight.g}, ${colors.highlight.b}, ${opacity})`);
          gradient.addColorStop(0.3, `rgba(${colors.primary.r}, ${colors.primary.g}, ${colors.primary.b}, ${opacity * 0.7})`);
          gradient.addColorStop(0.6, `rgba(${colors.secondary.r}, ${colors.secondary.g}, ${colors.secondary.b}, ${opacity * 0.3})`);
          gradient.addColorStop(1, `rgba(${colors.tertiary.r}, ${colors.tertiary.g}, ${colors.tertiary.b}, 0)`);
          
          ctx.beginPath();
          ctx.arc(bp.x, bp.y, bp.size * 5, 0, Math.PI * 2);
          ctx.fillStyle = gradient;
          ctx.fill();
          
          // Bright core
          ctx.beginPath();
          ctx.arc(bp.x, bp.y, bp.size * lifeRatio, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 220, 220, ${opacity})`;
          ctx.fill();
          
          return true;
        }
        return false;
      });

      particlesRef.current.forEach((particle) => {
        // Calculate distance from mouse
        const dx = particle.x - mouse.x;
        const dy = particle.y - mouse.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Mouse repulsion effect
        if (distance < mouseRadius && distance > 0) {
          const force = (mouseRadius - distance) / mouseRadius;
          const angle = Math.atan2(dy, dx);
          particle.x += Math.cos(angle) * force * 3;
          particle.y += Math.sin(angle) * force * 3;
        } else {
          // Return to base position gradually
          particle.x += (particle.baseX - particle.x) * 0.015;
          
          // Wave motion on Y axis
          const targetY = particle.baseY + 
            Math.sin(timeRef.current * particle.waveSpeed * 60 + particle.waveOffset) * particle.waveAmplitude;
          particle.y += (targetY - particle.y) * 0.03;
        }

        // Update base X for continuous slow movement
        particle.baseX += particle.vx * 0.1;
        if (particle.baseX < 0) particle.baseX = canvas.width;
        if (particle.baseX > canvas.width) particle.baseX = 0;

        particle.pulse += particle.pulseSpeed;

        // Wrap around edges
        if (particle.x < -50) particle.x = canvas.width + 50;
        if (particle.x > canvas.width + 50) particle.x = -50;

        // Calculate pulsing opacity - brighter when near mouse
        let pulsingOpacity = particle.opacity * (0.4 + 0.6 * Math.sin(particle.pulse));
        if (distance < mouseRadius * 2) {
          pulsingOpacity *= 1 + (1 - distance / (mouseRadius * 2)) * 0.5;
        }

        // Draw particle with glow
        const gradient = ctx.createRadialGradient(
          particle.x,
          particle.y,
          0,
          particle.x,
          particle.y,
          particle.size * 4
        );
        gradient.addColorStop(0, `rgba(${colors.primary.r}, ${colors.primary.g}, ${colors.primary.b}, ${pulsingOpacity})`);
        gradient.addColorStop(0.3, `rgba(${colors.secondary.r}, ${colors.secondary.g}, ${colors.secondary.b}, ${pulsingOpacity * 0.5})`);
        gradient.addColorStop(0.6, `rgba(${colors.tertiary.r}, ${colors.tertiary.g}, ${colors.tertiary.b}, ${pulsingOpacity * 0.2})`);
        gradient.addColorStop(1, `rgba(${colors.tertiary.r}, ${colors.tertiary.g}, ${colors.tertiary.b}, 0)`);

        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * 4, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw bright core
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${colors.highlight.r}, ${colors.highlight.g}, ${colors.highlight.b}, ${pulsingOpacity})`;
        ctx.fill();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("click", handleClick);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchend", handleTouchEnd);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full opacity-80"
      style={{ zIndex: 0, pointerEvents: "none" }}
    />
  );
}
