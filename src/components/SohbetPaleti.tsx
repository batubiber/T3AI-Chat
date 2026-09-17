import { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Plus } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { sohbetleriSuz } from '@/lib/sohbetArama';

/** Palette tek seferde en fazla bu kadar sohbet basar. */
const AZAMI_SONUC = 50;

interface Sohbet {
  id: string;
  title?: string;
}

interface Props {
  sohbetler: Sohbet[];
  onSec: (id: string) => void;
  onYeniSohbet: () => void;
}

/**
 * ⌘K / Ctrl+K komut paleti: sohbetlerde ara, seç, geç.
 *
 * SÜZMEYİ cmdk'ya BIRAKMIYORUZ (`shouldFilter={false}`): cmdk kendi
 * filtresinde .toLowerCase() kullanıyor ve Türkçe "İ" orada "i + birleşen
 * nokta"ya dönüşüp eşleşmeyi sessizce bozuyor. Kenar çubuğu araması ile aynı
 * (testli) `sohbetleriSuz` kullanılıyor — tek bir süzme davranışı var.
 */
export function SohbetPaleti({ sohbetler, onSec, onYeniSohbet }: Props) {
  const [acik, setAcik] = useState(false);
  const [sorgu, setSorgu] = useState('');

  useEffect(() => {
    const dinle = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setAcik((a) => !a);
      }
    };
    document.addEventListener('keydown', dinle);
    return () => document.removeEventListener('keydown', dinle);
  }, []);

  // Kapanışta sorgu sıfırlanıyor: ikinci açılışta eski arama kalırsa
  // kullanıcı boş liste görüp arama bozuk sanıyor.
  useEffect(() => {
    if (!acik) setSorgu('');
  }, [acik]);

  const sonuclar = useMemo(
    () => sohbetleriSuz(sohbetler, sorgu).slice(0, AZAMI_SONUC),
    [sohbetler, sorgu],
  );

  // Eylemler de SÜZÜLÜYOR. Süzülmezse "zzzz" araması sonuç yokken bile
  // "Yeni sohbet"i gösterir ve "Sonuç yok." mesajı hiç görünmez.
  // Aynı `sohbetleriSuz` kullanılıyor: eylem de başlığı olan bir kayıt.
  const eylemler = useMemo(
    () => sohbetleriSuz(
      [{ id: 'yeni-sohbet', title: 'Yeni sohbet', calistir: onYeniSohbet }],
      sorgu,
    ),
    [sorgu, onYeniSohbet],
  );

  const calistir = (is: () => void) => {
    setAcik(false);
    is();
  };

  return (
    <CommandDialog
      open={acik}
      onOpenChange={setAcik}
      commandProps={{ shouldFilter: false }}
      /* Merkezin biraz ÜSTÜNDE. Tam geometrik ortadaki bir kutu göze her zaman
         alçak geliyor — optik ortalama denen şey; ChatGPT, Linear, VS Code ve
         Raycast komut paletlerini bu yüzden yukarıda tutuyor.

         Ölçüldü: 1999×1126'lık ekranda palet gerçekten ortalıydı (sapma yatayda
         0, dikeyde 7 piksel) ama alçak görünüyordu. Kenar çubuğunu sayıp yatayda
         kaydırmak DENENDİ ve daha kötü oldu — geniş ekranda paleti sağa itiyordu;
         yatay konum pencereye göre ortalı KALIYOR. */
      contentClassName="top-[40%]"
    >
      <CommandInput
        placeholder="Sohbetlerde ara veya komut yaz…"
        value={sorgu}
        onValueChange={setSorgu}
      />
      <CommandList>
        <CommandEmpty>Sonuç yok.</CommandEmpty>
        {eylemler.length > 0 && (
          <CommandGroup heading="Eylemler">
            {eylemler.map((e) => (
              <CommandItem key={e.id} value={e.id} onSelect={() => calistir(e.calistir)}>
                <Plus />
                <span>{e.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {sonuclar.length > 0 && (
          <CommandGroup heading="Sohbetler">
            {sonuclar.map((s) => (
              <CommandItem key={s.id} value={s.id} onSelect={() => calistir(() => onSec(s.id))}>
                <MessageSquare />
                <span className="truncate">{s.title || 'Adsız sohbet'}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
