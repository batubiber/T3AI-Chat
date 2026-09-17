import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { pptxBaytlari, pptxOlustur } from './pptxOlustur';
import { ORNEKLER } from '../../degerlendirme/pptx/ornekler';

const EMU = 914400;
async function slaytlar(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b) => Number(a.match(/\d+/)![0])-Number(b.match(/\d+/)![0]));
  return Promise.all(names.map(async (n) => new DOMParser().parseFromString(await zip.file(n)!.async('string'), 'application/xml')));
}
const text = (d: Document | Element) => Array.from(d.getElementsByTagName('a:t')).map((n) => n.textContent).join('');
function geometriyiDogrula(d: Document) {
  const shapes = [...Array.from(d.getElementsByTagName('p:sp')), ...Array.from(d.getElementsByTagName('p:graphicFrame'))];
  const boxes = shapes.map((s) => {
    const t = s.getElementsByTagName(s.nodeName === 'p:sp' ? 'a:xfrm' : 'p:xfrm')[0];
    const off = t.getElementsByTagName('a:off')[0], ext = t.getElementsByTagName('a:ext')[0];
    return { x: Number(off.getAttribute('x'))/EMU, y: Number(off.getAttribute('y'))/EMU, w: Number(ext.getAttribute('cx'))/EMU, h: Number(ext.getAttribute('cy'))/EMU, text: text(s) };
  }).sort((a,b) => a.y-b.y);
  for (const [i,b] of boxes.entries()) {
    expect(b.h, b.text).toBeGreaterThan(0);
    expect(b.x).toBeGreaterThanOrEqual(0.49);
    expect(b.x+b.w).toBeLessThanOrEqual(12.85);
    expect(b.y+b.h, b.text).toBeLessThanOrEqual(7.01);
    if (i) expect(b.y, b.text).toBeGreaterThanOrEqual(boxes[i-1].y+boxes[i-1].h+0.05);
  }
  for (const shape of Array.from(d.getElementsByTagName('p:sp'))) expect(shape.getElementsByTagName('a:bodyPr')[0].getAttribute('anchor')).toBe('t');
  for (const cell of Array.from(d.getElementsByTagName('a:tcPr'))) expect(cell.getAttribute('anchor')).toBe('t');
  for (const paragraph of Array.from(d.getElementsByTagName('a:p'))) expect(paragraph.getElementsByTagName('a:pPr').length).toBeLessThanOrEqual(1);
}

describe('PPTX gerçek dosya yerleşimi', () => {
  for (const [name, blocks] of Object.entries(ORNEKLER)) it(`${name}: metin/tablo kutuları başlığı ve birbirini örtmez, slayt içinde kalır`, async () => {
    const docs = await slaytlar(await pptxBaytlari(blocks));
    docs.forEach(geometriyiDogrula);
    if (name === 'kisa') expect(docs).toHaveLength(2);
    else expect(docs.length).toBeGreaterThan(1);
    if (name === 'yogun') {
      const all = docs.map(text).join('');
      for (let i=1; i<=12; i++) expect(all.split(`ADIM${i}:`)).toHaveLength(2);
      const nums = docs.flatMap((d) => Array.from(d.getElementsByTagName('a:buAutoNum')).map((n) => Number(n.getAttribute('startAt'))));
      expect(nums).toEqual(Array.from({length:12},(_,i)=>i+1));
    }
    if (name === 'tablo') {
      for (const d of docs) for (const table of Array.from(d.getElementsByTagName('a:tbl'))) expect(text(table.getElementsByTagName('a:tr')[0])).toBe('TesisBulgu ve yapılacak işlemSorumlu');
      const all = docs.map(text).join('');
      for (let i=1; i<=15; i++) expect(all).toContain(`EKİP${i}`);
      expect(all).toContain('TABLOSONU:');
    }
  });
  it('tek uzun paragrafı sayfalarken metin ve kalın koşu kaybolmaz', async () => {
    const content = Array.from({length:600},(_,i)=>`KELİME${i} `).join('');
    const {baytlar, ekSlaytSayisi} = await pptxOlustur([{ tip:'baslik', seviye:2, metin:'Uzun paragraf' }, { tip:'paragraf', parcalar:[{metin:content,kalin:true}] }]);
    expect(ekSlaytSayisi).toBeGreaterThan(0);
    const docs = await slaytlar(baytlar); docs.forEach(geometriyiDogrula);
    const runs = docs.flatMap((d) => Array.from(d.getElementsByTagName('a:r'))).filter((r)=>text(r).includes('KELİME'));
    expect(runs.map(text).join('')).toBe(content);
    for (const r of runs) expect(r.getElementsByTagName('a:rPr')[0].getAttribute('b')).toBe('1');
  });
  it('tek uzun tablo satırının bütün hücrelerini devam slaytlarında korur', async () => {
    const content = Array.from({length:400},(_,i)=>`HÜCRE${i} `).join('');
    const docs = await slaytlar(await pptxBaytlari([{tip:'tablo',basliklar:['Kimlik','Açıklama'],satirlar:[['TEK-KAYIT',content],['SON-KAYIT','TAMAMLANDI']]}]));
    expect(docs.length).toBeGreaterThan(1); docs.forEach(geometriyiDogrula);
    const cells = docs.flatMap((d)=>Array.from(d.getElementsByTagName('a:tc'))).map(text);
    expect(cells.filter((t)=>t.includes('HÜCRE')).join('')).toBe(content);
    expect(cells).toContain('SON-KAYIT'); expect(cells).toContain('TAMAMLANDI');
  });
  it('çok uzun başlığı gövdenin üzerine taşırmak yerine açık hata verir', async () => {
    await expect(pptxBaytlari([{tip:'baslik',seviye:2,metin:'Uzun başlık '.repeat(300)}])).rejects.toThrow('başlığı');
  });
  it('kısa sunum için ek slayt uyarısı üretmez', async () => {
    expect((await pptxOlustur(ORNEKLER.kisa)).ekSlaytSayisi).toBe(0);
  });
});
