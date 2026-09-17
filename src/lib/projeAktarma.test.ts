import { describe, it, expect } from 'vitest';
import {
  disaAktarmaKur, iceAktarmayaHazirla, AKTARMA_TURU, AKTARMA_SURUMU,
} from './projeAktarma';

/** Deterministik id üreteci: n1, n2, ... */
function sayac() {
  let n = 0;
  return () => `n${++n}`;
}

const T = new Date('2026-01-02T03:04:05.000Z');

const ornekProje = {
  id: 'p1', name: 'Deneme', instructions: 'Kısa cevapla', memory: 'not',
  createdAt: T, updatedAt: T,
};
const ornekDosyalar = [
  { id: 'f1', projectId: 'p1', name: 'a.md', content: '# a', mimeType: 'text/markdown', size: 3, createdAt: T },
];
const ornekSohbetler = [{ id: 'c1', title: 'Sohbet', projectId: 'p1', createdAt: T, updatedAt: T }];
const ornekMesajlar = [
  { id: 'm1', conversationId: 'c1', role: 'user' as const, content: 'selam', createdAt: T },
  { id: 'm2', conversationId: 'c1', role: 'assistant' as const, content: 'merhaba', createdAt: T, forkedFrom: 'm1', artifactId: 'a1' },
];
const ornekBelgeler = [{ id: 'd1', name: 'a.md', content: '# a', createdAt: T }];
const ornekParcalar = [
  { id: 'k1', documentId: 'd1', projectId: 'p1', content: 'parça', embedding: [0.1, 0.2], createdAt: T },
  { id: 'k2', documentId: 'd1', projectId: 'p1', conversationId: 'c1', content: 'sohbet parçası', createdAt: T },
];

const tamDosya = () => disaAktarmaKur({
  proje: ornekProje, dosyalar: ornekDosyalar,
  sohbetler: ornekSohbetler, mesajlar: ornekMesajlar,
  belgeler: ornekBelgeler, parcalar: ornekParcalar,
}, T);

/** Gerçek kullanımdaki gibi: JSON'a yaz, geri oku. */
const turla = (d: unknown) => JSON.parse(JSON.stringify(d));

describe('disaAktarmaKur', () => {
  it('tür ve sürüm damgası koyuyor', () => {
    const d = tamDosya();
    expect(d.tur).toBe(AKTARMA_TURU);
    expect(d.surum).toBe(AKTARMA_SURUMU);
  });

  it('artifactId HİÇ yazılmıyor — Blob JSON\'da taşınmıyor', () => {
    // editedBlob JSON'da {} olur; alıcıda çalışmayan bir indirme kartı çıkardı.
    const d = turla(tamDosya());
    expect(JSON.stringify(d)).not.toContain('artifactId');
  });

  it('sohbetler dahil edilmediyse sohbete bağlı parçalar da DÜŞÜYOR', () => {
    // conversationId taşıyan chunk sohbete ait, projeye değil; sohbetsiz
    // aktarımda öksüz kalırdı.
    const d = disaAktarmaKur({
      proje: ornekProje, dosyalar: ornekDosyalar, belgeler: ornekBelgeler, parcalar: ornekParcalar,
    }, T);
    expect(d.parcalar?.map(p => p.id)).toEqual(['k1']);
    expect(d.sohbetler).toBeUndefined();
    expect(d.mesajlar).toBeUndefined();
  });
});

