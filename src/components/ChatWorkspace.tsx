import { useLayoutEffect, useRef, useState } from 'react';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { ChatArea } from './ChatArea';
import { DocumentEditPanel } from './DocumentEditPanel';
import { ArtifactToggle } from './ArtifactToggle';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from './ui/resizable';
import { useDocumentEdit } from '@/contexts/documentEditStore';
import { useMediaQuery } from '@/hooks/use-media-query';
import { usePanelPresence } from '@/hooks/use-panel-presence';
import { useChat } from '@/contexts/ChatContext';
import { SidebarTrigger } from './ui/sidebar';
import logoLight from '@/assets/logo-light.png';
import logoDark from '@/assets/logo-dark.png';

const WIDTH_KEY = 't3ai-document-panel-size';
function storedWidth() {
  try { const n = Number(localStorage.getItem(WIDTH_KEY)); return n >= 20 && n <= 65 ? n : 32; }
  catch { return 32; }
}

/** Bölme grubu ve sohbet aynı DOM'da kalır; aç/kapat taslağı ve kaydırmayı sıfırlamaz. */
export function ChatWorkspace({ splashComplete }: { splashComplete: boolean }) {
  const { isOpen } = useDocumentEdit();
  const { activeConversation, goToNewChatScreen } = useChat();
  const desktop = useMediaQuery('(min-width: 1024px)');
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyWidth, setBodyWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const documentPanel = useRef<ImperativePanelHandle>(null);
  const preferredSize = useRef(storedWidth());
  const documentMotion = usePanelPresence(isOpen);
  const chatMotion = usePanelPresence(desktop || !isOpen);
  const minDocumentSize = desktop && bodyWidth ? Math.min(55, Math.max(20, 320 / Math.max(1, bodyWidth - 12) * 100)) : 20;

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const observer = new ResizeObserver(() => setBodyWidth(body.clientWidth));
    observer.observe(body);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (isOpen) documentPanel.current?.resize(preferredSize.current);
    else documentPanel.current?.collapse();
  }, [isOpen]);

  // Açılışın geçici minimum boyutu kullanıcının tercihinin üstüne yazılmaz.
  const rememberWidth = () => {
    const size = documentPanel.current?.getSize();
    if (size && isOpen && desktop) {
      preferredSize.current = size;
      try { localStorage.setItem(WIDTH_KEY, String(size)); } catch { /* Bellekte korunur. */ }
    }
  };

  return <div className="chat-workspace relative flex min-h-0 min-w-0 flex-1 flex-col gap-3" data-compact={!desktop}>
    <header data-workspace-toolbar className="flex h-16 shrink-0 items-center gap-3 rounded-2xl bg-card px-3 dark:bg-[#2C2C2C]">
      <SidebarTrigger className="workspace-icon-button canli-ikon canli-pop h-9 w-9 shrink-0 rounded-lg md:hidden" title="Sohbetleri aç" />
      <button onClick={goToNewChatScreen} aria-label="Yeni sohbet ekranı" className="workspace-icon-button relative h-10 w-24 shrink-0 rounded-lg focus-visible:outline-none">
        <img src={logoLight} alt="T3AI Logo" className="h-full w-full object-contain dark:hidden" />
        <img src={logoDark} alt="T3AI Logo" className="hidden h-full w-full object-contain dark:block" />
      </button>
      <div className="hidden min-w-0 flex-1 border-l border-border/60 pl-3 md:block">
        <p className="truncate text-sm font-medium" title={activeConversation?.title}>{activeConversation?.title || 'Yeni sohbet'}</p>
      </div>
      <div className="ml-auto shrink-0"><ArtifactToggle /></div>
    </header>
    <div ref={bodyRef} className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
    <ResizablePanelGroup direction="horizontal" className="workspace-resizable min-w-0" data-resizing={dragging}>
      <ResizablePanel id="chat" order={1} defaultSize={100} minSize={35}>
        <div {...chatMotion.props} className="workspace-pane flex h-full min-h-0 min-w-0 flex-col">
          <ChatArea splashComplete={splashComplete} showArtifactActions={false} showHeaderLogo={false} />
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle disabled={!isOpen || !desktop} aria-label="Belge paneli genişliği"
        className="workspace-width border-0 bg-transparent" style={{ width: isOpen && desktop ? 12 : 0, opacity: isOpen && desktop ? 1 : 0 }}
        onDragging={(active) => { setDragging(active); if (!active) rememberWidth(); }} onKeyUp={rememberWidth} />
      <ResizablePanel ref={documentPanel} id="document" order={2} defaultSize={0} minSize={minDocumentSize} maxSize={65} collapsible={!isOpen} collapsedSize={0}>
        <section {...documentMotion.props} aria-label="Belge paneli" className="workspace-pane h-full min-h-0 min-w-0">
          <DocumentEditPanel />
        </section>
      </ResizablePanel>
    </ResizablePanelGroup>
    </div>
  </div>;
}
