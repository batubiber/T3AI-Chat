import { describe, it, expect } from 'vitest';
import { filterThinkContent } from './thinkFilter';

describe('filterThinkContent — <think> etiketleri', () => {
  it('YALNIZ KAPANIŞ etiketi olan içerikte etiket temizlenir (canlı hata)', () => {
    /**
     * Bildirilen hata: kullanıcı tablo istedi, cevap
     *   "</think>| Gün | Nöbetçi || ---|---|| Pazartesi ..."
     * diye çıktı.
     *
     * Sebep: hızlı yol yalnız '<think>' arıyordu. GLM'de akıl yürütme ayrı bir
     * alandan (reasoning_content) geldiği için görünen içerikte AÇILIŞ etiketi
     * hiç olmuyor, yalnız artakalan KAPANIŞ etiketi geliyordu; koşul sağlanıyor
     * ve içerik olduğu gibi dönüyordu.
     *
     * Etiket ilk satıra yapıştığı için tablo başlığı '|' ile başlamıyor,
     * remark-gfm tabloyu göremiyor ve her şey tek paragraf olarak basılıyor —
     * paragrafta tek satır sonları boşluğa döndüğü için tablo "tek satır"
     * görünüyordu. Tek kök neden, iki belirti.
     */
    const ham = '</think>| Gün | Nöbetçi |\n| --- | --- |\n| Pazartesi | Deniz |';
    const r = filterThinkContent(ham);

    expect(r.visibleContent).not.toContain('</think>');
    // Tablo satırı artık '|' ile başlıyor → ayrıştırılabilir
    expect(r.visibleContent.split('\n')[0]).toBe('| Gün | Nöbetçi |');
    expect(r.isThinking).toBe(false);
  });

  it('satır sonları KORUNUR — tablo yapısı bozulmamalı', () => {
    const ham = '</think>| A | B |\n| --- | --- |\n| 1 | 2 |';
    expect(filterThinkContent(ham).visibleContent.split('\n')).toHaveLength(3);
  });

  it('tam blok: düşünce ayrılır, görünen içerik kalır', () => {
    const r = filterThinkContent('<think>düşünüyorum</think>Cevap burada.');
    expect(r.visibleContent).toBe('Cevap burada.');
    expect(r.thinkContent).toContain('düşünüyorum');
    expect(r.isThinking).toBe(false);
  });

  it('kapanmamış blok: hâlâ düşünüyor, içerik gösterilmez', () => {
    const r = filterThinkContent('<think>henüz bitmedi');
    expect(r.visibleContent).toBe('');
    expect(r.isThinking).toBe(true);
  });

  it('hiç etiket yoksa içerik aynen geçer', () => {
    const r = filterThinkContent('Düz bir cevap.');
    expect(r.visibleContent).toBe('Düz bir cevap.');
    expect(r.isThinking).toBe(false);
    expect(r.thinkContent).toBe('');
  });

  it('birden çok blok temizlenir', () => {
    const r = filterThinkContent('<think>bir</think>A<think>iki</think>B');
    expect(r.visibleContent).toBe('AB');
  });

  it('metin içinde geçen kapanış etiketi de temizlenir', () => {
    const r = filterThinkContent('Önce şunu</think> sonra bunu');
    expect(r.visibleContent).not.toContain('</think>');
  });
});

describe('filterThinkContent — diğer biçimler bozulmadı', () => {
  it('Harmony biçimi kendi yoluna gider', () => {
    const r = filterThinkContent(
      '<|channel|>analysis<|message|>akıl yürütme<|channel|>final<|message|>Cevap',
    );
    expect(r.visibleContent).toBe('Cevap');
    expect(r.thinkContent).toContain('akıl yürütme');
  });

  it('Gemma kanal biçimi kendi yoluna gider', () => {
    const r = filterThinkContent('<|channel>thoughtdüşünce<channel|>Cevap');
    expect(r.visibleContent).toBe('Cevap');
    expect(r.thinkContent).toContain('düşünce');
  });
});
