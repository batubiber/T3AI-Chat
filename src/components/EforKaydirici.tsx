import { useEffect, useMemo, useState } from 'react';
import type { ModelPreset } from '@/lib/modelConfig';
import { kisaPresetAdi } from '@/lib/kisaEtiket';
import { miknatisla, durakIndeksi } from '@/lib/eforMiknatis';

interface Props {
  /** AZDAN ÇOĞA sıralı preset listesi (eforMerdiveni). */
  merdiven: ModelPreset[];
  seciliId: string;
  onSec: (presetId: string) => void;
}

/** Parçacık sayısı — daha fazlası bu boyutta kalabalık görünüyor. */
const PARCACIK = 9;
/** Sürükleme çözünürlüğü. 1 olsaydı bar duraktan durağa SIÇRARDI. */
const ADIM = 0.01;
/**
 * Topuz çapı (px). Konum hesabı buna bağlı: topuz yolun İÇİNDE kalmalı, yani
 * merkezi 0..100 değil, yarıçap kadar içeriden başlayıp yarıçap kadar
 * içeride bitmeli. Merkeze göre konumlandırıldığında uçlarda yarısı dışarı
 * taşıyordu.
 */
const TOPUZ = 28;

/**
 * Efor seçimi için kaydırıcı.
 *
 * SÜRÜKLERKEN KESİNTİSİZ, DURAKLARDA KİTLENİR: kaydırıcı ince adımlarla
 * çalışıyor, bar parmağı takip ediyor; bir durağa yaklaşınca `miknatisla`
 * tam durağa oturtuyor. Seçilen preset her zaman en yakın durak.
 *
 * NEDEN NATIVE `input[type=range]`: sürükleme, ok tuşları, Home/End ve ekran
 * okuyucu desteği bedava geliyor. Görsel parçalar ayrı çiziliyor, native girdi
 * ŞEFFAF olarak üstlerine biniyor.
 *
 * `aria-valuetext` ŞART: onsuz ekran okuyucu sayı okuyor, seviyenin adını
 * söylemiyor.
 */
