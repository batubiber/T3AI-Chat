import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { xlsxBaytlari } from './usageExport';

const HAFTALAR = [
  { haftaBasi: '2026-08-17', istek: 3 },
  { haftaBasi: '2026-08-10', istek: 1 },
];
const MODELLER = [{ ad: 'glm-5.2', istek: 3 }, { ad: 'gemma-4-31b', istek: 1 }];
const UYGULAMALAR = [{ ad: 't3ai', istek: 4 }];

/** Üretilen baytları geri oku — dosyanın gerçekten açılabildiğini kanıtlar */
const geriOku = (bayt: Uint8Array) => XLSX.read(bayt, { type: 'array' });
const satirlar = (wb: XLSX.WorkBook, sayfa: string) =>
  XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets[sayfa], { header: 1 });

describe('xlsxBaytlari', () => {
  it('üç sayfa üretir', () => {
    const wb = geriOku(xlsxBaytlari(HAFTALAR, MODELLER, UYGULAMALAR));
    expect(wb.SheetNames).toEqual(['Haftalık', 'Model', 'Uygulama']);
  });

  it('haftalık sayfada başlık ve satırlar doğru', () => {
    const s = satirlar(geriOku(xlsxBaytlari(HAFTALAR, MODELLER, UYGULAMALAR)), 'Haftalık');
    expect(s[0]).toEqual(['Hafta', 'İstek']);
    expect(s[1]).toEqual(['2026-08-17', 3]);
    expect(s).toHaveLength(3);
  });

  it('model sayfasında başlık ve satırlar doğru', () => {
    const s = satirlar(geriOku(xlsxBaytlari(HAFTALAR, MODELLER, UYGULAMALAR)), 'Model');
    expect(s[0]).toEqual(['Model', 'İstek']);
    expect(s[1]).toEqual(['glm-5.2', 3]);
    expect(s[2]).toEqual(['gemma-4-31b', 1]);
    expect(s).toHaveLength(3);
  });

  it('uygulama sayfasında başlık ve satırlar doğru', () => {
    const s = satirlar(geriOku(xlsxBaytlari(HAFTALAR, MODELLER, UYGULAMALAR)), 'Uygulama');
    expect(s[0]).toEqual(['Uygulama', 'İstek']);
    expect(s[1]).toEqual(['t3ai', 4]);
  });

  it('boş veride başlıklı ama satırsız dosya', () => {
    const wb = geriOku(xlsxBaytlari([], [], []));
    expect(satirlar(wb, 'Haftalık')).toEqual([['Hafta', 'İstek']]);
    expect(satirlar(wb, 'Model')).toEqual([['Model', 'İstek']]);
    expect(satirlar(wb, 'Uygulama')).toEqual([['Uygulama', 'İstek']]);
  });

  it('Uint8Array döner — Blob değil', () => {
    expect(xlsxBaytlari(HAFTALAR, MODELLER, UYGULAMALAR)).toBeInstanceOf(Uint8Array);
  });
});
