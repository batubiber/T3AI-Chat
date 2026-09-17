const express = require('express');
const cors = require('cors');
const path = require('path');
// Load .env from root directory (one level up from server folder)
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { modelUcunaGonder } = require('./sunucuModelAdi');

const app = express();
// req.ip nginx'in arkasında DOĞRU istemciyi göstersin. Bu ayar olmadan tüm
// istekler nginx'in IP'sinden geliyor gibi görünüyor ve admin giriş sayacı
// kişi başı değil KÜRESEL çalışıyor: bir kişi beş yanlış denemeyle girişi
// herkese kapatabiliyor.
//
// Sahtecilik riski yok: nginx $proxy_add_x_forwarded_for ile gerçek eşi
// listenin SONUNA ekliyor, trust proxy 1 de sondakini alıyor; istemcinin
// uydurduğu ön ekler yok sayılıyor.
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

// Environment variables
const VLLM_ENDPOINT = process.env.VLLM_ENDPOINT || 'http://vllm-a.example:8000/v1/chat/completions'; // GLM 5.2 (fallback; ana sohbet nginx /vllm-8001/ üzerinden gider)
const VLLM_API_KEY = process.env.VLLM_API_KEY || 'token-yok';
const MODEL_NAME = process.env.VITE_MODEL_NAME || 'glm-5.2';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
// GLM gateway x-user-id header'ı ister; sabit id (nginx de /vllm-8001/'de aynısını enjekte eder).
const GLM_USER_ID = process.env.GLM_USER_ID || 't3ai-chat';

// Özetleme/başlık gemma-4-31b kullanır (SUMMARY_* env ile ayarlanır)
const SUMMARY_VLLM_ENDPOINT = process.env.SUMMARY_VLLM_ENDPOINT || VLLM_ENDPOINT;

// --- Oturum başlığı (KV-cache yönlendirme) ---
//
// GLM gateway REJECT MODE'da: X-Claude-Code-Session-Id olmadan gelen
// /v1/chat/completions isteğine 400 dönüyor. Bu backend vLLM isteğini sıfırdan
// kurduğu için istemcinin başlığı kendiliğinden ileri GİTMİYOR — aşağıdaki
// yardımcı onu taşıyor.
//
// SUMMARY_VLLM_ENDPOINT normalde Gemma'ya gider ve orada reject
// mode yok; ama env verilmezse yukarıdaki satır onu VLLM_ENDPOINT'e, yani
// gateway'e düşürüyor. Bu yüzden başlık özet/başlık/moderasyon çağrılarına da
// konuyor: fazladan header zararsız, eksik header isteği tamamen kaybettirir.
const OTURUM_BASLIGI = 'X-Claude-Code-Session-Id';

// İstemci başlık yollamadığında kullanılan sabit anahtar. Süreç boyunca
// değişmiyor: her istekte yeni üretilseydi gateway her seferinde başka node'a
// yönlendirir ve prefix cache hiç tutmazdı.
const YEDEK_OTURUM_ANAHTARI = (() => {
  let s = '';
  while (s.length < 24) s += Math.random().toString(36).slice(2);
  return s.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
})();

/**
 * İstemciden gelen oturum başlığını yukarı taşır.
 *
 * Tek üretici bizim frontend'imiz (src/lib/sessionHeader.ts) ve o HER ZAMAN
 * tam 24 karakter alfanümerik yolluyor. Başka bir şey gelirse ona güvenmiyoruz:
 * değer doğrudan yukarı akan bir header, temizlenmeden geçirilmemeli.
 */
