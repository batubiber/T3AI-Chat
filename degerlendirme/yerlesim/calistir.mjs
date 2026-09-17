/** Gerçek sayfa + IndexedDB + DOCX; yalnız API yanıtları taklit. Model sunucusu kullanılmaz. */
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react-swc';
const playwright = await import(process.env.HARNESS_PLAYWRIGHT_PATH ? pathToFileURL(process.env.HARNESS_PLAYWRIGHT_PATH).href : 'playwright');
const output = process.env.LAYOUT_OUTPUT || '/tmp/t3ai-yerlesim';
await fs.mkdir(output, { recursive: true });
const server = await createServer({ configFile: false, envDir: false, plugins: [react()],
  optimizeDeps: { entries: ['degerlendirme/yerlesim/index.html'] },
  resolve: { alias: { '@': path.join(process.cwd(), 'src') } },
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
});
let browser;
const errors = [], apiRequests = [], results = [];
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await (playwright.chromium ?? playwright.default.chromium).launch({ headless: true, executablePath: process.env.HARNESS_CHROME_PATH });
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1366, height: 900 } });
  await context.route('**/*', async (route) => {
    const r = route.request(), u = new URL(r.url());
    if (u.origin === origin && r.method() === 'GET' && !/^\/(api|vllm|functions)/.test(u.pathname)) return route.continue();
    apiRequests.push(u.pathname);
    if (u.origin !== origin) { errors.push('Engellenen dış ağ isteği: ' + u.origin); return route.abort(); }
    if (u.pathname === '/api/config') return route.fulfill({ json: { systemPromptBase: null } });
    if (u.pathname.endsWith('/health')) return route.fulfill({ status: 503, json: { available: false } });
    errors.push('Beklenmeyen API isteği: ' + u.pathname);
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => { errors.push(e.message); console.error('PAGE', e.message); });
  page.setDefaultTimeout(15000);
  await page.goto(origin + '/degerlendirme/yerlesim/index.html');
  await page.getByTitle('Yerleşim denetimi', { exact: true }).click().catch(async (e) => { await page.screenshot({ path: path.join(output, 'hata.png') }); console.error(await page.locator('body').innerText()); throw e; });
  await page.getByRole('button', { name: 'Belge panelini aç', exact: true }).click();
  await page.getByTitle('Paneli kapat').waitFor();
  if (process.env.LAYOUT_BEFORE === '1') {
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'once-1366.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'once-390.png') });
    console.log('Önceki yerleşim kaydedildi.', errors);
  } else {
    const doc = page.getByRole('region', { name: 'Belge paneli', exact: true });
    const project = page.getByRole('complementary', { name: 'Proje detayları', exact: true });
    const draft = 'Kaydedilmemiş talimat: bütçeyi TL olarak göster.';
    const instructions = page.getByPlaceholder('Bu projede Türkçe yanıt ver. Kod örneklerinde TypeScript kullan...');
    const check = async (name, fn) => { await fn(); results.push(name); console.log('PASS', name); };
    const visible = async (locator, shown = true) => locator.waitFor({ state: shown ? 'visible' : 'hidden' });
    const inViewport = async (locator) => {
      await page.waitForFunction((element) => {
        for (let n = element; n; n = n.parentElement) {
          if (n.dataset.visible === 'false') return false;
          if (n.getAnimations().some((a) => a.playState === 'running' && a.effect.getTiming().iterations !== Infinity)) return false;
        }
        return true;
      }, await locator.elementHandle());
      const box = await locator.boundingBox(), v = page.viewportSize();
      assert(box && box.width > 0 && box.height > 0, 'Öğe görünür olmalı');
      assert(box.x >= -1 && box.y >= -1 && box.x + box.width <= v.width + 1 && box.y + box.height <= v.height + 1, `Öğe ekran içinde kalmalı: ${JSON.stringify(box)} / ${JSON.stringify(v)}`);
    };
    const navButton = (name) => page.getByRole('navigation').getByRole('button', { name, exact: true });
    await check('Belge kapanmadan proje açılır; talimat taslağı sekmeler arasında korunur', async () => {
      await page.getByRole('button', { name: 'Detayları Göster', exact: true }).click();
      await visible(project); await visible(doc, false);
      await project.getByRole('button', { name: 'Talimatlar', exact: true }).click();
      await instructions.fill(draft);
      await navButton('Belge').click(); await visible(doc);
      await navButton('Proje').click(); await visible(project);
      assert.equal(await instructions.inputValue(), draft);
      // Görünmez panel de bağlı kalır; referanslar boyut değişiminde kontrol edilir.
      await page.evaluate(() => { window.layoutNodes = ['project-document-pane', 'project-project-pane'].map((id) => document.getElementById(id).firstElementChild); });
    });
    for (const width of [1920, 1600, 1599, 1366, 1280, 1279, 1024, 1023, 768, 390, 320]) {
      await check(`${width}px: paneller erişilebilir, kontroller ekran içinde ve taslak korunuyor`, async () => {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
        if (width < 1600) await navButton('Proje').click();
        await visible(project);
        await inViewport(project);
        assert.equal(await instructions.inputValue(), draft);
        await project.getByRole('button', { name: 'Dökümanlar', exact: true }).click();
        await visible(project.getByText('turna-notlari.txt', { exact: true }));
        for (const name of ['Bellek', 'Talimatlar', 'Dökümanlar']) await inViewport(project.getByRole('button', { name, exact: true }));
        await page.screenshot({ animations: 'disabled', path: path.join(output, `proje-${width}.png`) });
        await project.getByRole('button', { name: 'Talimatlar', exact: true }).click();
        if (width < 1600) await navButton('Belge').click();
        await visible(doc); await inViewport(doc);
        await inViewport(doc.getByTitle('Paneli kapat'));
        await inViewport(doc.getByRole('button', { name: 'Düzenlenmiş dosyayı indir', exact: true }));
        await page.screenshot({ animations: 'disabled', path: path.join(output, `belge-${width}.png`) });
        if (width >= 1600) { await visible(project); await inViewport(page.getByRole('main')); }
        if (width < 1024) {
          await navButton('Sohbet').click(); await visible(doc, false); await visible(project, false);
          await inViewport(page.getByRole('main'));
          await inViewport(page.getByRole('button', { name: 'Yeniden Dene', exact: true }));
          await page.screenshot({ animations: 'disabled', path: path.join(output, `sohbet-${width}.png`) });
          await navButton('Belge').click();
        }
        assert(await page.evaluate(() => ['project-document-pane', 'project-project-pane'].every((id, i) => document.getElementById(id).firstElementChild === window.layoutNodes[i])), 'Panel bileşenleri yeniden oluşturulmamalı');
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Sayfa yatay taşmamalı');
      });
    }
    await check('Telefonda sohbet çekmecesi açılır; seçimden sonra kapanır ve belgeye dönülür', async () => {
      await page.getByRole('button', { name: 'Sohbetleri Göster', exact: true }).click();
      const drawer = page.getByRole('dialog', { name: 'Proje sohbetleri', exact: true });
      await visible(drawer); await inViewport(drawer);
      await visible(drawer.getByRole('button', { name: 'Projeyi Dışa Aktar', exact: true }));
      await drawer.getByTitle('Yerleşim denetimi', { exact: true }).click();
      await visible(drawer, false); await visible(page.getByRole('main'));
      await navButton('Belge').click(); await visible(doc);
    });
    await check('Geçişlerden sonra gerçek DOCX indirilebilir; kapatma ve yeniden açma çalışır', async () => {
      const [download] = await Promise.all([page.waitForEvent('download'), doc.getByRole('button', { name: 'Düzenlenmiş dosyayı indir', exact: true }).click()]);
      assert(download.suggestedFilename().endsWith('.docx'));
      const bytes = await fs.readFile(await download.path()); assert.equal(bytes.subarray(0, 2).toString(), 'PK');
      await doc.getByTitle('Paneli kapat').click();
      await visible(doc, false); await visible(page.getByRole('main'));
      await page.getByRole('button', { name: 'Belge panelini aç', exact: true }).click();
      await visible(doc); await inViewport(doc);
      await navButton('Proje').click(); await visible(project);
      assert.equal(await instructions.inputValue(), draft);
    });
    await check('Klavye ile panel geçişi ve sağ üst detay düğmesi çalışır', async () => {
      await page.setViewportSize({ width: 1366, height: 900 });
      await visible(page.getByRole('navigation', { name: 'Sağ panel görünümü', exact: true }));
      await navButton('Belge').focus(); await page.keyboard.press('Enter'); await visible(doc);
      await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await visible(project);
      await page.getByRole('button', { name: 'Detayları Gizle', exact: true }).click(); await visible(doc);
      await page.getByRole('button', { name: 'Detayları Göster', exact: true }).click(); await visible(project);
      assert.equal(await instructions.inputValue(), draft);
    });
    await check('Model ayarlarında geçici pilot anahtarı bulunmaz', async () => {
      await page.getByRole('button', { name: /^Model ve seviye/ }).click();
      assert.equal(await page.getByRole('switch', { name: 'Belge sonucu değerlendirmesi (Pilot)', exact: true }).count(), 0);
      await page.keyboard.press('Escape');
    });
    assert.deepEqual(errors, []);
  }
  console.log(JSON.stringify({ results, apiRequests, errors }, null, 2));
} finally { await browser?.close(); await server.close(); }
