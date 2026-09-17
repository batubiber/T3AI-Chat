import { estimateTokens, estimateImageTokens } from '../tokenEstimator';
import { iptaliKontrolEt, istekOmru } from './iptal';
import type { DurmaNedeni, TurOzeti } from './tipler';

// Tur sınırları; model kalitesi/gerçek gecikme ölçülünce ayarlanır.
export const TUR_SINIRLARI = { anaAdim: 4, arac: 4, modelIstegi: 12, token: 600_000, sureMs: 900_000 };
export class TurSiniri extends Error {
  constructor(message: string) { super(message); this.name = 'TurSiniri'; }
}

/** Her tur kendi sayacına sahiptir; yardımcı ve kurtarma çağrıları da aynı sayacı kullanır. */
export class TurButcesi {
  private baslangic = Date.now();
  private sayac = { anaAdim: 0, arac: 0, modelIstegi: 0, ayrilanToken: 0 };
  private omur: ReturnType<typeof istekOmru>;
  readonly sinir: typeof TUR_SINIRLARI;
  readonly signal: AbortSignal;
  constructor(private parent: AbortSignal, sinir: Partial<typeof TUR_SINIRLARI> = {}) {
    this.sinir = { ...TUR_SINIRLARI, ...sinir };
    this.omur = istekOmru(parent, this.sinir.sureMs);
    this.signal = this.omur.signal;
  }
  temizle() { this.omur.temizle(); }
  kontrol() {
    iptaliKontrolEt(this.parent);
    if (this.signal.aborted || Date.now() - this.baslangic >= this.sinir.sureMs) throw new TurSiniri('İşlem süre sınırına ulaştı.');
  }
  anaAdimBaslat() {
    this.kontrol();
    if (this.sayac.anaAdim >= this.sinir.anaAdim) throw new TurSiniri('Yanıt adımı sınırına ulaşıldı.');
    this.sayac.anaAdim++;
  }
  aracBaslat() {
    this.kontrol();
    if (this.sayac.arac >= this.sinir.arac) throw new TurSiniri('Belge işlemi sınırına ulaşıldı.');
    this.sayac.arac++;
  }
  /** Tam gövde sayılır; 404 adı düzeltme/503 yedek de ayrı bir model isteğidir. */
  modelBaslat(govde: Record<string, unknown>) {
    this.kontrol();
    let resim = 0;
    const metin = JSON.stringify({ messages: govde.messages, tools: govde.tools }, (key, value) => {
      if (key === 'image_url') { resim++; return '[görsel]'; }
      return value;
    });
    const token = estimateTokens(metin) + estimateImageTokens(resim) + Math.max(0, Number(govde.max_tokens) || 0);
    if (this.sayac.modelIstegi >= this.sinir.modelIstegi || this.sayac.ayrilanToken + token > this.sinir.token) {
      throw new TurSiniri('Toplam model çağrısı veya token bütçesi doldu.');
    }
    this.sayac.modelIstegi++;
    this.sayac.ayrilanToken += token;
  }
  ozet(durma: DurmaNedeni): TurOzeti { return { ...this.sayac, durma, sureMs: Date.now() - this.baslangic }; }
}