function oturumBasligi(req) {
  const gelen = req.headers[OTURUM_BASLIGI.toLowerCase()];
  const sade = typeof gelen === 'string' ? gelen.replace(/[^a-zA-Z0-9]/g, '') : '';
  if (sade.length === 24) return { [OTURUM_BASLIGI]: sade };
  if (gelen) console.warn(`⚠️ Beklenmeyen oturum anahtarı biçimi, yedeğe düşülüyor`);
  return { [OTURUM_BASLIGI]: YEDEK_OTURUM_ANAHTARI };
}
const SUMMARY_MODEL_NAME = process.env.SUMMARY_MODEL_NAME || MODEL_NAME;
const DEFAULT_TEMPERATURE = parseFloat(process.env.VITE_DEFAULT_TEMPERATURE) || 0.7;
const DEFAULT_MAX_TOKENS = process.env.VITE_DEFAULT_MAX_TOKENS ? parseInt(process.env.VITE_DEFAULT_MAX_TOKENS) : 8192;
const MAX_OUTPUT_TOKENS_CAP = parseInt(process.env.MAX_OUTPUT_TOKENS_CAP) || 16384;
const MODEL_MAX_CONTEXT_LENGTH = parseInt(process.env.VITE_MODEL_MAX_CONTEXT_LENGTH) || 262144;
const DEFAULT_TOP_P = parseFloat(process.env.VITE_DEFAULT_TOP_P) || 0.95;
const DEFAULT_TOP_K = parseInt(process.env.VITE_DEFAULT_TOP_K) || 20;
const DEFAULT_MIN_P = parseFloat(process.env.VITE_DEFAULT_MIN_P) || 0;

const crypto = require('crypto');
const fs = require('fs');
const { jetonUret, jetonDogrula, JETON_OMRU_MS } = require('./adminJeton');

// ASLA VITE_ ÖNEKLİ OLMAYACAK: VITE_* derleme zamanında JS paketine gömülür
// ve parola tarayıcıdan okunabilir hale gelir. Eski VITE_ADMIN_PASSWORD tam
// olarak bu yüzden kaldırıldı.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_ACIK = ADMIN_PASSWORD.trim() !== '';

// Sır verilmezse paroladan türetiliyor: yeni bir zorunlu ortam değişkeni
// doğmuyor, backend yeniden başlayınca jetonlar yaşıyor, parola değişince
// hepsi kendiliğinden geçersizleşiyor.
const ADMIN_JETON_SIRRI = process.env.ADMIN_TOKEN_SECRET
  || crypto.createHash('sha256').update('t3ai-admin-jeton:' + ADMIN_PASSWORD).digest();

const KULLANIM_LOG_YOLU = process.env.KULLANIM_LOG_YOLU
  || '/var/log/nginx/kullanim/kullanim.log';

/** Sabit zamanlı parola karşılaştırması — düz === karakter karakter kısa devre yapar. */
function parolaDogru(girilen) {
  if (typeof girilen !== 'string') return false;
  const a = Buffer.from(girilen);
  const b = Buffer.from(ADMIN_PASSWORD);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Authorization: Bearer <jeton> doğrular; geçersizse 401 yazıp false döner. */
function adminYetkili(req, res) {
  if (!ADMIN_ACIK) {
    res.status(503).json({ hata: 'Admin özelliği kapalı' });
    return false;
  }
  const baslik = req.headers.authorization || '';
  const jeton = baslik.startsWith('Bearer ') ? baslik.slice(7) : '';
  if (!jetonDogrula(jeton, ADMIN_JETON_SIRRI)) {
    res.status(401).json({ hata: 'Yetkisiz' });
    return false;
  }
  return true;
}

// Kaba kuvvet sayacı: IP -> { adet, pencereBaslangici }. Tek örnek çalışıyor,
// dağıtık sayaca gerek yok.
const girisDenemeleri = new Map();
const DENEME_PENCERESI_MS = 60_000;
const DENEME_SINIRI = 5;

function denemeHakkiVar(ip) {
  const simdi = Date.now();
  const kayit = girisDenemeleri.get(ip);
  if (!kayit || simdi - kayit.pencereBaslangici > DENEME_PENCERESI_MS) {
    girisDenemeleri.set(ip, { adet: 1, pencereBaslangici: simdi });
    return true;
  }
  kayit.adet += 1;
  return kayit.adet <= DENEME_SINIRI;
}

/**
 * Strips <think>...</think> blocks from model output (Qwen reasoning mode)
 */
function stripThinkTags(content) {
  if (!content) return '';
  // Remove complete think blocks
  let cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, '');
  // Remove unclosed think block at the end
  cleaned = cleaned.replace(/<think>[\s\S]*$/g, '');
  return cleaned.trim();
}

