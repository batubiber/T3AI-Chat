import { Plus, Settings, Moon, Sun, Check, Trash2, Pencil, Download, Upload, FolderOpen, GitBranch, ArrowUpRight, Folder, Star, Shield, LogOut, BarChart3, PanelLeftClose, ChevronDown, MessageSquare, MoreVertical, User, Loader2, Search } from "lucide-react";
import { truncateByChars, TRUNCATE_LIMITS } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, useSidebar, SidebarTrigger } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useChat } from "@/contexts/ChatContext";
import { useProject } from "@/contexts/ProjectContext";
import { useTheme } from "next-themes";
import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { sohbetleriSuz } from '@/lib/sohbetArama';
import { SohbetPaleti } from '@/components/SohbetPaleti';
import { useStaggerReveal } from "@/hooks/useAnimeTransition";
import { useShatterEffect } from "@/hooks/useAdvancedAnimations";
import { useNavigate } from "react-router-dom";
import logo from "@/assets/logo.png";
import { ConversationTree } from "./ConversationTree";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AdminLoginDialog } from "./AdminLoginDialog";
import { AdminUsageDashboard } from "./AdminUsageDashboard";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { usageLogOperations } from "@/lib/localDb";
import { toast } from "sonner";

function RecentProjects() {
  const { projects } = useProject();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(true);
  
  const recentProjects = [...projects]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 3);

  if (recentProjects.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex items-center justify-between mb-2">
        <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
          Projeler
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`} />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="space-y-1">
          {recentProjects.map((project) => (
            <button
              key={project.id}
              onClick={() => navigate(`/projects/${project.id}`)}
              className="w-full text-left text-xs font-medium text-foreground hover:text-primary transition-colors truncate py-1"
            >
              {project.name}
            </button>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ProjectsButton() {
  const navigate = useNavigate();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => navigate("/projects")}
      className="w-full justify-start gap-2 hover:bg-primary/10 hover:border-primary/50"
    >
      <FolderOpen className="h-4 w-4" />
      <span className="text-sm">Projeler</span>
    </Button>
  );
}


export function ChatSidebar() {
  const navigate = useNavigate();
  const {
    conversations,
    activeConversationId,
    goToNewChatScreen,
    switchConversation,
    clearAllConversations,
    deleteConversation,
    updateConversationTitle,
    exportActiveConversation,
    importData,
    toggleFavorite,
    akanSohbetler
  } = useChat();
  const {
    theme,
    setTheme
  } = useTheme();
  const { setOpenMobile, isMobile } = useSidebar();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Sohbet listesi filtresi. Süzme SAF fonksiyonda (sohbetArama.ts):
  // Türkçe İ/I ve şapkalı harf tuzakları orada testleniyor.
  const [aramaSorgusu, setAramaSorgusu] = useState('');
  const suzulmusSohbetler = useMemo(
    () => sohbetleriSuz(conversations, aramaSorgusu),
    [conversations, aramaSorgusu],
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const adminFileInputRef = useRef<HTMLInputElement>(null);
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const { isAdmin, isAdminEnabled, login, logout } = useAdminAuth();
  const conversationListRef = useStaggerReveal("[data-sidebar-item]", [conversations.length]);
  const shatter = useShatterEffect();

  const handleDeleteWithAnimation = useCallback((convId: string, element: HTMLElement | null) => {
    if (deletingIds.has(convId)) return;
    setDeletingIds(prev => new Set(prev).add(convId));

    if (element) {
      shatter(element, () => {
        deleteConversation(convId);
        setDeletingIds(prev => {
          const next = new Set(prev);
          next.delete(convId);
          return next;
        });
      });
    } else {
      deleteConversation(convId);
    }
  }, [deletingIds, shatter, deleteConversation]);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const startEditing = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditingTitle(currentTitle);
  };

  const saveEdit = async () => {
    if (editingId && editingTitle.trim()) {
      await updateConversationTitle(editingId, editingTitle.trim());
    }
    setEditingId(null);
    setEditingTitle("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingTitle("");
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await importData(file);
      e.target.value = "";
    }
  };

  const handleAdminExport = async () => {
    try {
      const data = await usageLogOperations.exportUsageLogs();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `t3ai-usage-logs-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Kullanım logları dışa aktarıldı");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Dışa aktarma başarısız");
    }
  };

  const handleAdminImportClick = () => {
    adminFileInputRef.current?.click();
  };

  const handleAdminFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const count = await usageLogOperations.importUsageLogs(data);
        toast.success(`${count} yeni log içe aktarıldı`);
      } catch (error) {
        console.error("Import error:", error);
        toast.error("İçe aktarma başarısız: Geçersiz dosya formatı");
      }
      e.target.value = "";
    }
  };

  /**
   * Tema geçişindeki dalga.
   *
   * ÖNCEKİ HÂLİ MAKİNEYİ KİLİTLİYORDU: dalga `width`/`height` animasyonuyla
   * 0'dan ekranın 2,5 katına (~5000 piksel) büyütülüyordu. Bu iki özellik
   * derleyiciye devredilemiyor; her karede yerleşim ve YENİDEN BOYAMA
   * gerekiyor, yani 5000x5000'lik bir radyal gradyan saniyede altmış kez
   * yeniden çiziliyordu. İki eleman birden, üstelik `transition: all` ile.
   *
   * Şimdi eleman SABİT boyutta ve yalnız `transform: scale()` ile büyüyor.
   * Gradyan bir kez küçük boyutta rasterleştiriliyor, büyütmeyi ekran kartı
   * yapıyor — yerleşim de boyama da yok.
   */
  const toggleTheme = (e: React.MouseEvent<HTMLButtonElement>) => {
    const yeniTema = theme === "dark" ? "light" : "dark";

    // Hareket duyarlılığı: dalga hiç çizilmiyor, tema anında dönüyor.
    const azHareket = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (azHareket || !toggleRef.current) {
      setTheme(yeniTema);
      return;
    }

    const x = e.clientX;
    const y = e.clientY;
    /** Taban çap. Büyütme transform ile yapıldığı için küçük tutuluyor:
     *  gradyan bu boyutta bir kez rasterleşiyor. */
    const TABAN = 240;
    const hedefCap = Math.max(window.innerWidth, window.innerHeight) * 2.5;
    const olcek = hedefCap / TABAN;

    const kap = document.createElement('div');
    kap.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;';

    const ortak = (cap: number) =>
      `position:absolute;left:${x}px;top:${y}px;width:${cap}px;height:${cap}px;` +
      `margin:${-cap / 2}px 0 0 ${-cap / 2}px;border-radius:50%;` +
      /* `will-change`: tarayıcıya "bunu ayrı katmana al" diyor, geçiş
         başlarken katman kurma gecikmesi yaşanmıyor. */
      'will-change:transform,opacity;';

    const dalga = document.createElement('div');
    dalga.style.cssText = ortak(TABAN) +
      `background:${theme === "dark"
        ? "radial-gradient(circle, rgba(255,180,100,0.25) 0%, rgba(255,120,50,0.15) 40%, transparent 70%)"
        : "radial-gradient(circle, rgba(180,30,30,0.25) 0%, rgba(127,29,29,0.15) 40%, transparent 70%)"};` +
      /* `all` DEĞİL: yalnız değişen iki özellik. `all` her animasyonlanabilir
         özelliği izler ve gereksiz iş çıkarır. */
      'transform:scale(0.02);opacity:1;' +
      'transition:transform .8s cubic-bezier(.25,.46,.45,.94),opacity .5s ease .3s;';

    const halka = document.createElement('div');
    halka.style.cssText = ortak(TABAN) +
      `border:2px solid ${theme === "dark" ? "rgba(255,150,50,0.4)" : "rgba(220,38,38,0.4)"};` +
      'transform:scale(0.02);opacity:1;' +
      'transition:transform .7s cubic-bezier(.25,.46,.45,.94),opacity .7s ease;';

    kap.appendChild(dalga);
    kap.appendChild(halka);
    document.body.appendChild(kap);

    requestAnimationFrame(() => {
      dalga.style.transform = `scale(${olcek})`;
      dalga.style.opacity = '0';
      halka.style.transform = `scale(${olcek * 0.6})`;
      halka.style.opacity = '0';
    });

    // Tema, dalga yayılırken dönüyor — geçiş dalganın altında kalıyor.
    setTimeout(() => setTheme(yeniTema), 150);
    setTimeout(() => kap.remove(), 1000);
  };

  const handleConversationClick = (id: string) => {
    switchConversation(id);
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return <Sidebar 
      className="border-none bg-transparent transition-all duration-300 ease-in-out" 
      collapsible="icon"
    >
      <SidebarHeader className="sidebar-motion p-0 safe-top">
        {/* Top icons row - visible in both states */}
        <div className="flex items-center justify-between px-3 pt-3 pb-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:pt-3">
          <SidebarTrigger 
            className="h-10 w-10 rounded-full bg-[#FAFAFA] border border-[#E6E6E6] dark:bg-sidebar-accent dark:border-transparent hover:bg-muted transition-all duration-300 shrink-0 text-[#333333] dark:text-foreground" 
            title="Sidebar Aç/Kapa"
          />
          <div className="flex items-center gap-1.5 group-data-[collapsible=icon]:hidden">
            
            <button
              ref={toggleRef}
              onClick={toggleTheme}
              className="h-10 w-10 rounded-full flex items-center justify-center bg-[#FAFAFA] border border-[#E6E6E6] dark:bg-sidebar-accent dark:border-transparent hover:bg-muted transition-all duration-300"
              title={theme === "dark" ? "Aydınlık Mod" : "Karanlık Mod"}
            >
              <Sun className={`h-5 w-5 absolute transition-all duration-500 ${
                theme === "dark" ? "opacity-0 rotate-90 scale-0" : "opacity-100 rotate-0 scale-100"
              } text-[#333333] dark:text-foreground`} />
              <Moon className={`h-5 w-5 absolute transition-all duration-500 ${
                theme === "dark" ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-0"
              } text-[#333333] dark:text-foreground`} />
            </button>
          </div>
        </div>

        {/* New Chat + ConvTree - expanded */}
        <div className="flex gap-2 px-3 pb-2 group-data-[collapsible=icon]:hidden">
          <Button 
            onClick={() => { goToNewChatScreen(); navigate("/"); if (isMobile) setOpenMobile(false); }}
            size="sm" 
            className="w-[170px] h-10 justify-start gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-[10px] text-xs font-medium shadow-none"
          >
            <Pencil className="h-4 w-4" />
            <span>Yeni Sohbet</span>
          </Button>
          <ConversationTree
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelectConversation={switchConversation}
          />
        </div>
        <div className="px-3 pb-3 group-data-[collapsible=icon]:hidden">
          <Button
            variant="outline"
            onClick={() => navigate("/projects")}
            className="w-full h-10 justify-start gap-2 rounded-[10px] bg-[#FAFAFA] border border-[#E6E6E6] dark:bg-sidebar-accent dark:border-transparent hover:bg-muted text-[#333333] dark:text-foreground text-xs font-medium"
          >
            <FolderOpen className="h-4 w-4" />
            <span>Projeler</span>
          </Button>
        </div>

        {/* Collapsed: icon-only buttons */}
        <div className="hidden group-data-[collapsible=icon]:flex flex-col items-center gap-2 px-2 pb-2">
          <Button 
            onClick={() => { goToNewChatScreen(); navigate("/"); if (isMobile) setOpenMobile(false); }}
            size="icon" 
            className="h-10 w-10 rounded-[10px] bg-primary hover:bg-primary/90 text-primary-foreground"
            title="Yeni Sohbet"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <button 
            onClick={() => navigate("/projects")}
            className="h-10 w-10 rounded-[10px] flex items-center justify-center border border-sidebar-border bg-sidebar-accent hover:bg-muted transition-colors"
            title="Projeler"
          >
            <FolderOpen className="h-4 w-4 text-foreground" />
          </button>
        </div>
      </SidebarHeader>

      {/* Spacer for collapsed mode to push footer to bottom */}
      <div className="hidden group-data-[collapsible=icon]:flex flex-1" />

      <SidebarContent className="sidebar-motion px-3 group-data-[collapsible=icon]:hidden relative">

        {/* Favorites Section */}
        {conversations.some(c => c.isFavorite) && (
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
              <span className="text-xs font-medium text-muted-foreground">Favoriler</span>
            </div>
            <SidebarMenu>
              {conversations
                .filter((conv) => conv.isFavorite)
                .map((conv) => (
                  <SidebarMenuItem key={conv.id} className="group/item">
                    <div className="relative">
                      <SidebarMenuButton 
                        isActive={conv.id === activeConversationId} 
                        onClick={() => handleConversationClick(conv.id)} 
                        className={`w-full justify-start gap-2 py-1 transition-all pr-2 group-hover/item:pr-[70px] group-focus-within/item:pr-[70px] rounded-md
                          ${conv.id === activeConversationId 
                            ? 'bg-[#F4F4F4] dark:bg-gradient-to-r dark:from-[rgba(196,23,24,0.4)] dark:to-[rgba(44,44,44,0.4)]' 
                            : 'hover:bg-muted/50'
                          }
                        `}
                      >
                        <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />
                        {conv.isGeneratingTitle ? (
                          <span className="inline-block w-24 h-3 bg-muted-foreground/20 rounded animate-pulse" />
                        ) : (
                          <span className="truncate text-xs font-medium text-foreground" title={conv.title}>{conv.title}</span>
                        )}
                        {/* Gösterge, başlık üretimi üçlü koşulunun DIŞINDA duruyor:
                            başlık üretilirken de yanıt akıyor olabilir. */}
                        {akanSohbetler.has(conv.id) && (
                          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" aria-label="Yanıt üretiliyor" />
                        )}
                      </SidebarMenuButton>
                      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 group-focus-within/item:opacity-100 transition-all duration-300">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(conv.id);
                          }} 
                          className="hover:scale-110 hover:text-amber-500 p-0.5 rounded hover:bg-amber-500/10"
                          title="Favorilerden çıkar"
                        >
                          <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            const item = (e.currentTarget as HTMLElement).closest(".group\\/item") as HTMLElement;
                            handleDeleteWithAnimation(conv.id, item);
                          }} 
                          className="hover:scale-110 hover:text-destructive p-0.5 rounded hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </div>
        )}

        <SohbetPaleti
          sohbetler={conversations}
          onSec={switchConversation}
          onYeniSohbet={goToNewChatScreen}
        />

        <Collapsible defaultOpen>
          <div className="flex items-center justify-between mb-2">
            <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
              Sohbetler
              <ChevronDown className="h-4 w-4 transition-transform duration-200 [[data-state=closed]>&]:rotate-[-90deg]" />
            </CollapsibleTrigger>
          </div>

        <CollapsibleContent>
        {conversations.length > 0 && (
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={aramaSorgusu}
              onChange={(e) => setAramaSorgusu(e.target.value)}
              placeholder="Sohbetlerde ara"
              aria-label="Sohbetlerde ara"
              className="w-full h-8 pl-7 pr-2 text-xs rounded-md bg-muted/50 border border-transparent
                         focus:border-border focus:bg-background outline-none placeholder:text-muted-foreground"
            />
          </div>
        )}
        <SidebarMenu ref={conversationListRef as unknown as React.RefObject<HTMLUListElement>} className="space-y-[12px]">
          {suzulmusSohbetler.length === 0 && aramaSorgusu.trim() && (
            <p className="px-2 py-3 text-xs text-muted-foreground">Sohbet bulunamadı.</p>
          )}
          {suzulmusSohbetler.map((conv, index) => <SidebarMenuItem key={conv.id} className="group/item" data-sidebar-item>
              <div className="relative">
                {editingId === conv.id ? (
                  <div className="flex items-center gap-1 px-2 py-1">
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={handleEditKeyDown}
                      onBlur={saveEdit}
                      className="flex-1 bg-background/50 border border-primary/50 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                ) : (
                  <>
                    <SidebarMenuButton 
                      isActive={conv.id === activeConversationId} 
                      onClick={() => handleConversationClick(conv.id)} 
                      className={`w-full justify-start py-1.5 pr-2 group-hover/item:pr-[80px] group-focus-within/item:pr-[80px] rounded-none transition-all -mx-3 px-3
                        ${conv.id === activeConversationId 
                          ? 'bg-[#F4F4F4] dark:bg-gradient-to-r dark:from-[rgba(196,23,24,0.4)] dark:to-[rgba(44,44,44,0.4)]' 
                          : 'hover:bg-muted/50'
                        }
                      `}
                    >
                      {conv.isGeneratingTitle ? (
                        <span className="inline-block w-24 h-3 bg-muted-foreground/20 rounded animate-pulse" />
                      ) : (
                        <span className="truncate text-xs font-medium text-foreground" title={conv.title}>{conv.title}</span>
                      )}
                      {akanSohbetler.has(conv.id) && (
                        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" aria-label="Yanıt üretiliyor" />
                      )}
                      {conv.forkedFromConversationId && (
                        <div className="flex items-center gap-0.5 shrink-0 ml-1">
                          <GitBranch className="h-3 w-3 text-amber-500" />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (conv.forkedFromConversationId) {
                                switchConversation(conv.forkedFromConversationId);
                              }
                            }}
                            className="p-0.5 rounded hover:bg-primary/20 transition-colors"
                            title="Orijinal sohbete git"
                          >
                            <ArrowUpRight className="h-2.5 w-2.5 text-muted-foreground hover:text-primary" />
                          </button>
                        </div>
                      )}
                    </SidebarMenuButton>
                      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 group-focus-within/item:opacity-100 transition-all duration-300">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(conv.id);
                        }} 
                        className="hover:scale-110 p-0.5 rounded hover:bg-primary/10 text-[#C41718] dark:text-white"
                        title={conv.isFavorite ? "Favorilerden çıkar" : "Favorilere ekle"}
                      >
                        <Star className={`h-3.5 w-3.5 ${conv.isFavorite ? 'fill-current' : ''}`} />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(conv.id, conv.title);
                        }} 
                        className="hover:scale-110 p-0.5 rounded hover:bg-primary/10 text-[#C41718] dark:text-white"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          const item = (e.currentTarget as HTMLElement).closest("[data-sidebar-item]") as HTMLElement;
                          handleDeleteWithAnimation(conv.id, item);
                        }} 
                        className="hover:scale-110 p-0.5 rounded hover:bg-primary/10 text-[#C41718] dark:text-white"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            </SidebarMenuItem>)}
        </SidebarMenu>
        </CollapsibleContent>
        </Collapsible>

        {/* Bottom gradient fade - Figma style */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-black/5 to-transparent" />
      </SidebarContent>

      <SidebarFooter className="sidebar-motion p-3 group-data-[collapsible=icon]:p-2">
        {/* Expanded footer */}
        <div className="group-data-[collapsible=icon]:hidden">
          <RecentProjects />
          <Separator className="my-3" />
          <div className="space-y-1.5">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />
            <input type="file" ref={adminFileInputRef} onChange={handleAdminFileChange} accept=".json" className="hidden" />
            <button 
              onClick={handleImportClick}
              className="w-full h-10 flex items-center gap-2 px-3 rounded-[10px] bg-[#FAFAFA] border border-[#E6E6E6] dark:bg-sidebar-accent dark:border-transparent hover:bg-muted transition-colors text-xs font-medium text-[#333333] dark:text-foreground"
            >
              <Download className="h-4 w-4" />
              <span>Sohbeti İçe Aktar</span>
            </button>
            <button 
              onClick={exportActiveConversation}
              className="w-full h-10 flex items-center gap-2 px-3 rounded-[10px] bg-[#FAFAFA] border border-[#E6E6E6] dark:bg-sidebar-accent dark:border-transparent hover:bg-muted transition-colors text-xs font-medium text-[#333333] dark:text-foreground"
            >
              <Upload className="h-4 w-4" />
              <span>Sohbeti Dışa Aktar</span>
            </button>

            <Separator className="my-2" />

            {isAdminEnabled && (
              <>
                {isAdmin ? (
                  <>
                    <button onClick={() => setDashboardOpen(true)} className="w-full h-10 flex items-center gap-2 px-3 rounded-[10px] bg-[#FAFAFA] border border-[#E6E6E6] dark:bg-sidebar-accent dark:border-transparent hover:bg-muted transition-colors text-xs font-medium text-[#333333] dark:text-foreground">
                      <BarChart3 className="h-4 w-4" />
                      <span>İstatistikler</span>
                    </button>
                    <button onClick={handleAdminExport} className="w-full h-10 flex items-center gap-2 px-3 rounded-[10px] bg-[#FAFAFA] border border-[#E6E6E6] dark:bg-sidebar-accent dark:border-transparent hover:bg-muted transition-colors text-xs font-medium text-[#333333] dark:text-foreground">
                      <Download className="h-4 w-4" />
                      <span>Logları Dışa Aktar</span>
                    </button>
                    <button onClick={handleAdminImportClick} className="w-full h-10 flex items-center gap-2 px-3 rounded-[10px] bg-[#FAFAFA] border border-[#E6E6E6] dark:bg-sidebar-accent dark:border-transparent hover:bg-muted transition-colors text-xs font-medium text-[#333333] dark:text-foreground">
                      <Upload className="h-4 w-4" />
                      <span>Logları İçe Aktar</span>
                    </button>
                    <button onClick={logout} className="w-full h-10 flex items-center gap-2 px-3 rounded-[10px] bg-[#FAFAFA] border border-[#E6E6E6] dark:bg-sidebar-accent dark:border-transparent hover:bg-destructive/10 transition-colors text-xs font-medium text-destructive">
                      <LogOut className="h-4 w-4" />
                      <span>Admin Çıkış</span>
                    </button>
                  </>
                ) : (
                  <button onClick={() => setAdminLoginOpen(true)} className="w-full h-10 flex items-center gap-2 px-3 rounded-[10px] bg-[#FAFAFA] border border-[#E6E6E6] dark:bg-sidebar-accent dark:border-transparent hover:bg-muted transition-colors text-xs font-medium text-[#333333] dark:text-foreground">
                    <Shield className="h-4 w-4" />
                    <span>Admin Giriş</span>
                  </button>
                )}
              </>
            )}

          </div>

          
          <div className="flex items-center gap-3 px-1 py-1">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary text-primary-foreground">
                <User className="h-5 w-5" />
              </AvatarFallback>
            </Avatar>
            <span className="text-xs font-medium text-foreground truncate flex-1">T3 AI</span>
            <button className="h-4 w-4 flex items-center justify-center rounded hover:bg-muted text-muted-foreground">
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Collapsed footer - icon only */}
        <div className="hidden group-data-[collapsible=icon]:flex flex-col items-center gap-2 px-2">
          <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />
          <input type="file" ref={adminFileInputRef} onChange={handleAdminFileChange} accept=".json" className="hidden" />
          <button onClick={handleImportClick} className="h-10 w-10 rounded-[10px] flex items-center justify-center border border-sidebar-border bg-sidebar-accent hover:bg-muted transition-colors" title="Sohbeti İçe Aktar">
            <Download className="h-4 w-4 text-foreground" />
          </button>
          <button onClick={exportActiveConversation} className="h-10 w-10 rounded-[10px] flex items-center justify-center border border-sidebar-border bg-sidebar-accent hover:bg-muted transition-colors" title="Sohbeti Dışa Aktar">
            <Upload className="h-4 w-4 text-foreground" />
          </button>
          <Separator className="w-full my-1" />
          <Avatar className="h-10 w-10 cursor-pointer">
            <AvatarFallback className="bg-primary text-primary-foreground">
              <User className="h-5 w-5" />
            </AvatarFallback>
          </Avatar>
        </div>

        <AdminLoginDialog open={adminLoginOpen} onOpenChange={setAdminLoginOpen} onLogin={login} />
        <AdminUsageDashboard open={dashboardOpen} onOpenChange={setDashboardOpen} />
      </SidebarFooter>
    </Sidebar>;
}
