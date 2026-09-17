import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, TrendingUp, Cpu } from "lucide-react";
import { ModelMetricsPanel } from "./ModelMetricsPanel";
import { KurumKullanimSekmesi } from "./admin/KurumKullanimSekmesi";

interface AdminUsageDashboardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Admin paneli — kabuk.
 *
 * İçerik ayrı bileşenlerde: bu dosya 274 satırdı ve kırılımlar + grafik +
 * dışa aktarma eklenince çok daha büyürdü.
 *
 * İKİ SEKME FARKLI ŞEY ÖLÇÜYOR, toplamları birbirine karışmaz:
 * - Kurum kullanımı → merkezî nginx logu, bu ters vekilden geçen istekler
 * - Model metrikleri → vLLM Prometheus sayaçları, TÜM uygulamalar dahil, anlık
 */
export function AdminUsageDashboard({ open, onOpenChange }: AdminUsageDashboardProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Admin Paneli
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="kullanim" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="kullanim" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Kurum kullanımı
            </TabsTrigger>
            <TabsTrigger value="metrik" className="flex items-center gap-2">
              <Cpu className="h-4 w-4" />
              Model metrikleri
            </TabsTrigger>
          </TabsList>

          <TabsContent value="kullanim" className="mt-4">
            <KurumKullanimSekmesi />
          </TabsContent>

          <TabsContent value="metrik" className="mt-4">
            <p className="mb-3 text-xs text-muted-foreground">
              vLLM sunucusunun anlık sayaçları — <strong>tüm uygulamalar dahil</strong>,
              geçmiş tutulmuyor ve vLLM yeniden başlayınca sıfırlanıyor. Kurum
              kullanımı sekmesindeki sayılarla toplanmaz.
            </p>
            <ModelMetricsPanel />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
