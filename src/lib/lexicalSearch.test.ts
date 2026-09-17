import { describe, it, expect } from 'vitest';
import { tokenizeTr, buildLexicalIndex, scoreBm25, getLexicalIndex, fuseRrf, isHybridOff, hybridRank } from './lexicalSearch';

const DOCS = [
  { id: 'a', content: 'VEGA-2 motoru PRT-4412 parça kodu ile değiştirilir' },
  { id: 'b', content: 'VEGA-1 gövde bakımı genel talimatlar ve prosedür' },
  { id: 'c', content: 'Genel bakım prosedürleri motor ve gövde için talimatlar' },
];

describe('smoke', () => {
  it('vitest çalışıyor', () => {
    expect(1 + 1).toBe(2);
  });
});

describe('tokenizeTr', () => {
  it('tr-TR lowercase: İ→i doğru katlanır', () => {
    expect(tokenizeTr('İHA MENZİLİ')).toEqual(['iha', 'menzili']);
  });
  it("apostrof kesme: Ankara'nın → ankara (hem ' hem ')", () => {
    expect(tokenizeTr("Ankara'nın nüfusu")).toEqual(['ankara', 'nufusu']);
    expect(tokenizeTr('GÜNEŞ’in')).toEqual(['gunes']);
  });
  it('ASCII-fold: ş→s ğ→g ı→i ç→c ö→o ü→u', () => {
    expect(tokenizeTr('güneş çelik ırmağı örtü')).toEqual(['gunes', 'celik', 'irmagi', 'ortu']);
  });
  it('tireli kod hem BÜTÜN hem parça olarak token üretir', () => {
    /* SÖZLEŞME BİLEREK DEĞİŞTİ. Tire eskiden ayırıcıydı ve varyant kodları
       çöküyordu: 'VEGA-2' ile 'VEGA-1' ikisi de ['vega'] oluyor, sözcüksel
       bacak onları hiçbir sorguda ayıramıyordu (ölçüldü: 8 varyant vakasının
       4'ünde doğru belge üstteydi — ikili seçimde şans oranı).
       Ayrımı asıl BÜTÜN token sağlıyor; nadir olduğu için ayırt edici.
       Bkz. lexicalVaryant.test.ts. */
    expect(tokenizeTr('PRT-4412 kodu, 25000 ft'))
      .toEqual(['prt4412', 'prt', '4412', 'kodu', '25000', 'ft']);
  });

  it('kısa parça yalnız RAKAM içeriyorsa korunur', () => {
    // 'f-16' → 'f' gürültü, '16' varyantı ayıran işaret.
    expect(tokenizeTr('F-16')).toEqual(['f16', '16']);
  });
  it('tek karakterli token atılır, boş metin boş dizi', () => {
    expect(tokenizeTr('a b ab')).toEqual(['ab']);
    expect(tokenizeTr('')).toEqual([]);
    expect(tokenizeTr('  \n ')).toEqual([]);
  });
});

describe('buildLexicalIndex', () => {
  it('df ve avgdl doğru hesaplanır', () => {
    const idx = buildLexicalIndex(DOCS);
    expect(idx.docCount).toBe(3);
    expect(idx.df.get('vega')).toBe(2);      // a ve b
    expect(idx.df.get('4412')).toBe(1);      // sadece a
    const totalLen = [...idx.docTokens.values()].reduce((s, t) => s + t.length, 0);
    expect(idx.avgdl).toBeCloseTo(totalLen / 3);
  });
});

describe('scoreBm25', () => {
  it('nadir terim içeren doküman, içermeyenden yüksek skorlar', () => {
    const idx = buildLexicalIndex(DOCS);
    const s = scoreBm25(idx, ['4412']);
    expect(s.get('a')).toBeGreaterThan(0);
    expect(s.has('b')).toBe(false);
    expect(s.has('c')).toBe(false);
  });
  it('iki sorgu terimi eşleşen, tek eşleşenden yüksek skorlar', () => {
    const idx = buildLexicalIndex(DOCS);
    const s = scoreBm25(idx, ['vega', '4412']);
    expect(s.get('a')!).toBeGreaterThan(s.get('b')!);
  });
  it('hiç eşleşme yoksa boş map', () => {
    const idx = buildLexicalIndex(DOCS);
    expect(scoreBm25(idx, ['bulunmayankelime']).size).toBe(0);
  });
  it('boş sorgu boş map', () => {
    const idx = buildLexicalIndex(DOCS);
    expect(scoreBm25(idx, []).size).toBe(0);
  });
});

