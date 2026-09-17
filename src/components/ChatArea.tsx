import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { Button } from "@/components/ui/button";
import { ArrowDown, Loader2, Square, Brain, Timer, Coins, ArrowLeft, Layers } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChat } from "@/contexts/ChatContext";
import { useEffect, useRef, useState, useMemo, useLayoutEffect, useCallback, useContext } from "react";
import { useWelcomeTimeline, useThinkingAnimation } from "@/hooks/useAnimeTransition";
import { SidebarContext } from "@/components/ui/sidebar";
import { ImageGenerator } from "./ImageGenerator";
import { estimateTokens, formatTokenCount } from "@/lib/tokenEstimator";
import { getContextConfig } from "@/lib/contextManager";
import { isImageGenerationModel } from "@/lib/modelConfig";
import logo from "@/assets/logo.png";
import logoLight from "@/assets/logo-light.png";
import logoDark from "@/assets/logo-dark.png";
import chatLogo from "@/assets/chat-logo.png";
import { useNavigate } from "react-router-dom";
import { TextSelectionPopup } from "./TextSelectionPopup";
import { VersionBadge } from "./VersionBadge";
import { ArtifactToggle } from "./ArtifactToggle";

interface ChatAreaProps {
  showHeaderLogo?: boolean;
  showArtifactActions?: boolean;
  projectId?: string;
  projectName?: string;
  showBackButton?: boolean;
  splashComplete?: boolean;
}
export function ChatArea({
  projectId,
  projectName,
  showBackButton = false,
  showArtifactActions = true,
  showHeaderLogo = true,
  splashComplete,
}: ChatAreaProps) {
  const navigate = useNavigate();
  const {
    activeConversation,
    isStreaming,
    isThinking,
    isRetrying,
    isSummarizing,
    sendMessage,
    stopGeneration,
    forkFromMessage,
    goToNewChatScreen,
    setQuotedText,
    streamingContent,
    selectedModel,
  } = useChat();
  const sidebarCtx = useContext(SidebarContext);
  const sidebarState = sidebarCtx?.state ?? "expanded";
  const isSidebarCollapsed = sidebarState === "collapsed";
  const isProjectMode = !!projectId;
  const isImageMode = isImageGenerationModel(selectedModel);
  const messages = activeConversation?.messages || [];
  const viewportRef = useRef<HTMLDivElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);
  

  // Token counter - calculate total tokens used
  const tokenInfo = useMemo(() => {
    const config = getContextConfig(selectedModel);
    const totalTokens = messages.reduce((sum, msg) => {
      return sum + estimateTokens(msg.content) + 4; // +4 overhead per message
    }, 0);
    const percentage = Math.min(totalTokens / config.MAX_CONTEXT_TOKENS * 100, 100);
    const isNearLimit = percentage > 70;
    const isAtLimit = percentage > 90;
    return {
      totalTokens,
      percentage,
      isNearLimit,
      isAtLimit
    };
  }, [messages, selectedModel]);

  // Smart auto-scroll state
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const lastMessageCount = useRef(messages.length);

  // Live timer for thinking state
  const [liveTimer, setLiveTimer] = useState(0);
  const timerStartRef = useRef<number | null>(null);

  // Check if user is near bottom (within 30px threshold - lower for easier disable on tablets)
  const isNearBottom = () => {
    if (!viewportRef.current) return true;
    const {
      scrollTop,
      scrollHeight,
      clientHeight
    } = viewportRef.current;
    return scrollHeight - scrollTop - clientHeight < 30;
  };

  // Auto-scroll during streaming when shouldAutoScroll is true
  // NOTE: Streaming updates can change DOM height (markdown/code highlighting) a frame later.
  // We schedule scroll after layout to reliably follow the latest token.
  // STREAMING OPTIMIZATION: Use streamingContent.content.length for scroll trigger
  // This avoids dependency on messages array which would cause more re-renders
  const scrollTrigger = useMemo(() => {
    if (streamingContent) {
      return `streaming:${streamingContent.messageId}:${streamingContent.content.length}`;
    }
    const last = messages[messages.length - 1];
    return last ? `${last.id}:${last.content.length}` : "";
  }, [messages, streamingContent]);
  
  // WHEEL/POINTERDOWN CAPTURE - ChatGPT/Claude/Gemini tarzı "niyet yakalama"
  // Kullanıcı scroll event'i oluşmadan önce bile (wheel/pointerdown anında) 
  // kod bloğuyla etkileşime girerse auto-scroll'u anında kapat
  useEffect(() => {
    const handleUserIntent = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.closest('.code-block-scroll')) {
        setShouldAutoScroll(false);
      }
    };

    // Wheel ve pointerdown capture phase'de - scroll event'inden önce tetiklenir
    document.addEventListener('wheel', handleUserIntent, { capture: true, passive: true });
    document.addEventListener('pointerdown', handleUserIntent, { capture: true });
    
    return () => {
      document.removeEventListener('wheel', handleUserIntent, { capture: true });
      document.removeEventListener('pointerdown', handleUserIntent, { capture: true });
    };
  }, []);
  
  // Streaming sırasında içerik büyürken showScrollBottom'u güncelle
  // Kullanıcı kod bloğunda takılırken bile yeni token geldikçe "↓" butonu görünsün
  useEffect(() => {
    if (!shouldAutoScroll && (isStreaming || isThinking) && messages.length > 0) {
      const atBottom = isNearBottom();
      setShowScrollBottom(!atBottom);
    }
  }, [scrollTrigger, shouldAutoScroll, isStreaming, isThinking, messages.length]);

  useLayoutEffect(() => {
    if (!(isStreaming || isThinking)) return;
    if (!shouldAutoScroll) return;
    const el = viewportRef.current;
    if (!el) return;
    
    // Kullanıcı aktif olarak kod bloğunda focus ise auto-scroll yapma
    const activeElement = document.activeElement;
    if (activeElement?.closest('.code-block-scroll')) {
      return;
    }
    
    const raf1 = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      const raf2 = requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
      // cleanup for nested raf
      return () => cancelAnimationFrame(raf2);
    });
    return () => cancelAnimationFrame(raf1);
  }, [scrollTrigger, isStreaming, isThinking, shouldAutoScroll]);

  // Reset auto-scroll when a new message is added
  useEffect(() => {
    if (messages.length > lastMessageCount.current) {
      setShouldAutoScroll(true);
    }
    lastMessageCount.current = messages.length;
  }, [messages.length]);

  // Prevent background/page scroll while ChatArea is mounted (fixes "sayfa kayıyor")
  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, []);

  // Live timer update for thinking state
  useEffect(() => {
    if (isThinking) {
      timerStartRef.current = Date.now();
      setLiveTimer(0);
      const interval = setInterval(() => {
        if (timerStartRef.current) {
          setLiveTimer((Date.now() - timerStartRef.current) / 1000);
        }
      }, 100);
      return () => clearInterval(interval);
    } else {
      timerStartRef.current = null;
    }
  }, [isThinking]);
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    // NESTED SCROLL GUARD: Kod bloğu içinden gelen scroll event'lerini ayıkla
    // Bu event'ler viewport scroll'u değil, nested container scroll'udur
    const target = e.target as HTMLElement;
    if (target.closest('.code-block-scroll')) {
      // Kullanıcı kod bloğunda scroll yapıyor - takip modunu kapat
      setShouldAutoScroll(false);
      return; // Ana scroll mantığını çalıştırma
    }

    const element = e.currentTarget;
    const scrollTop = element.scrollTop;
    /* Yukarı kaydır düğmesi kaldırıldı; bu bayrak logoyu soldurmak için
       duruyor (aşağıda `opacity-20`). Sohbette "en başa dön" düğmesi
       tutmuyoruz: geçmişi okumak için zaten yukarı kaydırılıyor ve uzun bir
       konuşmanın ilk mesajına tek tıkla atlamak nadiren isteniyor —
       ChatGPT, Claude, Telegram, Discord ve Slack'te de yok. */
    setShowScrollTop(scrollTop > 300);

    // Scroll to bottom butonu: en altta değilse ve mesaj varsa göster
    const atBottom = isNearBottom();
    setShowScrollBottom(!atBottom && messages.length > 0);

    // If user scrolls up during streaming, disable auto-scroll
    if (isStreaming && !atBottom) {
      setShouldAutoScroll(false);
    }
    // If user scrolls back to bottom, re-enable auto-scroll
    if (atBottom) {
      setShouldAutoScroll(true);
    }
  };
  const scrollToBottom = () => {
    if (viewportRef.current) {
      viewportRef.current.scrollTo({
        top: viewportRef.current.scrollHeight,
        behavior: 'smooth'
      });
      setShouldAutoScroll(true);
    }
  };
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const swipeDistance = touchEndX.current - touchStartX.current;
    const minSwipeDistance = 50;

    // Only trigger sidebar swipe if started from left edge (within 30px)
    const startedFromLeftEdge = touchStartX.current < 30;

    // Swipe right to open sidebar (only on mobile and from left edge)
    if (swipeDistance > minSwipeDistance && window.innerWidth < 768 && startedFromLeftEdge) {
      const sidebarTrigger = document.querySelector('[data-sidebar="trigger"]') as HTMLButtonElement;
      if (sidebarTrigger) {
        sidebarTrigger.click();
      }
    }
    touchStartX.current = 0;
    touchEndX.current = 0;
  };
  return <div className="relative flex flex-1 min-h-0 flex-col bg-background overflow-hidden" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      {/* Logo header */}
      {/* Logo header with background to prevent text overlap */}
      {showHeaderLogo && <div className="group/logo absolute left-0 top-0 z-10 w-[200px] h-[80px] pointer-events-none">
        {/* `relative` ŞART: görseller `absolute inset-0` ve bu sarmalayıcı
            konumlandırılmamışsa onlar DIŞTAKİ 200x80 kutuya göre yerleşiyor.
            Sarmalayıcıya bir dönüşüm uygulandığı anda (eskiden `hover:scale-105`,
            hâlâ `active:scale-90`) CSS kuralı gereği sarmalayıcı kapsayıcı blok
            hâline geliyor ve görseller referansı değiştirip 12 piksel aşağı
            atlıyordu — logonun imleç üstüne gelince yer değiştirmesinin sebebi
            buydu. `relative` ile referans her iki durumda da aynı.

            Görsellerdeki `mt-3` de KALDIRILDI: boşluk sarmalayıcıda zaten var,
            ikisi birden uygulanınca 12 piksel iki kez sayılıyordu.

            Hover efekti: hafif bir arka plan pili + %3,5 büyüme. Büyüme
            `origin-left` ile SOL KENARA çivili — merkezden büyütmek üst kenarı
            oynatırdı ve düzelttiğimiz şikâyet tam olarak buydu. Bu hâlde logo
            yalnızca sağa doğru açılıyor, dikeyde ±1 piksel.

            Kaydırıldığında solma davranışı aynen korundu. */}
        <div className={`relative w-[128px] h-[64px] mt-3 rounded-2xl origin-left cursor-pointer transition-[opacity,transform,background-color] duration-300 hover:bg-foreground/[0.055] hover:scale-[1.035] active:scale-90 pointer-events-auto group-hover/logo:!opacity-100 ${showScrollTop ? 'opacity-20' : 'opacity-100'}`} onClick={() => { goToNewChatScreen(); }}>
          <img src={logoLight} alt="T3AI Logo" className="absolute inset-0 w-full h-full object-contain dark:hidden" />
          <img src={logoDark} alt="T3AI Logo" className="absolute inset-0 w-full h-full object-contain hidden dark:block" />
        </div>
      </div>}

      {/* Artifact paneli anahtarı — sağ üst, logonun karşısı. Sohbette artifact
          yoksa kendini hiç render etmez. */}
      {showArtifactActions && <div className="absolute right-3 top-3 z-20">
        <ArtifactToggle />
      </div>}

      {/* Image Generation Mode */}
      {isImageMode ? (
        <ImageGenerator />
      ) : messages.length === 0 && !isRetrying ? <WelcomeScreen
          isProjectMode={isProjectMode}
          projectName={projectName}
          sendMessage={sendMessage}
          splashComplete={splashComplete ?? true}
        /> : <>
          <ScrollArea className="flex-1 min-h-0" viewportRef={viewportRef} onScrollCapture={handleScroll}>
            <div className={`mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 w-full overflow-x-clip transition-all duration-200 ease-linear ${showHeaderLogo ? 'pt-16' : 'pt-4'}`}>
              {messages.map((message, index) => {
                // STREAMING OPTIMIZATION: Use streamingContent for the active streaming message
                const isStreamingMessage = streamingContent?.messageId === message.id;
                const displayContent = isStreamingMessage ? streamingContent.content : message.content;
                const displayRawContent = isStreamingMessage ? (streamingContent.rawContent || message.rawContent) : message.rawContent;
                
                return (
                  <ChatMessage 
                    key={message.id} 
                    role={message.role} 
                    content={displayContent} 
                    rawContent={displayRawContent} 
                    sources={message.sources}
                    kesildi={message.kesildi}
                    hafizaOnerisi={message.hafizaOnerisi}
                    turBilgisi={message.turBilgisi}
                    images={message.images} 
                    showActions={index === messages.length - 1 && message.role === "assistant" && !isStreaming} 
                    messageId={message.id} 
                    onForkFromHere={forkFromMessage} 
                    isForkPoint={activeConversation?.forkedAtMessageId === message.id}
                    isStreaming={isStreamingMessage}
                    modelId={message.modelId}
                  />
                );
              })}
              {/* ThinkingBlock removed - ThinkingIndicator button in ChatMessage handles this */}

              {/* Chat compact (özetleme) göstergesi — asıl yanıt başlamadan önce */}
              {isSummarizing && <div className="flex gap-4 py-2 items-center">
                  <div className="h-8 w-8" />
                  <div className="inline-flex items-center gap-2 px-4 h-10 rounded-full bg-[#FAE8E8] text-[#C41718] border border-[#C41718] dark:bg-[#332121] dark:border-[#C41718] dark:text-white text-xs font-medium">
                    <Layers className="h-4 w-4 animate-brain-pulse" />
                    <span className="whitespace-nowrap">Sohbet özetleniyor</span>
                    <span className="inline-flex gap-0.5">
                      <span className="h-1 w-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="h-1 w-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="h-1 w-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                  </div>
                </div>}

              {isStreaming && !isThinking && !isSummarizing && messages[messages.length - 1]?.role === "assistant" && <div className="flex gap-4 py-2">
                  <div className="h-8 w-8" />
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>}
            </div>
          </ScrollArea>
          
          {/* Red ambient glow near input - dark mode only */}
          <div className="hidden dark:block absolute w-[480px] h-[480px] left-1/2 -translate-x-1/2 bottom-0 bg-[rgba(196,23,24,0.1)] blur-[100px] pointer-events-none z-0" />

          {/* Aşağı kaydır — girdi kutusunun ORTASINDA, hemen üstünde.
              Ekrana sabitlenmiş (`fixed right-8`) ve 56 pikselken iki sorunu
              vardı: 40 piksellik gönder düğmesinden büyüktü, yani ikincil bir
              eylem birincilden baskın görünüyordu; ve konumu girdi kutusuna
              değil ekrana bağlıydı, kutu geniş moda geçip iki satıra çıkınca
              üstüne biniyordu.

              Sarmalayıcı `relative`, düğme `bottom-full`: kutu ne kadar
              büyürse büyüsün düğme hep onun üstünde kalıyor. Kenarlık yerine
              GÖLGE — koyu temada kutu ile arka planın kontrastı düşük ve ince
              bir kenarlık orada kayboluyor. */}
          <div className="relative">
            <Button
              onClick={scrollToBottom}
              size="icon"
              aria-label="Sohbetin en altına in"
              className={`absolute left-1/2 -translate-x-1/2 bottom-full mb-2 h-8 w-8 rounded-full border-none
                bg-card text-muted-foreground shadow-[0_4px_14px_rgba(0,0,0,0.14)]
                hover:bg-card hover:text-foreground
                dark:bg-[#383838] dark:shadow-[0_4px_14px_rgba(0,0,0,0.5)] dark:hover:bg-[#383838]
                transition-all duration-200 hover:scale-105 z-40
                ${showScrollBottom ? 'opacity-100' : 'opacity-0 translate-y-2 pointer-events-none'}`}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>

            <ChatInput />
          </div>
        </>}
      
      {/* Text Selection Popup for quoting */}
      <TextSelectionPopup 
        onQuote={(text) => {
          setQuotedText(text);
          // Focus the chat input
          window.dispatchEvent(new CustomEvent("t3ai:focus-chat-input"));
        }}
        onAction={(text, instruction) => {
          // Alıntıyı ve talimatı birlikte YOLLA — kullanıcı ayrıca yazmasın.
          // Alıntı biçimi ChatInput'takiyle aynı, model bağlamı aynı okuyor.
          sendMessage(`> "${text}"\n\n${instruction}`);
        }}
      />
      
      {/* Version Badge */}
      <VersionBadge />
    </div>;
}

