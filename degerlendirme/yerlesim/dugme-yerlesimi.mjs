/** Uzun dosya adı, açık sol sidebar, dar belge paneli ve gerçek hit-test kontrolleri. */
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react-swc';
const playwright = await import(process.env.HARNESS_PLAYWRIGHT_PATH ? pathToFileURL(process.env.HARNESS_PLAYWRIGHT_PATH).href : 'playwright');
const output = process.env.LAYOUT_OUTPUT || '/tmp/t3ai-dugme-yerlesimi';
await fs.mkdir(output, { recursive: true });
const server = await createServer({ configFile: false, envDir: false, plugins: [react()],
  optimizeDeps: { entries: ['degerlendirme/yerlesim/index.html'] },
  resolve: { alias: { '@': path.join(process.cwd(), 'src') } },
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
});
let browser, page;
const results = [], errors = [];
const settle = async () => page.waitForFunction(() => !document.getAnimations().some(a =>
  a.playState === 'running' && a.effect.getTiming().iterations !== Infinity));
const check = async (name, run) => {
  try { await run(); results.push(name); console.log('PASS', name); }
  catch (error) { await page.screenshot({path:path.join(output,'hata.png')}); throw error; }
};
const noOverlap = async () => {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await settle();
  const report = await page.evaluate(() => {
    const toolbar = document.querySelector('[data-workspace-toolbar]');
    const header = document.querySelector('[data-artifact-header]');
    const rect = el => el.getBoundingClientRect();
    const overlaps = (a,b) => a.left < b.right-1 && a.right > b.left+1 && a.top < b.bottom-1 && a.bottom > b.top+1;
    const visible = el => rect(el).width > 0 && rect(el).height > 0;
    const controls = [...toolbar.querySelectorAll('button'), ...header.querySelectorAll('button')].filter(visible);
    const problems = [];
    if (overlaps(rect(toolbar),rect(header))) problems.push('Araç çubuğu belge başlığına biniyor');
    for (let i=0;i<controls.length;i++) {
      const el=controls[i], r=rect(el), name=el.getAttribute('aria-label') || el.title || el.textContent;
      if (r.left<0 || r.right>innerWidth+1 || r.top<0 || r.bottom>innerHeight+1) problems.push('Ekran dışı: '+name);
      if (!el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))) problems.push('Üstü kapalı: '+name);
      for (let j=i+1;j<controls.length;j++) if(overlaps(r,rect(controls[j]))) problems.push('Düğmeler çakışıyor: '+name);
    }
    const title=header.querySelector('p[title]'), actions=header.querySelector('[data-artifact-actions]');
    if (overlaps(rect(title),rect(actions))) problems.push('Dosya adı eylemlere biniyor');
    if (document.documentElement.scrollWidth>innerWidth) problems.push('Yatay taşma');
    return {problems, panelWidth:document.querySelector('section[aria-label="Belge paneli"]').clientWidth};
  });
  assert.deepEqual(report.problems,[]);
  return report;
};
try {
  await server.listen();
  const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
  browser=await (playwright.chromium ?? playwright.default.chromium).launch({headless:true,executablePath:process.env.HARNESS_CHROME_PATH});
  for (const normal of [true,false]) {
    const mode=normal?'sohbet':'proje';
    const context=await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:'block'});
    await context.route('**/*', async route => {
      const request=route.request(),url=new URL(request.url());
      if(url.origin===origin && request.method()==='GET' && !/^\/(api|vllm|functions)/.test(url.pathname)) return route.continue();
      if(url.origin===origin && url.pathname==='/api/config') return route.fulfill({json:{systemPromptBase:null}});
      if(url.origin===origin && url.pathname.endsWith('/health')) return route.fulfill({status:503,json:{available:false}});
      errors.push('Beklenmeyen istek: '+url.pathname); return route.abort();
    });
    page=await context.newPage();page.setDefaultTimeout(15000);
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/degerlendirme/yerlesim/index.html?long=1'+(normal?'&normal=1':''));
    if(normal) await page.getByTitle('Sidebar Aç/Kapa',{exact:true}).click();
    await page.getByTitle('Yerleşim denetimi',{exact:true}).click();
    await page.getByRole('button',{name:'Belge panelini aç',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('section[aria-label="Belge paneli"]').dataset.visible==='true');
    for (const width of [1920,1366,1050,1024,768,390,320]) {
      await check(mode+' '+width+'px: uzun dosya adı ve bütün başlık düğmeleri çakışmaz',async()=>{
        await page.setViewportSize({width,height:width<768?844:900});
        const report=await noOverlap();
        if(normal&&width>=1024) assert(report.panelWidth>=314,JSON.stringify(report));
        await page.screenshot({path:path.join(output,mode+'-'+width+'.png')});
      });
    }
    if(normal) {
      await check('Telefonda belge açıkken sol sidebar erişilir ve sohbet seçimi çekmeceyi kapatır',async()=>{
        await page.getByTitle('Sohbetleri aç',{exact:true}).click();
        const drawer=page.getByRole('dialog',{name:'Sohbetler',exact:true});await drawer.waitFor();
        await drawer.getByTitle('Yerleşim denetimi',{exact:true}).click();await drawer.waitFor({state:'hidden'});
        await noOverlap();
      });
      await page.setViewportSize({width:1366,height:900});await noOverlap();
      await check('Panel en dar genişliğe sürüklendiğinde dosya başlığı ve düğmeler korunur',async()=>{
        const handle=page.getByRole('separator',{name:'Belge paneli genişliği'}),r=await handle.boundingBox();
        await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();
        assert.equal(await page.locator('.workspace-resizable').getAttribute('data-resizing'),'true');
        await page.mouse.move(1290,r.y+r.height/2,{steps:10});await page.mouse.up();
        assert.equal(await page.locator('[data-document-toggle]').getAttribute('aria-expanded'),'true');
        const report=await noOverlap();assert(report.panelWidth>=314&&report.panelWidth<=325,JSON.stringify(report));
        assert.equal(await page.evaluate(()=>window.getSelection()?.toString()),'');
      });
      await check('Açık ve kapalı sol sidebar düğmeleri aynı ikon animasyonunu kullanır',async()=>{
        const sidebar=page.locator('[data-sidebar="sidebar"]');
        for(const name of ['Yeni Sohbet','Projeler','Sohbeti İçe Aktar','Sohbeti Dışa Aktar']) {
          for (const button of await sidebar.getByRole('button',{name,exact:true}).all()) {
            await button.hover();
            assert(await button.evaluate(el=>el.getAnimations({subtree:true}).some(a=>a.animationName==='canli-pop')),name);
          }
        }
        await page.getByTitle('Sidebar Aç/Kapa',{exact:true}).click();await noOverlap();
        for(const name of ['Yeni Sohbet','Projeler','Sohbeti İçe Aktar','Sohbeti Dışa Aktar']) {
          for (const button of await sidebar.getByRole('button',{name,exact:true}).all()) {
            await button.hover();
            assert(await button.evaluate(el=>el.getAnimations({subtree:true}).some(a=>a.animationName==='canli-pop')),name);
          }
        }
        await page.emulateMedia({reducedMotion:'reduce'});
        const button=sidebar.getByRole('button',{name:'Yeni Sohbet',exact:true});await button.hover();
        assert(await button.evaluate(el=>el.getAnimations({subtree:true}).every(a=>a.animationName!=='canli-pop')));
        await page.emulateMedia({reducedMotion:'no-preference'});
        await page.getByTitle('Sidebar Aç/Kapa',{exact:true}).click();await settle();
        await sidebar.getByTitle('Aydınlık Mod',{exact:true}).click();
        await page.waitForFunction(()=>!document.documentElement.classList.contains('dark'));await settle();
        await noOverlap();await page.screenshot({path:path.join(output,'sohbet-acik-tema.png')});
      });
    } else {
      await page.setViewportSize({width:1366,height:900});await settle();
      await check('Proje sohbet listesindeki düğmeler de animasyonlu',async()=>{
        const button=page.getByRole('complementary',{name:'Proje sohbetleri',exact:true}).getByRole('button',{name:'Yeni Sohbet',exact:true});
        await button.hover();assert(await button.evaluate(el=>el.getAnimations({subtree:true}).some(a=>a.animationName==='canli-pop')));
      });
    }
    await context.close();
  }
  assert.deepEqual(errors,[]);
  const report={passed:results.length,results,errors,realModelRequests:0};
  await fs.writeFile(path.join(output,'sonuclar.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally {await browser?.close();await server.close();}
