/**
 * vLLM'in SERVİS ETTİĞİ model adını çözer — frontend'deki
 * `src/lib/sunucuModelAdi.ts` ile aynı iş, backend tarafı için.
 *
 * NEDEN BURADA DA GEREKLİ: özetleme, başlık üretme ve moderasyon
 * `SUMMARY_VLLM_ENDPOINT` üzerinden Gemma'ya gidiyor ve `SUMMARY_MODEL_NAME`
 * `.env`'den okunuyor. Sunucudaki `--served-model-name` değiştiğinde
 * (2026-09-01: `gemma-4-31b` → `gemma4-31b`) bu üç uç da 404 alır. Sohbetten
 * farkı: hiçbiri kullanıcıya hata göstermiyor — özet sessizce üretilmiyor,
 * başlık "Yeni Sohbet" kalıyor, moderasyon açık düşüp isteği geçiriyor. Yani
 * .env'i elle düzeltmeyi bekleyecek bir uyarı YOK.
 *
 * Frontend'le AYRI kopya olması bilinçli: server/ CommonJS ve `src/` derleme
 * hattına hiç girmiyor, ortak modül için ayrı bir paketleme adımı gerekirdi.
 * İki kopyanın kuralı aynı; ikisinin de kendi testi var.
 */

/**
 * Karşılaştırma için adı sadeleştirir: `gemma-4-31b` ile `gemma4-31b` aynı
 * dizgeye iner. Türkçe yerel küçültme BİLEREK kullanılmadı; model adı ASCII
 * tanımlayıcı ve `I` → `ı` dönüşümü alttaki süzgeçte kaybolurdu.
 */
function sadelestir(ad) {
  return String(ad).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * `/v1/models` yanıtından kullanılacak adı seçer.
 * Sıra: tam eşleşme → sadeleştirilmiş eşleşme → ilk taban model (LoRA hariç).
 */
function modelAdiSec(veri, istenenId) {
  const liste = veri && veri.data;
  if (!Array.isArray(liste)) return null;

  const adaylar = liste
    .filter((k) => k && typeof k.id === 'string' && k.id.trim() !== '')
    .map((k) => ({ id: k.id, adaptor: k.parent !== null && k.parent !== undefined }));
  if (adaylar.length === 0) return null;

  const tam = adaylar.find((a) => a.id === istenenId);
  if (tam) return tam.id;

  const hedef = sadelestir(istenenId);
  const yakin = adaylar.find((a) => sadelestir(a.id) === hedef);
  if (yakin) return yakin.id;

  const taban = adaylar.filter((a) => !a.adaptor);
  return (taban[0] || adaylar[0]).id;
}

/** Sohbet adresinden model liste adresi. Uymayan adreste keşif denenmez. */
function modelListesiUrl(sohbetUrl) {
  if (!/\/v1\/chat\/completions$/.test(sohbetUrl)) return null;
  return sohbetUrl.replace(/\/v1\/chat\/completions$/, '/v1/models');
}

/** Süreç ömrü boyunca geçerli — backend'de kalıcı depo yok, gerek de yok. */
const cozulenler = new Map();
const ucustakiler = new Map();

function anahtar(sohbetUrl, yapilandirilanAd) {
  return `${sohbetUrl}|${yapilandirilanAd}`;
}

function sunucuModelAdi(sohbetUrl, yapilandirilanAd) {
  return cozulenler.get(anahtar(sohbetUrl, yapilandirilanAd)) || yapilandirilanAd;
}

async function modelAdiniCoz(sohbetUrl, yapilandirilanAd, signal) {
  signal?.throwIfAborted();
  const k = anahtar(sohbetUrl, yapilandirilanAd);
  if (!signal && ucustakiler.has(k)) return ucustakiler.get(k);

  const is = (async () => {
    const url = modelListesiUrl(sohbetUrl);
    if (!url) return null;
    let veri;
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), 10000);
    const omur = controller.signal;
    try {
      const yanit = await fetch(url, { headers: { Accept: 'application/json' }, signal: omur });
      if (!yanit.ok) return null;
      veri = await yanit.json();
      omur.throwIfAborted();
    } catch {
      signal?.throwIfAborted();
      return null; // kurtarma yolunun kendisi isteği düşürmesin
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
    const secilen = modelAdiSec(veri, yapilandirilanAd);
    if (!secilen || secilen === sunucuModelAdi(sohbetUrl, yapilandirilanAd)) return null;
    cozulenler.set(k, secilen);
    return secilen;
  })();

  if (!signal) ucustakiler.set(k, is);
  try {
    return await is;
  } finally {
    if (ucustakiler.get(k) === is) ucustakiler.delete(k);
  }
}

/**
 * İsteği gönderir; 404 gelirse gerçek adı öğrenip BİR KEZ yeniler.
 *
 * `govde.model` çağıran tarafından verilmez — burada konur.
 */
async function modelUcunaGonder(sohbetUrl, yapilandirilanAd, govde, ayarlar = {}) {
  ayarlar.signal?.throwIfAborted();
  const gonder = (ad) =>
    fetch(sohbetUrl, {
      method: 'POST',
      headers: ayarlar.headers || { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...govde, model: ad }),
      signal: ayarlar.signal,
    });

  const ilkAd = sunucuModelAdi(sohbetUrl, yapilandirilanAd);
  const yanit = await gonder(ilkAd);
  ayarlar.signal?.throwIfAborted();
  if (yanit.status !== 404) return yanit;

  const cozulen = await modelAdiniCoz(sohbetUrl, yapilandirilanAd, ayarlar.signal);
  ayarlar.signal?.throwIfAborted();
  if (!cozulen || cozulen === ilkAd) return yanit;

  console.warn(
    `[model-adi] Sunucu "${cozulen}" adıyla servis ediyor; istek bu adla yenilendi (yapılandırma: "${yapilandirilanAd}"). .env'deki adı güncellemek gerekiyor.`,
  );
  return gonder(cozulen);
}

/** Testler ve elle sıfırlama için. */
function modelAdiniUnut() {
  cozulenler.clear();
  ucustakiler.clear();
}

module.exports = {
  modelAdiSec,
  sunucuModelAdi,
  modelAdiniCoz,
  modelUcunaGonder,
  modelAdiniUnut,
};
