import { describe, it, expect } from 'vitest';
import {
  extractJsonArray,
  coerceEdits,
  extractCompleteObjects,
  parseSseLine,
  sseFinishReason,
  pdfPromptKuraliVarMi,
} from './docxEditService';

describe('extractJsonArray', () => {
  it('düz JSON dizisini okur', () => {
    expect(extractJsonArray('[{"a":1}]')).toEqual([{ a: 1 }]);
  });

  it('kod çiti içindeki JSON\'u okur', () => {
    expect(extractJsonArray('```json\n[{"a":1}]\n```')).toEqual([{ a: 1 }]);
  });

  it('giriş cümlesi eklenmiş yanıtı kurtarır', () => {
    expect(extractJsonArray('İşte düzenlemeler:\n[{"a":1}]\nUmarım yardımcı olur.')).toEqual([
      { a: 1 },
    ]);
  });

  it('boş dizi geçerlidir (değişiklik gerekmiyor)', () => {
    expect(extractJsonArray('[]')).toEqual([]);
  });

  it('dizi yoksa hata verir', () => {
    expect(() => extractJsonArray('Böyle bir şey yapamam.')).toThrow(/JSON dizisi bulunamadı/);
  });

  it('bozuk JSON\'da hata verir', () => {
    expect(() => extractJsonArray('[{"a":}]')).toThrow();
  });
});

describe('coerceEdits', () => {
  it('geçerli öğeyi çevirir', () => {
    expect(
      coerceEdits([{ paragraph: 3, find: 'yalnış', replace: 'yanlış', reason: 'yazım hatası' }]),
    ).toEqual([{ paragraph: 3, find: 'yalnış', replace: 'yanlış', reason: 'yazım hatası' }]);
  });

  it('reason yoksa alanı hiç eklemez', () => {
    expect(coerceEdits([{ paragraph: 0, find: 'a', replace: 'b' }])).toEqual([
      { paragraph: 0, find: 'a', replace: 'b' },
    ]);
  });

  it('silme düzenlemesinde boş replace kabul edilir', () => {
    expect(coerceEdits([{ paragraph: 0, find: 'fazla ', replace: '' }])).toHaveLength(1);
  });

  it('find olmadan gelen öğe tam-paragraf yazımı olarak geçer', () => {
    expect(coerceEdits([{ paragraph: 4, replace: 'yeni paragraf metni' }])).toEqual([
      { paragraph: 4, replace: 'yeni paragraf metni' },
    ]);
  });

  it('metin olarak gelen paragraf numarasını sayıya çevirir', () => {
    expect(coerceEdits([{ paragraph: '5', find: 'a', replace: 'b' }])[0].paragraph).toBe(5);
  });

  it('şemaya uymayan öğeleri eler, geçerlileri korur', () => {
    const out = coerceEdits([
      { paragraph: 0, find: 'a', replace: 'b' }, // geçerli
      { paragraph: -1, find: 'a', replace: 'b' }, // negatif index
      { paragraph: 1.5, find: 'a', replace: 'b' }, // tam sayı değil
      { paragraph: 2, find: '', replace: 'b' }, // boş find → tam-paragraf yazımı
      { paragraph: 3, find: 'a' }, // replace yok
      { paragraph: 4, find: 'a', replace: 5 }, // replace string değil
      null,
      'metin',
      { paragraph: 9, find: 'x', replace: 'y' }, // geçerli
    ]);
    expect(out).toEqual([
      { paragraph: 0, find: 'a', replace: 'b' },
      { paragraph: 2, replace: 'b' }, // find düştü → paragrafın tamamı yazılacak
      { paragraph: 9, find: 'x', replace: 'y' },
    ]);
  });

  it('dizi olmayan girdide hata verir', () => {
    expect(() => coerceEdits({ paragraph: 0 })).toThrow(/dizi değil/);
  });

  it('boş dizi boş sonuç verir', () => {
    expect(coerceEdits([])).toEqual([]);
  });
});

