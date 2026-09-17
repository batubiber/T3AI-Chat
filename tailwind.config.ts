import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        'logo-red': 'hsl(5 85% 55%)',
        'logo-orange': 'hsl(15 88% 58%)',
        'logo-blue': 'hsl(199 89% 48%)',
        'logo-cyan': 'hsl(195 85% 50%)',
        'logo-yellow': 'hsl(45 98% 60%)',
        'logo-dark': 'hsl(220 50% 15%)',
      },
      backgroundImage: {
        'gradient-primary': 'var(--gradient-primary)',
        'gradient-accent': 'var(--gradient-accent)',
        'gradient-sidebar': 'var(--gradient-sidebar)',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "50%": { transform: "translate(20px, -20px) scale(1.1)" },
        },
        "float-medium": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "50%": { transform: "translate(-15px, 15px) scale(1.05)" },
        },
        "spin-slow": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        "sparkle-1": {
          "0%, 100%": { opacity: "0", transform: "scale(0)" },
          "50%": { opacity: "1", transform: "scale(1)" },
        },
        "sparkle-2": {
          "0%, 100%": { opacity: "0", transform: "scale(0)" },
          "60%": { opacity: "1", transform: "scale(1)" },
        },
        "sparkle-3": {
          "0%, 100%": { opacity: "0", transform: "scale(0)" },
          "70%": { opacity: "1", transform: "scale(1)" },
        },
        "bounce-1": {
          "0%, 80%, 100%": { transform: "translateY(0)" },
          "40%": { transform: "translateY(-6px)" },
        },
        "bounce-2": {
          "0%, 80%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "bounce-3": {
          "0%, 80%, 100%": { transform: "translateY(0)" },
          "60%": { transform: "translateY(-6px)" },
        },
        "draw-1": {
          "0%": { strokeDashoffset: "20" },
          "50%, 100%": { strokeDashoffset: "0" },
        },
        "draw-2": {
          "0%, 20%": { strokeDashoffset: "30" },
          "70%, 100%": { strokeDashoffset: "0" },
        },
        "draw-3": {
          "0%, 40%": { strokeDashoffset: "15" },
          "90%, 100%": { strokeDashoffset: "0" },
        },
        "shake": {
          "0%, 100%": { transform: "translateX(0)" },
          "10%, 30%, 50%, 70%, 90%": { transform: "translateX(-2px)" },
          "20%, 40%, 60%, 80%": { transform: "translateX(2px)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "float-slow": "float-slow 8s ease-in-out infinite",
        "float-medium": "float-medium 6s ease-in-out infinite",
        "spin-slow": "spin-slow 8s linear infinite",
        "sparkle-1": "sparkle-1 2s ease-in-out infinite",
        "sparkle-2": "sparkle-2 2.5s ease-in-out infinite 0.3s",
        "sparkle-3": "sparkle-3 2s ease-in-out infinite 0.6s",
        "bounce-1": "bounce-1 1.4s ease-in-out infinite",
        "bounce-2": "bounce-2 1.4s ease-in-out infinite 0.2s",
        "bounce-3": "bounce-3 1.4s ease-in-out infinite 0.4s",
        "draw-1": "draw-1 2s ease-in-out infinite",
        "draw-2": "draw-2 2s ease-in-out infinite",
        "draw-3": "draw-3 2s ease-in-out infinite",
        "shake": "shake 0.5s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
