import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Zap, Calendar, Boxes, Download, AlertTriangle, RefreshCw } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import { logAyristir, LOG_YOLU, type KullanimKaydi } from "@/lib/kullanimLog";
import { adminJetonu, adminJetonuSil } from "@/hooks/useAdminAuth";
import { ozetle, uygulamaBazinda, modelBazinda, haftaBazinda, type KirilimSatiri } from "@/lib/usageStats";
import { xlsxBaytlari } from "@/lib/usageExport";

function tarihBicimle(t: Date | null): string {
  if (!t) return "—";
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric" }).format(t);
}

/** Uygulama ve model kırılımı aynı şekli paylaşıyor — tablo da paylaşsın */
function KirilimTablosu({ baslik, satirlar }: { baslik: string; satirlar: KirilimSatiri[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-xs">{baslik}</TableHead>
          <TableHead className="text-xs text-right">İstek</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {satirlar.map((s) => (
          <TableRow key={s.ad}>
            <TableCell className="text-xs font-medium">{s.ad}</TableCell>
            <TableCell className="text-xs text-right">{s.istek.toLocaleString("tr-TR")}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function KurumKullanimSekmesi() {
  const [kayitlar, setKayitlar] = useState<KullanimKaydi[]>([]);
  const [bozukSatir, setBozukSatir] = useState(0);
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  /** Verinin ne zaman çekildiği — panel açık kalırken bayatlayabiliyor */
  const [sonCekim, setSonCekim] = useState<Date | null>(null);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    setHata(null);
    try {
      const yanit = await fetch(LOG_YOLU, {
        headers: { Authorization: `Bearer ${adminJetonu()}` },
      });
      // 401: parola değişmiş ya da jeton süresi dolmuş olabilir — sessizce
      // "veri yok" göstermek yerine kullanıcıyı yeniden girişe yönlendir.
      if (yanit.status === 401) {
        adminJetonuSil();
        throw new Error('Oturum süresi doldu, yeniden giriş yapın');
      }
      if (!yanit.ok) throw new Error(`HTTP ${yanit.status}`);
      const { kayitlar: k, bozukSatir: b } = logAyristir(await yanit.text());
      setKayitlar(k);
      setBozukSatir(b);
      setSonCekim(new Date());
    } catch (e) {
      setKayitlar([]);
      setHata(e instanceof Error ? e.message : "bilinmeyen hata");
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => { void yukle(); }, [yukle]);

  const ozet = ozetle(kayitlar);
  const uygulamalar = uygulamaBazinda(kayitlar);
  const modeller = modelBazinda(kayitlar);
  const haftalar = haftaBazinda(kayitlar);

  const disaAktar = () => {
    try {
      const bayt = xlsxBaytlari(haftalar, modeller, uygulamalar);
      const url = URL.createObjectURL(new Blob([bayt], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `kullanim-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Dışa aktarma başarısız", {
        description: e instanceof Error ? e.message : "Bilinmeyen hata",
      });
    }
  };

  /** Duruma göre değişen bölüm; yenile başlığı bunun ÜSTÜNDE, her zaman görünür. */
  const icerikSec = () => {
    if (yukleniyor) {
      return (
      <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      );
    }
    if (hata) {
      return (
      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
        <span>
          Kullanım kaydına ulaşılamadı ({hata}). Merkezî log ters vekilde tutuluyor;
          nginx yapılandırması ya da ağ kısıtı kontrol edilmeli.
        </span>
        </div>
      );
    }
    if (kayitlar.length === 0) {
      return <div className="py-12 text-center text-sm text-muted-foreground">Henüz kayıt yok.</div>;
    }
    return govde();
  };

  // Grafik yeniden eskiye sıralı geliyor; zaman ekseni soldan sağa aksın
  const grafikVerisi = [...haftalar].reverse().map((h) => ({
    hafta: h.haftaBasi.slice(5),
    İstek: h.istek,
  }));

  function govde() {
    return (
    <div className="space-y-6">
      {bozukSatir > 0 && (
        <div className="rounded-md border border-muted p-2 text-xs text-muted-foreground">
          {bozukSatir} satır okunamadı ve atlandı.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-primary" /> Toplam istek
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{ozet.istek.toLocaleString("tr-TR")}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Boxes className="h-3.5 w-3.5 text-accent" /> Uygulama
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-accent">{ozet.uygulamaSayisi}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Kayıt aralığı
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs font-medium">{tarihBicimle(ozet.ilkKayit)}</div>
            <div className="text-xs text-muted-foreground">→ {tarihBicimle(ozet.sonKayit)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm">Uygulama kırılımı</CardTitle>
          <Button size="sm" variant="outline" onClick={disaAktar}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Dışa aktar
          </Button>
        </CardHeader>
        <CardContent>
          <KirilimTablosu baslik="Uygulama" satirlar={uygulamalar} />
          <p className="mt-3 text-xs text-muted-foreground">
            Yalnız bu ters vekilden geçen uygulamalar görünür. Doğrudan gateway'e
            giden uygulamalar (ör. IDE eklentileri) burada sayılmaz.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Model kırılımı</CardTitle></CardHeader>
        <CardContent><KirilimTablosu baslik="Model" satirlar={modeller} /></CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Haftalık trend</CardTitle></CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={grafikVerisi}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis dataKey="hafta" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="İstek" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Haftalık döküm</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Hafta</TableHead>
                <TableHead className="text-xs text-right">İstek</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {haftalar.slice(0, 12).map((h) => (
                <TableRow key={h.haftaBasi}>
                  <TableCell className="text-xs">{h.haftaBasi}</TableCell>
                  <TableCell className="text-xs text-right">{h.istek.toLocaleString("tr-TR")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {sonCekim
            ? `Son güncelleme: ${new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(sonCekim)}`
            : ""}
        </span>
        <Button size="sm" variant="outline" onClick={() => void yukle()} disabled={yukleniyor}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${yukleniyor ? "animate-spin" : ""}`} />
          Yenile
        </Button>
      </div>
      {icerikSec()}
    </div>
  );
}
