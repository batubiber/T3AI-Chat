import { useState } from 'react';
import { APP_VERSION } from '@/lib/surum';
import { YeniliklerDialog } from './YeniliklerDialog';
import { rozetDurumu, SON_GORULEN_ANAHTARI } from '@/lib/yenilikler';

/**
 * Sürüm rozeti — tıklanınca "Yenilikler" açılıyor.
 *
 * Yeni bir menü öğesi eklemek yerine rozeti kullanmak bilinçli: sürüm
 * numarasına tıklayınca değişikliklerin görünmesi yerleşik bir kalıp ve
 * arayüze fazladan bir şey koymuyor.
 *
 * HOVER'da köşeden yükselen bir daire rozeti dolduruyor ve renkler ters
 * dönüyor. OKUNMAMIŞ hâlde aynı dairenin yumuşak bir dalgası kendiliğinden
 * yükselip iniyor — aynı görsel dilin sakin hâli.
 *
 * Dönen konik gradyan çerçeve denendi ve BU ÖLÇEKTE kötü durdu: 1 piksellik
 * halkada renk sınırı köşede zıplıyordu. Büyük öğeler için tasarlanmış bir
 * tekniği 10 piksellik bir rozete taşımak hataydı.
 *
 * YANIP SÖNME değil: sürekli
 * yanıp sönen bir öğe hem göz yoruyor hem de hareket duyarlılığı olan
 * kullanıcılar için sorunlu. `motion-reduce` ile işletim sistemi ayarı
 * "hareketi azalt" diyorsa animasyon tamamen kapanıyor, renk kalıyor.
 *
 * Kullanıcı bir kez açınca rozet sıradan hâline dönüyor; YENİ BİR SÜRÜM
 * kurulduğunda yeniden uyanıyor — not yazılmış olması şart değil, kullanıcı
 * güncelleme aldığını görmeli.
 */
export function VersionBadge() {
  const [acik, setAcik] = useState(false);
  const [durum, setDurum] = useState(() =>
    rozetDurumu(localStorage.getItem(SON_GORULEN_ANAHTARI), APP_VERSION),
  );

  const { yeniVar, yeniKayitSayisi } = durum;

  const ac = () => {
    setAcik(true);
    localStorage.setItem(SON_GORULEN_ANAHTARI, APP_VERSION);
    setDurum({ yeniVar: false, yeniKayitSayisi: 0 });
  };

  return (
    <>
      <div className="absolute bottom-3 left-0 z-10">
        <button
          type="button"
          onClick={ac}
          title={yeniKayitSayisi > 0 ? `${yeniKayitSayisi} yeni değişiklik — Yenilikler` : 'Yenilikler'}
          className={[
            // Hover'da köşeden yükselen daire rozeti dolduruyor (index.css).
            // overflow-hidden ŞART: daire rozetin dışına taşmasın.
            'yenilik-rozet relative z-0 overflow-hidden isolate',
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full border cursor-pointer',
            yeniVar ? 'text-foreground/80' : 'text-[#999999]',
            'transition-[transform,color] [transition-duration:500ms]',
            'hover:scale-105 active:scale-95 hover:text-background',
            yeniVar
              ? 'yenilik-dalga border-[hsl(var(--primary))]/40'
              : 'border-[#E1E1E1] dark:border-[#474747]',
          ].join(' ')}
        >
          {/* Hover'da renk terse döndüğü için metin rengi butondan miras
              alınıyor; kendi rengini yazarsa hover'da okunmaz kalıyor. */}
          <span className="text-[10px] font-normal leading-[15px]">
            {yeniVar ? 'Yenilikler' : `v.${APP_VERSION}`}
          </span>
        </button>
      </div>
      <YeniliklerDialog acik={acik} onAcikDegisti={setAcik} />
    </>
  );
}