const SYSTEM_PROMPT_BASE = process.env.VITE_SYSTEM_PROMPT_BASE || `Sen T3AI'sin - Türk mühendisler tarafından geliştirilen, Türkiye'nin milli yapay zeka asistanı.

Bugünün tarihi: {DATE}
Şu anki saat: {TIME} (Türkiye saati)

Temel özellikerin:
- Türkçe'yi ana dil seviyesinde, doğal ve akıcı kullanırsın
- Türk kültürü, tarihi ve güncel olayları hakkında derin bilgiye sahipsin
- Bilimsel, teknik ve günlük konularda yardımcı olabilirsin
- Matematiksel ifadeleri LaTeX formatında yazarsın (inline için $...$, blok için $$...$$)
- Kod yazarken syntax highlighting için dil belirtirsin

Kullanıcıya her zaman saygılı, yardımsever ve bilgilendirici yanıtlar ver.`;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// System prompt generator
function getSystemPrompt() {
  const now = new Date();
  const turkishDate = now.toLocaleDateString('tr-TR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const turkishTime = now.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit'
  });

  // Replace placeholders in the base prompt
  return SYSTEM_PROMPT_BASE
    .replace(/{DATE}/g, turkishDate)
    .replace(/{TIME}/g, turkishTime);
}

// Chat endpoint (streaming optional)
app.post('/api/chat', async (req, res) => {
  // Create AbortController to cancel vLLM request if client disconnects
  const abortController = new AbortController();
  let isClientDisconnected = false;
  let requestStarted = false;

  // Listen for client disconnect on response (more reliable than req)
  res.on('close', () => {
    // Only abort if request started and response not finished
    if (requestStarted && !res.writableEnded) {
      console.log('⚠️ Client disconnected, aborting vLLM request...');
      isClientDisconnected = true;
      abortController.abort();
    }
  });

  try {
    const { messages, model, temperature, max_tokens, stream, tools, tool_choice } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // OpenRouter model mapping
    const OPENROUTER_MODELS = {
      'qwen3.6-plus': 'qwen/qwen3.6-plus-preview:free',
    };

    const isOpenRouterModel = !!OPENROUTER_MODELS[model];

    if (isOpenRouterModel) {
      // === OpenRouter Route ===
      if (!OPENROUTER_API_KEY) {
        return res.status(500).json({ error: 'OPENROUTER_API_KEY is not configured' });
      }

      const openRouterModel = OPENROUTER_MODELS[model];
      const effectiveTemperature = typeof temperature === 'number' ? temperature : 0.7;
      const effectiveStream = typeof stream === 'boolean' ? stream : false;

      const hasSystemMessage = messages.some((m) => m && m.role === 'system');
      const effectiveMessages = hasSystemMessage
        ? messages
        : [{ role: 'system', content: getSystemPrompt() }, ...messages];

      const openRouterBody = {
        model: openRouterModel,
        messages: effectiveMessages,
        temperature: effectiveTemperature,
        stream: effectiveStream,
        reasoning: { enabled: true },
      };

      if (typeof max_tokens === 'number' && max_tokens > 0) {
        openRouterBody.max_tokens = max_tokens;
      }

      console.log(`📤 OpenRouter request: model=${openRouterModel}, stream=${effectiveStream}`);

      requestStarted = true;

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(openRouterBody),
        signal: abortController.signal,
      });

      if (isClientDisconnected) {
        console.log('⚠️ Client already disconnected, not sending response');
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenRouter API error:', response.status, errorText);
        return res.status(response.status).json({
          error: 'OpenRouter servisi hatası',
          details: errorText,
        });
      }

      if (effectiveStream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');

        if (!response.body) {
          return res.status(500).json({ error: 'No response body' });
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            res.write(chunk);
          }
        } catch (streamError) {
          console.error('OpenRouter stream error:', streamError);
        } finally {
          res.end();
        }
        return;
      }

      const data = await response.json();
      return res.json(data);
    }

    // === Standard vLLM Route ===
    const headers = {
      'Content-Type': 'application/json',
      ...oturumBasligi(req),
    };

    headers['Authorization'] = `Bearer ${VLLM_API_KEY}`;

    const effectiveModel = model || MODEL_NAME;
    const effectiveTemperature = typeof temperature === 'number' ? temperature : DEFAULT_TEMPERATURE;
    const effectiveStream = typeof stream === 'boolean' ? stream : false;
    
    // Backend safety net: clamp max_tokens to prevent vLLM errors
    let effectiveMaxTokens = typeof max_tokens === 'number' ? max_tokens : DEFAULT_MAX_TOKENS;
    
    // Hard cap: never exceed MAX_OUTPUT_TOKENS_CAP
    if (effectiveMaxTokens > MAX_OUTPUT_TOKENS_CAP) {
      console.log(`⚠️ Clamping max_tokens from ${effectiveMaxTokens} to ${MAX_OUTPUT_TOKENS_CAP}`);
      effectiveMaxTokens = MAX_OUTPUT_TOKENS_CAP;
    }
    
    // Safety check: ensure max_tokens + estimated input doesn't exceed context
    const estimatedInputTokens = messages.reduce((sum, m) => sum + Math.ceil((m.content?.length || 0) / 3.5) + 4, 0);
    const maxSafeOutput = MODEL_MAX_CONTEXT_LENGTH - estimatedInputTokens - 1024;
    if (effectiveMaxTokens > maxSafeOutput && maxSafeOutput > 256) {
      console.log(`⚠️ Backend clamp: max_tokens ${effectiveMaxTokens} -> ${maxSafeOutput} (input est: ${estimatedInputTokens})`);
      effectiveMaxTokens = maxSafeOutput;
    }

    const hasSystemMessage = messages.some((m) => m && m.role === 'system');
    const effectiveMessages = hasSystemMessage
      ? messages
      : [{ role: 'system', content: getSystemPrompt() }, ...messages];

    const requestBody = {
      model: effectiveModel,
      messages: effectiveMessages,
      temperature: effectiveTemperature,
      stream: effectiveStream,
      top_p: DEFAULT_TOP_P,
      top_k: DEFAULT_TOP_K,
      min_p: DEFAULT_MIN_P,
    };

    // Only add max_tokens if it's a positive number (vLLM doesn't accept -1)
    if (effectiveMaxTokens > 0) {
      requestBody.max_tokens = effectiveMaxTokens;
    }

    // Add tools and tool_choice if provided
    if (tools) {
      requestBody.tools = tools;
    }
    if (tool_choice) {
      requestBody.tool_choice = tool_choice;
    }

    // Mark request as started for abort handling
    requestStarted = true;

    const response = await fetch(VLLM_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: abortController.signal,
    });

    // Check if client disconnected while waiting for response
    if (isClientDisconnected) {
      console.log('⚠️ Client already disconnected, not sending response');
      return;
    }

    // console.log('📥 Response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('vLLM API error:', response.status, errorText);
      return res.status(response.status).json({
        error: 'AI servisi hatası',
        details: errorText,
      });
    }

    if (effectiveStream) {
      // Set headers for streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!response.body) {
        return res.status(500).json({ error: 'No response body' });
      }

      // Stream the response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
      } catch (streamError) {
        console.error('Stream error:', streamError);
      } finally {
        res.end();
      }

      return;
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    // Handle abort errors (client disconnected)
    if (error.name === 'AbortError' || isClientDisconnected) {
      console.log('🛑 Request aborted (client disconnected)');
      return; // Don't send response, client is gone
    }
    
    console.error('Chat error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }
});

