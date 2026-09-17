import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseReasoningSteps } from "@/lib/reasoningSteps";

interface ThinkingIndicatorProps {
  thinkContent: string;
  isThinking: boolean;
  isStreaming?: boolean;
}

export function ThinkingIndicator({ thinkContent, isThinking, isStreaming = false }: ThinkingIndicatorProps) {
  /** null = kullanıcı karışmadı, otomatik davranış geçerli. Model düşünürken iz
   *  açık duruyor (izlemek istiyorsun), bitince kendiliğinden toplanıyor. */
  const [manuelAcik, setManuelAcik] = useState<boolean | null>(null);
  /** Açılmış adımlar — ölçümde 21 adım çıktı, hepsini tam metinle basmak duvar
   *  oluyor. Liste özetlerle çiziliyor, istenen adım tıklanınca açılıyor. */
  const [acikAdimlar, setAcikAdimlar] = useState<Set<number>>(new Set());
  const [userScrolled, setUserScrolled] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const isAutoScrolling = useRef(false);

  const extractReasoningContent = (content: string): string => {
    if (!content) return "";
    if (content.includes("\n\n---\n\n")) {
      const reasoningPart = content.split("\n\n---\n\n")[0];
      return reasoningPart.replace(/<\/?think>/g, "").trim();
    }
    const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
    const matches = [...content.matchAll(thinkRegex)];
    if (matches.length > 0) {
      return matches.map((m) => m[1]).join("\n\n");
    }
    const openTagIndex = content.lastIndexOf("<think>");
    if (openTagIndex !== -1) {
      return content.substring(openTagIndex + 7);
    }
    if (isStreaming && content.trim()) {
      return content.trim();
    }
    return "";
  };

  const displayContent = extractReasoningContent(thinkContent);

  // Akıl yürütme bitti mi: ayraç geldiyse cevap başlamış demektir
  const akilBitti = !isStreaming || thinkContent.includes("\n\n---\n\n");
  const otomatikAcik = !akilBitti;
  const isExpanded = manuelAcik ?? otomatikAcik;
  const setIsExpanded = (v: boolean) => setManuelAcik(v);

  // Detect user scroll
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const handleScroll = () => {
      if (isAutoScrolling.current) return;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
      setUserScrolled(!atBottom);
    };
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [isExpanded]);

  // Reset userScrolled when panel opens
  useEffect(() => {
    if (isExpanded) setUserScrolled(false);
  }, [isExpanded]);

  // Auto-scroll only if user hasn't scrolled away
  useEffect(() => {
    if (isStreaming && isExpanded && contentRef.current && !userScrolled) {
      isAutoScrolling.current = true;
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
      requestAnimationFrame(() => { isAutoScrolling.current = false; });
    }
  }, [displayContent, isStreaming, isExpanded, userScrolled]);

  if (!displayContent.trim() && !isThinking) return null;

  // Reasoning is done when separator exists (final content started) even if still streaming
  const reasoningDone = isStreaming && thinkContent.includes("\n\n---\n\n");

  /* Adımlar MODELİN KENDİ yapısından çıkarılıyor (boş satır, kendi
     numaralandırması, geçiş sözcükleri). Faz UYDURULMUYOR: bizde araç izi yok,
     "arama/kodlama" gibi etiketler yazmak yalan olurdu. Model düz bir blok
     yazdıysa tek adım kalır. */
  const adimlar = parseReasoningSteps(displayContent);
  const cokAdimli = adimlar.length > 1;
  /** Dört adıma kadar hepsi açık: kısa iz zaten sığıyor, kırpmak bilgi saklamak
   *  olur. Uzun izde satırlar tek satıra iniyor ve tıklanarak açılıyor. */
  const varsayilanAcik = adimlar.length <= 4;
  const calisiyor = isStreaming && !reasoningDone;
  const baslik = "Düşünme süreci";

  return (
    <div className="t3ai-akil mb-3">
      {/* Başlık: eskiden kırmızı çerçeveli iri bir hap düğmeydi ve cevabın
          üstünde en dikkat çekici öğeydi. Akıl yürütme YARDIMCI bilgi — sessiz
          bir satır olması doğru. Etkin haldeyken metnin KENDİSİ parlıyor
          (shimmer-text zaten LoadingState için tanımlıydı), bitince sabit
          metne dönüyor.

          İKON YOK: parıltı (sparkles) simgesi "yapay zekâ" göstergesi olarak
          o kadar çok kullanıldı ki artık ucuzlatıyor. Satır zaten ne olduğunu
          söylüyor ve parlama hareketi tek başına yeterli sinyal. */}
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded(!isExpanded)}
        className="-mx-1.5 flex w-fit items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-accent/60"
      >
        {calisiyor ? (
          <span
            className="bg-clip-text text-[13px] font-medium text-transparent"
            style={{
              backgroundImage:
                "linear-gradient(90deg, hsl(var(--muted-foreground)) 35%, hsl(var(--foreground)) 50%, hsl(var(--muted-foreground)) 65%)",
              backgroundSize: "200% 100%",
              animation: "shimmer-text 1.4s linear infinite",
            }}
          >
            Düşünüyor
          </span>
        ) : (
          <span
            className="text-[13px] font-medium text-foreground/80"
            style={{ animation: "fade-up 350ms ease-out both" }}
          >
            {baslik}
          </span>
        )}
        {cokAdimli && !calisiyor && (
          <span className="text-[12px] tabular-nums text-muted-foreground">
            · {adimlar.length} adım
          </span>
        )}
        <ChevronDown
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-300"
          style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>

      {/* Açılma: yükseklik grid satırıyla animasyonlanıyor (0fr → 1fr).
          max-height ile yapılsaydı içerik uzunluğuna göre hız değişirdi. */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-300"
        style={{
          gridTemplateRows: isExpanded ? "1fr" : "0fr",
          opacity: isExpanded ? 1 : 0,
          transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
        }}
      >
        <div className="overflow-hidden">
          {/* Kutu YOK, sol cetvel var: iz cevabın bir kenar notu gibi dursun,
              ayrı bir panel gibi değil. */}
          <div
            ref={contentRef}
            className="relative ml-[6px] max-h-72 overflow-y-auto border-l border-border pl-4 pt-1"
          >
            {cokAdimli ? (
              <ol className="t3ai-akil-izi flex flex-col gap-1 py-1">
                {adimlar.map((a, i) => {
                  /* Kısa izlerde kırpmanın anlamı yok — referanstaki gibi
                     paragraflar tam görünsün. Kırpma yalnız liste uzayınca
                     devreye giriyor; ölçülen gerçek çıktı 21 adımdı. */
                  const acik = acikAdimlar.has(a.no) || varsayilanAcik;
                  const acilabilir = !varsayilanAcik && a.text.trim() !== a.ozet;
                  const govde = (
                    <>
                      <span className="w-4 shrink-0 select-none text-right font-mono text-[10px] tabular-nums text-muted-foreground/60">
                        {a.no}
                      </span>
                      <span
                        className={cn(
                          "min-w-0 text-[12.5px] leading-relaxed text-muted-foreground",
                          acik ? "whitespace-pre-wrap" : "truncate",
                        )}
                      >
                        {acik ? a.text : a.ozet}
                      </span>
                    </>
                  );
                  // Satırlar sırayla belirsin; 21 satırda bile toplam gecikme
                  // ~0.9sn kalsın diye adım başına 45ms
                  const animasyon = {
                    animation: `fade-up 300ms cubic-bezier(0.23,1,0.32,1) ${Math.min(i, 20) * 45}ms both`,
                  };
                  return (
                    <li key={a.no}>
                      {acilabilir ? (
                        <button
                          type="button"
                          aria-expanded={acik}
                          onClick={() =>
                            setAcikAdimlar((prev) => {
                              const y = new Set(prev);
                              if (y.has(a.no)) y.delete(a.no);
                              else y.add(a.no);
                              return y;
                            })
                          }
                          className="flex w-full items-baseline gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-accent/50"
                          style={animasyon}
                        >
                          {govde}
                        </button>
                      ) : (
                        <div className="flex items-baseline gap-2 px-1 py-0.5" style={animasyon}>
                          {govde}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="whitespace-pre-wrap py-1 text-[12.5px] leading-relaxed text-muted-foreground">
                {displayContent || (isStreaming ? "Düşünmeye başlıyor…" : "")}
                {isStreaming && !akilBitti && (
                  <span className="ml-0.5 inline-block h-3.5 w-1 animate-pulse align-middle bg-foreground/50" />
                )}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
