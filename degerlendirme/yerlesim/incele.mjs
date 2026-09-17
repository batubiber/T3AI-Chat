/** Görsel inceleme: gerçek uygulama, örnek belgeler, kapalı model API'leri. */
import path from 'node:path';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react-swc';

const server = await createServer({
  configFile: false, envDir: false, cacheDir: 'node_modules/.vite-ui-preview',
  plugins: [react(), { name: 'yerel-arayuz-incelemesi', configureServer(s) {
    s.middlewares.use((req, res, next) => {
      if (!/^\/(api|vllm|functions)(\/|$)/.test(req.url)) return next();
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/config') return res.end(JSON.stringify({ systemPromptBase: null }));
      res.statusCode = 503;
      res.end(JSON.stringify({ available: false, error: 'Görsel inceleme ortamında model çağrısı kapalı.' }));
    });
  } }],
  optimizeDeps: { entries: ['degerlendirme/yerlesim/index.html'] },
  resolve: { alias: { '@': path.join(process.cwd(), 'src') } },
  server: { host: '127.0.0.1', port: 4179, strictPort: true,
    watch: { usePolling: true, interval: 500, ignored: ['**/dist/**', '**/server/**', '**/.git/**'] },
  },
});
await server.listen();
console.log('Sohbet: http://127.0.0.1:4179/degerlendirme/yerlesim/index.html?normal=1');
console.log('Proje:  http://127.0.0.1:4179/degerlendirme/yerlesim/index.html');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0); });
