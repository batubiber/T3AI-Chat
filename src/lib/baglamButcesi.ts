/**
 * Bağlam bütçesi — birleştirilmiş girdiyi modelin penceresine ZORLA sığdırır.
 *
 * NEDEN VAR: bugün zincir şöyle işliyordu:
 *   1. selectMessagesForContext bütçeye göre pencere seçiyor, ama son birkaç
 *      mesajı BÜTÇEYİ AŞSA BİLE tutuyor (kendi yorumunda yazıyor).
 *   2. RAG bağlamı ve proje dosyaları bütçeleme BİTTİKTEN SONRA son mesajın
 *      önüne ekleniyor — bütçe o içeriği hiç görmüyor.
 *   3. ChatContext gerçek toplamı hesaplayıp taşmayı GÖRÜYOR, uyarı basıyor...
 *      ve isteği yine de gönderiyor. vLLM context-overflow döndürüyor.
 *
 * Yani eksik olan şey ölçüm değil, ölçüme göre DAVRANMAKTI. Bu modül o son
 * adımı yapıyor: sonuç her zaman tavana sığar.
 *
 * Eski mesajları özetlemek (contextManager) bu sorunu çözmüyor: taşmaya TEK
 * BİR dev kalem sebep olduğunda özetlenecek eski mesaj zaten yok.
 *
 * KIRPMA SIRASI, kaybın telafi edilebilirliğine göre:
 *   1. RAG bağlamı / proje dosyaları — yeniden getirilebilir
 *   2. En eski mesajlar — özette zaten temsil ediliyor olabilir
 *   3. Kalan son mesajın içeriği — en son çare
 * Kullanıcının o an yazdığı metin en sona bırakılıyor; onu kırpmak sorunun
 * kendisini bozmak demek.
 *
 * Sistem mesajı HİÇ kırpılmıyor: kimlik + davranış kuralları orada, yarısı
 * kesilmiş bir kural yokluğundan beter.
 */

import { estimateTokens } from './tokenEstimator';

export type OlcFn = (metin: string) => number;

export interface Mesaj {
  role: string;
  content: string;
}

export interface Kirpma {
  /** 'baglam' = RAG/proje dosyaları, 'mesaj' = konuşma mesajı */
  tur: 'baglam' | 'mesaj';
  aciklama: string;
  oncekiToken: number;
  sonrakiToken: number;
}

export interface Girdi {
  /** Sistem mesajı — kırpılmaz, yalnız bütçeden düşülür. */
  sistem: string;
  /** Son kullanıcı turunun önüne eklenen kararsız bloklar (RAG, proje dosyaları). */
  kararsizParcalar: string[];
  /** Bağlam penceresi; son eleman en yeni mesaj. */
  gecmis: Mesaj[];
  /**
   * Girdi için toplam token tavanı.
   *
   * Çağıran taraf çıktı payını ve güvenlik marjını BURADAN ÖNCE düşmüş
   * olmalı; bu modül yalnız girdiyi tavana sığdırır.
   */
  tavan: number;
}

export interface Sonuc {
  kararsizParcalar: string[];
  gecmis: Mesaj[];
  /** Ne kırpıldıysa burada — sessizce eksik bağlamla cevap üretmeyelim. */
  kirpmalar: Kirpma[];
}

/**
 * Kırpmanın devreye girdiği eşik: bu kadar çıktı yeri kalmıyorsa girdiyi
 * küçültüyoruz.
 *
 * Sayı yeni değil — ChatContext zaten `safeMaxTokens < 512` olduğunda uyarı
 * basıyordu. Politika aynı kaldı; değişen şey uyarıp GÖNDERMEK yerine
 * sığdırmak.
 */
export const EN_AZ_CIKTI_TOKENI = 512;

export const KIRPMA_ISARETI = '\n\n[… kısaltıldı]';
const AYIRAC = '\n\n';

/** `olc` keyfi olabilir; karakter sayısıyla token doğrusal değil. İkili arama. */
function enBuyukSigdir(metin: string, hedef: number, olc: OlcFn): string {
  if (hedef <= 0) return '';
  if (olc(metin) <= hedef) return metin;
  let alt = 0;
  let ust = metin.length;
  while (alt < ust) {
    const orta = Math.ceil((alt + ust) / 2);
    if (olc(metin.slice(0, orta)) <= hedef) alt = orta;
    else ust = orta - 1;
  }
  return metin.slice(0, alt);
}

