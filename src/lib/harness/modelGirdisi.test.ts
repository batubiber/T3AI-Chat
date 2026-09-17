import { expect, it } from 'vitest';
import { modelGirdisiniKur } from './modelGirdisi';
import { getModelContextWindow } from '../modelConfig';
const g = { sistem: 'Kurallar', gecmis: [{ role: 'user', content: 'Raporu özetle' }], ciktiIstegi: 8000 };
it('büyük modelden küçük yedeğe geçişte pencere ve çıktı yeniden hesaplanır', () => {
  const gecmis = [{ role: 'user', content: 'örnek '.repeat(90000) }, ...g.gecmis];
  const buyuk = modelGirdisiniKur({ ...g, gecmis, modelId: 'gemma-4-31b' });
  const kucuk = modelGirdisiniKur({ ...g, gecmis, modelId: 'glm-5.2' });
  expect(kucuk.pencere).toBe(getModelContextWindow('glm-5.2'));
  expect(kucuk.pencere).toBeLessThan(buyuk.pencere);
  expect(kucuk.girdiToken + kucuk.maxTokens + 8192).toBeLessThanOrEqual(kucuk.pencere);
  expect(kucuk.kirpmalar.length).toBeGreaterThan(0);
  expect(kucuk.messages[kucuk.messages.length - 1].content).toBe('Raporu özetle');
});
it('araç şeması ve görseller aynı toplam bütçeye girer', () => {
  const sade = modelGirdisiniKur({ ...g, modelId: 'gemma-4-31b' });
  const ekli = modelGirdisiniKur({ ...g, modelId: 'gemma-4-31b', tools: [{ description: 'x'.repeat(1000) }], images: ['sentetik-gorsel'] });
  expect(ekli.girdiToken).toBeGreaterThan(sade.girdiToken + 500);
});
it('desteklenmeyen görsel ve araç modeli çağırmadan reddedilir', () => {
  expect(() => modelGirdisiniKur({ ...g, modelId: 'glm-5.2', images: ['x'] })).toThrow('görsel');
  expect(() => modelGirdisiniKur({ ...g, modelId: 'bilinmeyen', tools: [{}] })).toThrow('araç');
});
it('sistem tek başına sığmazsa boş kullanıcı isteği gönderilmez', () => {
  expect(() => modelGirdisiniKur({ ...g, modelId: 'glm-5.2', sistem: 'kural'.repeat(5000), pencereTavani: 10000 })).toThrow();
});
