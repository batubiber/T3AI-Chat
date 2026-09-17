import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";

/**
 * Derlenen pakete `surum.json` koyar.
 *
 * Açık sekme, kendi içine gömülü APP_VERSION ile bu dosyayı karşılaştırıp
 * sunucuda yeni bir dağıtım olup olmadığını anlıyor (bkz. surumKontrol.ts).
 *
 * Sürüm ELDE YAZILMIYOR, `src/lib/surum.ts`'ten okunuyor: iki yerde tutulsaydı
 * biri güncellenmeyi unutulur ve kontrol sessizce yanlış cevap verirdi.
 */
function surumDosyasi(): Plugin {
  return {
    name: "t3ai-surum-json",
    generateBundle() {
      const kaynak = fs.readFileSync(path.resolve(__dirname, "src/lib/surum.ts"), "utf-8");
      const eslesme = kaynak.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
      if (!eslesme) throw new Error("surum.ts icinde APP_VERSION bulunamadi");
      this.emitFile({
        type: "asset",
        fileName: "surum.json",
        source: JSON.stringify({ surum: eslesme[1] }),
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        secure: false,
        timeout: 300000, // 5 minutes
        proxyTimeout: 300000,
      },
    },
  },
  plugins: [react(), surumDosyasi()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
