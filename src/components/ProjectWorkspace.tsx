import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, FileText, FolderOpen, FolderCog, MessageSquare, PanelLeft, PanelLeftClose, Settings } from 'lucide-react';
import { type Project } from '@/contexts/ProjectContext';
import { useDocumentEdit } from '@/contexts/documentEditStore';
import { ArtifactToggle } from '@/components/ArtifactToggle';
import { usePanelPresence } from '@/hooks/use-panel-presence';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { ChatArea } from '@/components/ChatArea';
import { DocumentEditPanel } from '@/components/DocumentEditPanel';
import { ProjectRightPanel } from '@/components/ProjectRightPanel';
import { ProjectConversationList } from '@/components/ProjectConversationList';
import { ProjectSettingsDialog } from '@/components/ProjectSettingsDialog';
import { ProjeDisaAktarDialog } from '@/components/ProjeDisaAktarDialog';
import { cn } from '@/lib/utils';

type View = 'chat' | 'document' | 'project';
const iconButton = 'workspace-icon-button canli-ikon canli-pop h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-muted dark:bg-[#3D3D3D] hover:bg-muted/80 dark:hover:bg-[#4A4A4A] shrink-0';

export function ProjectWorkspace({ project }: { project: Project }) {
  const navigate = useNavigate();
  const { isOpen: editOpen } = useDocumentEdit();
  const desktop = useMediaQuery('(min-width: 1024px)');
  const pinnedConversations = useMediaQuery('(min-width: 1280px)');
  const wide = useMediaQuery('(min-width: 1600px)');
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [view, setView] = useState<View>('chat');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [disaAktarOpen, setDisaAktarOpen] = useState(false);

  useEffect(() => {
    // Yeni açılan belge görünür olsun; proje sekmesine geçiş belgeyi kapatmaz.
    if (editOpen) setView('document');
    else setView((current) => current === 'document' ? 'chat' : current);
  }, [editOpen]);

  useEffect(() => {
    if (pinnedConversations) setDrawerOpen(false);
  }, [pinnedConversations]);

  const projectVisible = rightPanelOpen && (wide || view === 'project' || (desktop && !editOpen));
  const documentVisible = editOpen && (wide || (desktop ? !projectVisible : view === 'document'));
  const sideVisible = projectVisible || documentVisible;
  const leftVisible = pinnedConversations ? leftPanelOpen : drawerOpen;
  const documentMotion = usePanelPresence(documentVisible);
  const projectMotion = usePanelPresence(projectVisible);
  const chatMotion = usePanelPresence(desktop || !sideVisible);
  const sideMotion = usePanelPresence(sideVisible);
  const leftMotion = usePanelPresence(pinnedConversations && leftPanelOpen);
  const sideShown = sideMotion.props['data-visible'] === 'true';


  const selectView = (next: View) => {
    if (next === 'project') setRightPanelOpen(true);
    setView(next);
  };
  const toggleProject = () => {
    if (projectVisible) {
      setRightPanelOpen(false);
      setView(desktop && editOpen ? 'document' : 'chat');
    } else selectView('project');
  };
  const conversationSelected = () => { setDrawerOpen(false); setView('chat'); };

  const viewButtons = (mobile: boolean) => (
    <nav aria-label={mobile ? 'Çalışma alanı' : 'Sağ panel görünümü'} className="flex shrink-0 gap-1 rounded-xl bg-card p-1 dark:bg-[#2C2C2C]">
      {([
        ...(mobile ? [{ id: 'chat' as const, label: 'Sohbet', icon: MessageSquare }] : []),
        ...(editOpen ? [{ id: 'document' as const, label: 'Belge', icon: FileText }] : []),
        { id: 'project' as const, label: 'Proje', icon: FolderOpen },
      ]).map(({ id, label, icon: Icon }) => (
        <Button key={id} variant="ghost" size="sm" className={cn('workspace-icon-button min-w-0 flex-1 gap-2 rounded-lg',
          (id === 'project' ? projectVisible : id === 'document' ? documentVisible : !sideVisible) && 'bg-muted text-foreground')}
          aria-pressed={id === 'project' ? projectVisible : id === 'document' ? documentVisible : !sideVisible}
          aria-controls={`project-${id}-pane`} onClick={() => selectView(id)}>
          <Icon className="h-4 w-4 shrink-0" />{label}
        </Button>
      ))}
    </nav>
  );

  return (
    <div className="flex h-svh min-w-0 w-full flex-col gap-2 overflow-hidden bg-background p-2 dark:bg-[#222222] sm:gap-3 sm:p-3">
      <header data-workspace-toolbar className="flex shrink-0 flex-wrap items-center gap-2 rounded-[20px] bg-card p-2 dark:bg-[#2C2C2C] sm:h-16 sm:flex-nowrap sm:px-3">
        <div className="flex min-w-[140px] flex-1 items-center gap-2 overflow-hidden">
          <Button variant="ghost" size="icon" className={iconButton} title="Projelere Dön" aria-label="Projelere Dön" onClick={() => navigate('/projects')}><ArrowLeft className="h-5 w-5" /></Button>
          <Button variant="ghost" size="icon" className={iconButton} title={leftVisible ? 'Sohbetleri Gizle' : 'Sohbetleri Göster'} aria-label={leftVisible ? 'Sohbetleri Gizle' : 'Sohbetleri Göster'} aria-expanded={leftVisible}
            onClick={() => pinnedConversations ? setLeftPanelOpen(!leftPanelOpen) : setDrawerOpen(!drawerOpen)}>
            {leftVisible ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeft className="h-5 w-5" />}
          </Button>
          <div className="hidden h-10 w-px shrink-0 bg-border dark:bg-[#474747] sm:block" />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-medium text-foreground" title={project.name}>{project.name}</h1>
            {project.description && <p className="truncate text-[10px] text-muted-foreground" title={project.description}>{project.description}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <ArtifactToggle panelVisible={documentVisible} onShowPanel={() => selectView('document')} />
          <Button variant="ghost" size="icon" className={cn(iconButton, 'hidden sm:inline-flex')} title="Projeyi Dışa Aktar" aria-label="Projeyi Dışa Aktar" onClick={() => setDisaAktarOpen(true)}><Download className="h-5 w-5" /></Button>
          <Button variant="ghost" size="icon" className={iconButton} title="Proje Ayarları" aria-label="Proje Ayarları" onClick={() => setSettingsOpen(true)}><Settings className="h-5 w-5" /></Button>
          <Button variant="ghost" size="icon" className={iconButton} title={projectVisible ? 'Detayları Gizle' : 'Detayları Göster'} aria-label={projectVisible ? 'Detayları Gizle' : 'Detayları Göster'} aria-expanded={projectVisible} aria-controls="project-project-pane" onClick={toggleProject}>
            <FolderCog className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {!desktop && viewButtons(true)}
      <div className={cn('relative min-h-0 flex-1 overflow-hidden', desktop ? 'flex' : 'grid grid-cols-1 grid-rows-1')}>
        <aside aria-label="Proje sohbetleri" {...leftMotion.props}
          className="workspace-pane workspace-width shrink-0 overflow-hidden rounded-[20px] bg-card dark:bg-[#2C2C2C]"
          style={{ width: leftMotion.props['data-visible'] === 'true' ? 240 : 0, marginRight: leftMotion.props['data-visible'] === 'true' ? 12 : 0 }}>
          <div className="h-full w-60">{pinnedConversations && <ProjectConversationList project={project} onSelect={conversationSelected} />}</div>
        </aside>
        <main id="project-chat-pane" {...chatMotion.props} className="workspace-pane relative col-start-1 row-start-1 flex min-h-0 min-w-0 flex-1 flex-col">
          <ChatArea projectId={project.id} projectName={project.name} showArtifactActions={false} />
        </main>
        <div {...sideMotion.props} className={cn('workspace-pane workspace-width col-start-1 row-start-1 flex min-h-0 min-w-0 flex-col gap-2', desktop && 'shrink-0')}
          style={{ width: desktop ? (sideShown ? (wide ? (editOpen && rightPanelOpen ? 774 : editOpen ? 420 : 342) : 'min(38vw, 420px)') : 0) : undefined, marginLeft: desktop && sideShown ? 12 : 0 }}>
          {desktop && !wide && editOpen && viewButtons(false)}
          {/* Aynı DOM düğümleri: çapraz geçişte taslak ve kabul/red seçimleri korunur. */}
          <div className="grid min-h-0 flex-1 grid-rows-1" style={{ gridTemplateColumns: wide && documentVisible && projectVisible ? 'minmax(0, 1fr) 342px' : 'minmax(0, 1fr)', columnGap: wide && documentVisible && projectVisible ? 12 : 0 }}>
            <section id="project-document-pane" aria-label="Belge paneli" {...documentMotion.props} className="workspace-pane col-start-1 row-start-1 min-h-0 min-w-0">
              <DocumentEditPanel />
            </section>
            <aside id="project-project-pane" aria-label="Proje detayları" {...projectMotion.props}
              className="workspace-pane row-start-1 min-h-0 min-w-0 overflow-hidden rounded-[20px] bg-card dark:bg-[#2C2C2C]"
              style={{ gridColumnStart: wide && documentVisible && projectVisible ? 2 : 1 }}>
              <ProjectRightPanel project={project} />
            </aside>
          </div>
        </div>
      </div>

      <Sheet open={drawerOpen && !pinnedConversations} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-0 p-0" aria-describedby={undefined}>
          <SheetTitle className="shrink-0 p-4 pr-12 text-sm">Proje sohbetleri</SheetTitle>
          <div className="min-h-0 flex-1"><ProjectConversationList project={project} onSelect={conversationSelected} /></div>
          <Button variant="ghost" className="m-3 shrink-0 gap-2 sm:hidden" onClick={() => { setDrawerOpen(false); setDisaAktarOpen(true); }}><Download className="h-4 w-4" />Projeyi Dışa Aktar</Button>
        </SheetContent>
      </Sheet>
      <ProjeDisaAktarDialog projeId={project.id} projeAdi={project.name} acik={disaAktarOpen} onAcikDegisti={setDisaAktarOpen} />
      <ProjectSettingsDialog project={project} open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
