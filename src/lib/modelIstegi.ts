/**
 * Model ucuna sohbet isteği gönderir ve SERVİS EDİLEN AD DEĞİŞTİYSE kendini
 * onarır.
 *
 * Sorun: sohbet isteği backend'e uğramıyor, tarayıcı nginx üzerinden doğrudan
 * vLLM'e gidiyor ve gövdedeki `model` alanı kaynak koda gömülü. vLLM'in
 * `--served-model-name` değeri bizden bağımsız değiştiğinde (2026-09-01'de
 * `gemma-4-31b` → `gemma4-31b`) her istek 404 dönüyor ve tek çare yeni bir
 * derleme çıkıp dağıtmak oluyordu.
 *
 * Çözüm, taşma telafisindeki desenle aynı: ÖNCE dene, hata gelirse ONAR.
 * Mutlu yolda fazladan istek yok. 404 ise vLLM'in üretime hiç başlamadan
 * verdiği ret olduğu için kurtarma birkaç milisaniyeye mal oluyor.
 *
 * Neden özellikle 404: gövdeyi ayrıştırıp "model does not exist" aramıyoruz.
 * vLLM sürümleri hata gövdesini iki farklı şekilde sarıyor ve yanlış şekli
 * beklemek kurtarmanın canlıda hiç çalışmaması demek — bunu taşma telafisinde
 * bir kez yaşadık. 404'ün öteki sebebi yolun yanlış olması; o durumda
 * `/v1/models` sorgusu da 404 döner ve kurtarma sessizce vazgeçer.
 */
import { resolveChatApiUrl } from './modelConfig';
import { sunucuModelAdi, modelAdiniCoz } from './sunucuModelAdi';
import { harnessOlayiBildir } from './kullanimBildir';
import type { TurButcesi } from './harness/turButcesi';
import { iptaliKontrolEt } from './harness/iptal';

export interface ModelIstekAyarlari {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  butce?: TurButcesi;
}

/**
 * `govde.model` ÇAĞIRAN TARAFINDAN VERİLMEZ — burada, iç kimlikten çözülerek
 * konur. Çağıranlar iç kimliği (`modelId`) geçirir; hangi adın tele çıktığı
 * tek bir yerde bilinir.
 */
export async function modelUcunaGonder(
  modelId: string,
  govde: Record<string, unknown>,
  ayarlar: ModelIstekAyarlari = {},
): Promise<Response> {
  iptaliKontrolEt(ayarlar.signal);
  const url = resolveChatApiUrl(modelId);

  const gonder = (ad: string): Promise<Response> => {
    iptaliKontrolEt(ayarlar.signal);
    ayarlar.butce?.modelBaslat(govde);
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(ayarlar.headers ?? {}) },
      signal: ayarlar.signal,
      body: JSON.stringify({ ...govde, model: ad }),
    });
  };

  const ilkAd = sunucuModelAdi(modelId);
  const yanit = await gonder(ilkAd);
  iptaliKontrolEt(ayarlar.signal);
  if (yanit.status !== 404) return yanit;

  const cozulen = await modelAdiniCoz(modelId, ayarlar.signal);
  iptaliKontrolEt(ayarlar.signal);
  if (!cozulen || cozulen === ilkAd) return yanit;

  console.warn(
    `🔤 Model adı sunucuda "${cozulen}" olarak servis ediliyor; istek bu adla yenileniyor (yapılandırma: "${modelId}").`,
  );
  harnessOlayiBildir('model-adi-degisti');
  return gonder(cozulen);
}