// Thinking block with anime.js animations
function ThinkingBlock({ liveTimer }: { liveTimer: number }) {
  const thinkingRef = useThinkingAnimation();

  return (
    <div className="flex gap-4 py-6 animate-fade-in">
      <div className="h-8 w-8" />
      <div ref={thinkingRef} className="flex items-center gap-3">
        <div className="relative flex items-center justify-center w-10 h-10 rounded-full bg-primary/10" style={{ perspective: "200px" }}>
          <Brain className="thinking-brain h-5 w-5 text-primary" />
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="thinking-particle absolute w-1.5 h-1.5 rounded-full bg-primary"
              style={{
                top: "50%",
                left: "50%",
                marginTop: "-3px",
                marginLeft: "-3px",
                transformOrigin: `${12 + i * 3}px 0px`,
              }}
            />
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-primary">
            Düşünüyor
            <span className="inline-block w-6 text-left animate-pulse">...</span>
          </span>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Timer className="h-3 w-3" />
            <span className="font-mono tabular-nums">{liveTimer.toFixed(1)}s</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Extracted WelcomeScreen with anime.js timeline + 3D tilt
function WelcomeScreen({ isProjectMode, projectName, sendMessage, splashComplete }: {
  isProjectMode: boolean;
  projectName?: string;
  sendMessage: (msg: string) => void;
  splashComplete: boolean;
}) {
  const welcomeRef = useWelcomeTimeline(splashComplete);

  return (
    <div className="flex-1 relative overflow-hidden">
      {/* Red ambient glow - dark mode only */}
      <div className="hidden dark:block absolute w-[480px] h-[480px] left-1/2 -translate-x-1/2 top-[251px] bg-[rgba(196,23,24,0.1)] blur-[100px] pointer-events-none" />
      
      <div ref={welcomeRef} className="absolute inset-0 flex flex-col items-center z-10">
        {/* Welcome text group - independently positioned */}
        <div className="text-center mt-[297px]">
          <h2 className="welcome-letter text-[32px] font-medium leading-[48px] mb-3 text-foreground/80" style={{ opacity: 0 }}>
            {isProjectMode && projectName ? projectName : "Merhaba!"}
          </h2>
          <p className="welcome-subtitle text-[20px] font-normal leading-[30px] text-foreground/40" style={{ opacity: 0 }}>
            {isProjectMode ? "Bu proje içinde bir soru sorun" : "Bugün sana nasıl yardımcı olabilirim?"}
          </p>
        </div>
        
        {/* Chat input group - independently positioned */}
        <div className="mt-[32px] w-full">
          <ChatInput />
        </div>
      </div>
    </div>
  );
}
