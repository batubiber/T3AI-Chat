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
let mode = 'generate', firstFailed = false;
const event = (delta, finish_reason = null) => `data: ${JSON.stringify({ choices: [{ delta, finish_reason }] })}\n\n`;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await (playwright.chromium ?? playwright.default.chromium).launch({ headless: true, ...(process.env.HARNESS_CHROME_PATH ? { executablePath: process.env.HARNESS_CHROME_PATH } : {}) });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('pageerror', (e) => { errors.push(e.message); console.error('PAGE', e.message); });
  page.setDefaultTimeout(15000);
  await context.route('**/*', async (route) => {
    const r = route.request(), u = new URL(r.url());
    const fulfill = (body, status = 200, contentType = 'application/json') => route.fulfill({ status, contentType, body: typeof body === 'string' ? body : JSON.stringify(body) }).catch(() => {});
    // Yalnız localhost'taki statik test uygulamasının GET'leri ağdan alınır.
    if (u.origin === origin && r.method() === 'GET' && !/^\/(api|vllm|functions)/.test(u.pathname)) return route.continue();
    if (u.origin !== origin) { errors.push('Engellenen dış ağ isteği: ' + u.origin); return route.abort(); }
    if (!u.pathname.endsWith('/chat/completions')) return fulfill({ available: false });
    const body = r.postDataJSON();
    requests.push({ ...body, url: u.pathname, headers: r.headers() });
    if (mode === 'fallback' && body.stream && !firstFailed) { firstFailed = true; return fulfill({ error: 'unavailable' }, 503); }
    if (mode === 'overflow' && body.stream && !firstFailed) { firstFailed = true; return fulfill({ error: { message: 'maximum context length exceeded' } }, 400); }
    if (body.stream && body.tools?.length) {
      let s;
      if (body.messages.some((m) => m.role === 'tool')) s = event({ content: 'Belge işlemi tamamlandı.' }, 'stop');
      else if (['fallback', 'overflow', 'chat'].includes(mode)) s = event({ content: 'İstanbul: yerel yanıt 🤖' }, 'stop');
      else if (mode === 'edit') s = event({ tool_calls: [{ index: 0, id: 'edit-1', function: { name: 'belge_duzenle', arguments: JSON.stringify({ talimat: 'Yanlş yerine Yanlış yaz' }) } }] }, 'tool_calls');
      else s = event({ content: 'Belgeyi hazırlıyorum.' }) + event({ tool_calls: [{ index: 0, id: 'uretim-1', function: { name: 'belge_uret', arguments: JSON.stringify({ tur: 'pptx', baslik: 'Bütçe', talimat: 'Kısa sunum' }) } }] }, 'tool_calls');
      if (mode === 'broken') s = s.replace(/"finish_reason":"tool_calls"/, '"finish_reason":null');
      else s += 'data: [DONE]\n\n';
      return fulfill(s, 200, 'text/event-stream');
    }
    if (body.stream) {
      // Gerçek DOCX parser/validator/apply/preview çalışır, yalnız model yanıtı taklittir.
      pending.push(() => fulfill(event({ content: '[{"paragraph":1,"find":"Yanlş","replace":"Yanlış"}]' }, 'stop') + 'data: [DONE]\n\n', 200, 'text/event-stream'));
      return;
    }
    if (body.tools?.length) return fulfill({ choices: [{ message: { content: '' } }] }); // bellek yan isteği
    if (body.max_tokens === 200) return fulfill({ choices: [{ message: { content: 'Yerel test' } }] });
    pending.push(() => fulfill({ choices: [{ message: { content: '# Bütçe\n\n## Sonuç\n- 17,42 milyon TL\n\n## Sonraki adım\n- Plan' }, finish_reason: 'stop' }] }));
  });
  await page.goto(origin + '/degerlendirme/harness/index.html');
  await page.waitForFunction(() => window.h?.chat.conversations.length === 2);
  const check = async (name, fn) => { await fn(); results.push(name); console.log('PASS', name); };
  const select = async (id) => { await page.evaluate((id) => window.h.chat.switchConversation(id), id); await page.waitForFunction((id) => window.h.chat.activeConversation?.id === id, id); };
  const start = async (content, target, edit = false) => page.evaluate(({ content, target, edit }) => {
    window.job = window.h.chat.sendMessage(content, undefined, target, edit ? { tur: 'artifact', artifactId: 'kaynak-A', ad: 'ornek.docx', turEtiketi: 'Word belgesi' } : undefined);
  }, { content, target, edit });
  const drain = async () => { for (const p of pending.splice(0)) await p(); };
  const waitPending = async () => { for (let i = 0; !pending.length && i < 200; i++) await new Promise((r) => setTimeout(r, 25)); assert(pending.length, 'model alt isteği başlamalı'); };
  const done = async () => page.evaluate(() => window.job);
  const snapshot = async () => page.evaluate(async () => ({ messages: await window.h.db.messages.toArray(), artifacts: await window.h.db.docxArtifacts.toArray(), panel: { open: window.h.panel.isOpen, owner: window.h.panel.stateConversationId }, active: window.h.chat.activeConversation?.id }));
  await check('A kaynağı ve geçmişi üreticiye taşınır; B ekranı korunur; PPTX yeniden açılır', async () => {
    await select('A'); await start('Kaynağa göre sunum hazırla', 'A'); await waitPending();
    const generated = requests.find((r) => !r.stream && r.max_tokens > 200 && !r.tools);
    const payload = JSON.stringify(generated.messages);
    assert(payload.includes('17,42')); assert(payload.includes('kısa başlıklar')); assert(payload.includes('Para birimi TL')); assert(payload.includes('yönetim kurulu'));
    assert(!payload.includes('98,76')); assert(!payload.includes('B sohbete özel'));
    await select('B');
    await page.evaluate(() => window.h.chat.setSelectedModel('gemma-4-31b'));
    await drain(); await done();
    const s = await snapshot();
    assert.equal(s.active, 'B'); assert.equal(s.panel.open, false);
    const a = s.artifacts.find((a) => a.fileName.endsWith('.pptx')); assert.equal(a.conversationId, 'A');
    assert(s.messages.some((m) => m.artifactId === a.id && m.conversationId === 'A' && m.modelId === 'glm-5.2'));
    const text = await page.evaluate(async (id) => { const a = await window.h.db.docxArtifacts.get(id); return (await window.h.loadEditableDocument(await a.editedBlob.arrayBuffer(), a.fileName)).numberedText; }, a.id);
    assert(text.includes('17,42'));
    await page.evaluate(() => window.h.chat.setSelectedModel('glm-5.2'));
  });
  await check('Durdur belge üretimini keser; geç sonuç kart/dosya veya çift asistan oluşturmaz', async () => {
    await select('A'); const before = await snapshot();
    await start('Bir sunum daha', 'A'); await waitPending();
    await page.evaluate(() => window.h.chat.stopGeneration('A'));
    await drain(); await done();
    const after = await snapshot(); assert.equal(after.artifacts.length, before.artifacts.length);
    assert.equal(after.messages.filter((m) => m.role === 'assistant').length, before.messages.filter((m) => m.role === 'assistant').length + 1);
    assert.equal(after.panel.open, false);
  });
  await check('Arka plandaki DOCX düzenlemesi A üzerinde çalışır ve kaydedilir', async () => {
    mode = 'edit'; await select('B'); await start('Yazım hatasını düzelt', 'A', true); await waitPending(); await drain(); await done();
    const s = await snapshot(); const a = s.artifacts.filter((a) => a.id !== 'kaynak-A' && a.fileName === 'ornek.docx')[0];
    assert(a, 'düzenlenmiş artifact'); assert.equal(a.conversationId, 'A'); assert.equal(s.panel.open, false);
    const text = await page.evaluate(async (id) => { const a = await window.h.db.docxArtifacts.get(id); return (await window.h.loadEditableDocument(await a.editedBlob.arrayBuffer(), a.fileName)).numberedText; }, a.id);
    assert(text.includes('Yanlış'));
  });
  await check('İki sohbet eşzamanlı: A iptal olurken B tamamlanır', async () => {
    mode = 'generate'; await select('A');
    const before = await snapshot();
    await page.evaluate(() => { window.jobs = ['A', 'B'].map((id) => window.h.chat.sendMessage('Sunum ' + id, undefined, id)); });
    for (let i = 0; pending.length < 2 && i < 200; i++) await new Promise((r) => setTimeout(r, 25));
    assert.equal(pending.length, 2);
    await page.evaluate(() => window.h.chat.stopGeneration('A')); await select('B'); await drain();
    await page.evaluate(() => Promise.all(window.jobs));
    const after = await snapshot(), added = after.artifacts.filter((a) => !before.artifacts.some((b) => b.id === a.id));
    assert.equal(added.length, 1); assert.equal(added[0].conversationId, 'B');
  });
  await check('Yarım SSE sonrası belge aracı çalıştırılmaz ve mesaj kesik işaretlenir', async () => {
    mode = 'broken'; const count = requests.length; await start('Eksik sunum', 'B'); await done();
    assert.equal(requests.slice(count).filter((r) => !r.stream && !r.tools && r.max_tokens > 200).length, 0);
    assert((await snapshot()).messages.some((m) => m.kesildi));
  });
  await check('503 yedeği hedef modelin pencere/parametrelerini ve kayıt kimliğini kullanır', async () => {
    mode = 'fallback'; firstFailed = false;
    await page.evaluate(() => window.h.chat.setSelectedModel('gemma-4-31b'));
    await page.waitForFunction(() => window.h.chat.selectedModel === 'gemma-4-31b');
    const offset = requests.length; await start('Yedek denetimi', 'B'); await done();
    const calls = requests.slice(offset).filter((r) => r.stream); assert.equal(calls.length, 2);
    assert.equal(calls[0].model, 'gemma-4-31b'); assert.equal(calls[1].model, 'glm-5.2');
    assert.deepEqual(calls[1].chat_template_kwargs, { reasoning_effort: 'high' });
    assert.equal(calls[1].top_k, undefined);
    const m = (await snapshot()).messages.filter((m) => m.content.includes('İstanbul:')).pop();
    assert.equal(m.modelId, 'glm-5.2'); assert.equal(m.turBilgisi.pencere, 131072);
  });
  await check('400 taşma tek telafi çağrısından sonra toparlanır', async () => {
    mode = 'overflow'; firstFailed = false; const offset = requests.length;
    await start('Taşma denetimi', 'B'); await done(); assert.equal(requests.slice(offset).filter((r) => r.stream).length, 2);
  });
  await check('İptal/silinmiş sohbet kayıtları ve kapsam dışı artifact reddedilir', async () => {
    const r = await page.evaluate(async () => {
      const before = await window.h.db.docxArtifacts.count();
      const c = new AbortController(); c.abort();
      const input = { islem: { runId: 'iptal', sohbetId: 'A', modelId: 'glm-5.2', signal: c.signal }, fileName: 'iptal.docx', instruction: '', editedBlob: new Blob(['x']), editCount: 1, previewHtml: '' };
      let iptal, silindi;
      try { await window.h.record(input); } catch (e) { iptal = e.name; }
      try { await window.h.record({ ...input, islem: { ...input.islem, sohbetId: 'silinmis', signal: new AbortController().signal } }); } catch (e) { silindi = e.message; }
      return { before, after: await window.h.db.docxArtifacts.count(), iptal, silindi };
    });
    assert.equal(r.iptal, 'AbortError'); assert(r.silindi.includes('silinmiş')); assert.equal(r.before, r.after);
    mode = 'edit'; const offset = requests.length; await start('Yanlış sohbetteki belgeyi düzelt', 'B', true); await done();
    assert.equal(requests.slice(offset).filter((r) => r.stream && !r.tools?.length).length, 0);
  });
  await check('Kayıt sırasında iptal tüm dosya/kart işlemini geri alır', async () => {
    const r = await page.evaluate(async () => {
      const db = window.h.db;
      const before = [await db.docxArtifacts.count(), await db.messages.count()];
      const c = new AbortController();
      const hook = () => { c.abort(); };
      db.messages.hook('creating', hook);
      let error;
      try { await window.h.record({ islem: { runId: 'transaction-abort', sohbetId: 'A', modelId: 'glm-5.2', signal: c.signal }, fileName: 'abort.docx', instruction: '', editCount: 1, editedBlob: new Blob(['x']), previewHtml: '' }); }
      catch (e) { error = e.name; }
      finally { db.messages.hook('creating').unsubscribe(hook); }
      return { before, after: [await db.docxArtifacts.count(), await db.messages.count()], error };
    });
    assert.equal(r.error, 'AbortError'); assert.deepEqual(r.after, r.before);
  });
  await check('Kota hatası dosyasız kartı uyarıyla kaydeder; diğer kayıt hataları başarı oluşturmaz', async () => {
    const r = await page.evaluate(async () => {
      const db = window.h.db;
      const input = { islem: { runId: 'quota', sohbetId: 'A', modelId: 'gemma-4-31b', signal: new AbortController().signal }, fileName: 'quota.docx', instruction: '', editCount: 1, editedBlob: new Blob(['x']), previewHtml: '' };
      const quota = (_key, obj) => { if (obj.editedBlob) throw new DOMException('sentetik kota', 'QuotaExceededError'); };
      db.docxArtifacts.hook('creating', quota);
      let result;
      try { result = await window.h.record(input); }
      finally { db.docxArtifacts.hook('creating').unsubscribe(quota); }
      const a = await db.docxArtifacts.get(result.assistantMsg.artifactId);
      const before = [await db.docxArtifacts.count(), await db.messages.count()];
      const failure = () => { throw new Error('sentetik disk hatası'); };
      db.messages.hook('creating', failure);
      let error;
      try { await window.h.record({ ...input, fileName: 'failure.docx' }); } catch (e) { error = e.message; }
      finally { db.messages.hook('creating').unsubscribe(failure); }
      return { hasBlob: !!a.editedBlob, saved: result.blobSaved, note: result.assistantMsg.content, before, after: [await db.docxArtifacts.count(), await db.messages.count()], error };
    });
    assert.equal(r.saved, false); assert.equal(r.hasBlob, false); assert(r.note.includes('tarayıcı deposuna sığmadı'));
    assert(r.error.includes('sentetik disk')); assert.deepEqual(r.before, r.after);
  });
  await check('Panelden ilk belge işi yeni sohbet oluşturur ve aynı Durdur kaydını kullanır', async () => {
    mode = 'edit';
    await page.evaluate(() => window.h.chat.goToNewChatScreen());
    await page.waitForFunction(() => !window.h.chat.activeConversation);
    await page.evaluate(() => { window.job = window.h.panel.openAndRun(window.h.sourceFile, 'Yanlş yerine Yanlış'); });
    await waitPending();
    const active = (await snapshot()).active;
    assert(active && active !== 'A' && active !== 'B');
    await page.evaluate(() => window.h.panel.stop()); await drain(); await done();
    const s = await snapshot(); assert(!s.artifacts.some((a) => a.conversationId === active));
    assert.equal(s.panel.open, false);
    await page.evaluate(() => { window.job = window.h.panel.openAndRun(window.h.sourceFile, 'Yanlş yerine Yanlış'); });
    await waitPending(); await drain(); await done();
    const after = await snapshot(); assert(after.artifacts.some((a) => a.conversationId === active));
    assert.equal(after.panel.owner, active);
  });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: results.length, realModelRequests: 0, results }, null, 2));
} finally { await browser?.close(); await server.close(); }
