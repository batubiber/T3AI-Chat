/** Belge listesi ve panel görünümü birbirinden bağımsız, sabit eylemlerdir. */
import { useEffect, useState } from 'react';
import { Check, Files, FileText, FileSpreadsheet, Presentation, PanelRight, PanelRightClose } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useChat } from '@/contexts/ChatContext';
import { useDocumentEditOptional } from '@/contexts/documentEditStore';
import { artifactOperations, type LocalDocxArtifact } from '@/lib/localDb';
import { toast } from 'sonner';

export function ArtifactToggle({ panelVisible, onShowPanel }: { panelVisible?: boolean; onShowPanel?: () => void }) {
  const docEdit = useDocumentEditOptional();
  const { activeConversation } = useChat();
  const [loaded, setLoaded] = useState<{ conversationId: string; items: LocalDocxArtifact[] } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const conversationId = activeConversation?.id;
  const artifactCount = (activeConversation?.messages ?? []).filter((m) => m.artifactId).length;
  useEffect(() => {
    setMenuOpen(false);
    if (!conversationId || !artifactCount) { setLoaded(null); return; }
    let cancelled = false;
    artifactOperations.listByConversation(conversationId).then((items) => {
      if (!cancelled) setLoaded({ conversationId, items: [...items].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) });
    }).catch(() => { if (!cancelled) { setLoaded(null); toast.error('Belge listesi yüklenemedi.'); } });
    return () => { cancelled = true; };
  }, [conversationId, artifactCount]);

  // Sohbet değişir değişmez önceki sohbetin listesi kaybolur; async okumayı beklemez.
  const items = loaded && loaded.conversationId === conversationId ? loaded.items : [];
  const hasLivePanel = !!docEdit && docEdit.stateConversationId === conversationId &&
    (docEdit.hasRun || docEdit.isLoading || !!docEdit.buffer || !!docEdit.uretim);
  if (!docEdit || (!items.length && !hasLivePanel)) return null;
  const open = panelVisible ?? docEdit.isOpen;
  const showPanel = () => { docEdit.show(); onShowPanel?.(); };
  const select = async (id: string) => {
    if (hasLivePanel && docEdit.artifactId === id) { showPanel(); return; }
    try { await docEdit.openArtifact(id); onShowPanel?.(); }
    catch { toast.error('Belge açılamadı. Yeniden deneyin.'); }
  };
  const openPanel = () => {
    if (hasLivePanel) showPanel();
    else if (items[0]) void select(items[0].id);
  };
  const label = open ? 'Belge panelini kapat' : 'Belge panelini aç';

  return (
    <div role="group" aria-label="Belge araçları" className="flex shrink-0 items-center gap-1 rounded-xl border border-border/60 bg-background/90 p-1 shadow-sm">
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" disabled={!items.length} aria-label="Belgeler"
                className="workspace-icon-button canli-ikon canli-pop relative h-9 w-9 gap-2 rounded-lg data-[state=open]:bg-accent sm:w-auto sm:px-2.5">
                <Files className="h-4 w-4" />
                <span className="hidden text-xs font-medium sm:inline">Belgeler</span>
                {items.length > 1 && <span aria-hidden className="absolute right-0.5 top-0.5 min-w-3 rounded bg-muted px-0.5 text-[9px] font-medium leading-3 sm:static sm:px-1 sm:text-[10px] sm:leading-4">{items.length > 99 ? '99+' : items.length}</span>}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          {!menuOpen && <TooltipContent>Bu sohbetteki belgeler{items.length ? ` (${items.length})` : ''}</TooltipContent>}
        </Tooltip>
        <DropdownMenuContent align="end" sideOffset={8} collisionPadding={12}
          onKeyDown={(event) => {
            if (event.key === 'Escape') { event.preventDefault(); setMenuOpen(false); }
          }}
          className="w-80 max-w-[calc(100vw-24px)] max-h-[min(420px,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto rounded-xl p-1.5 shadow-xl">
          <DropdownMenuLabel className="flex items-center justify-between px-2 py-2 text-xs font-medium text-muted-foreground">
            Bu sohbetteki belgeler <span>{items.length}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {items.map((a) => {
            const current = hasLivePanel && docEdit.artifactId === a.id;
            const Icon = a.fileName.endsWith('.pptx') ? Presentation : a.fileName.endsWith('.xlsx') ? FileSpreadsheet : FileText;
            return <DropdownMenuItem key={a.id} onSelect={() => { void select(a.id); }}
              className={cn('group gap-3 rounded-lg px-2 py-2.5', current && 'bg-accent/60')}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background"><Icon className="h-4 w-4 text-muted-foreground" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium" title={a.fileName}>{a.fileName}</span>
                <span className="block truncate text-xs text-muted-foreground">{current ? 'Seçili belge' : a.instruction || 'Oluşturulan belge'}</span>
              </span>
              {current && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
            </DropdownMenuItem>;
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <span aria-hidden className="mx-0.5 h-4 w-px bg-border/70" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={label} aria-expanded={open} data-document-toggle
            className={cn('workspace-icon-button canli-ikon canli-pop h-9 w-9 rounded-lg', open && 'bg-accent text-foreground')}
            onClick={() => open ? docEdit.hide() : openPanel()}>
            {open ? <PanelRightClose className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </div>
  );
}
