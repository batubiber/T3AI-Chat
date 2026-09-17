import { ThumbsUp, ThumbsDown, Copy, RefreshCw, Check, GitBranch, AlertTriangle, ChevronDown, Brain, Undo2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import chatLogo from "@/assets/chat-logo.png";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useEffect, useLayoutEffect, useCallback, memo } from "react";
import { katlamaTavani } from "@/lib/mesajKatlama";
import { hafizayaEkle } from "@/lib/hafizaOnerisi";
// Bu dosyadaki `toast` shadcn useToast'tan geliyor; uygulamanın geri kalanı
// sonner kullanıyor. Ad çakışmasın diye ayrı isimle alınıyor.
import { toast as bildir } from "sonner";
import { useProject } from "@/contexts/ProjectContext";
import { useMessageEntry, useCopySuccess } from "@/hooks/useAnimeTransition";
import ReactMarkdown from "react-markdown";

import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import "highlight.js/styles/github-dark.css";
import "katex/dist/katex.min.css";
import { useChat } from "@/contexts/ChatContext";
import { convertMathDelimiters } from "@/lib/mathDelimiterConverter";
import { ThinkingIndicator } from "@/components/ThinkingIndicator";
import { ContextCards } from "@/components/ContextCards";
import { MarkdownTable } from "@/components/MarkdownTable";
import { modelSupportsVision, modelShowsReasoning } from "@/lib/modelConfig";
import { ImageLightbox } from "@/components/ImageLightbox";
import { IsikliKart } from "@/components/IsikliKart";
import { TurBilgisiPaneli } from "@/components/TurBilgisiPaneli";
import { gosterilmeliMi, type TurBilgisi } from "@/lib/turBilgisi";


interface ChatMessageProps {
  /** Belge düzenleme artifact'i — varsa mesajın altında kart gösterilir */
  role: "user" | "assistant";
  content: string;
  rawContent?: string;
  images?: string[];
  showActions?: boolean;
  messageId?: string;
  onForkFromHere?: (messageId: string) => void;
  isForkPoint?: boolean;
  isStreaming?: boolean;
  modelId?: string;
  sources?: import("@/lib/ragService").RagSource[];
  /** Yanıt uzunluk sınırına takılıp yarım kaldı mı. */
  kesildi?: boolean;
  /** Modelin proje hafızasına eklemeyi önerdiği bilgi. */
  hafizaOnerisi?: string;
  /** Bu turda modele ne gittiğinin kaydı — eylem sırasındaki panelde açılır. */
  turBilgisi?: TurBilgisi;
}

