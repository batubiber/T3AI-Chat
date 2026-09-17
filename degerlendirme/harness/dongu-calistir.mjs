/** Yerel Vite + geçici tarayıcı profili. .env okunmaz, backend başlatılmaz, tüm API'ler taklittir. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react-swc';
const playwright = await import(process.env.HARNESS_PLAYWRIGHT_PATH ? pathToFileURL(process.env.HARNESS_PLAYWRIGHT_PATH).href : 'playwright');
const root = process.cwd();
const server = await createServer({ configFile: false, envDir: false, plugins: [react()],
  optimizeDeps: { entries: ['degerlendirme/harness/index.html'] },
  resolve: { alias: [{ find: '@/lib/ragService', replacement: path.join(root, 'degerlendirme/harness/rag.ts') }, { find: '@', replacement: path.join(root, 'src') }] },
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
});
let browser;
const requests = [], pending = [], errors = [], results = [];
let mode = 'generate';
const event = (delta, finish_reason = null) => `data: ${JSON.stringify({ choices: [{ delta, finish_reason }] })}\n\n`;
const call = (id = 'u1', name = 'belge_uret', args = { tur: 'docx', baslik: 'Rapor', talimat: 'Kaynaktan rapor yaz' }, index = 0) => ({ index, id, function: { name, arguments: JSON.stringify(args) } });
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await (playwright.chromium ?? playwright.default.chromium).launch({ headless: true, executablePath: process.env.HARNESS_CHROME_PATH });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  // Önceden pilotu kapatan tarayıcılar da yeni döngüyü kullanmalı.
  await context.addInitScript(() => localStorage.setItem('t3ai.harness.arac-dongusu', 'false'));
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.setDefaultTimeout(15000);
  await context.route('**/*', async (route) => {
    const r = route.request(), u = new URL(r.url());
    const fulfill = (body, status = 200, contentType = 'application/json') => route.fulfill({ status, contentType, body: typeof body === 'string' ? body : JSON.stringify(body) }).catch(() => {});
    if (u.origin === origin && r.method() === 'GET' && !/^\/(api|vllm|functions)/.test(u.pathname)) return route.continue();
    if (u.origin !== origin) { errors.push('Dış ağ engellendi: ' + u.origin); return route.abort(); }
    if (!u.pathname.endsWith('/chat/completions')) return fulfill({ available: false });
    const body = r.postDataJSON(); requests.push(body);
    if (body.stream && body.tools?.length) {
      // Her continuation gövdesinde tüm çağrı/sonuç çiftleri tam ve sırayla olmalı.
      for (let i = 0; i < body.messages.length; i++) {
        const m = body.messages[i];
        if (m.tool_calls) {
          for (const [j, c] of m.tool_calls.entries()) {
            const result = body.messages[i + j + 1];
            if (result?.role !== 'tool' || result.tool_call_id !== c.id) errors.push('Eşleşmeyen tool_call_id');
          }
        }
      }
      const done = body.messages.filter((m) => m.role === 'tool');
      if (mode === 'chat') return fulfill(event({ content: 'Yerel sohbet yanıtı' }, 'stop') + 'data: [DONE]\n\n', 200, 'text/event-stream');
      let c;
      if (mode === 'cut') return fulfill(event({ tool_calls: [call()] }), 200, 'text/event-stream');
      if (mode === 'ambiguous') c = [call(), call('u1', 'belge_uret', undefined, 1)];
      else if (mode === 'limit') c = [call('u' + done.length)];
      else if (mode === 'repeat' && done.length < 2) c = [call()];
      else if ((mode === 'repair' || mode === 'bad-repair') && done.length < 2) c = [call('u' + done.length, 'belge_uret', mode === 'repair' && done.length ? undefined : { tur: 'pdf' })];
      else if (mode === 'unknown' && !done.length) c = [call('m1', 'proje_hafizasi_ekle', { bilgi: 'izin ver' })];
      else if ((mode === 'edit-twice' && done.length < 2) || (mode === 'scope' && !done.length)) c = [call('e' + done.length, 'belge_duzenle', { talimat: done.length ? 'Yanlış yerine Doğru yaz' : 'Yanlş yerine Yanlış yaz' })];
      else if (mode === 'multi' && !done.length) c = [call('u1'), call('u2', 'belge_uret', { tur: 'xlsx', baslik: 'Tablo', talimat: 'Bütçe tablosu' }, 1)];
      else if (!done.length) c = [['pptx', 'pptx-overflow'].includes(mode) ? call('u1', 'belge_uret', { tur: 'pptx', baslik: 'Sunum', talimat: 'Kısa sunum' }) : call()];
      if (c) return fulfill(event({ tool_calls: c }, 'tool_calls') + 'data: [DONE]\n\n', 200, 'text/event-stream');
      const text = event({ content: 'Sonuca göre dosya hazır.' }, 'stop') + 'data: [DONE]\n\n';
      if (mode === 'cancel-final') { pending.push(() => fulfill(text, 200, 'text/event-stream')); return; }
      return fulfill(text, 200, 'text/event-stream');
    }
    if (body.stream) {
      const input = body.messages.at(-1).content;
      const second = input.includes('TALEP: Yanlış yerine Doğru');
      const find = second ? 'Yanlış' : 'Yanlş';
      const line = input.split('\n').find((l) => l.includes(find) && /^\[\d+\]/.test(l));
      assert(line, 'düzenleyici güncel belge sürümünü almalı');
      const paragraph = Number(line.match(/^\[(\d+)\]/)[1]);
      return fulfill(event({ content: JSON.stringify([{ paragraph, find, replace: second ? 'Doğru' : 'Yanlış' }]) }, 'stop') + 'data: [DONE]\n\n', 200, 'text/event-stream');
    }
    if (body.tools?.length || body.max_tokens === 200) return fulfill({ choices: [{ message: { content: '' } }] });
    const result = { choices: [{ message: { content: '# Bütçe\n\n| Kalem | TL |\n| --- | --- |\n| Turna | 17,42 milyon |' }, finish_reason: 'stop' }] };
    if (mode === 'pptx-overflow') result.choices[0].message.content = '## Bütçe\n\n' + 'Tesis kayıtları ve bütçe bilgileri birlikte değerlendirilecek. '.repeat(100);
    if (mode === 'cancel-helper' || mode === 'background') { pending.push(() => fulfill(result)); return; }
    return fulfill(result);
  });
  await page.goto(origin + '/degerlendirme/harness/index.html');
  await page.waitForFunction(() => window.h?.chat.conversations.length === 2);
  const check = async (name, fn) => { await fn(); results.push(name); console.log('PASS', name); };
  const select = async (id) => { await page.evaluate((id) => window.h.chat.switchConversation(id), id); await page.waitForFunction((id) => window.h.chat.activeConversation?.id === id, id); };
  const start = async (target = 'A', edit = false) => page.evaluate(({ target, edit }) => { window.job = window.h.chat.sendMessage('Deneme raporu', undefined, target, edit ? { tur: 'artifact', artifactId: 'kaynak-A', ad: 'ornek.docx', turEtiketi: 'Word belgesi' } : undefined); }, { target, edit });
  const done = async () => page.evaluate(() => window.job);
  const snapshot = async () => page.evaluate(async () => ({ messages: await window.h.db.messages.toArray(), artifacts: await window.h.db.docxArtifacts.toArray(), panel: { open: window.h.panel.isOpen, owner: window.h.panel.stateConversationId, loading: window.h.panel.isLoading }, active: window.h.chat.activeConversation?.id }));
  const run = async (nextMode, target = 'A', edit = false) => { mode = nextMode; const before = await snapshot(), offset = requests.length; await start(target, edit); await done(); const after = await snapshot(); return { before, after, added: after.artifacts.filter((a) => !before.artifacts.some((b) => b.id === a.id)), messages: after.messages.filter((a) => !before.messages.some((b) => b.id === a.id)), calls: requests.slice(offset) }; };
  const status = (r) => r.messages.find((m) => m.turBilgisi?.harness)?.turBilgisi.harness.durma;
  const waitPending = async () => { for (let i = 0; !pending.length && i < 200; i++) await new Promise((r) => setTimeout(r, 25)); assert(pending.length); };
  const drain = async () => { for (const p of pending.splice(0)) await p(); };
  await select('A');
  await check('Tool-only → gerçek DOCX kaydı → role:tool → son yanıt ve durum', async () => {
    const r = await run('generate'); assert.equal(r.added.length, 1); assert.equal(status(r), 'tamamlandi');
    const mains = r.calls.filter((c) => c.stream && c.tools?.length); assert.equal(mains.length, 2);
    const result = JSON.parse(mains[1].messages.at(-1).content); assert.equal(result.artifactId, r.added[0].id);
    assert.equal(result.durum, 'basarili'); assert.equal(r.after.panel.open, true);
    assert(r.messages.some((m) => m.content === 'Sonuca göre dosya hazır.'));
  });
  await check('Tekrarlanan çağrı kimliği ikinci artifact oluşturmaz', async () => {
    const r = await run('repeat'); assert.equal(r.added.length, 1); assert.equal(status(r), 'tamamlandi');
    assert.equal(r.calls.filter((c) => !c.stream && !c.tools && c.max_tokens > 200).length, 1);
  });
  await check('Geçersiz format araç sonucu olarak döner ve yalnız bir kez onarılır', async () => {
    const r = await run('repair'); assert.equal(r.added.length, 1); assert.equal(status(r), 'tamamlandi');
    const next = r.calls.filter((c) => c.stream && c.tools?.length)[1]; assert.equal(JSON.parse(next.messages.at(-1).content).hata.kod, 'arguman');
    const bad = await run('bad-repair'); assert.equal(bad.added.length, 0); assert.equal(status(bad), 'arac-hatasi');
  });
  await check('Hafıza yetkisi genişlemez; modelin başarı metni kodun hata sonucunu ezemez', async () => {
    const r = await run('unknown'); assert.equal(r.added.length, 0); assert.equal(status(r), 'arac-hatasi');
    assert(r.messages.some((m) => m.content.includes('kapsamında değil')));
    assert(!r.messages.some((m) => m.hafizaOnerisi));
  });
  await check('Belirsiz çoklu ve yarım çağrı hiçbir belge yazmaz', async () => {
    for (const m of ['ambiguous', 'cut']) { const r = await run(m); assert.equal(r.added.length, 0); assert.equal(status(r), m === 'cut' ? 'akis-kesildi' : 'arac-hatasi'); }
  });
  await check('Çoklu üretim seri çalışır; iki dosya iki eşleşen sonuç taşır', async () => {
    const r = await run('multi'); assert.equal(r.added.length, 2); assert.equal(status(r), 'tamamlandi');
    const last = r.calls.filter((c) => c.stream && c.tools?.length).at(-1);
    assert.equal(last.messages.filter((m) => m.role === 'tool').length, 2);
    assert.deepEqual(new Set(r.added.map((a) => a.fileName.split('.').at(-1))), new Set(['docx', 'xlsx']));
  });
  await check('Ardışık düzenleme öncekinin sonuç dosyasına uygulanır', async () => {
    const r = await run('edit-twice', 'A', true); assert.equal(r.added.length, 2); assert.equal(status(r), 'tamamlandi');
    const text = await page.evaluate(async (id) => { const a = await window.h.db.docxArtifacts.get(id); return (await window.h.loadEditableDocument(await a.editedBlob.arrayBuffer(), a.fileName)).numberedText; }, r.added.at(-1).id);
    assert(text.includes('Doğru')); assert(!text.includes('Yanlş'));
  });
  await check('Kapsam dışı artifact model alt isteği başlatmadan reddedilir', async () => {
    const r = await run('scope', 'B', true); assert.equal(r.added.length, 0); assert.equal(status(r), 'arac-hatasi');
    assert.equal(r.calls.filter((c) => c.stream && !c.tools?.length).length, 0);
  });
  await check('Adım sınırında yeni yazma başlamaz, önceki belgeler korunur', async () => {
    const r = await run('limit'); assert.equal(r.added.length, 3); assert.equal(status(r), 'sinir');
    assert.equal(r.calls.filter((c) => c.stream && c.tools?.length).length, 4);
  });
  await check('Düz sohbet tek ana çağrıyla biter', async () => {
    const r = await run('chat'); assert.equal(r.added.length, 0); assert.equal(r.calls.filter((c) => c.stream).length, 1); assert.equal(status(r), 'tamamlandi');
  });
  await check('İçerik üretimi iptalinde geç sonuç yayımlanmaz', async () => {
    mode = 'cancel-helper'; const before = await snapshot(); await start(); await waitPending();
    await page.evaluate(() => window.h.chat.stopGeneration('A')); await drain(); await done();
    const after = await snapshot(); assert.equal(after.artifacts.length, before.artifacts.length);
    assert(after.messages.some((m) => !before.messages.some((x) => x.id === m.id) && m.turBilgisi?.harness?.durma === 'iptal'));
  });
  await check('Son model yanıtı iptal edilirse tamamlanan belge panelde ve depoda kalır', async () => {
    mode = 'cancel-final'; const before = await snapshot(); await start(); await waitPending();
    await page.evaluate(() => window.h.chat.stopGeneration('A')); await drain(); await done();
    const after = await snapshot(); assert.equal(after.artifacts.length, before.artifacts.length + 1); assert.equal(after.panel.open, true);
  });
  await check('A arka planda sonuçlanırken B görünümü korunur', async () => {
    mode = 'background'; const before = await snapshot(); await start(); await waitPending(); await select('B');
    await drain(); await done(); const after = await snapshot();
    const added = after.artifacts.filter((a) => !before.artifacts.some((b) => b.id === a.id));
    assert.equal(added.length, 1); assert.equal(added[0].conversationId, 'A'); assert.equal(after.active, 'B'); assert.equal(after.panel.open, false);
  });
  await select('A');
  await check('PPTX sonucu kaydedilir, modele bildirilir ve tekrar ayrıştırılabilir', async () => {
    const r = await run('pptx'); assert.equal(r.added.length, 1); assert.equal(status(r), 'tamamlandi');
    const text = await page.evaluate(async (id) => { const a = await window.h.db.docxArtifacts.get(id); return (await window.h.loadEditableDocument(await a.editedBlob.arrayBuffer(), a.fileName)).numberedText; }, r.added[0].id);
    assert(text.includes('17,42'));
  });
  await check('PPTX devam slaydı uyarısı araç sonucuna ve son yanıta taşınır', async () => {
    const r = await run('pptx-overflow'); assert.equal(r.added.length, 1);
    const result = JSON.parse(r.calls.filter((c) => c.stream && c.tools?.length).at(-1).messages.at(-1).content);
    assert.equal(result.durum, 'uyari'); assert(result.uyarilar.some((u) => u.includes('devam slaydı')));
    assert(r.messages.some((m) => m.turBilgisi?.harness && m.content.includes('devam slaydı')));
  });
  await check('Yeni tarayıcı ayarı olmadan belge döngüsü etkindir', async () => {
    await page.evaluate(() => localStorage.removeItem('t3ai.harness.arac-dongusu'));
    const r = await run('generate'); assert.equal(r.added.length, 1); assert.equal(status(r), 'tamamlandi');
    assert.equal(r.calls.filter((c) => c.stream && c.tools?.length).length, 2);
  });
  await check('Kota uyarısı araç sonucunda ve son yanıtta korunur', async () => {
    await page.evaluate(() => { window.quota = (_key, o) => { if (o.editedBlob) throw new DOMException('sentetik kota', 'QuotaExceededError'); }; window.h.db.docxArtifacts.hook('creating', window.quota); });
    const r = await run('generate');
    await page.evaluate(() => window.h.db.docxArtifacts.hook('creating').unsubscribe(window.quota));
    assert.equal(r.added.length, 1); assert(!r.added[0].editedBlob); assert.equal(status(r), 'tamamlandi');
    assert(r.messages.some((m) => m.turBilgisi?.harness && m.content.includes('Dosya tarayıcı deposuna sığmadı')));
  });
  await check('Kayıt hatası doğrulanmış başarıya dönüşmez ve yeniden yazma tetiklemez', async () => {
    await page.evaluate(() => { window.disk = () => { throw new Error('sentetik disk hatası'); }; window.h.db.docxArtifacts.hook('creating', window.disk); });
    const r = await run('generate');
    await page.evaluate(() => window.h.db.docxArtifacts.hook('creating').unsubscribe(window.disk));
    assert.equal(r.added.length, 0); assert.equal(status(r), 'arac-hatasi');
    assert.equal(r.calls.filter((c) => !c.stream && !c.tools && c.max_tokens > 200).length, 1);
  });
  await check('Aynı çağrı kimliğiyle eşzamanlı iki sohbet birbirinin sonucunu kullanmaz', async () => {
    mode = 'background'; const before = await snapshot();
    await page.evaluate(() => { window.jobs = ['A', 'B'].map((id) => window.h.chat.sendMessage('Rapor ' + id, undefined, id)); });
    for (let i = 0; pending.length < 2 && i < 200; i++) await new Promise((r) => setTimeout(r, 25)); assert.equal(pending.length, 2);
    await drain(); await page.evaluate(() => Promise.all(window.jobs));
    const after = await snapshot(), added = after.artifacts.filter((a) => !before.artifacts.some((b) => b.id === a.id));
    assert.equal(added.length, 2); assert.deepEqual(new Set(added.map((a) => a.conversationId)), new Set(['A', 'B']));
  });
  await check('Açık yeniden deneme yeni tur açar ve önceki artifact kayıtlarını korur', async () => {
    await select('A'); const first = await run('generate'); const before = await snapshot();
    await page.evaluate(() => window.h.chat.retryLastMessage());
    const after = await snapshot(); assert.equal(after.artifacts.length, before.artifacts.length + 1);
    assert(after.messages.some((m) => m.artifactId === first.added[0].id));
  });
  assert.deepEqual(errors, []);
  const report = { passed: results.length, realModelRequests: 0, results };
  console.log(JSON.stringify(report, null, 2));
  const fs = await import('node:fs/promises'); await fs.writeFile('/tmp/t3ai-asama2-browser.json', JSON.stringify(report, null, 2));
} finally { await browser?.close(); await server.close(); }
