import { describe, it, expect } from 'vitest';
import { butceyeSigdir, KIRPMA_ISARETI, type Mesaj } from './baglamButcesi';
import { estimateTokens, estimateMessagesTokens } from './tokenEstimator';

/** Test için deterministik ölçüm: 1 karakter = 1 token. */
const olc = (m: string) => m.length;
const M = (role: 'user' | 'assistant', content: string): Mesaj => ({ role, content });

describe('butceyeSigdir', () => {
  it('zaten sığıyorsa HİÇBİR ŞEYE dokunmaz', () => {
    const s = butceyeSigdir({
      sistem: 'sis', kararsizParcalar: ['rag'], gecmis: [M('user', 'selam')], tavan: 1000,
    }, olc);
    expect(s.kararsizParcalar).toEqual(['rag']);
    expect(s.gecmis.map(m => m.content)).toEqual(['selam']);
    expect(s.kirpmalar).toEqual([]);
  });

  it('ÖNCE RAG bağlamını kırpar — geçmişe dokunmadan', () => {
    // RAG yeniden getirilebilir; kullanıcının yazdığı metin getirilemez.
    const s = butceyeSigdir({
      sistem: 'x'.repeat(10),
      kararsizParcalar: ['r'.repeat(500)],
      gecmis: [M('user', 'kısa soru')],
      tavan: 200,
    }, olc);
    expect(s.gecmis[0].content).toBe('kısa soru');          // dokunulmadı
    expect(olc(s.kararsizParcalar.join(''))).toBeLessThan(500);
    expect(s.kirpmalar.some(k => k.tur === 'baglam')).toBe(true);
  });

  it('RAG yetmezse ESKİ mesajları düşürür, en yenisini korur', () => {
    const s = butceyeSigdir({
      sistem: '', kararsizParcalar: [],
      gecmis: [M('user', 'e'.repeat(300)), M('assistant', 'a'.repeat(300)), M('user', 'yeni soru')],
      tavan: 60,
    }, olc);
    expect(s.gecmis[s.gecmis.length - 1].content).toBe('yeni soru');
    expect(s.gecmis.length).toBeLessThan(3);
    expect(s.kirpmalar.some(k => k.tur === 'mesaj')).toBe(true);
  });

  it('en yeni mesaj ASLA tamamen düşürülmez — kırpılır ama KALIR', () => {
    // Hepsini düşürmek de tavana "sığar" ama modele gönderilecek bir soru
    // kalmaz. Eski mesajları düşürme adımı en yeniye dokunamamalı.
    const s = butceyeSigdir({
      sistem: '', kararsizParcalar: [],
      gecmis: [M('user', 'e'.repeat(100)), M('user', 'y'.repeat(100))], tavan: 50,
    }, olc);
    expect(s.gecmis).toHaveLength(1);
    expect(s.gecmis[0].content.length).toBeGreaterThan(0);
  });

  it('SON kullanıcı mesajı tek başına taşıyorsa onu da kırpar — hata vermektense', () => {
    // Kullanıcı dev bir metin yapıştırdı. Sessizce başarısız olmak yerine
    // kırpıp gönderiyoruz; ne olduğu kirpmalar'da yazıyor.
    const s = butceyeSigdir({
      sistem: '', kararsizParcalar: [], gecmis: [M('user', 'u'.repeat(1000))], tavan: 100,
    }, olc);
    expect(olc(s.gecmis[0].content)).toBeLessThanOrEqual(100);
    expect(s.gecmis[0].content).toContain(KIRPMA_ISARETI);
  });

  it('SONUÇ HER ZAMAN tavana sığar — asıl sözleşme bu', () => {
    // Bugünkü hata tam burada: kod taşmayı hesaplıyor, uyarıyor ve yine
    // gönderiyordu. Bu testin kırılması vLLM context-overflow demek.
    const senaryolar = [
      { sistem: 's'.repeat(50), kararsizParcalar: ['r'.repeat(900)], gecmis: [M('user', 'u'.repeat(400)), M('assistant', 'a'.repeat(400))], tavan: 120 },
      { sistem: '', kararsizParcalar: ['a'.repeat(100), 'b'.repeat(100)], gecmis: [M('user', 'x')], tavan: 30 },
      { sistem: 's'.repeat(29), kararsizParcalar: [], gecmis: [M('user', 'y'.repeat(50))], tavan: 30 },
    ];
    for (const g of senaryolar) {
      const s = butceyeSigdir(g, olc);
      const toplam = olc(g.sistem) + olc(s.kararsizParcalar.join('\n\n'))
        + s.gecmis.reduce((t, m) => t + olc(m.content), 0);
      expect(toplam).toBeLessThanOrEqual(g.tavan);
    }
  });

  it('sistem mesajı tavanı tek başına doldursa bile ÇÖKMEZ', () => {
    // Sistem mesajı kırpılmaz (kimlik + kurallar); geriye yer kalmazsa
    // geçmiş boşalır ama fonksiyon sonuç döner.
    const s = butceyeSigdir({
      sistem: 's'.repeat(500), kararsizParcalar: ['r'], gecmis: [M('user', 'soru')], tavan: 100,
    }, olc);
    expect(s.kararsizParcalar).toEqual([]);
    expect(Array.isArray(s.gecmis)).toBe(true);
  });

  it('kırpmalar NE KADAR yer kazanıldığını söylüyor', () => {
    const s = butceyeSigdir({
      sistem: '', kararsizParcalar: ['r'.repeat(500)], gecmis: [M('user', 'q')], tavan: 100,
    }, olc);
    const k = s.kirpmalar.find(x => x.tur === 'baglam')!;
    expect(k.oncekiToken).toBeGreaterThan(k.sonrakiToken);
  });

  it('boş girdide çökmüyor', () => {
    const s = butceyeSigdir({ sistem: '', kararsizParcalar: [], gecmis: [], tavan: 10 }, olc);
    expect(s.gecmis).toEqual([]);
    expect(s.kirpmalar).toEqual([]);
  });
});

