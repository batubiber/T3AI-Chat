import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { localDbOperations } from '@/lib/localDb';
import { disaAktarmaKur } from '@/lib/projeAktarma';

interface Props {
  projeId: string;
  projeAdi: string;
  acik: boolean;
  onAcikDegisti: (acik: boolean) => void;
}

/** Dosya adında kullanılamayacak karakterleri sadeleştirir. */
function dosyaAdi(projeAdi: string): string {
  const temiz = projeAdi.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLocaleLowerCase('tr');
  const tarih = new Date().toISOString().slice(0, 10);
  return `proje-${temiz || 'adsiz'}-${tarih}.json`;
}

/**
 * İki kutu, iki senaryo:
 *   ikisi de kapalı → PAYLAŞIM. Küçük dosya, sohbetler gitmiyor, belgeler
 *                     alıcıda yeniden işleniyor.
 *   ikisi de açık   → YEDEK. Her şey aynen taşınıyor, embedding servisine
 *                     ihtiyaç duymadan çalışıyor.
 *
 * Varsayılan KAPALI: paylaşım daha yaygın ve yanlışlıkla başkasının
 * konuşmalarını göndermek geri alınamaz bir hata.
 */
export function ProjeDisaAktarDialog({ projeId, projeAdi, acik, onAcikDegisti }: Props) {
  const [sohbetler, setSohbetler] = useState(false);
  const [indeks, setIndeks] = useState(false);
  const [calisiyor, setCalisiyor] = useState(false);

  const disaAktar = async () => {
    setCalisiyor(true);
    try {
      const girdi = await localDbOperations.projeVerisiniTopla(projeId, { sohbetler, indeks });
      if (!girdi) {
        toast.error('Proje bulunamadı.');
        return;
      }
      const dosya = disaAktarmaKur(girdi, new Date());
      const blob = new Blob([JSON.stringify(dosya, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = dosyaAdi(projeAdi);
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Proje dışa aktarıldı.');
      onAcikDegisti(false);
    } catch (e) {
      toast.error(`Dışa aktarma başarısız: ${e instanceof Error ? e.message : 'bilinmeyen hata'}`);
    } finally {
      setCalisiyor(false);
    }
  };

  return (
    <Dialog open={acik} onOpenChange={onAcikDegisti}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Projeyi dışa aktar</DialogTitle>
          <DialogDescription>
            Proje talimatları ve dosyaları her zaman dahil edilir.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={sohbetler}
              onChange={(e) => setSohbetler(e.target.checked)}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <span className="text-sm">
              Sohbetleri de aktar
              <span className="block text-xs text-muted-foreground">
                Bu projede yaptığın konuşmalar da dosyaya eklenir. Sohbetlerin
                gizli bilgi içeriyorsa bu seçeneği kapat.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={indeks}
              onChange={(e) => setIndeks(e.target.checked)}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <span className="text-sm">
              Belgeleri hazır hâliyle aktar
              <span className="block text-xs text-muted-foreground">
                Belgeler karşı tarafta beklemeden kullanılabilir olur, ama dosya
                çok büyür. Bu seçenek kapalıyken dokümanlar içe aktarma sırasında
                yeniden işlenir.
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onAcikDegisti(false)} disabled={calisiyor}>
            Vazgeç
          </Button>
          <Button onClick={disaAktar} disabled={calisiyor}>
            {calisiyor
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Hazırlanıyor…</>
              : <><Download className="h-4 w-4 mr-2" />Dışa aktar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
