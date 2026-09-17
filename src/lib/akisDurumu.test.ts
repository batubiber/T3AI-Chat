import { describe, it, expect } from 'vitest';
import { akisBaslat, akisGuncelle, akisBitir, aktifAkistanTuret } from './akisDurumu';

const BOS = new Map();

describe('akisBaslat', () => {
  it('yeni bir akış girdisi ekler', () => {
    const h = akisBaslat(BOS, 'sohbet-1', 'mesaj-1', 1000);
    expect(h.get('sohbet-1')).toEqual({
      mesajId: 'mesaj-1', icerik: '', hamIcerik: undefined,
      dusunuyor: true, ozetliyor: false,
      akilBaslangici: 1000,
    });
  });

  it('DİĞER sohbetlere dokunmaz', () => {
    // Eşzamanlılığın tamamı buna bağlı: ikinci sohbet başlarken birincinin
    // durumu olduğu gibi kalmalı.
    const h1 = akisBaslat(BOS, 'a', 'm-a', 1000);
    const h2 = akisGuncelle(h1, 'a', { icerik: 'merhaba' });
    const h3 = akisBaslat(h2, 'b', 'm-b', 2000);
    expect(h3.get('a')?.icerik).toBe('merhaba');
    expect(h3.get('b')?.icerik).toBe('');
    expect(h3.size).toBe(2);
  });

  it('girdi haritayı MUTASYONA UĞRATMAZ', () => {
    // React state: yerinde değişiklik yeniden çizimi tetiklemez.
    const h1 = akisBaslat(BOS, 'a', 'm-a', 1000);
    akisBaslat(h1, 'b', 'm-b', 2000);
    expect(h1.size).toBe(1);
  });
});

describe('akisGuncelle', () => {
  it('yalnız verilen alanları değiştirir', () => {
    const h = akisGuncelle(akisBaslat(BOS, 'a', 'm', 1000), 'a', { icerik: 'x', dusunuyor: false });
    expect(h.get('a')).toEqual({
      mesajId: 'm', icerik: 'x', hamIcerik: undefined,
      dusunuyor: false, ozetliyor: false, akilBaslangici: 1000,
    });
  });

  it('yalnız hedef sohbeti değiştirir', () => {
    let h = akisBaslat(BOS, 'a', 'm-a', 1000);
    h = akisBaslat(h, 'b', 'm-b', 1000);
    h = akisGuncelle(h, 'a', { icerik: 'A' });
    expect(h.get('a')?.icerik).toBe('A');
    expect(h.get('b')?.icerik).toBe('');
  });

  it('girdi haritayı MUTASYONA UĞRATMAZ', () => {
    // HER AKIŞ PARÇASINDA çalışan fonksiyon bu. Yerinde değiştirirse React
    // yeni bir referans görmez, yeniden çizmez ve akış DONMUŞ görünür.
    const h1 = akisBaslat(BOS, 'a', 'm', 1000);
    const h2 = akisGuncelle(h1, 'a', { icerik: 'x' });
    expect(h1.get('a')?.icerik).toBe('');
    expect(h2).not.toBe(h1);
  });

  it('olmayan sohbet için haritayı DEĞİŞTİRMEDEN döner', () => {
    const h1 = akisBaslat(BOS, 'a', 'm', 1000);
    const h2 = akisGuncelle(h1, 'yok', { icerik: 'x' });
    expect(h2.size).toBe(1);
    expect(h2.get('a')?.icerik).toBe('');
  });
});

describe('akisBitir', () => {
  it('yalnız o girdiyi siler', () => {
    let h = akisBaslat(BOS, 'a', 'm-a', 1000);
    h = akisBaslat(h, 'b', 'm-b', 1000);
    h = akisBitir(h, 'a');
    expect(h.has('a')).toBe(false);
    expect(h.has('b')).toBe(true);
  });

  it('girdi haritayı MUTASYONA UĞRATMAZ', () => {
    const h1 = akisBaslat(BOS, 'a', 'm-a', 1000);
    const h2 = akisBitir(h1, 'a');
    expect(h1.has('a')).toBe(true);
    expect(h2).not.toBe(h1);
  });

  it('olmayan sohbette çökmez', () => {
    expect(() => akisBitir(BOS, 'yok')).not.toThrow();
    expect(akisBitir(BOS, 'yok').size).toBe(0);
  });
});

describe('aktifAkistanTuret', () => {
  it('aktif sohbet akıyorsa değerlerini verir', () => {
    let h = akisBaslat(BOS, 'a', 'm-a', 1000);
    h = akisGuncelle(h, 'a', { icerik: 'selam', hamIcerik: 'ham', dusunuyor: false });
    expect(aktifAkistanTuret(h, 'a')).toEqual({
      isStreaming: true, isThinking: false, isSummarizing: false,
      streamingContent: { messageId: 'm-a', content: 'selam', rawContent: 'ham' },
    });
  });

  it('BAŞKA sohbet akarken aktif olan durgun görünür', () => {
    // Bugünkü hata tam burada: A akarken B'ye geçince B'de de düşünme
    // göstergesi çıkıyordu.
    const h = akisBaslat(BOS, 'a', 'm-a', 1000);
    expect(aktifAkistanTuret(h, 'b')).toEqual({
      isStreaming: false, isThinking: false, isSummarizing: false, streamingContent: null,
    });
  });

  it('aktif sohbet yoksa (null) durgun döner', () => {
    const h = akisBaslat(BOS, 'a', 'm-a', 1000);
    expect(aktifAkistanTuret(h, null).isStreaming).toBe(false);
  });
});

describe('mesajId null iken', () => {
  it('sohbet MEŞGUL kalır ama canlı içerik gösterilmez', () => {
    // Yanıt kaydedildi, akış bitmedi: isStreaming true kalmalı ki Gönder
    // düğmesi erken açılmasın, ama streamingContent null olmalı ki panel
    // kaydedilmiş mesajı göstersin.
    let h = akisBaslat(BOS, 'a', 'm-a', 1000);
    h = akisGuncelle(h, 'a', { mesajId: null });
    const t = aktifAkistanTuret(h, 'a');
    expect(t.isStreaming).toBe(true);
    expect(t.streamingContent).toBeNull();
  });
});