describe('getLexicalIndex', () => {
  it('aynı anahtar aynı nesneyi döner (yeniden inşa yok)', () => {
    const a1 = getLexicalIndex('p:1|v0', DOCS);
    const a2 = getLexicalIndex('p:1|v0', DOCS);
    expect(a1).toBe(a2);
  });
  it('versiyon değişince yeniden inşa edilir', () => {
    const a1 = getLexicalIndex('p:2|v0', DOCS);
    const a2 = getLexicalIndex('p:2|v1', DOCS);
    expect(a1).not.toBe(a2);
  });
  it('LRU: 4 girişten fazlası en eskisini düşürür', () => {
    const first = getLexicalIndex('lru:0', DOCS);
    for (let i = 1; i <= 4; i++) getLexicalIndex(`lru:${i}`, DOCS);
    expect(getLexicalIndex('lru:0', DOCS)).not.toBe(first); // yeniden inşa edildi
  });
  it('hit LRU tazeler: dokunulan anahtar evict edilmez, en eski dokunulmamış düşer', () => {
    const a = getLexicalIndex('rec:0', DOCS);
    getLexicalIndex('rec:1', DOCS);
    getLexicalIndex('rec:2', DOCS);
    getLexicalIndex('rec:3', DOCS);
    // rec:0'a dokun → recency tazelenir (artık en eski rec:1)
    expect(getLexicalIndex('rec:0', DOCS)).toBe(a);
    const b1 = getLexicalIndex('rec:1', DOCS);
    // Kapasite 4: rec:1 çağrısı bir şeyi evict etmiş olabilir; kritik iddia şu:
    getLexicalIndex('rec:4', DOCS);
    getLexicalIndex('rec:5', DOCS);
    // rec:0 hâlâ cache'te olmalı (tazelendi), aynı referans döner
    expect(getLexicalIndex('rec:0', DOCS)).toBe(a);
  });
});

describe('fuseRrf', () => {
  it('iki listede de olan, tek listede olandan yüksek skorlar', () => {
    const s = fuseRrf([['a', 'b'], ['a', 'c']]);
    expect(s.get('a')!).toBeGreaterThan(s.get('b')!);
    expect(s.get('a')!).toBeGreaterThan(s.get('c')!);
  });
  it('rank formülü: 1/(k+rank), rank 1-tabanlı', () => {
    const s = fuseRrf([['x']], 60);
    expect(s.get('x')!).toBeCloseTo(1 / 61);
  });
  it('boş listeler boş map', () => {
    expect(fuseRrf([[], []]).size).toBe(0);
  });
});

describe('isHybridOff', () => {
  it('node ortamında (localStorage yok) false döner', () => {
    expect(isHybridOff()).toBe(false);
  });
});

function mkChunk(id: string, content: string, embedding: number[]) {
  return { id, content, embedding };
}

describe('hybridRank', () => {
  const chunks = [
    mkChunk('a', 'VEGA-2 motoru PRT-4412 kodu', [1, 0]),
    mkChunk('b', 'VEGA-1 gövde bakımı', [0.9, 0.1]),
    mkChunk('c', 'alakasız içerik tamamen', [0, 1]),
  ];
  const idx = buildLexicalIndex(chunks);

  it('lexical eşleşme dense eşiğin altındaki dokümanı kurtarır', () => {
    // query embedding c'ye benzer AMA metin a'daki koda eşleşiyor
    const r = hybridRank(chunks, [0, 1], ['4412'], idx, { topK: 3, threshold: 0.5 });
    expect(r.map(x => x.chunk.id)).toContain('a');
  });
  it('embedding null → lexical-only, skorlar 0..1 normalize', () => {
    const r = hybridRank(chunks, null, ['4412'], idx, { topK: 3, threshold: 0.5 });
    expect(r[0].chunk.id).toBe('a');
    expect(r[0].score).toBe(1);
  });
  it('lexical eşleşme yoksa saf dense sonucu döner', () => {
    const r = hybridRank(chunks, [1, 0], ['yokboylekelime'], idx, { topK: 2, threshold: 0.5 });
    expect(r.map(x => x.chunk.id)).toEqual(['a', 'b']);
    expect(r[0].score).toBeGreaterThan(0.9); // ham cosine korunur
  });
  it('topK sınırı uygulanır ve skorlar azalan sıradadır', () => {
    const r = hybridRank(chunks, [1, 0], ['vega'], idx, { topK: 2, threshold: 0.3 });
    expect(r.length).toBeLessThanOrEqual(2);
    for (let i = 1; i < r.length; i++) expect(r[i].score).toBeLessThanOrEqual(r[i - 1].score);
  });
});