describe('gerçek tahminciyle (varsayılan ölçüm)', () => {
  it('ölçüm ENJEKTE EDİLMEDEN de tavana sığar', () => {
    // Diğer testler sahte ölçüm veriyor; varsayılan parametre yolu hiç
    // çalışmıyordu. Gerçek senaryo: kullanıcı dev bir metin yapıştırıyor,
    // üstüne RAG bloğu biniyor.
    const tavan = 4000;
    const sonuc = butceyeSigdir({
      sistem: 'Sen bir asistansın. '.repeat(20),
      kararsizParcalar: ['İlgili Bağlam:\n' + 'belge içeriği '.repeat(3000)],
      gecmis: [
        { role: 'user', content: 'eski soru '.repeat(500) },
        { role: 'assistant', content: 'eski cevap '.repeat(500) },
        { role: 'user', content: 'yapıştırılmış dev metin '.repeat(4000) },
      ],
      tavan,
    });

    // ChatContext'in ölçtüğü gibi ölç: sistem + (parçalar + son mesaj) + diğerleri
    const gecmis = [...sonuc.gecmis];
    if (sonuc.kararsizParcalar.length > 0 && gecmis.length > 0) {
      const son = gecmis[gecmis.length - 1];
      gecmis[gecmis.length - 1] = {
        ...son, content: `${sonuc.kararsizParcalar.join('\n\n')}\n\n${son.content}`,
      };
    }
    const toplam = estimateMessagesTokens([
      { role: 'system', content: 'Sen bir asistansın. '.repeat(20) }, ...gecmis,
    ]);
    // Mesaj başına +4 ek yük var; tavan buna pay bırakacak şekilde çağrılıyor.
    expect(toplam).toBeLessThanOrEqual(tavan + 4 * (gecmis.length + 1));
    expect(sonuc.kirpmalar.length).toBeGreaterThan(0);
  });

  it('gerçek tahminci kısa girdiye DOKUNMUYOR', () => {
    const sonuc = butceyeSigdir({
      sistem: 'kısa sistem', kararsizParcalar: [], 
      gecmis: [{ role: 'user', content: 'merhaba' }], tavan: 4000,
    });
    expect(sonuc.kirpmalar).toEqual([]);
    expect(sonuc.gecmis[0].content).toBe('merhaba');
    expect(estimateTokens('merhaba')).toBeGreaterThan(0);
  });
});