describe('extractCompleteObjects — akışta parçalı JSON', () => {
  it('tamamlanmış nesneyi çıkarır, yarımı bırakır', () => {
    const buf = '[{"a":1},{"b":2},{"c":';
    const r = extractCompleteObjects(buf, 0);
    expect(r.objects).toEqual(['{"a":1}', '{"b":2}']);
    expect(buf.slice(r.nextFrom)).toBe(',{"c":');
  });

  it('kaldığı yerden devam eder, aynı nesneyi iki kez vermez', () => {
    const first = '[{"a":1},{"b":';
    const r1 = extractCompleteObjects(first, 0);
    expect(r1.objects).toEqual(['{"a":1}']);
    const full = first + '2}]';
    const r2 = extractCompleteObjects(full, r1.nextFrom);
    expect(r2.objects).toEqual(['{"b":2}']);
  });

  it('string İÇİNDEKİ süslü parantez sayacı bozmaz', () => {
    const buf = '[{"reason":"şu { bu }","find":"x"}]';
    expect(extractCompleteObjects(buf, 0).objects).toEqual([
      '{"reason":"şu { bu }","find":"x"}',
    ]);
  });

  it('kaçışlı tırnak sayacı bozmaz', () => {
    const buf = String.raw`[{"find":"o \"dedi\" bu"}]`;
    expect(extractCompleteObjects(buf, 0).objects).toHaveLength(1);
  });

  it('iç içe nesneyi tek parça sayar', () => {
    const buf = '[{"a":{"b":1}},{"c":2}]';
    expect(extractCompleteObjects(buf, 0).objects).toEqual(['{"a":{"b":1}}', '{"c":2}']);
  });

  it('henüz nesne yoksa boş döner', () => {
    expect(extractCompleteObjects('[', 0).objects).toEqual([]);
  });

  it('çıkarılan parçalar tek tek parse edilebilir', () => {
    const { objects } = extractCompleteObjects(
      '[{"paragraph":1,"replace":"yeni","reason":"yazım"},{"paragraph":2,"replace":"x"}]',
      0,
    );
    expect(objects.map((o) => JSON.parse(o))).toEqual([
      { paragraph: 1, replace: 'yeni', reason: 'yazım' },
      { paragraph: 2, replace: 'x' },
    ]);
  });
});

describe('parseSseLine', () => {
  it('delta içeriğini çıkarır', () => {
    expect(parseSseLine('data: {"choices":[{"delta":{"content":"ab"}}]}')).toBe('ab');
  });
  it('reasoning_content da okunur', () => {
    expect(parseSseLine('data: {"choices":[{"delta":{"reasoning_content":"düşünce"}}]}')).toBe(
      'düşünce',
    );
  });
  it('[DONE] boş döner', () => {
    expect(parseSseLine('data: [DONE]')).toBe('');
  });
  it('data olmayan satır boş döner', () => {
    expect(parseSseLine(': keep-alive')).toBe('');
    expect(parseSseLine('')).toBe('');
  });
  it('bozuk JSON çökmez', () => {
    expect(parseSseLine('data: {bozuk')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Tetikleme yönlendirmesi — karar GLM'de değil, hızlı modelde verilir
// ---------------------------------------------------------------------------

describe('sseFinishReason — sessiz kesilme yakalanır', () => {
  it('length bitişini okur', () => {
    expect(
      sseFinishReason('data: {"choices":[{"delta":{},"finish_reason":"length"}]}'),
    ).toBe('length');
  });

  it('normal bitişi okur', () => {
    expect(sseFinishReason('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}')).toBe('stop');
  });

  it('devam eden parçada null döner', () => {
    expect(sseFinishReason('data: {"choices":[{"delta":{"content":"{"}}]}')).toBeNull();
  });

  it('[DONE] ve bozuk satırda çökmez', () => {
    expect(sseFinishReason('data: [DONE]')).toBeNull();
    expect(sseFinishReason('data: {bozuk')).toBeNull();
    expect(sseFinishReason('event: ping')).toBeNull();
  });
});

describe('PDF prompt kuralı', () => {
  it('PDF için "find/replace kullan" kuralı EKLENİR', () => {
    const p = pdfPromptKuraliVarMi('pdf');
    expect(p).toBe(true);
  });

  it('docx/pptx/xlsx için EKLENMEZ — orada metin yeniden dizilebiliyor', () => {
    // Taban prompt "paragrafı yeniden yaz"ı tercih ediyor ve Word'de bu doğru.
    // PDF kuralı oraya sızarsa mevcut davranış bozulur.
    for (const f of ['docx', 'pptx', 'xlsx', undefined]) {
      expect(pdfPromptKuraliVarMi(f)).toBe(false);
    }
  });
});
