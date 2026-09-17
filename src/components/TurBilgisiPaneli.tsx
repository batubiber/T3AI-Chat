import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { bilgiSatirlari, sikistirmaVarMi, type TurBilgisi } from "@/lib/turBilgisi";

/**
 * "Bu turda modele ne gitti" paneli.
 *
 * Bağlamı üç yerde sıkıştırıyoruz (eski yanıtları kısaltma, pencereye
 * sığmayanları düşürme, geçmişi özetleme) ve üçü de görünmezdi. Cevap tuhaf
 * geldiğinde bakılacak hiçbir şey yoktu — internetsiz ağda hiç yoktu.
 *
 * VARSAYILAN OLARAK KAPALI: her mesajın altına sayı dökmek sıradan kullanımı
 * boğardı. Bağlamdan bir şey ÇIKARILDIĞINDA simgenin üstünde küçük bir nokta
 * çıkıyor, yani kullanıcı aramak zorunda kalmıyor ama sürekli de rahatsız
 * olmuyor. Eşiğin neden yüksek tutulduğu `sikistirmaVarMi`'de yazılı.
 */
export function TurBilgisiPaneli({ bilgi }: { bilgi: TurBilgisi }) {
  const satirlar = bilgiSatirlari(bilgi);
  const isaret = sikistirmaVarMi(bilgi);

  return (
    <Popover>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="canli-ikon canli-pop relative h-10 w-10 rounded-full bg-[#F4F4F4] text-[#999999] transition-all duration-200 hover:text-foreground dark:bg-[#333333] dark:text-[#999999]"
                aria-label="Bu turda modele ne gitti"
              >
                <Layers className="h-5 w-5" />
                {isaret && (
                  <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isaret ? "Bağlamdan bir şey çıkarıldı — ayrıntı" : "Modele giden bağlam"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <PopoverContent align="start" className="w-[320px] p-0">
        <div className="border-b border-border px-4 py-3">
          <h4 className="text-sm font-medium">Modele giden bağlam</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Bu yanıt üretilirken modele ne gönderildi.
          </p>
        </div>

        <dl className="divide-y divide-border/60">
          {satirlar.map((s) => (
            <div key={s.etiket} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
              <dt className="shrink-0 text-xs text-muted-foreground">{s.etiket}</dt>
              <dd className="min-w-0 text-right">
                <span className={`text-[13px] ${s.vurgu ? "text-foreground" : "text-foreground/80"}`}>
                  {s.deger}
                </span>
                {s.ipucu && (
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                    {s.ipucu}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>

        {bilgi.kirpmalar.length > 0 && (
          /* Kırpmalar ayrı blokta: bunlar sayı değil, "şu bütçeye sığmadı"
             cümleleri. Tabloya sıkıştırmak okunmaz hâle getirirdi. */
          <div className="border-t border-border px-4 py-3">
            <p className="mb-1.5 text-xs text-muted-foreground">Bütçeye sığmayanlar</p>
            <ul className="space-y-1">
              {bilgi.kirpmalar.map((k, i) => (
                <li key={i} className="flex gap-2 text-[11px] leading-snug text-foreground/80">
                  <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
                  <span className="min-w-0">{k}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