// Summarize endpoint (non-streaming)
app.post('/api/summarize', async (req, res) => {
  const controller = new AbortController();
  const disconnect = () => controller.abort();
  res.on('close', disconnect);
  const timer = setTimeout(() => controller.abort(), 600000);
  try {
    const { messages, existingSummary } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const conversationText = messages
      .map(m => `${m.role === 'user' ? 'Kullanıcı' : 'Asistan'}: ${m.content}`)
      .join('\n\n');

    // Yapılandırılmış özet: "3-4 cümle" yerine, sohbetin gerisini hatırlatacak
    // bilgi-yoğun bölümler. Bölüm yoksa atlanır; kısa ve madde madde tutulur.
    const summaryFormat = `Şu başlıkları kullan (ilgili bilgi yoksa o başlığı atla), kısa ve madde madde yaz:
- Konu/Amaç: kullanıcının ana amacı ve istekleri
- Önemli bilgiler: konuşmada geçen kalıcı gerçekler (isim, tarih, sayı, tercih, tanım, kod/dosya adı)
- Varılan sonuçlar: cevaplanan sorular, alınan kararlar, üzerinde anlaşılanlar
- Açık konular / sonraki adım: cevaplanmamış sorular veya devam eden iş`;

    const summaryPrompt = existingSummary
      ? `Sen bir konuşma özetleyicisisin. Aşağıda mevcut yapılandırılmış özet ve sohbete yeni eklenen mesajlar var. Mevcut özeti yeni mesajlardaki bilgilerle GÜNCELLE: aynı başlık yapısını koru, yeni bilgileri ekle, değişen/çözülen maddeleri güncelle, gereksiz tekrarı sil. Sadece konuşmada gerçekten geçen bilgileri kullan; uydurma.\n\n${summaryFormat}\n\nMevcut özet:\n${existingSummary}\n\nYeni mesajlar:\n${conversationText}`
      : `Sen bir konuşma özetleyicisisin. Aşağıdaki konuşmayı, sohbetin gerisini hatırlayabilmek için yapılandırılmış ve öz bir biçimde özetle. Sadece konuşmada gerçekten geçen bilgileri kullan; uydurma.\n\n${summaryFormat}\n\nKonuşma:\n${conversationText}`;

    const headers = {
      'Content-Type': 'application/json',
      ...oturumBasligi(req),
    };

    headers['Authorization'] = `Bearer ${VLLM_API_KEY}`;

    const response = await modelUcunaGonder(SUMMARY_VLLM_ENDPOINT, SUMMARY_MODEL_NAME, {
      messages: [
        { role: 'system', content: getSystemPrompt() },
        { role: 'user', content: summaryPrompt }
      ],
      stream: false,
      temperature: 0.3,
      max_tokens: 4096,
    }, { headers, signal: controller.signal });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('vLLM API error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: 'Özet oluşturma hatası',
        details: errorText 
      });
    }

    const data = await response.json();
    controller.signal.throwIfAborted();
    const message = data.choices?.[0]?.message;
    // Handle thinking mode: content may be null, use reasoning_content as fallback
    const rawSummary = message?.content || message?.reasoning_content || '';
    const summary = stripThinkTags(rawSummary);

    res.json({ summary });

  } catch (error) {
    if (res.destroyed) return;
    console.error('Summarize error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  } finally {
    clearTimeout(timer);
    res.off('close', disconnect);
  }
});