describe('iceAktarmayaHazirla', () => {
  it('KAYNAK id\'lerinden hiçbiri sonuca sızmıyor', () => {
    // En güçlü değişmez: sızan bir id, var olan bir kaydı ezme riski.
    const h = iceAktarmayaHazirla(turla(tamDosya()), sayac());
    const metin = JSON.stringify(h);
    for (const eski of ['"p1"', '"f1"', '"c1"', '"m1"', '"m2"', '"d1"', '"k1"']) {
      expect(metin).not.toContain(eski);
    }
  });

  it('proje adı ve talimatları korunuyor', () => {
    const h = iceAktarmayaHazirla(turla(tamDosya()), sayac());
    expect(h.proje.name).toBe('Deneme');
    expect(h.proje.instructions).toBe('Kısa cevapla');
  });

  it('her mesaj VAR OLAN bir sohbete bağlı', () => {
    const h = iceAktarmayaHazirla(turla(tamDosya()), sayac());
    const sohbetIdleri = new Set(h.sohbetler.map(s => s.id));
    for (const m of h.mesajlar) expect(sohbetIdleri.has(m.conversationId)).toBe(true);
  });

  it('her parça VAR OLAN bir belgeye ve projeye bağlı', () => {
    const h = iceAktarmayaHazirla(turla(tamDosya()), sayac());
    const belgeIdleri = new Set(h.belgeler.map(b => b.id));
    for (const p of h.parcalar) {
      expect(belgeIdleri.has(p.documentId)).toBe(true);
      expect(p.projectId).toBe(h.proje.id);
    }
  });

  it('dosyalar YENİ projeye bağlanıyor', () => {
    const h = iceAktarmayaHazirla(turla(tamDosya()), sayac());
    for (const f of h.dosyalar) expect(f.projectId).toBe(h.proje.id);
  });

  it('forkedFrom hedefi aktarıldıysa YENİ id\'ye eşleniyor', () => {
    const h = iceAktarmayaHazirla(turla(tamDosya()), sayac());
    const kaynak = h.mesajlar.find(m => m.content === 'merhaba')!;
    const hedef = h.mesajlar.find(m => m.content === 'selam')!;
    expect(kaynak.forkedFrom).toBe(hedef.id);
  });

  it('forkedFrom hedefi YOKSA alan düşüyor — öksüz referans kalmıyor', () => {
    const dosya = turla(tamDosya());
    dosya.mesajlar = [{ ...dosya.mesajlar[1], forkedFrom: 'olmayan-mesaj' }];
    const h = iceAktarmayaHazirla(dosya, sayac());
    expect(h.mesajlar[0].forkedFrom).toBeUndefined();
  });

  it('TARİHLER Date nesnesine dönüyor — Dexie indeksleri string ile bozulur', () => {
    const h = iceAktarmayaHazirla(turla(tamDosya()), sayac());
    expect(h.proje.createdAt).toBeInstanceOf(Date);
    expect(h.mesajlar[0].createdAt).toBeInstanceOf(Date);
    expect(h.parcalar[0].createdAt).toBeInstanceOf(Date);
  });

  it('embedding korunuyor (yedek senaryosu)', () => {
    const h = iceAktarmayaHazirla(turla(tamDosya()), sayac());
    expect(h.parcalar.find(p => p.embedding)?.embedding).toEqual([0.1, 0.2]);
  });

  it('PAYLAŞIM dosyası (yalnız proje + dosyalar) çalışıyor', () => {
    const d = turla(disaAktarmaKur({ proje: ornekProje, dosyalar: ornekDosyalar }, T));
    const h = iceAktarmayaHazirla(d, sayac());
    expect(h.dosyalar).toHaveLength(1);
    expect(h.sohbetler).toEqual([]);
    expect(h.parcalar).toEqual([]);
  });

  it('YANLIŞ tür anlaşılır hatayla reddediliyor', () => {
    expect(() => iceAktarmayaHazirla({ tur: 't3ai-sohbet', surum: 1 }, sayac()))
      .toThrow(/proje dışa aktarma dosyası/i);
  });

  it('İLERİ sürüm reddediliyor — sessizce yanlış okumaktansa', () => {
    expect(() => iceAktarmayaHazirla({ ...turla(tamDosya()), surum: 99 }, sayac()))
      .toThrow(/sürüm/i);
  });

  it('çöp girdi çökmüyor, anlaşılır hata veriyor', () => {
    for (const cop of [null, 'metin', 42, [], {}]) {
      expect(() => iceAktarmayaHazirla(cop, sayac())).toThrow();
    }
  });
});
