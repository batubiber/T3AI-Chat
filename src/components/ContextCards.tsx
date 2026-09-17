/**
 * Cevabın dayandığı belge parçaları.
 *
 * RAG bu listeyi ZATEN üretiyordu ama yalnızca console.log'a yazılıp
 * atılıyordu; kullanıcı cevabın hangi belgeden geldiğini göremiyordu. İki işe
 * yarıyor: güven ("bunu nereden çıkardı") ve hata ayıklama ("yanlış dosyaya
 * bakmış").
 *
 * Kapalı başlar: her cevabın altında açık bir kaynak listesi sohbeti boğar.
 *
 * SKOR ÜZERİNE DÜRÜSTLÜK: skor yalnız anlamsal aramadan gelen parçalarda
 * anlamlı. Sohbete eklenen dosyalar için yedek yol SIRALAMA yapmıyor; oraya
 * "%0 alaka" yazmak yanlış olurdu, o yüzden skor hiç gösterilmiyor ve
 * "doğrudan eklendi" deniyor.
 */
import { useState } from "react";
import { ChevronRight, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RagSource } from "@/lib/ragService";
import { gruplaKaynaklar, sayfaAraligi, satirAraligiMetni } from "@/lib/contextSources";

export function ContextCards({ sources }: { sources: RagSource[] }) {
  const [acik, setAcik] = useState(false);
  if (!sources || sources.length === 0) return null;

  const gruplar = gruplaKaynaklar(sources);

  return (
    <div className="t3ai-kaynaklar mt-2">
      <button
        type="button"
        onClick={() => setAcik((v) => !v)}
        aria-expanded={acik}
        className="group flex items-center gap-1.5 rounded-md px-1 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight
          className={cn("h-3 w-3 shrink-0 transition-transform", acik && "rotate-90")}
        />
        <FileText className="h-3 w-3 shrink-0" />
        <span className="text-[11px]">
          {gruplar.length} belge
          <span className="opacity-60"> · {sources.length} parça kullanıldı</span>
        </span>
      </button>

      {acik && (
        <ul className="mt-1.5 space-y-1 border-l border-border/70 pl-2.5">
          {gruplar.map((g) => (
            <li key={g.fileName} className="flex items-baseline gap-2 text-[11px]">
              <span className="min-w-0 flex-1 truncate text-foreground/85" title={g.fileName}>
                {g.fileName}
              </span>
              {/* Kodda birim SAYFA değil SATIR — adres doğrudan işe yarasın */}
              {g.satirAraliklari.length > 0 ? (
                <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                  sat.{satirAraligiMetni(g.satirAraliklari)}
                </span>
              ) : g.sayfalar.length > 0 ? (
                <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                  s.{sayfaAraligi(g.sayfalar)}
                </span>
              ) : null}
              <span className="shrink-0 font-mono tabular-nums text-muted-foreground/70">
                {g.parcaSayisi}×
              </span>
              {/* Skor yalnız aramadan geleni niteler; yedek yolda skor YOK */}
              <span className="w-14 shrink-0 text-right font-mono tabular-nums text-muted-foreground">
                {g.enIyiSkor !== null ? `%${Math.round(g.enIyiSkor * 100)}` : "eklendi"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
