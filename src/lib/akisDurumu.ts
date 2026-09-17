/**
 * Sohbet başına akış durumu.
 *
 * NEDEN HARİTA: akış durumu eskiden uygulama genelinde TEKİL beş state ve iki
 * ref'ti; ikinci bir sohbet başlayınca birincinin durumunu eziyordu. Hepsi
 * sohbet kimliğine anahtarlanmış tek bir haritada toplandı.
 *
 * NEDEN AYRI MODÜL: `ChatContext` bir React bağlamı, testler node ortamında
 * çalışıyor. Saf fonksiyonlar doğrudan çağrılabiliyor.
 *
 * Fonksiyonlar girdi haritasını MUTASYONA UĞRATMAZ; React state'inde yerinde
 * değişiklik yeniden çizimi tetiklemez.
 */

export interface AkisDurumu {
  /**
   * Canlı akışın yazıldığı mesaj. İçerik kaydedilip `conversations`'a
   * geçtiğinde NULL yapılır: sohbet hâlâ MEŞGUL sayılır (isStreaming true)
   * ama artık kaydedilmiş mesajın üstüne canlı içerik basılmaz.
   *
   * Bu ayrım şart — ikisi tek alanda tutulduğunda yanıt bitip belge
   * üretilirken Gönder düğmesi erkenden açılıyor, o pencerede yazılan mesaj
   * ise koruma yüzünden sessizce yutuluyordu.
   */
  mesajId: string | null;
  icerik: string;
  hamIcerik?: string;
  dusunuyor: boolean;
  ozetliyor: boolean;
  /** Akıl yürütme başlangıcı (ms). Süreyi hesaplamak için. */
  akilBaslangici: number | null;
}

export type AkisHaritasi = ReadonlyMap<string, AkisDurumu>;

/** Context'in dışarı verdiği, aktif sohbete ait değerler. */
export interface TuretilmisAkis {
  isStreaming: boolean;
  isThinking: boolean;
  isSummarizing: boolean;
  streamingContent: { messageId: string; content: string; rawContent?: string } | null;
}

export function akisBaslat(
  h: AkisHaritasi,
  sohbetId: string,
  mesajId: string,
  simdi: number,
): Map<string, AkisDurumu> {
  const yeni = new Map(h);
  yeni.set(sohbetId, {
    mesajId,
    icerik: '',
    hamIcerik: undefined,
    dusunuyor: true,
    ozetliyor: false,
    akilBaslangici: simdi,
  });
  return yeni;
}

export function akisGuncelle(
  h: AkisHaritasi,
  sohbetId: string,
  parca: Partial<AkisDurumu>,
): Map<string, AkisDurumu> {
  const mevcut = h.get(sohbetId);
  // Akış bitmiş ya da iptal edilmişse geç gelen bir parça girdiyi DİRİLTMEMELİ
  if (!mevcut) return new Map(h);
  const yeni = new Map(h);
  yeni.set(sohbetId, { ...mevcut, ...parca });
  return yeni;
}

export function akisBitir(h: AkisHaritasi, sohbetId: string): Map<string, AkisDurumu> {
  const yeni = new Map(h);
  yeni.delete(sohbetId);
  return yeni;
}

const DURGUN: TuretilmisAkis = {
  isStreaming: false,
  isThinking: false,
  isSummarizing: false,
  streamingContent: null,
};

export function aktifAkistanTuret(h: AkisHaritasi, aktifId: string | null): TuretilmisAkis {
  const a = aktifId ? h.get(aktifId) : undefined;
  if (!a) return DURGUN;
  return {
    isStreaming: true,
    isThinking: a.dusunuyor,
    isSummarizing: a.ozetliyor,
    streamingContent: a.mesajId
      ? { messageId: a.mesajId, content: a.icerik, rawContent: a.hamIcerik }
      : null,
  };
}
