import { describe, it, expect } from 'vitest';
import { geriSarilacakIdler, gorunurMesajlar } from './geriSarma';

const m = (id: string, geriSarildi?: boolean) => ({ id, geriSarildi });

describe('geriSarilacakIdler', () => {
  const liste = [m('1'), m('2'), m('3'), m('4')];

  it('seçilen mesaj DAHİL sonrasını döndürüyor', () => {
    // Kullanıcı "buradan geri sar" derken o mesajı da yeniden yazmak istiyor;
    // metni girdi kutusuna geri konuyor.
    expect(geriSarilacakIdler(liste, '2')).toEqual(['2', '3', '4']);
  });

  it('son mesajda yalnız kendisi', () => {
    expect(geriSarilacakIdler(liste, '4')).toEqual(['4']);
  });

  it('ilk mesajda tamamı', () => {
    expect(geriSarilacakIdler(liste, '1')).toEqual(['1', '2', '3', '4']);
  });

  it('bilinmeyen id hiçbir şey döndürmüyor — tahmin etmiyoruz', () => {
    // Yanlış tahmin, kullanıcının konuşmasını beklemediği yerden kesmek olurdu.
    expect(geriSarilacakIdler(liste, 'yok')).toEqual([]);
  });

  it('ZATEN geri sarılmışları saymıyor', () => {
    // Bir kez geri sarılan mesaj görünmüyor; ikinci geri sarmada tekrar
    // işaretlemek geri alma listesini kirletirdi.
    const karisik = [m('1'), m('2'), m('3', true), m('4')];
    expect(geriSarilacakIdler(karisik, '2')).toEqual(['2', '4']);
  });

  it('boş listede çökmüyor', () => {
    expect(geriSarilacakIdler([], '1')).toEqual([]);
  });
});

describe('gorunurMesajlar', () => {
  it('geri sarılanları eliyor', () => {
    expect(gorunurMesajlar([m('1'), m('2', true), m('3')]).map((x) => x.id)).toEqual(['1', '3']);
  });

  it('işaretsiz mesajlar duruyor', () => {
    expect(gorunurMesajlar([m('1'), m('2')]).length).toBe(2);
  });

  it('boş listede çökmüyor', () => {
    expect(gorunurMesajlar([])).toEqual([]);
  });
});
