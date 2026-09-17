/** Gerçek sayfa + IndexedDB + DOCX; yalnız API yanıtları taklit. Model sunucusu kullanılmaz. */
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react-swc';
const playwright = await import(process.env.HARNESS_PLAYWRIGHT_PATH ? pathToFileURL(process.env.HARNESS_PLAYWRIGHT_PATH).href : 'playwright');
const output = process.env.LAYOUT_OUTPUT || '/tmp/t3ai-ui-gecisleri';
await fs.mkdir(output, { recursive: true });
const server = await createServer({ configFile: false, envDir: false, plugins: [react()],
  optimizeDeps: { entries: ['degerlendirme/yerlesim/index.html'] },
  resolve: { alias: { '@': path.join(process.cwd(), 'src') } },
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
});
let browser;
const results = [], errors = [];
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await (playwright.chromium ?? playwright.default.chromium).launch({ headless: true, executablePath: process.env.HARNESS_CHROME_PATH });
  for (const normal of [false, true]) {
    const mode = normal ? 'sohbet' : 'proje';
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: {width:1366,height:900}, reducedMotion:'no-preference' });
    await context.route('**/*', async (route) => {
      const r=route.request(), u=new URL(r.url());
      if (u.origin===origin && r.method()==='GET' && !/^\/(api|vllm|functions)/.test(u.pathname)) return route.continue();
      if(u.origin!==origin) {errors.push('Dış ağ engellendi: '+u.origin);return route.abort();}
      if(u.pathname==='/api/config') return route.fulfill({json:{systemPromptBase:null}});
      if(u.pathname.endsWith('/health')) return route.fulfill({status:503,json:{available:false}});
      errors.push('Beklenmeyen API: '+u.pathname);return route.abort();
    });
    const page=await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE',e.message);});
    await page.goto(origin+'/degerlendirme/yerlesim/index.html'+(normal?'?normal=1':''));
    if(normal) await page.getByTitle('Sidebar Aç/Kapa',{exact:true}).click();
    await page.getByTitle('Yerleşim denetimi',{exact:true}).click();
    if(normal) await page.getByTitle('Sidebar Aç/Kapa',{exact:true}).click();
    const panel=page.locator(normal?'section[aria-label="Belge paneli"]':'#project-document-pane');
    const list=page.getByRole('button',{name:'Belgeler',exact:true});
    const toggle=page.locator('[data-document-toggle]');
    const input=page.locator('.chat-textarea');
    const check=async(name,fn)=>{try{await fn();results.push(mode+': '+name);console.log('PASS',mode,name);}catch(e){await page.screenshot({path:path.join(output,mode+'-hata.png')});throw e;}};
    const settle=async(locator)=>{
      await page.waitForFunction((el)=>{
        for(let n=el;n;n=n.parentElement){if(n.dataset.visible==='false')return false;if(n.getAnimations().some(a=>a.playState==='running'&&a.effect.getTiming().iterations!==Infinity))return false;}
        return true;
      },await locator.elementHandle());
    };
    const visible=async()=>{await page.waitForFunction(el=>el.dataset.visible==='true',await panel.elementHandle());await settle(panel);};
    const hidden=async()=>{await panel.waitFor({state:'hidden'});};
    const within=async(locator)=>{await settle(locator);const b=await locator.boundingBox(),v=page.viewportSize();assert(b&&b.x>=-1&&b.y>=-1&&b.x+b.width<=v.width+1&&b.y+b.height<=v.height+1,JSON.stringify(b));};

    await check('İki bağımsız düğme, liste paneli kendiliğinden açmaz',async()=>{
      await list.waitFor();assert.equal(await toggle.getAttribute('aria-label'),'Belge panelini aç');
      await list.click();const menu=page.getByRole('menu');await menu.waitFor();assert.equal(await menu.getByRole('menuitem').count(),2);
      assert.equal(await toggle.getAttribute('aria-expanded'),'false');
      await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});assert(await list.evaluate(e=>e===document.activeElement));
    });
    await check('Panel açıkken liste ve seçili belge, aynı belgeyi yeniden seçme',async()=>{
      await input.fill('Kaybolmaması gereken mesaj taslağı.');
      await page.evaluate(()=>{window.chatInput=document.querySelector('.chat-textarea');});
      await toggle.click();await visible();
      await page.evaluate(()=>{window.documentNode=document.querySelector('.t3ai-artifact');});
      await list.click();const item=page.getByRole('menuitem',{name:/Turna-Pilot.docx/});
      assert((await item.innerText()).includes('Seçili belge'));
      assert.equal(await toggle.getAttribute('aria-expanded'),'true');
      await page.screenshot({animations:'disabled',path:path.join(output,mode+'-liste-1366.png')});
      await item.click();await page.getByRole('menu').waitFor({state:'hidden'});await visible();
      assert(await page.evaluate(()=>window.documentNode===document.querySelector('.t3ai-artifact')));
      assert.equal(await input.inputValue(),'Kaybolmaması gereken mesaj taslağı.');
    });
    await check('Başka belgeye geçiş, kapatıp aynı belgeyi geri açma ve odak',async()=>{
      await list.click();await page.getByRole('menuitem',{name:/Turna-Onceki.docx/}).click();await page.getByRole('menu').waitFor({state:'hidden'});await visible();
      await panel.getByTitle('Turna-Onceki.docx',{exact:true}).waitFor();
      await panel.getByTitle('Paneli kapat',{exact:true}).click();await hidden();
      assert(await toggle.evaluate(e=>e===document.activeElement));
      await toggle.click();await visible();await panel.getByTitle('Turna-Onceki.docx',{exact:true}).waitFor();
      assert(await page.evaluate(()=>window.chatInput===document.querySelector('.chat-textarea')));
      assert.equal(await input.inputValue(),'Kaybolmaması gereken mesaj taslağı.');
    });
    await check('Kapanış animi oynar, kapalı içerik odak almaz; hızlı tersine geçiş güvenli',async()=>{
      const state=await toggle.evaluate(async b=>{
        b.click();await new Promise(r=>setTimeout(r,50));
        const p=document.querySelector('section[aria-label="Belge paneli"]');
        return {opacity:Number(getComputedStyle(p).opacity),inert:p.inert,present:!p.hidden};
      });
      assert(state.present&&state.inert&&state.opacity>0&&state.opacity<1,JSON.stringify(state));
      await hidden();await toggle.click();await visible();
      await toggle.evaluate(async b=>{for(let i=0;i<4;i++){b.click();await new Promise(r=>setTimeout(r,45));}});
      await visible();assert.equal(await toggle.getAttribute('aria-expanded'),'true');
      assert.equal(await input.inputValue(),'Kaybolmaması gereken mesaj taslağı.');
    });
    if(normal) await check('Panel sürüklemede gecikmez; genişlik kapat/aç boyunca korunur',async()=>{
      const handle=page.getByRole('separator',{name:'Belge paneli genişliği'}),b=await handle.boundingBox();
      await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x-80,b.y+b.height/2,{steps:8});
      assert.equal(await page.locator('.workspace-resizable').getAttribute('data-resizing'),'true');await page.mouse.up();await settle(panel);
      const width=(await panel.boundingBox()).width;await toggle.click();await hidden();await toggle.click();await visible();
      assert(Math.abs((await panel.boundingBox()).width-width)<3);
    });
    for(const width of [768,390,320]) await check(width+'px: panel açıkken belge listesi erişilebilir ve taşmaz',async()=>{
      await page.setViewportSize({width,height:844});await visible();await within(panel);await within(list);await within(toggle);
      await list.click();await within(page.getByRole('menu'));await page.screenshot({animations:'disabled',path:path.join(output,mode+'-liste-'+width+'.png')});
      await page.getByRole('menuitem',{name:/Turna-Pilot.docx/}).click();await page.getByRole('menu').waitFor({state:'hidden'});await visible();await panel.getByTitle('Turna-Pilot.docx',{exact:true}).waitFor();
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    });
    await check('Klavye ve azaltılmış hareket tercihinde geçişler',async()=>{
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.waitForFunction(el=>getComputedStyle(el).transitionDuration.split(',').every(v=>parseFloat(v)===0),await panel.elementHandle());
      await list.focus();await page.keyboard.press('Enter');await page.getByRole('menu').waitFor();
      await page.waitForFunction(()=>document.activeElement?.closest('[role="menu"]'));
      assert.equal(await page.getByRole('menu').evaluate(el=>getComputedStyle(el).animationName),'none');
      await page.keyboard.press('Escape');await page.getByRole('menu').waitFor({state:'hidden'});
      await toggle.click();await hidden();await toggle.click();await visible();
      await page.emulateMedia({reducedMotion:'no-preference'});
    });
    await page.setViewportSize({width:1366,height:900});await visible();
    if(!normal) await check('Proje ayarları açılış/kapanış animi ve Escape',async()=>{
      await page.getByRole('button',{name:'Proje Ayarları',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();
      const anim=await dialog.evaluate(el=>getComputedStyle(el).animationDuration);assert.notEqual(anim,'0s');
      await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
    });
    await check('Hover ikon animasyonu ve açık tema',async()=>{
      await list.hover();assert(await list.evaluate(el=>el.getAnimations({subtree:true}).length>0));
      await page.evaluate(()=>document.documentElement.classList.remove('dark'));await list.click();
      await page.screenshot({animations:'disabled',path:path.join(output,mode+'-liste-acik-tema.png')});await page.keyboard.press('Escape');
    });
    await check('Belgesiz sohbete geçince önceki belge kontrolleri kaybolur',async()=>{
      if(normal) await page.getByTitle('Sidebar Aç/Kapa',{exact:true}).click();
      await page.getByTitle('Belgesiz sohbet',{exact:true}).click();
      await list.waitFor({state:'hidden'});await panel.waitFor({state:'hidden'});
    });
    await context.close();
  }
  assert.deepEqual(errors,[]);
  const report={passed:results.length,results,errors,realModelRequests:0};console.log(JSON.stringify(report,null,2));
  await fs.writeFile(path.join(output,'sonuclar.json'),JSON.stringify(report,null,2));
} finally {await browser?.close();await server.close();}
