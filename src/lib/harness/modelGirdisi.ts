import type { DevamMesaji } from './tipler';
import { butceyeSigdir, EN_AZ_CIKTI_TOKENI, type Mesaj } from '../baglamButcesi';
import { getModelContextWindow, modelSupportsVision, getModelById } from '../modelConfig';
import { estimateTokens, estimateMessagesTokens, estimateImageTokens } from '../tokenEstimator';

/** Her denemede HEDEF modele göre hesaplanır; yedek model eski pencereyi kullanmaz. */
export function modelGirdisiniKur(g: {
  modelId: string; sistem: string; gecmis: Mesaj[]; ekBaglam?: string[];
  tools?: unknown[]; images?: string[]; ciktiIstegi: number;
  devam?: DevamMesaji[];
  pencereTavani?: number; guvenlikPayi?: number; girdiTavani?: number;
}) {
  if (g.tools?.length && !getModelById(g.modelId)?.supportsTools) {
    throw new Error('Seçilen model araç çağrılarını desteklemiyor.');
  }
  if (g.images?.length && !modelSupportsVision(g.modelId)) {
    throw new Error('Seçilen model görsel girdiyi desteklemiyor.');
  }
  const pencere = Math.min(getModelContextWindow(g.modelId), g.pencereTavani ?? Infinity);
  const pay = g.guvenlikPayi ?? 8192;
  // Bunlar tahmin: gerçek token sayacı yok. Şema ve görseller de bütçeye girer.
  const devamMaliyeti = g.devam?.length ? estimateTokens(JSON.stringify(g.devam)) + g.devam.length * 4 : 0;
  const ekMaliyet = estimateTokens(JSON.stringify(g.tools ?? [])) + estimateImageTokens(g.images?.length ?? 0);
  const tavan = Math.min(g.girdiTavani ?? Infinity, pencere - pay - EN_AZ_CIKTI_TOKENI) - ekMaliyet - devamMaliyeti - (g.gecmis.length + 1) * 4;
  const sigan = butceyeSigdir({ sistem: g.sistem, gecmis: g.gecmis, kararsizParcalar: g.ekBaglam ?? [], tavan });
  const gecmis = [...sigan.gecmis];
  if (!gecmis.length || !gecmis[gecmis.length - 1].content.trim()) {
    throw new Error('Talimat ve zorunlu bağlam modelin penceresine sığmıyor. Talebi daraltın.');
  }
  if (sigan.kararsizParcalar.length) {
    const son = gecmis[gecmis.length - 1];
    gecmis[gecmis.length - 1] = { ...son, content: `${sigan.kararsizParcalar.join('\n\n')}\n\n${son.content}` };
  }
  // Çağrı/sonuç grubu BÜTÜN tutulur; bağlam daraltılırken yarıya bölünmez.
  const messages = [{ role: 'system', content: g.sistem }, ...gecmis, ...(g.devam ?? [])];
  const girdiToken = estimateMessagesTokens([{ role: 'system', content: g.sistem }, ...gecmis]) + ekMaliyet + devamMaliyeti;
  const maxTokens = Math.floor(Math.min(g.ciktiIstegi, pencere - pay - girdiToken));
  if (maxTokens < EN_AZ_CIKTI_TOKENI) throw new Error('Modelin yanıtı için yeterli bağlam bütçesi kalmadı.');
  return { messages, maxTokens, pencere, girdiToken, kirpmalar: sigan.kirpmalar, gonderilenMesaj: gecmis.length };
}