function closeOpenCodeFences(content: string): string {
  const lines = content.split('\n');
  let inFence = false;
  let fenceMarker = '```';

  for (const line of lines) {
    const m = line.match(/^(`{3,}|~{3,})/);
    if (m) {
      if (!inFence) {
        inFence = true;
        fenceMarker = m[1][0].repeat(3);
      } else if (line.trimEnd().startsWith(fenceMarker)) {
        inFence = false;
      }
    }
  }

  return inFence ? content + '\n' + fenceMarker : content;
}

// Memoized ChatMessage to prevent re-renders of unchanged messages during streaming
export const ChatMessage = memo(function ChatMessage({
  role,
  content,
  rawContent,
  images,
  showActions = false,
  messageId,
  onForkFromHere,
  isForkPoint = false,
  isStreaming = false,
  modelId,
  sources,
  kesildi,
  hafizaOnerisi,
  turBilgisi,
}: ChatMessageProps) {
  const isUser = role === "user";
  const { toast } = useToast();
  const { retryLastMessage, isThinking, selectedModel, sendMessage, projeId, hafizaOnerisiniTemizle, buradanGeriSar } = useChat();
  const { projects, updateProjectMemory } = useProject();
  const currentModelSupportsVision = modelSupportsVision(selectedModel);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);

  /* Uzun kullanıcı mesajı altı satırda kesiliyor. `olcu` null ise mesaj zaten
     kısa ve ok işareti hiç çıkmıyor.

     TAM YÜKSEKLİK DE SAKLANIYOR: açık durumda `max-height: none` vermek
     kolaydı ama CSS `none` değerine GEÇİŞ YAPAMIYOR, yani açılma anında
     animasyon olmuyordu. İki uçta da piksel değeri olunca geçiş iki yönde de
     çalışıyor. Değer ResizeObserver'la güncel tutuluyor. */
  const metinRef = useRef<HTMLParagraphElement>(null);
  const [olcu, setOlcu] = useState<{ tavanPx: number; tamPx: number } | null>(null);
  const [acik, setAcik] = useState(false);

  /* Ölçüm layout etkisinde: boya öncesinde yapılıyor, yoksa uzun mesaj bir
     kare boyunca tam boy görünüp sonra kısalıyor — göze çarpan bir zıplama.

     ResizeObserver ŞART: balon yüzde genişlikte, pencere daraldıkça aynı
     metin daha çok satıra yayılıyor. Tek seferlik ölçümde altı satıra sığan
     bir mesaj, pencere daraldığında sekiz satır olup katlanmadan kalırdı.

     `scrollHeight` max-height'tan ETKİLENMİYOR (kırpılan değil, gerçek içerik
     yüksekliği), o yüzden ölçüm katlanmış hâlde de doğru ve döngü kurmuyor. */
  useLayoutEffect(() => {
    const el = metinRef.current;
    if (!isUser || !el) return;
    const olc = () => {
      const satirPx = parseFloat(getComputedStyle(el).lineHeight);
      const tamPx = el.scrollHeight;
      const tavanPx = katlamaTavani(tamPx, satirPx);
      setOlcu((onceki) => {
        if (tavanPx === null) return onceki === null ? onceki : null;
        if (onceki && onceki.tavanPx === tavanPx && onceki.tamPx === tamPx) return onceki;
        return { tavanPx, tamPx };
      });
    };
    olc();
    const gozlemci = new ResizeObserver(olc);
    gozlemci.observe(el);
    return () => gozlemci.disconnect();
  }, [isUser, content]);
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState<{ [key: string]: boolean }>({});
  const messageAnimRef = useMessageEntry(role);
  const animateCopySuccess = useCopySuccess();
  const copyCheckRef = useRef<HTMLDivElement>(null);
  const codeCopyCheckRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const messageRef = useRef<HTMLDivElement>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Merge refs for message animation + existing ref
  const setRefs = useCallback((node: HTMLDivElement | null) => {
    (messageRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    (messageAnimRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  }, [messageAnimRef]);

  const handleImageClick = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  
  const copyToClipboard = async (text: string): Promise<boolean> => {
    // Try modern clipboard API first
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        console.warn('Clipboard API failed, trying fallback:', err);
      }
    }
    
    // Fallback: use textarea + execCommand
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch (err) {
      console.error('Fallback copy failed:', err);
      return false;
    }
  };

  const handleCopy = async () => {
    const textToCopy = content;
    const success = await copyToClipboard(textToCopy);
    if (success) {
      setCopied(true);
      // Animate the checkmark
      if (copyCheckRef.current) {
        animateCopySuccess(copyCheckRef.current);
      }
      toast({
        description: "Kopyalandı!",
        duration: 2000
      });
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast({
        description: "Kopyalama başarısız oldu",
        variant: "destructive",
        duration: 2000
      });
    }
  };
  
  const handleLike = () => {
    setLiked(!liked);
    if (disliked) setDisliked(false);
  };
  
  const handleDislike = () => {
    setDisliked(!disliked);
    if (liked) setLiked(false);
  };

  const handleCodeCopy = async (code: string, index: string) => {
    const success = await copyToClipboard(code);
    if (success) {
      setCodeCopied((prev) => ({ ...prev, [index]: true }));
      // Animate code copy checkmark
      const checkEl = codeCopyCheckRefs.current[index];
      if (checkEl) {
        animateCopySuccess(checkEl);
      }
      toast({
        description: "Kod kopyalandı!",
        duration: 2000,
      });
      setTimeout(() => {
        setCodeCopied((prev) => ({ ...prev, [index]: false }));
      }, 2000);
    } else {
      toast({
        description: "Kopyalama başarısız oldu",
        variant: "destructive",
        duration: 2000
      });
    }
  };
  
  return (
    <div 
      ref={setRefs} 
      data-role={role} 
      className={`flex w-full py-4 px-4 ${isUser ? 'justify-end' : 'justify-start'}`}
      style={{ opacity: 0 }}
    >
      <div 
        className={`flex items-start transition-all duration-300 relative group select-text 
          ${isUser 
            ? 'max-w-[85%] md:max-w-[75%] bg-white dark:bg-[#333333] shadow-[0_0_20px_5px_rgba(0,0,0,0.05)] dark:shadow-none px-5 py-3 rounded-3xl' 
            : 'w-full max-w-[800px] px-0 py-3'
          }
          ${isForkPoint ? 'ring-2 ring-amber-500/50 bg-amber-500/5' : ''}`}
      >
        {/* User message hover actions - fork & copy */}
        {isUser && (
          /* Grubun SAĞ kenarı balonun soluna yaslı (`right-full`), sol kenarı
             sabit uzaklıkta değil. Önce `-left-20` idi: iki düğmeyle sığıyordu,
             geri sarma düğmesi gelince grup genişleyip balonun üstüne taştı.
             Bu konumlandırma düğme sayısından bağımsız. */
          <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            {messageId && onForkFromHere && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="canli-ikon canli-ciz h-8 w-8 rounded-full bg-[#F4F4F4] dark:bg-[#333333] border border-border/50 text-muted-foreground hover:text-foreground"
                      onClick={() => onForkFromHere(messageId)}
                    >
                      <GitBranch className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Buradan dallan</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {/* Geri sarma dallanmanın YANINDA: ikisi de "bu noktaya dön"
                demek, farkları nereye dönüldüğü. Dallanma yeni bir sohbet
                açıyor, geri sarma aynı sohbette kalıyor. */}
            {messageId && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="canli-ikon canli-don-geri h-8 w-8 rounded-full bg-[#F4F4F4] dark:bg-[#333333] border border-border/50 text-muted-foreground hover:text-foreground"
                      onClick={() => buradanGeriSar(messageId)}
                      aria-label="Buradan geri sar"
                    >
                      <Undo2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Buradan geri sar</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="canli-ikon canli-kaydir h-8 w-8 rounded-full bg-[#F4F4F4] dark:bg-[#333333] border border-border/50 text-muted-foreground hover:text-foreground"
                    onClick={handleCopy}
                  >
                    {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>{copied ? 'Kopyalandı!' : 'Kopyala'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
        {/* Fork point indicator */}
        {isForkPoint && (
          <div className="absolute -left-1 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-500 via-amber-400 to-amber-500 rounded-full" />
        )}
        {isForkPoint && (
          <div className="absolute -top-3 left-4 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30">
            <GitBranch className="h-3 w-3 text-amber-500" />
            <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">Dallanma noktası</span>
          </div>
        )}

        <div className="flex-1 space-y-2 min-w-0 overflow-x-clip">

        {/* Thinking indicator - always above content for assistant messages with reasoning */}
        {!isUser && modelShowsReasoning(modelId || selectedModel) && (
          (isStreaming || (rawContent && rawContent !== content)) ? (
            <ThinkingIndicator 
              thinkContent={rawContent || ''} 
              isThinking={isThinking}
              isStreaming={isStreaming}
            />
          ) : null
        )}

        {/* User message images */}
        {isUser && images && images.length > 0 && (
          <div className="flex flex-col gap-2 mb-2">
            {/* Warning if current model doesn't support vision */}
            {!currentModelSupportsVision && (
              <div className="flex items-center gap-1.5 text-xs text-amber-500">
                <AlertTriangle className="h-3 w-3" />
                <span>Mevcut model bu resimleri göremez</span>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {images.map((img, idx) => (
                <img
                  key={idx}
                  src={img}
                  alt={`Eklenen resim ${idx + 1}`}
                  className={`max-w-[200px] max-h-[200px] rounded-lg object-cover border cursor-pointer hover:opacity-90 hover:scale-[1.02] transition-all ${
                    !currentModelSupportsVision 
                      ? 'border-amber-500/50 opacity-60' 
                      : 'border-border'
                  }`}
                  onClick={() => handleImageClick(idx)}
                />
              ))}
            </div>
            <ImageLightbox
              images={images}
              initialIndex={lightboxIndex}
              open={lightboxOpen}
              onOpenChange={setLightboxOpen}
            />
          </div>
        )}

        <div className="prose prose-sm dark:prose-invert max-w-none break-words select-text cursor-text overflow-x-clip w-full max-w-full">
          {isUser ? (
            <div className="relative">
              <p
                ref={metinRef}
                /* Solma MASKEYLE: son satırı yavaşça silikleştiriyor ve
                   "devamı var" sinyalini asıl bu veriyor — küçük ok tek başına
                   gözden kaçıyor. Gradyanlı bir kaplama koymak balonun iki
                   temadaki farklı zeminine uyum sağlayamazdı; maske zeminden
                   bağımsız çalışıyor. */
                className={`text-sm leading-relaxed text-foreground break-words select-text cursor-text whitespace-pre-wrap${
                  olcu ? ' overflow-hidden transition-[max-height] duration-300 ease-out motion-reduce:transition-none' : ''
                }${
                  olcu && !acik ? ' [mask-image:linear-gradient(to_bottom,#000_60%,transparent_100%)]' : ''
                }`}
                style={olcu ? { maxHeight: acik ? olcu.tamPx : olcu.tavanPx } : undefined}
              >
                {content.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
                  part.startsWith('**') && part.endsWith('**') ? (
                    <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
                  ) : (
                    <span key={i}>{part}</span>
                  )
                )}
              </p>

              {olcu && (
                <button
                  type="button"
                  onClick={() => setAcik((a) => !a)}
                  aria-expanded={acik}
                  aria-label={acik ? 'Mesajı kısalt' : 'Mesajın tamamını göster'}
                  className="absolute -bottom-1 right-0 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronDown className={`h-4 w-4 transition-transform duration-200${acik ? ' rotate-180' : ''}`} />
                </button>
              )}
            </div>
          ) : <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]} 
            rehypePlugins={[rehypeHighlight, rehypeKatex]} 
            components={{
          code({
            className,
            children,
            ...props
          }: any) {
            const match = /language-(\w+)/.exec(className || '');
            return !match ? <code className="bg-muted px-1.5 py-0.5 rounded text-sm break-words" {...props}>
                      {children}
                    </code> : <code className={className} {...props}>
                      {children}
                    </code>;
          },
          p({
            children
          }) {
            return <p className="text-sm leading-relaxed text-foreground mb-4 break-words">{children}</p>;
          },
          ul({
            children
          }) {
            return <ul className="list-disc list-inside space-y-1 text-sm text-foreground mb-4 break-words">{children}</ul>;
          },
          ol({
            children
          }) {
            return <ol className="list-decimal list-inside space-y-1 text-sm text-foreground mb-4 break-words">{children}</ol>;
          },
          h1({
            children
          }) {
            return <h1 className="text-xl font-bold text-foreground mb-3 break-words">{children}</h1>;
          },
          h2({
            children
          }) {
            return <h2 className="text-lg font-bold text-foreground mb-2 break-words">{children}</h2>;
          },
          h3({
            children
          }) {
            return <h3 className="text-base font-semibold text-foreground mb-2 break-words">{children}</h3>;
          },
          pre({ children, node, ...props }: any) {
            // Extract text content from React children recursively
            const extractText = (node: any): string => {
              if (typeof node === 'string') return node;
              if (typeof node === 'number') return String(node);
              if (!node) return '';
              if (Array.isArray(node)) return node.map(extractText).join('');
              if (node.props?.children) return extractText(node.props.children);
              return '';
            };
            
            const codeContent = extractText(children).trim();
            // Use content hash as stable key instead of random
            const codeIndex = codeContent.slice(0, 50) + codeContent.length;
            
            return (
              <div className="not-prose relative group/code w-full mb-4">
                {/* Zero-height sticky row — sibling of overflow container so sticky resolves to chat scroll */}
                <div className="sticky top-2 z-10 flex justify-end h-0 overflow-visible pointer-events-none">
                  <div className="pointer-events-auto mr-2 opacity-0 group-hover/code:opacity-100 transition-opacity duration-150">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 bg-muted/80 backdrop-blur-sm shadow-sm hover:bg-background/80"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleCodeCopy(codeContent, codeIndex);
                      }}
                    >
                      {codeCopied[codeIndex] ? (
                        <div ref={(el) => { codeCopyCheckRefs.current[codeIndex] = el; }}>
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Code content — no vertical scroll, horizontal scroll only */}
                <div className="bg-muted rounded-lg border border-border/50 w-full max-w-full overflow-x-auto">
                  <pre className="p-4 text-xs sm:text-sm min-w-full" {...props}>
                    {children}
                  </pre>
                </div>
              </div>
            );
          },
          blockquote({
            children
          }) {
            return <blockquote className="border-l-4 border-primary pl-4 italic text-muted-foreground mb-4">{children}</blockquote>;
          },
          // Tablonun tamamı MarkdownTable'da: hiza kararı kolonun tamamına
          // bakmayı gerektiriyor, tek hücre kendi başına bilemiyor.
          // th/td geçersiz kılınMIYOR ki hücre içindeki kalın/bağlantı/kod
          // biçimleri react-markdown'ın kendi çiziminde korunsun.
          table: MarkdownTable
        }}>
              {convertMathDelimiters(isStreaming ? closeOpenCodeFences(content) : content)}
            </ReactMarkdown>}
        </div>

        {/* Cevabın dayandığı belge parçaları — eylem çubuğunun ÜSTÜNDE, cevaba
            bitişik. Kapalı başlar. */}
        {/* Yanıt uzunluk sınırına takılmış. Sessiz kalmak, yarım cevabı tam
            cevap gibi göstermek demekti — makalenin "sessiz hata" dediği şey. */}
        {!isUser && kesildi && !isStreaming && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>Yanıt uzunluk sınırına takıldı, yarım kalmış olabilir.</span>
            <button
              type="button"
              onClick={() => sendMessage('Kaldığın yerden devam et.')}
              className="ml-auto rounded-md border border-amber-500/40 px-2 py-1 font-medium transition-colors hover:bg-amber-500/15"
            >
              Devam et
            </button>
          </div>
        )}

        {/* Model proje hafızasına ekleme önerdi. OTOMATİK YAZMIYORUZ: hafıza
            kullanıcının kendi düzenlediği bir alan, habersiz müdahale ona
            duyduğu güveni bitirirdi. Karar modelde, yetki kullanıcıda. */}
        {!isUser && hafizaOnerisi && projeId && messageId && !isStreaming && (
          <IsikliKart className="mt-2.5 rounded-xl border border-border bg-card px-3.5 py-3">
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-muted">
                <Brain className="h-3 w-3" />
              </span>
              {/* "hafıza" değil BELLEK: sağdaki panelin sekmesi zaten "Bellek",
                  kart "hafıza" diyordu — aynı şeyin iki adı vardı. */}
              <span>Proje belleğine eklensin mi?</span>
            </div>
            {/* Öneri, bellekte alacağı MADDE biçiminde gösteriliyor: kartta
                görülen satır ile kaydedilecek satır aynı, "neyi onaylıyorum"
                sorusu doğmuyor. */}
            <div className="mb-3 flex gap-2.5 rounded-lg bg-muted px-3 py-2.5">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
              <p className="text-[13px] leading-relaxed text-foreground">{hafizaOnerisi}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  const proje = projects.find((p) => p.id === projeId);
                  const sonuc = hafizayaEkle(proje?.memory || '', hafizaOnerisi);
                  if (sonuc.durum === 'eklendi') {
                    await updateProjectMemory(projeId, sonuc.metin);
                    bildir.success('Proje belleğine eklendi');
                  } else if (sonuc.durum === 'zaten-var') {
                    bildir.info('Bu bilgi bellekte zaten var');
                  } else {
                    bildir.warning('Proje belleği dolu', {
                      description: 'Proje panelinden eski maddeleri kısaltabilirsiniz.',
                    });
                  }
                  await hafizaOnerisiniTemizle(messageId);
                }}
                /* Sohbetin ortasında tek başına "Ekle" neyin nereye ekleneceğini
                   söylemiyor. */
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Belleğe ekle
              </button>
              <button
                type="button"
                onClick={() => hafizaOnerisiniTemizle(messageId)}
                /* Çerçevesiz: onay ile ret aynı görsel ağırlıkta durmamalı,
                   ret sessiz olan taraf. */
                className="rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Yoksay
              </button>
            </div>
          </IsikliKart>
        )}

        {!isUser && sources && sources.length > 0 && <ContextCards sources={sources} />}

        {showActions && !isUser && <TooltipProvider>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              {/* Bağlam paneli eylem sırasının BAŞINDA: sıkıştırma olduğunda
                  üstündeki nokta ilk göze çarpan şey olsun.
                  Sıradan turda HİÇ ÇIKMIYOR — gerekçesi `gosterilmeliMi`'de. */}
              {turBilgisi && gosterilmeliMi(turBilgisi) && <TurBilgisiPaneli bilgi={turBilgisi} />}
              <Tooltip>
                <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className={`canli-ikon canli-it h-10 w-10 rounded-full bg-[#F4F4F4] dark:bg-[#333333] transition-all duration-200 ${liked ? 'text-primary scale-110' : 'text-[#999999] dark:text-[#999999]'}`} onClick={handleLike}>
                    <ThumbsUp className={`h-5 w-5 ${liked ? 'fill-current' : ''}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Beğen</p>
                </TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" style={{ ['--canli-y' as string]: '2px' } as React.CSSProperties} className={`canli-ikon canli-it h-10 w-10 rounded-full bg-[#F4F4F4] dark:bg-[#333333] transition-all duration-200 ${disliked ? 'text-destructive scale-110' : 'text-[#999999] dark:text-[#999999]'}`} onClick={handleDislike}>
                    <ThumbsDown className={`h-5 w-5 ${disliked ? 'fill-current' : ''}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Beğenme</p>
                </TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className={`canli-ikon canli-kaydir h-10 w-10 rounded-full bg-[#F4F4F4] dark:bg-[#333333] transition-all duration-200 ${copied ? 'text-primary scale-110' : 'text-[#999999] dark:text-[#999999]'}`} onClick={handleCopy}>
                    <div className="relative w-5 h-5">
                      <Copy className={`h-5 w-5 absolute inset-0 transition-all duration-300 ${copied ? 'scale-0 rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100'}`} />
                      <Check className={`h-5 w-5 absolute inset-0 transition-all duration-300 ${copied ? 'scale-100 rotate-0 opacity-100' : 'scale-0 -rotate-90 opacity-0'}`} />
                    </div>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{copied ? 'Kopyalandı!' : 'Kopyala'}</p>
                </TooltipContent>
              </Tooltip>
              
              <div className="ml-auto flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="canli-ikon canli-don gap-2 text-sm transition-all duration-200 rounded-full bg-[#F4F4F4] text-[#333333] dark:bg-[#333333] dark:border dark:border-black dark:text-white h-10"
                      onClick={retryLastMessage}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Yeniden Dene
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Son mesajı yeniden gönder</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </TooltipProvider>}
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  /* Memo karşılaştırması ELLE yazılı: burada SAYILMAYAN bir prop değişirse
     bileşen yeniden çizilmez ve değişiklik ekrana hiç yansımaz.
     `hafizaOnerisi` eksikken tam bu oldu — öneri veritabanından siliniyor ama
     kart ekranda kalıyordu ve kullanıcı ikinci kez ekleyebiliyordu. `kesildi`
     de eksikti; o şimdiye kadar tesadüfen çalışıyordu çünkü içerikle aynı anda
     değişiyor. YENİ PROP EKLERKEN BURAYA DA EKLE. */
  return (
    prevProps.content === nextProps.content &&
    prevProps.rawContent === nextProps.rawContent &&
    prevProps.showActions === nextProps.showActions &&
    prevProps.isStreaming === nextProps.isStreaming &&
    prevProps.isForkPoint === nextProps.isForkPoint &&
    prevProps.role === nextProps.role &&
    prevProps.messageId === nextProps.messageId &&
    prevProps.images === nextProps.images &&
    prevProps.modelId === nextProps.modelId &&
    prevProps.kesildi === nextProps.kesildi &&
    prevProps.hafizaOnerisi === nextProps.hafizaOnerisi &&
    prevProps.turBilgisi === nextProps.turBilgisi &&
    prevProps.sources === nextProps.sources
  );
});
