import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, FolderOpen, ArrowLeft, MoreHorizontal, Trash2, Edit, FileText, Upload, Loader2 } from "lucide-react";
import { truncateByChars, TRUNCATE_LIMITS } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProject, type Project } from "@/contexts/ProjectContext";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { toast } from "sonner";
import { localDbOperations } from "@/lib/localDb";
import { iceAktarmayaHazirla } from "@/lib/projeAktarma";
import { eslesiyorMu } from "@/lib/sohbetArama";
import { indexProjectFiles } from "@/lib/ragService";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const ProjectsPage = () => {
  const navigate = useNavigate();
  const { projects, deleteProject, isLoading, refreshProjects } = useProject();
  const dosyaGirdisiRef = useRef<HTMLInputElement>(null);
  const [iceAktariliyor, setIceAktariliyor] = useState(false);

  /**
   * İçe aktarma HER ZAMAN yeni proje üretir; var olan hiçbir kayda dokunmaz.
   * (Uygulamadaki eski `importData` tüm tabloları siliyor — bu ondan ayrı.)
   */
  const iceAktar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const dosya = e.target.files?.[0];
    e.target.value = "";                      // aynı dosya tekrar seçilebilsin
    if (!dosya) return;
    setIceAktariliyor(true);
    try {
      const hazir = iceAktarmayaHazirla(
        JSON.parse(await dosya.text()),
        () => crypto.randomUUID(),
      );
      await localDbOperations.projeyiIceAktar(hazir);
      await refreshProjects();
      toast.success(`"${hazir.proje.name}" içe aktarıldı.`);

      // İndeks yoksa dosyaları burada indeksle. Başarısız olursa proje YİNE DE
      // duruyor; kullanıcı proje panelindeki "tüm dosyaları indeksle" ile
      // sonra deneyebilir.
      if (hazir.parcalar.length === 0 && hazir.dosyalar.length > 0) {
        try {
          const sonuc = await indexProjectFiles(hazir.proje.id, hazir.dosyalar);
          if (sonuc.successful > 0) toast.success(`${sonuc.successful} dosya indekslendi.`);
          if (sonuc.failed > 0) toast.warning(`${sonuc.failed} dosya indekslenemedi.`);
        } catch {
          toast.warning("Proje geldi ama dosyalar indekslenemedi. Proje panelinden yeniden deneyebilirsin.");
        }
      }
    } catch (hata) {
      toast.error(hata instanceof Error ? hata.message : "Dosya okunamadı.");
    } finally {
      setIceAktariliyor(false);
    }
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  // Sohbet aramasıyla AYNI yüklem: düz .toLowerCase() Türkçe "İ" harfini
  // "i + birleşen nokta"ya çevirip eşleşmeyi sessizce bozuyordu.
  const filteredProjects = projects.filter(
    (p) => eslesiyorMu(p.name, searchQuery) || eslesiyorMu(p.description, searchQuery)
  );

  const handleProjectClick = (projectId: string) => {
    navigate(`/projects/${projectId}`);
  };

  const handleDeleteClick = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    setProjectToDelete(project);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (projectToDelete) {
      await deleteProject(projectToDelete.id);
      setProjectToDelete(null);
    }
    setDeleteDialogOpen(false);
  };

  return (
    <div className="min-h-screen bg-background dark:bg-[#222222]">
      {/* Header */}
      <header className="mx-3 mt-3 rounded-[20px] bg-card dark:bg-[#2C2C2C] shadow-[0_0_20px_5px_rgba(0,0,0,0.05)] dark:shadow-none px-3 py-3 flex items-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/")}
          className="h-10 w-10 rounded-full bg-muted dark:bg-[#3D3D3D] hover:bg-muted/80 dark:hover:bg-[#4A4A4A] shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="ml-6 text-base font-medium text-foreground dark:text-white">Projeler</h1>
      </header>

      {/* Content */}
      <main className="px-3 pt-4">
        {/* Search + New Project row */}
        <div className="flex items-center gap-3 mb-4 mx-[132px]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground dark:text-[#999999]" />
            <Input
              placeholder="Proje ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10 bg-[#F4F4F4] dark:bg-[#2C2C2C] border-transparent dark:border-transparent rounded-[10px] text-xs font-medium dark:text-white placeholder:text-[#999999]"
            />
          </div>
          <input
            ref={dosyaGirdisiRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={iceAktar}
          />
          <Button
            variant="outline"
            onClick={() => dosyaGirdisiRef.current?.click()}
            disabled={iceAktariliyor}
            className="h-10 px-4 rounded-[10px] text-xs font-medium shrink-0"
            title="Dışa aktarılmış bir projeyi içe aktar"
          >
            {iceAktariliyor
              ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              : <Upload className="h-4 w-4 mr-1.5" />}
            İçe Aktar
          </Button>
          <Button
            onClick={() => setIsNewProjectOpen(true)}
            className="h-10 px-4 bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 dark:bg-[#C41718] dark:hover:bg-[#A51415] rounded-[10px] text-xs font-medium shrink-0"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Yeni Proje
          </Button>
        </div>

        {/* Projects Grid */}
        <div className="mx-[132px]">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-[145px] bg-card dark:bg-[#2C2C2C] rounded-[10px] animate-pulse"
                />
              ))}
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-16">
              <FolderOpen className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
              <h2 className="text-lg font-medium text-foreground mb-2">
                {searchQuery ? "Proje bulunamadı" : "Henüz proje yok"}
              </h2>
              <p className="text-muted-foreground mb-6 text-sm">
                {searchQuery
                  ? "Farklı bir arama terimi deneyin"
                  : "İlk projenizi oluşturarak başlayın"}
              </p>
              {!searchQuery && (
                <Button onClick={() => setIsNewProjectOpen(true)} className="dark:bg-[#C41718] dark:hover:bg-[#A51415] rounded-[10px]">
                  <Plus className="h-4 w-4 mr-2" />
                  Proje Oluştur
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredProjects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => handleProjectClick(project.id)}
                  className="group relative bg-white dark:bg-[#2C2C2C] rounded-[10px] p-3 cursor-pointer transition-all duration-200 hover:ring-1 hover:ring-primary/30 h-[145px] flex flex-col shadow-[0_0_20px_5px_rgba(0,0,0,0.05)] dark:shadow-none"
                >
                  {/* Top row: icon */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-[10px] bg-primary/10 dark:bg-[#4A2828] flex items-center justify-center shrink-0">
                      <FileText className="h-5 w-5 text-primary dark:text-[#C41718]" />
                    </div>
                  </div>

                  {/* Title */}
                  <h3
                    className="text-xs font-medium text-foreground dark:text-white truncate mb-1"
                    title={project.name}
                  >
                    {truncateByChars(project.name, TRUNCATE_LIMITS.PROJECT_NAME_CARD)}
                  </h3>

                  {/* Description */}
                  {project.description && (
                    <p className="text-xs font-normal text-muted-foreground dark:text-[#999999] line-clamp-1 mb-auto">
                      {project.description}
                    </p>
                  )}
                  {/* Stats + Date bottom row */}
                  <div className="flex items-center justify-between mt-auto">
                    <div className="flex items-center gap-0 text-[10px] text-muted-foreground dark:text-[#999999]">
                      <span>{project.conversations.length} sohbet</span>
                      <span className="mx-1.5 w-px h-[15px] bg-border dark:bg-[#474747]" />
                      <span>{project.files.length} dosya</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground dark:text-[#999999]">
                      {formatDistanceToNow(new Date(project.updatedAt), {
                        addSuffix: true,
                        locale: tr,
                      })}
                    </span>
                  </div>

                  {/* Hover dropdown */}
                  <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-full bg-card dark:bg-[#333333] shadow-sm"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleProjectClick(project.id);
                        }}>
                          <Edit className="h-4 w-4 mr-2" />
                          Düzenle
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => handleDeleteClick(e, project)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Sil
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <NewProjectDialog
        open={isNewProjectOpen}
        onOpenChange={setIsNewProjectOpen}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Projeyi sil?</AlertDialogTitle>
            <AlertDialogDescription>
              "{truncateByChars(projectToDelete?.name, TRUNCATE_LIMITS.PROJECT_NAME_DIALOG)}" projesi ve içindeki tüm sohbetler ve
              dosyalar kalıcı olarak silinecek. Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProjectsPage;
