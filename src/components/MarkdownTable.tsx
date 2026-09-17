/**
 * Sohbetteki markdown tabloları.
 *
 * Eskisi her hücreye kenarlık çizip başlığa dolu zemin veriyordu; sonuç
 * elektronik tablo ekran görüntüsü gibi duruyordu. Burada kenarlık yok, satır
 * arası ince bir çizgi var ve dikey boşluk açık — ritim tablonun kendisinden
 * geliyor (biçimlendirme index.css'te .t3ai-md-tablo altında).
 *
 * ASIL KAZANÇ HİZALAMA. Eski th/td bileşenleri yalnız `children` alıyordu,
 * remark-gfm'in ürettiği hizalama ATILIYORDU: model `---:` yazsa bile sayılar
 * sola yaslı kalıyordu. Artık model söylediyse ona uyuluyor, söylemediyse
 * sayısal kolonlar sağa yaslanıyor (bkz. tabloHizalama).
 *
 * NEDEN CSS İLE HİZALIYORUZ: hiza kararı KOLONUN TAMAMINA bakmayı gerektiriyor,
 * tek hücre kendi başına bilemiyor. Hücreleri kendimiz çizmek ise içerideki
 * kalın/bağlantı/kod gibi biçimleri düzleştirirdi — react-markdown'ın kendi
 * çizimi korunuyor, hiza yalnız nth-child kuralıyla ekleniyor.
 */
import { useId, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import type { Element as HastElement } from "hast";
import { kolonHizalari } from "@/lib/tabloHizalama";
import {
  nodeMetni,
  tabloSatirlari,
  acikHiza,
  hizaKurallari,
} from "@/lib/markdownTabloNode";

export function MarkdownTable({ node, children }: { node?: HastElement; children?: ReactNode }) {
  const [kopyalandi, setKopyalandi] = useState(false);
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");

  const cozum = node ? tabloSatirlari(node) : null;
  const hizalar = cozum
    ? kolonHizalari(cozum.baslikHucreleri.map(acikHiza), cozum.govdeMetinleri)
    : [];
  const kurallar = hizaKurallari(`[data-tablo="${id}"]`, hizalar);

  const panoyaKopyala = async () => {
    if (!cozum) return;
    // Sekmeyle ayrılmış: elektronik tabloya yapıştırınca kolonlara oturur
    const satirlar = [
      cozum.baslikHucreleri.map(nodeMetni),
      ...cozum.govdeMetinleri,
    ];
    try {
      await navigator.clipboard.writeText(satirlar.map((s) => s.join("\t")).join("\n"));
      setKopyalandi(true);
      setTimeout(() => setKopyalandi(false), 1600);
    } catch {
      /* pano reddedilirse sessiz kal — tablo yine okunabiliyor */
    }
  };

  return (
    <div className="group/tablo relative mb-4 w-full max-w-full">
      {kurallar && <style>{kurallar}</style>}
      {cozum && cozum.baslikHucreleri.length > 0 && (
        <button
          type="button"
          onClick={panoyaKopyala}
          title="Tabloyu kopyala"
          aria-label="Tabloyu kopyala"
          className="absolute right-0 top-0 z-10 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/tablo:opacity-100"
        >
          {kopyalandi ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      )}
      <div className="w-full max-w-full overflow-x-auto">
        <table data-tablo={id} className="t3ai-md-tablo min-w-full">
          {children}
        </table>
      </div>
    </div>
  );
}
