import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BELGE_URET_ARACI } from './belgeUretimKapisi';
import { belgeDuzenleAraci } from './belgeDuzenlemeAraci';
import { hafizaAraci } from './hafizaOnerisi';

/**
 * Değerlendirme setinin kullandığı araç tanımları, uygulamanın GÖNDERDİĞİ
 * tanımlarla aynı mı?
 *
 * Ayrı bir JSON tutmak zorundayız: değerlendirme betiği Windows'ta saf
 * Python ile koşuyor, TypeScript'i okuyamaz. Ama kopya sessizce bayatlarsa
 * set artık gönderdiğimiz şeyi ölçmez — "yeşil ama yanlış şeyi test ediyor"
 * durumu, testin hiç olmamasından kötüdür.
 *
 * Tanımlar değişince: ARACLARI_GUNCELLE=1 npx vitest run degerlendirmeAraclari
 */
const YOL = path.resolve(__dirname, '../../degerlendirme/araclar.json');

/** Düzenleme aracı dosya adına göre üretiliyor; set hep bu örneği kullanıyor. */
const ORNEK_DOSYA = 'rapor.docx';
const ORNEK_TUR = 'Word belgesi';

describe('degerlendirme/araclar.json', () => {
  it('uygulamanın gönderdiği araç tanımlarıyla birebir aynı', () => {
    const beklenen = {
      belge_uret: BELGE_URET_ARACI,
      belge_duzenle: belgeDuzenleAraci(ORNEK_DOSYA, ORNEK_TUR),
      proje_hafizasi_ekle: hafizaAraci(),
      ornek: { dosya: ORNEK_DOSYA, turEtiketi: ORNEK_TUR },
    };
    const metin = JSON.stringify(beklenen, null, 2) + '\n';

    if (process.env.ARACLARI_GUNCELLE === '1') {
      fs.mkdirSync(path.dirname(YOL), { recursive: true });
      fs.writeFileSync(YOL, metin, 'utf-8');
    }

    expect(fs.existsSync(YOL), `${YOL} yok — ARACLARI_GUNCELLE=1 ile üret`).toBe(true);
    expect(fs.readFileSync(YOL, 'utf-8')).toBe(metin);
  });
});
