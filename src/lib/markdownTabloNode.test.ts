import { describe, it, expect } from 'vitest';
import type { Element as HastElement } from 'hast';
import { nodeMetni, tabloSatirlari, acikHiza, hizaKurallari } from '@/lib/markdownTabloNode';

const metin = (v: string) => ({ type: 'text' as const, value: v });
const el = (tagName: string, children: unknown[], properties = {}): HastElement =>
  ({ type: 'element', tagName, properties, children } as HastElement);

const hucre = (tag: string, v: string, style?: string) =>
  el(tag, [metin(v)], style ? { style } : {});

describe('nodeMetni', () => {
  it('iç içe düğümlerin metnini birleştirir', () => {
    // Hücrede kalın metin varsa da hiza sezgisi doğru okusun
    const n = el('td', [metin('45.000 '), el('strong', [metin('TL')])]);
    expect(nodeMetni(n)).toBe('45.000 TL');
  });
});

describe('tabloSatirlari', () => {
  const tablo = el('table', [
    el('thead', [el('tr', [hucre('th', 'Ürün'), hucre('th', 'Fiyat')])]),
    el('tbody', [
      el('tr', [hucre('td', 'Laptop'), hucre('td', '45.000 TL')]),
      el('tr', [hucre('td', 'Mouse'), hucre('td', '1.200 TL')]),
    ]),
  ]);

  it('başlık ve gövdeyi ayırır', () => {
    const { baslikHucreleri, govdeMetinleri } = tabloSatirlari(tablo);
    expect(baslikHucreleri.map(nodeMetni)).toEqual(['Ürün', 'Fiyat']);
    expect(govdeMetinleri).toEqual([
      ['Laptop', '45.000 TL'],
      ['Mouse', '1.200 TL'],
    ]);
  });

  it('tbody sarmalayıcısı olmasa da satırları bulur', () => {
    const duz = el('table', [el('tr', [hucre('td', 'a'), hucre('td', '1')])]);
    expect(tabloSatirlari(duz).govdeMetinleri).toEqual([['a', '1']]);
  });

  it('boş tabloda çökmez', () => {
    const bos = tabloSatirlari(el('table', []));
    expect(bos.baslikHucreleri).toEqual([]);
    expect(bos.govdeMetinleri).toEqual([]);
  });
});

describe('acikHiza', () => {
  it('remark-gfm stilinden hizayı okur', () => {
    expect(acikHiza(hucre('th', 'x', 'text-align: right'))).toBe('right');
    expect(acikHiza(hucre('th', 'x', 'text-align: center'))).toBe('center');
    expect(acikHiza(hucre('th', 'x'))).toBeNull();
  });
});

describe('hizaKurallari', () => {
  it('yalnız sapan kolonlar için kural üretir', () => {
    // Sola yaslı zaten varsayılan; gereksiz kural CSS'i şişirir
    const k = hizaKurallari('[data-tablo="t1"]', ['left', 'left', 'right', 'right', 'left']);
    expect(k).toContain('nth-child(3)');
    expect(k).toContain('nth-child(4)');
    expect(k).not.toContain('nth-child(1)');
    expect(k).not.toContain('nth-child(5)');
  });

  it('sağa yaslarken rakam genişliğini sabitler', () => {
    expect(hizaKurallari('[x]', ['right'])).toContain('tabular-nums');
  });

  it('hepsi sola yaslıysa hiç kural yok', () => {
    expect(hizaKurallari('[x]', ['left', 'left'])).toBe('');
  });
});
