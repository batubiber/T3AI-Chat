import { describe, it, expect } from 'vitest';
import { yedekModelSec, yedekDenensinMi } from './yedekModel';

const M = (id: string, ek: Partial<{ disabled: boolean; supportsVision: boolean }> = {}) =>
  ({ id, disabled: false, supportsVision: false, ...ek });

describe('yedekDenensinMi', () => {
  it('sunucu hatasında (5xx) yedeğe düşülüyor', () => {
    expect(yedekDenensinMi(500)).toBe(true);
    expect(yedekDenensinMi(502)).toBe(true);
    expect(yedekDenensinMi(503)).toBe(true);
  });

  it('AĞ HATASINDA da düşülüyor — uç hiç cevap vermedi', () => {
    // vLLM makinesi kapalıysa fetch yanıt bile döndürmüyor.
    expect(yedekDenensinMi(null)).toBe(true);
  });

  it('istemci hatalarında DÜŞÜLMÜYOR — öteki model de aynı cevabı verir', () => {
    // 400 bizde girdi doğrulama ve bağlam taşması için kullanılıyor; ikisi de
    // model değiştirerek çözülmez, taşmanın kendi telafisi var.
    expect(yedekDenensinMi(400)).toBe(false);
    expect(yedekDenensinMi(401)).toBe(false);
    expect(yedekDenensinMi(404)).toBe(false);
    expect(yedekDenensinMi(429)).toBe(false);
  });

  it('başarılı yanıtta düşülmüyor', () => {
    expect(yedekDenensinMi(200)).toBe(false);
  });
});

describe('yedekModelSec', () => {
  const modeller = [M('glm-5.2'), M('gemma-4-31b', { supportsVision: true }), M('eski', { disabled: true })];

  it('seçili olmayan ilk açık modeli seçiyor', () => {
    expect(yedekModelSec('glm-5.2', modeller, false)).toBe('gemma-4-31b');
  });

  it('KAPALI modeller aday değil', () => {
    expect(yedekModelSec('glm-5.2', [M('glm-5.2'), M('eski', { disabled: true })], false)).toBeNull();
  });

  it('tek model varsa yedek YOK', () => {
    expect(yedekModelSec('glm-5.2', [M('glm-5.2')], false)).toBeNull();
  });

  it('turda RESİM varsa yalnız görsel anlayan modele düşülüyor', () => {
    // Görsel anlamayan modele düşmek resimleri sessizce kaybettirirdi:
    // kullanıcı resmi sorduğu cevabı alır ama model resmi hiç görmemiştir.
    expect(yedekModelSec('gemma-4-31b', modeller, true)).toBeNull();
    expect(yedekModelSec('glm-5.2', modeller, true)).toBe('gemma-4-31b');
  });

  it('resim yoksa görsel desteği aranmıyor', () => {
    expect(yedekModelSec('gemma-4-31b', modeller, false)).toBe('glm-5.2');
  });

  it('boş listede çökmüyor', () => {
    expect(yedekModelSec('glm-5.2', [], false)).toBeNull();
  });
});