// Generate chat title endpoint (non-streaming)
app.post('/api/generate-title', async (req, res) => {
  try {
    const { userMessage, assistantMessage } = req.body;

    if (!userMessage) {
      return res.status(400).json({ error: 'User message is required' });
    }

    const prompt = `Aşağıdaki sohbete kısa, öz bir başlık oluştur.
Kurallar:
- Maksimum 6 kelime
- Türkçe yaz
- Emoji kullanma
- Tırnak işareti kullanma

ZORUNLU: Yanıtı SADECE bu JSON formatında ver, başka hiçbir şey yazma:
{"title": "başlık burada"}

Kullanıcı: "${userMessage.slice(0, 500)}"
${assistantMessage ? `Asistan: "${assistantMessage.slice(0, 300)}"` : ''}`;

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VLLM_API_KEY}`,
      ...oturumBasligi(req),
    };

    const response = await modelUcunaGonder(SUMMARY_VLLM_ENDPOINT, SUMMARY_MODEL_NAME, {
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      temperature: 0.3,
      max_tokens: 200,
    }, { headers });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Title generation error:', response.status, errorText);
      return res.status(response.status).json({ error: 'Başlık oluşturma hatası' });
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    // Handle thinking mode: content may be null, use reasoning_content as fallback
    let rawContent = message?.content || message?.reasoning_content || '';
    rawContent = stripThinkTags(rawContent);

    // Try to parse JSON response
    let title = '';
    try {
      // Extract JSON from response (model might add extra text)
      const jsonMatch = rawContent.match(/\{[\s\S]*"title"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        title = parsed.title || '';
      }
    } catch {
      // JSON parse failed, use raw content as fallback
      title = rawContent;
    }

    // Temizlik: tırnak, gereksiz karakterler
    title = title.replace(/^["']|["']$/g, '').trim();

    // Fallback: boş veya çok uzunsa
    if (!title || title.length > 60) {
      title = userMessage.slice(0, 40) + (userMessage.length > 40 ? '...' : '');
    }

    res.json({ title });
  } catch (error) {
    console.error('Generate title error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    model: MODEL_NAME,
    endpoint: VLLM_ENDPOINT.replace(/\/\/.*@/, '//***@') // Hide credentials if any
  });
});

// Runtime config: frontend'in build'e gömülü VITE_ değerleri yerine sunucu
// .env'ini kullanabilmesi için. Prompt değişikliği artık rebuild GEREKTİRMEZ -
// .env'i güncelleyip backend'i restart etmek yeter.
app.get('/api/config', (req, res) => {
  res.json({
    systemPromptBase: process.env.VITE_SYSTEM_PROMPT_BASE || null,
    // Parola artık istemcide olmadığı için admin düğmesinin görünüp
    // görünmeyeceği buradan öğreniliyor. Parolanın KENDİSİ gönderilmiyor.
    adminAcik: ADMIN_ACIK,
  });
});

app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_ACIK) return res.status(503).json({ hata: 'Admin özelliği kapalı' });

  const ip = req.ip || req.socket?.remoteAddress || 'bilinmiyor';
  if (!denemeHakkiVar(ip)) {
    return res.status(429).json({ hata: 'Çok fazla deneme, bir dakika bekleyin' });
  }

  if (!parolaDogru(req.body?.parola)) {
    return res.status(401).json({ hata: 'Parola hatalı' });
  }

  // Doğru parola sayacı sıfırlıyor: yanlış denemeler kullanıcıyı kendi
  // başarılı girişinden sonra cezalandırmasın.
  girisDenemeleri.delete(ip);
  const jeton = jetonUret(ADMIN_JETON_SIRRI);
  // sonaErme istemcinin süresi dolmuş jetonla admin arayüzü göstermemesi için
  res.json({ jeton, sonaErme: Date.now() + JETON_OMRU_MS });
});

app.get('/api/admin/kullanim-log', (req, res) => {
  if (!adminYetkili(req, res)) return;
  // Dosya yoksa HATA DEĞİL: nginx henüz hiç istek yazmamış olabilir.
  // Panel boş listeyi "kayıt yok" diye gösteriyor.
  fs.readFile(KULLANIM_LOG_YOLU, 'utf8', (err, veri) => {
    res.type('text/plain').send(err ? '' : veri);
  });
});

// Model metrics configuration (uzak vLLM host'ları; METRICS_*_URL env ile override edilir)
const MODEL_METRICS_CONFIG = {
  'gemma-4-31b': { url: process.env.METRICS_GEMMA_URL || 'http://vllm-b.example:8000/metrics', name: 'Gemma-4 31B' },
  'glm-5.2': { url: process.env.METRICS_GLM_URL || 'http://vllm-a.example:8000/metrics', name: 'GLM-5.2' },
};

// Parse Prometheus format metrics to JSON
function parsePrometheusMetrics(rawText) {
  const metrics = {};
  const lines = rawText.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) continue;
    
    // Match: metric_name{labels} value or metric_name value
    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)\{?[^}]*\}?\s+(.+)$/);
    if (match) {
      const [, name, value] = match;
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && !metrics.hasOwnProperty(name)) {
        metrics[name] = numValue;
      }
    }
  }
  
  // Calculate averages for latency metrics
  const avgTimeToFirstToken = metrics['vllm:time_to_first_token_seconds_count'] > 0
    ? (metrics['vllm:time_to_first_token_seconds_sum'] / metrics['vllm:time_to_first_token_seconds_count'])
    : 0;
    
  const avgTokenLatency = metrics['vllm:time_per_output_token_seconds_count'] > 0
    ? (metrics['vllm:time_per_output_token_seconds_sum'] / metrics['vllm:time_per_output_token_seconds_count'])
    : 0;
  
  return {
    online: true,
    gpuCacheUsage: metrics['vllm:gpu_cache_usage_perc'] || 0,
    runningRequests: metrics['vllm:num_requests_running'] || 0,
    waitingRequests: metrics['vllm:num_requests_waiting'] || 0,
    promptTokensTotal: metrics['vllm:prompt_tokens_total'] || 0,
    generationTokensTotal: metrics['vllm:generation_tokens_total'] || 0,
    avgTimeToFirstToken,
    avgTokenLatency,
    rawMetricsCount: Object.keys(metrics).length
  };
}

// Embedding endpoint for RAG
// Proxies to vLLM embedding model or TEI (Text Embeddings Inference)
const EMBEDDING_ENDPOINT = process.env.EMBEDDING_ENDPOINT || 'http://vllm-b.example:8002/v1/embeddings';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'BAAI/bge-m3';
const EMBEDDING_DIMENSION = parseInt(process.env.EMBEDDING_DIMENSION) || 1024;

app.post('/api/embed', async (req, res) => {
  try {
    const { texts } = req.body;
    
    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ error: 'texts array is required' });
    }
    
    if (texts.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 texts per request' });
    }
    
    // Call embedding endpoint (15s timeout — embedding ulaşılamıyorsa takılıp kalma)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(EMBEDDING_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${VLLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: texts,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Embedding API error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: 'Embedding servisi hatası',
        details: errorText 
      });
    }
    
    const data = await response.json();
    
    // Extract embeddings from response
    // vLLM format: { data: [{ embedding: [...] }] }
    // TEI format: { embeddings: [[...]] } or similar
    let embeddings;
    
    if (data.data && Array.isArray(data.data)) {
      // OpenAI/vLLM format. index'e göre sırala — dizi sırası garanti değildir
      // (vLLM continuous batching yeniden sıralayabilir) → pozisyonel hizalama güvenli.
      embeddings = data.data.slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map(d => d.embedding);
    } else if (data.embeddings && Array.isArray(data.embeddings)) {
      // TEI format
      embeddings = data.embeddings;
    } else if (Array.isArray(data) && Array.isArray(data[0])) {
      // Direct array format
      embeddings = data;
    } else {
      console.error('Unknown embedding response format:', Object.keys(data));
      return res.status(500).json({ error: 'Bilinmeyen embedding yanıt formatı' });
    }
    
    res.json({ embeddings });
    
  } catch (error) {
    console.error('Embedding error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Embedding health check
app.get('/api/embed/health', async (req, res) => {
  try {
    // Try a simple embedding request to check if service is available (3s timeout — fail-open)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(EMBEDDING_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${VLLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: ['test'],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    
    if (!response.ok) {
      return res.status(503).json({ 
        available: false, 
        error: `Embedding service returned ${response.status}` 
      });
    }
    
    res.json({
      available: true,
      model: EMBEDDING_MODEL,
      dimension: EMBEDDING_DIMENSION,
      endpoint: EMBEDDING_ENDPOINT.replace(/\/\/.*@/, '//***@'), // Hide credentials
    });
    
  } catch (error) {
    res.status(503).json({ 
      available: false, 
      error: error.message 
    });
  }
});

// ---- OCR proxy (Unlimited-OCR) — taranmış sayfa / gömülü görsel metne çevrilir ----
const OCR_ENDPOINT = process.env.OCR_ENDPOINT || 'http://vllm-b.example:8003/v1/chat/completions';
const OCR_MODEL = process.env.OCR_MODEL || 'baidu/Unlimited-OCR';
const OCR_TIMEOUT_MS = 60000;
const OCR_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

app.post('/api/ocr', async (req, res) => {
  const { image } = req.body || {};
  if (typeof image !== 'string' || !image.startsWith('data:image/')) {
    return res.status(400).json({ error: 'image alanı data:image/* base64 data-URL olmalı' });
  }
  if (image.length > OCR_MAX_IMAGE_BYTES) {
    return res.status(413).json({ error: 'Görsel verisi sınırı aşıyor (base64 ~10MB ≈ ham ~7.5MB)' });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);
  try {
    const upstream = await fetch(OCR_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: OCR_MODEL,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: '<image>document parsing.' },
            { type: 'image_url', image_url: { url: image } },
          ],
        }],
        max_tokens: 8192,
        temperature: 0,
        skip_special_tokens: false,
        vllm_xargs: { ngram_size: 35, window_size: 128 },
      }),
    });
    if (!upstream.ok) {
      return res.status(502).json({ error: `OCR servisi hata döndü: ${upstream.status}` });
    }
    const data = await upstream.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') {
      return res.status(502).json({ error: 'OCR yanıtı beklenen biçimde değil' });
    }
    res.json({ text });
  } catch (err) {
    res.status(502).json({ error: `OCR servisine ulaşılamadı: ${err.name === 'AbortError' ? 'zaman aşımı' : err.message}` });
  } finally {
    clearTimeout(timer);
  }
});

// Health: endpoint host'u YANITA YAZILMAZ (embed/health'teki sızıntı dersinden)
app.get('/api/ocr/health', async (req, res) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const base = OCR_ENDPOINT.replace(/\/chat\/completions\/?$/, '');
    const r = await fetch(`${base}/models`, { signal: controller.signal });
    res.json(r.ok ? { available: true, model: OCR_MODEL } : { available: false });
  } catch {
    res.json({ available: false });
  } finally {
    clearTimeout(timer);
  }
});

// Model metrics endpoint - fetches metrics from all configured vLLM servers
app.get('/api/model-metrics', async (req, res) => {
  if (!adminYetkili(req, res)) return;
  const results = {};
  
  const fetchPromises = Object.entries(MODEL_METRICS_CONFIG).map(async ([modelId, config]) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
      
      const response = await fetch(config.url, { signal: controller.signal, headers: { 'x-user-id': GLM_USER_ID } });
      clearTimeout(timeout);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const rawText = await response.text();
      results[modelId] = {
        ...parsePrometheusMetrics(rawText),
        name: config.name
      };
    } catch (error) {
      console.error(`Failed to fetch metrics for ${modelId}:`, error.message);
      results[modelId] = {
        online: false,
        error: error.message,
        name: config.name,
        gpuCacheUsage: 0,
        runningRequests: 0,
        waitingRequests: 0,
        promptTokensTotal: 0,
        generationTokensTotal: 0
      };
    }
  });
  
  await Promise.all(fetchPromises);
  
  res.json({
    timestamp: new Date().toISOString(),
    models: results
  });
});

// Image prompt moderation endpoint for guardrail
app.post('/api/moderate-image-prompt', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const moderationPrompt = `Aşağıdaki görsel üretim prompt'unu değerlendir.
Bu prompt ile uygunsuz, müstehcen, şiddet içeren, nefret söylemi veya yasadışı içerik üretilebilir mi?

Prompt: "${prompt}"

SADECE şu JSON formatında yanıt ver, başka hiçbir şey yazma:
{"safe": true, "reason": ""} veya {"safe": false, "reason": "red sebebini kısaca açıkla"}`;

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VLLM_API_KEY}`,
      ...oturumBasligi(req),
    };

    const response = await modelUcunaGonder(SUMMARY_VLLM_ENDPOINT, SUMMARY_MODEL_NAME, {
      messages: [{ role: 'user', content: moderationPrompt }],
      stream: false,
      temperature: 0.1,
      max_tokens: 200,
      stop: ["<|return|>", "<|call|>"],
    }, { headers });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Moderation API error:', response.status, errorText);
      // Fail open: if moderation fails, allow the prompt
      return res.json({ safe: true, reason: '' });
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    let rawContent = message?.content || message?.reasoning_content || '';
    rawContent = cleanHarmonyResponse(rawContent);

    // Try to parse JSON response
    let result = { safe: true, reason: '' };
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*"safe"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        result.safe = parsed.safe === true;
        result.reason = parsed.reason || '';
      }
    } catch {
      // JSON parse failed, fail open
      console.error('Failed to parse moderation response:', rawContent);
    }

    res.json(result);
  } catch (error) {
    console.error('Moderation error:', error);
    // Fail open on error
    res.json({ safe: true, reason: '' });
  }
});

app.listen(PORT, () => {
  console.log(`T3AI Backend running on port ${PORT}`);
  console.log(`vLLM Endpoint: ${VLLM_ENDPOINT}`);
  console.log(`Model: ${MODEL_NAME}`);
  console.log(`Default Temperature: ${DEFAULT_TEMPERATURE}`);
  console.log(`Default Max Tokens: ${DEFAULT_MAX_TOKENS}`);
  console.log(`Max Output Tokens Cap: ${MAX_OUTPUT_TOKENS_CAP}`);
  console.log(`Model Max Context Length: ${MODEL_MAX_CONTEXT_LENGTH}`);
  console.log(`Default Top P: ${DEFAULT_TOP_P}`);
  console.log(`Default Top K: ${DEFAULT_TOP_K}`);
  console.log(`Default Min P: ${DEFAULT_MIN_P}`);
  console.log(`System Prompt Base: ${SYSTEM_PROMPT_BASE.substring(0, 50)}...`);
});
