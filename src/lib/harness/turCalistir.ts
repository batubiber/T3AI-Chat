import type { AracBirikimi } from '../aracAkisi';
import { TurButcesi, TurSiniri } from './turButcesi';
import { aracHatasi, type AracSonucu, type DevamMesaji, type DurmaNedeni, type ModelTuruSonucu } from './tipler';

export interface TurSonucu {
  metin: string;
  durma: DurmaNedeni;
  sonuclar: AracSonucu[];
  devam: DevamMesaji[];
}

/** React ve HTTP'den bağımsız. Yazma araçları seri; kimlik aynı turda yalnız bir kez uygulanır. */
export async function turCalistir(g: {
  runId: string;
  butce: TurButcesi;
  model: (devam: DevamMesaji[]) => Promise<ModelTuruSonucu>;
  calistir: (cagri: AracBirikimi, modelId: string) => Promise<AracSonucu>;
}): Promise<TurSonucu> {
  const devam: DevamMesaji[] = [], sonuclar: AracSonucu[] = [];
  const uygulanan = new Map<string, { imza: string; sonuc: AracSonucu }>();
  const hataSayisi = new Map<string, number>(), hatalar = new Map<string, AracSonucu>();
  let sonMetin = '';
  const bitir = (durma: DurmaNedeni, metin: string): TurSonucu => ({ durma, metin, sonuclar, devam });
  /**
   * Durma bildirimine belge cümlesini YALNIZ bu turda gerçekten belge işi
   * olduysa ekler.
   *
   * "selam naber" yazıp yanıtı durduran kullanıcı ekranda "Tamamlanan belgeler
   * korunuyor." görüyordu. Ortada belge yok: cümle hem anlamsız hem de
   * kullanıcıya kaybettiği bir şey varmış hissi veriyor. Bildirim, kullanıcının
   * o an ne yaptığına göre değişmeli — sıradan sohbette belgeden hiç söz etme.
   */
  const belgeNotu = (belgeIsiVar: boolean, cumle: string) => (belgeIsiVar ? ' ' + cumle : '');
  try {
    for (let adim = 0; adim < g.butce.sinir.anaAdim; adim++) {
      g.butce.anaAdimBaslat();
      const m = await g.model([...devam]);
      g.butce.kontrol();
      sonMetin = m.metin;
      const cagrilar = [...m.cagrilar].sort((a, b) => a.index - b.index);
      if (m.eksik || !m.bitis || m.bitis === 'length') {
        const kismi = !cagrilar.length && m.metin.trim() ? m.metin + '\n\n' : '';
        return bitir('akis-kesildi', kismi + 'Yanıt akışı tamamlanamadı.' + belgeNotu(sonuclar.length > 0 || cagrilar.length > 0, 'Bu adımdaki belge işlemleri başlatılmadı.'));
      }
      if (!cagrilar.length) {
        if (m.bitis === 'tool_calls') return bitir('arac-hatasi', 'Model araç çağrısını tamamlayamadı.' + belgeNotu(sonuclar.length > 0, 'Yeni bir belge işlemi yapılmadı.'));
        if (hatalar.size) return bitir('arac-hatasi', `Belge işlemi tamamlanamadı. ${[...hatalar.values()].map((r) => r.hata?.mesaj).filter(Boolean).join(' ')}`);
        const uyarilar = [...new Set(sonuclar.flatMap((r) => r.uyarilar))];
        const ek = uyarilar.length ? '\n\nBelge uyarıları: ' + uyarilar.join(' ') : '';
        const metin = (m.metin.trim() || (sonuclar.length ? 'Belge işleminin sonucunu sohbetten inceleyebilirsiniz.' : 'Model görünür bir yanıt üretmedi.')) + ek;
        return bitir(m.metin.trim() || sonuclar.length ? 'tamamlandi' : 'akis-kesildi', metin);
      }
      // Son model turundan sonra araç çalıştırma: sonucu değerlendirmek için
      // başka bir tur kalmadı. Böylece sınırdan sonra yeni yan etki başlamaz.
      if (adim + 1 >= g.butce.sinir.anaAdim) throw new TurSiniri('Yanıt adımı sınırına ulaşıldı.');
      const ids = new Set<string>();
      for (const c of cagrilar) {
        if (c.hata || !c.id?.trim() || c.id.length > 128 || ids.has(c.id) || !Number.isInteger(c.index) || c.index < 0 || !c.ad || c.ad.length > 64 || c.argumanlar.length > 32768) {
          return bitir('arac-hatasi', 'Araç çağrıları eksik veya birbiriyle çelişiyor; bu adımdaki işlemler başlatılmadı.');
        }
        ids.add(c.id);
        const eski = uygulanan.get(`${g.runId}:${c.id}`);
        if (eski && eski.imza !== JSON.stringify([c.ad, c.argumanlar])) {
          return bitir('arac-hatasi', 'Aynı araç kimliği farklı bir işlem için kullanıldı; işlem yeniden uygulanmadı.');
        }
      }
      devam.push({ role: 'assistant', content: m.metin, tool_calls: cagrilar.map((c) => ({ id: c.id!, type: 'function', function: { name: c.ad, arguments: c.argumanlar } })) });
      for (const c of cagrilar) {
        g.butce.kontrol();
        const key = `${g.runId}:${c.id}`, imza = JSON.stringify([c.ad, c.argumanlar]);
        let r = uygulanan.get(key)?.sonuc;
        if (!r) {
          if ((hataSayisi.get(c.ad) ?? 0) >= 2) return bitir('arac-hatasi', 'Belge işlemi bir düzeltme denemesinden sonra da tamamlanamadı.');
          g.butce.aracBaslat();
          try { r = await g.calistir(c, m.modelId); }
          catch (err) {
            g.butce.kontrol();
            if (err instanceof TurSiniri) throw err;
            // Yazmanın sonucu belirsiz olabilecek istisnalar otomatik tekrarlanmaz.
            r = aracHatasi('calistirma', err instanceof Error ? err.message : 'Araç çalıştırılamadı.');
          }
          if (!r) r = aracHatasi('sonuc-yok', 'Araç doğrulanabilir bir sonuç döndürmedi.');
          uygulanan.set(key, { imza, sonuc: r });
          sonuclar.push(r);
          if (r.durum === 'hata') {
            hatalar.set(c.ad, r);
            hataSayisi.set(c.ad, r.hata?.onarilabilir ? (hataSayisi.get(c.ad) ?? 0) + 1 : 2);
          } else hatalar.delete(c.ad);
        }
        devam.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(r) });
        g.butce.kontrol();
      }
      if ([...hataSayisi].some(([ad, n]) => n >= 2 && hatalar.get(ad)?.hata?.onarilabilir)) {
        return bitir('arac-hatasi', `Belge işlemi bir düzeltme denemesinden sonra da tamamlanamadı. ${[...hatalar.values()].map((r) => r.hata?.mesaj).join(' ')}`);
      }
    }
    throw new TurSiniri('Yanıt adımı sınırına ulaşıldı.');
  } catch (err) {
    let neden = err;
    try { g.butce.kontrol(); } catch (kontrol) { neden = kontrol; }
    if (neden instanceof TurSiniri) return bitir('sinir', neden.message + belgeNotu(sonuclar.length > 0, 'Tamamlanan belgeler korunuyor; yeni bir işlem başlatılmadı.'));
    // Kullanıcı durdurdu: belge cümlesi BİLEREK yok. Belge üretilmiş olsa bile
    // panelde duruyor, ayrıca söylemek gereksiz. Akışta ekrana gelmiş yarım
    // metni ChatContext ekler — model çağrısı fırlatarak bittiği için burada yok.
    if (g.butce.signal.aborted) return bitir('iptal', 'İşlem durduruldu.');
    return bitir('akis-kesildi', `Yanıt tamamlanamadı. ${neden instanceof Error ? neden.message : sonMetin}`);
  }
}
