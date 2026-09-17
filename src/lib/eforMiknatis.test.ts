import { describe, it, expect } from 'vitest';
import { miknatisla, durakIndeksi, MIKNATIS_ESIGI } from './eforMiknatis';

describe('miknatisla', () => {
  it('durağa YAKINSA tam durağa oturuyor', () => {
    expect(miknatisla(1.05)).toBe(1);
    expect(miknatisla(0.93)).toBe(1);
    expect(miknatisla(2 - MIKNATIS_ESIGI)).toBe(2);
  });

  it('duraklar ARASINDA serbest — bar parmağı takip ediyor', () => {
    // Asıl istenen bu: kesikli sıçrama değil, kesintisiz hareket.
    expect(miknatisla(1.5)).toBe(1.5);
    expect(miknatisla(0.5)).toBe(0.5);
  });

  it('eşiğin TAM sınırında kitleniyor, bir tık ötesinde serbest', () => {
    expect(miknatisla(1 + MIKNATIS_ESIGI)).toBe(1);
    expect(miknatisla(1 + MIKNATIS_ESIGI + 0.01)).toBeCloseTo(1 + MIKNATIS_ESIGI + 0.01, 5);
  });

  it('tam durakta zaten durakta', () => {
    expect(miknatisla(0)).toBe(0);
    expect(miknatisla(2)).toBe(2);
  });

  it('bozuk değerde çökmüyor', () => {
    expect(miknatisla(NaN)).toBe(0);
  });
});

describe('durakIndeksi', () => {
  it('en yakın durağı veriyor', () => {
    expect(durakIndeksi(0.4, 3)).toBe(0);
    expect(durakIndeksi(0.6, 3)).toBe(1);
    expect(durakIndeksi(1.5, 3)).toBe(2);
  });

  it('sınırların DIŞINA taşmıyor', () => {
    // Aksi hâlde merdiven dizisinde undefined okunur ve bileşen çöker.
    expect(durakIndeksi(-5, 3)).toBe(0);
    expect(durakIndeksi(99, 3)).toBe(2);
  });

  it('boş merdivende çökmüyor', () => {
    expect(durakIndeksi(1, 0)).toBe(0);
  });
});