export function EforKaydirici({ merdiven, seciliId, onSec }: Props) {
  const sonIndeks = merdiven.length - 1;
  const seciliIndeks = Math.max(0, merdiven.findIndex((p) => p.id === seciliId));

  /** Sürükleme konumu — kesirli olabilir. Seçili preset'ten AYRI tutuluyor. */
  const [ham, setHam] = useState(seciliIndeks);

  /* Preset dışarıdan değişebiliyor (model değişimi, durak adına tıklama);
     bar o zaman doğru yere gitmeli. AMA sürüklerken preset'i biz
     değiştiriyoruz ve koşulsuz senkron bu durumda barı zorla durağa çekiyordu:
     her orta noktayı geçişte bar SIÇRIYORDU — ölçülerek yakalandı.

     Koşul, değişimin kaynağını ayırıyor: sürükleme bizden geliyorsa
     durakIndeksi(ham) zaten seçiliyle aynıdır, ham'a dokunulmuyor. */
  useEffect(() => {
    setHam((onceki) =>
      durakIndeksi(onceki, merdiven.length) === seciliIndeks ? onceki : seciliIndeks,
    );
  }, [seciliIndeks, merdiven.length]);

  const gosterilen = miknatisla(ham);
  const oran = sonIndeks > 0 ? gosterilen / sonIndeks : 1;
  const secili = merdiven[durakIndeksi(ham, merdiven.length)];

  const surukle = (deger: number) => {
    setHam(deger);
    const yeni = merdiven[durakIndeksi(deger, merdiven.length)];
    if (yeni.id !== seciliId) onSec(yeni.id);
  };

  // Her parçacığın kendi hızı ve gecikmesi var; hepsi aynı olsaydı tek bir
  // çizgi gibi akarlardı. Liste sabit: her render'da yeniden üretilirse
  // animasyon baştan başlar ve titrer.
  const parcaciklar = useMemo(
    () =>
      Array.from({ length: PARCACIK }, (_, i) => ({
        ust: 12 + ((i * 29) % 76),
        boyut: i % 3 === 0 ? 3 : 2,
        sure: 2.1 + ((i * 0.41) % 1.7),
        gecikme: (i * 0.31) % 2.1,
      })),
    [],
  );

  return (
    <div className="w-full select-none">
      <div className="relative flex h-9 items-center">
        {/* boş yol */}
        <div className="absolute inset-x-0 h-9 rounded-full bg-muted" />

        {/* Durak noktaları: adları kaldırıldı (seviye zaten yukarıda yazıyor),
            ama nerede duracağı görünmeli — yoksa kaydırıcı sürekliymiş gibi
            duruyor ve kullanıcı arada bir yerde durabileceğini sanıyor. */}
        {merdiven.map((p, i) => {
          const yer = sonIndeks > 0 ? i / sonIndeks : 0;
          return (
            <span
              key={p.id}
              aria-hidden
              className="pointer-events-none absolute h-1 w-1 rounded-full bg-foreground/25"
              style={{ left: `calc(${yer} * (100% - ${TOPUZ}px) + ${TOPUZ / 2 - 2}px)` }}
            />
          );
        })}

        {/* dolu kısım + parçacıklar. Alt sınır YOK: bar topuzla tam hizalı.
            En düşük seviyede boş kalıyor ve akan parçacık olmuyor — "Hızlı"da
            akıl yürütme zaten yok, gösterge de bunu söylüyor. */}
        <div
          /* Dolgu SOLUK bir tonda: seviye adı barın içinde ve tam ortada
             duruyor, yani yarısı dolu yarısı boş zemine biniyor. Koyu dolguda
             yazı dolu tarafta okunmaz oluyordu. */
          className="absolute h-9 overflow-hidden rounded-full bg-[hsl(var(--primary))]/25" 
          /* Dolgunun sağ kenarı topuzun SAĞ kenarına yapışıyor: topuz her
             zaman baştan sona dolu zeminin üstünde duruyor. Ortada dolguyu
             topuzun merkezinde kesmek topuzun sağ yarısını boş zeminde
             bırakıyordu.

             Tek istisna en sol uç: orada topuzun sağ kenarına kadar doldurmak
             topuzun tam altında 28 piksellik kırmızı bir kalıntı bırakır ve
             saydam topuzun altından sızar. Bu yüzden yapışma payı topuzun
             kendi genişliği kadar bir mesafede RAMPA ile giriyor — en solda
             sıfır, topuz kendi boyu kadar ilerledikten sonra tam genişlik.
             Sıçrama olmuyor, sürükleme kesintisiz kalıyor.

             min() CSS'te hesaplanıyor; yolun piksel genişliğini JS'te ölçmeye
             gerek kalmıyor. */
          style={{
            width: `calc(${oran} * (100% - ${TOPUZ}px) + min(${TOPUZ}px, ${oran} * (100% - ${TOPUZ}px)))`,
          }}
        >
          {parcaciklar.map((p, i) => (
            <span
              key={i}
              className="efor-parcacik"
              style={{
                top: `${p.ust}%`,
                width: p.boyut,
                height: p.boyut,
                animationDuration: `${p.sure}s`,
                animationDelay: `${p.gecikme}s`,
              }}
            />
          ))}
        </div>

        {/* topuz */}
        <div
          /* SAYDAM: ortadaki seviye adı topuzun altında kalıyordu — koyu
             temada etiket neredeyse beyaz, topuz da beyaz. Saydamlık hem adı
             okutuyor hem topuzu görünür bırakıyor. */
          className="pointer-events-none absolute h-7 w-7 rounded-full border border-black/10 bg-white/45 shadow-md backdrop-blur-[1px]" 
          style={{ left: `calc(${oran} * (100% - ${TOPUZ}px))` }}
        />

        {/* Seviye adı BARIN İÇİNDE, ortada. Kaydırıcı oynadıkça değişiyor.
            pointer-events-none ŞART: üstteki katman tıklamayı yutarsa
            kaydırıcı sürüklenemiyor. */}
        <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-xs font-medium text-foreground">
          {secili.name}
        </span>

        {/* etkileşim + erişilebilirlik: görünmez ama tam işlevsel */}
        <input
          type="range"
          min={0}
          max={sonIndeks}
          step={ADIM}
          value={ham}
          onChange={(e) => surukle(Number(e.target.value))}
          /* Bırakınca tam durağa otur: arada asılı kalmasın. */
          onPointerUp={() => setHam(durakIndeksi(ham, merdiven.length))}
          onBlur={() => setHam(durakIndeksi(ham, merdiven.length))}
          aria-label="Yanıt seviyesi"
          aria-valuetext={secili.name}
          className="absolute inset-0 w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}