/** Kırpar ve sonuna işaret koyar; işaret sığmıyorsa işaretsiz kırpar. */
function isaretliKirp(metin: string, hedef: number, olc: OlcFn): string {
  const isaret = olc(KIRPMA_ISARETI);
  if (hedef <= isaret) return enBuyukSigdir(metin, hedef, olc);
  const govde = enBuyukSigdir(metin, hedef - isaret, olc);
  const sonuc = govde + KIRPMA_ISARETI;
  // SAVUNMA amaçlı, TESTSİZ: olc toplamsal değilse (gerçek tahminci kod
  // bloğu sezgisi taşıyor) işaretli sonuç hedefi aşabilir. `olc = uzunluk`
  // ile bu dalı tetikleyen bir girdi kuramadım; yine de ucuz sigorta.
  return olc(sonuc) <= hedef ? sonuc : enBuyukSigdir(metin, hedef, olc);
}

const parcaMaliyeti = (parcalar: string[], olc: OlcFn) =>
  parcalar.length === 0 ? 0 : olc(parcalar.join(AYIRAC));

const gecmisMaliyeti = (gecmis: Mesaj[], olc: OlcFn) =>
  gecmis.reduce((t, m) => t + olc(m.content), 0);

export function butceyeSigdir(girdi: Girdi, olc: OlcFn = estimateTokens): Sonuc {
  let parcalar = [...girdi.kararsizParcalar];
  let gecmis = girdi.gecmis.map((m) => ({ ...m }));
  const kirpmalar: Kirpma[] = [];

  const sistemMaliyeti = olc(girdi.sistem);
  const toplam = () => sistemMaliyeti + parcaMaliyeti(parcalar, olc) + gecmisMaliyeti(gecmis, olc);

  if (toplam() <= girdi.tavan) return { kararsizParcalar: parcalar, gecmis, kirpmalar };

  // 1) Kararsız bloklar. Sığanlar bütün kalır; ilk sığmayan kırpılır, sonrakiler düşer.
  if (parcalar.length > 0) {
    const oncekiToken = parcaMaliyeti(parcalar, olc);
    const yer = girdi.tavan - sistemMaliyeti - gecmisMaliyeti(gecmis, olc);
    const yeni: string[] = [];
    let kullanilan = 0;
    for (const parca of parcalar) {
      const ekMaliyet = (yeni.length > 0 ? olc(AYIRAC) : 0);
      const kalan = yer - kullanilan - ekMaliyet;
      if (kalan <= 0) break;
      if (olc(parca) <= kalan) {
        yeni.push(parca);
        kullanilan += ekMaliyet + olc(parca);
        continue;
      }
      const kirpilmis = isaretliKirp(parca, kalan, olc);
      if (kirpilmis) {
        yeni.push(kirpilmis);
        kullanilan += ekMaliyet + olc(kirpilmis);
      }
      break;                                  // sonraki bloklara yer yok
    }
    parcalar = yeni;
    const sonrakiToken = parcaMaliyeti(parcalar, olc);
    if (sonrakiToken < oncekiToken) {
      kirpmalar.push({
        tur: 'baglam',
        aciklama: parcalar.length === 0
          ? 'Ek bağlam (belge/proje içeriği) bağlam sınırına sığmadığı için tamamen çıkarıldı.'
          : 'Ek bağlam (belge/proje içeriği) bağlam sınırına sığacak şekilde kısaltıldı.',
        oncekiToken,
        sonrakiToken,
      });
    }
    if (toplam() <= girdi.tavan) return { kararsizParcalar: parcalar, gecmis, kirpmalar };
  }

  // 2) En eski mesajları düşür. En yeni mesaj her zaman kalır.
  if (gecmis.length > 1) {
    const oncekiToken = gecmisMaliyeti(gecmis, olc);
    const oncekiAdet = gecmis.length;
    while (gecmis.length > 1 && toplam() > girdi.tavan) gecmis.shift();
    if (gecmis.length < oncekiAdet) {
      kirpmalar.push({
        tur: 'mesaj',
        aciklama: `${oncekiAdet - gecmis.length} eski mesaj bağlam sınırı nedeniyle çıkarıldı.`,
        oncekiToken,
        sonrakiToken: gecmisMaliyeti(gecmis, olc),
      });
    }
    if (toplam() <= girdi.tavan) return { kararsizParcalar: parcalar, gecmis, kirpmalar };
  }

  // 3) Son çare: kalan mesajın içeriğini kırp. Hata vermektense eksik gönder —
  //    ne olduğu `kirpmalar`da yazıyor, kullanıcıya söylenebilir.
  if (gecmis.length === 1) {
    const oncekiToken = olc(gecmis[0].content);
    const yer = girdi.tavan - sistemMaliyeti - parcaMaliyeti(parcalar, olc);
    if (yer <= 0) {
      gecmis = [];
    } else {
      gecmis = [{ ...gecmis[0], content: isaretliKirp(gecmis[0].content, yer, olc) }];
    }
    kirpmalar.push({
      tur: 'mesaj',
      aciklama: 'Mesaj tek başına bağlam sınırını aştığı için kısaltıldı.',
      oncekiToken,
      sonrakiToken: gecmisMaliyeti(gecmis, olc),
    });
  }

  return { kararsizParcalar: parcalar, gecmis, kirpmalar };
}
