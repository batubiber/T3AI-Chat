import { useState, useRef, useEffect } from "react";
import { FileText, Brain, Settings2, Upload, Trash2, File, RefreshCw, CheckCircle, AlertCircle, Loader2, Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useProject, type Project } from "@/contexts/ProjectContext";
import { cn, truncateByChars, TRUNCATE_LIMITS } from "@/lib/utils";
import { toast } from "sonner";
import { getAcceptedFileTypes, isFileSupported } from "@/lib/fileParser";
import { indexDocument, indexProjectFiles, getDocumentChunkCount, getRagStatus, type IndexingProgress } from "@/lib/ragService";
import { maddeleriCoz } from "@/lib/hafizaOnerisi";
const PHASE_LABELS: Record<string, string> = { chunking: 'parçalama', embedding: 'vektörleme', storing: 'kaydetme' };
interface ProjectRightPanelProps {
  project: Project;
}
type Tab = "memory" | "instructions" | "files";
interface FileStatus {
  isProcessing: boolean;
  chunkCount: number;
  error?: string;
}
export function ProjectRightPanel({
  project
}: ProjectRightPanelProps) {
  const {
    updateProjectMemory,
    updateProjectInstructions,
    addFileToProject,
    removeFileFromProject
  } = useProject();
  const [activeTab, setActiveTab] = useState<Tab>("memory");
  /* Bellek KİLİTLİ açılıyor ve kilitliyken doğrudan `project.memory` çiziliyor.
     Eskiden panel metni bir kez kendi durumuna kopyalıyordu; sohbetteki
     öneri kartı belleğe yazdığında bu kopya tazelenmediği için değişiklik
     ancak F5'ten sonra görünüyordu. Yerel kopya artık YALNIZ düzenleme
     açıkken var, yani bayat kalabileceği bir aralık kalmadı. */
  const [bellekKilitli, setBellekKilitli] = useState(true);
  const [bellekTaslagi, setBellekTaslagi] = useState("");
  /** 'ac' = kilidi açma uyarısı, 'vazgec' = kaydedilmemiş değişiklik uyarısı. */
  const [bellekUyarisi, setBellekUyarisi] = useState<null | "ac" | "vazgec">(null);
  const [instructions, setInstructions] = useState(project.instructions || "");
  const [isSaving, setIsSaving] = useState(false);
  const [ragAvailable, setRagAvailable] = useState<boolean | null>(null);
  const [ragModel, setRagModel] = useState<string | null>(null);
  const [fileStatuses, setFileStatuses] = useState<Record<string, FileStatus>>({});
  const [isIndexingAll, setIsIndexingAll] = useState(false);
  const [indexingProgress, setIndexingProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tabs: {
    id: Tab;
    label: string;
    icon: React.ReactNode;
    disabled?: boolean;
  }[] = [{
    id: "memory",
    label: "Bellek",
    icon: <Brain className="h-4 w-4" />
  }, {
    id: "instructions",
    label: "Talimatlar",
    icon: <Settings2 className="h-4 w-4" />
  }, {
    id: "files",
    label: "Dökümanlar",
    icon: <FileText className="h-4 w-4" />
  }];

  // Check RAG availability on mount
  useEffect(() => {
    checkRagStatus();
  }, []);

  // Load file chunk counts on mount and when files change
  useEffect(() => {
    loadFileStatuses();
  }, [project.files]);
  const checkRagStatus = async () => {
    try {
      const status = await getRagStatus();
      setRagAvailable(status.available);
      setRagModel(status.model || null);
    } catch {
      setRagAvailable(false);
    }
  };
  const loadFileStatuses = async () => {
    const statuses: Record<string, FileStatus> = {};
    for (const file of project.files) {
      try {
        const count = await getDocumentChunkCount(file.id);
        statuses[file.id] = {
          isProcessing: false,
          chunkCount: count
        };
      } catch {
        statuses[file.id] = {
          isProcessing: false,
          chunkCount: 0
        };
      }
    }
    setFileStatuses(statuses);
  };
  const handleSaveMemory = async () => {
    setIsSaving(true);
    try {
      await updateProjectMemory(project.id, bellekTaslagi);
      // Kaydetmek "düzenlemeyi bitirdim" demek; alan açık bırakılmıyor.
      setBellekKilitli(true);
    } finally {
      setIsSaving(false);
    }
  };

  const bellekKirli = bellekTaslagi !== (project.memory || "");

  /** Kilit düğmesi: kapalıyken uyarı sorar, açıkken (kirliyse) vazgeçmeyi sorar. */
  const kilidiCevir = () => {
    if (bellekKilitli) { setBellekUyarisi("ac"); return; }
    if (bellekKirli) { setBellekUyarisi("vazgec"); return; }
    setBellekKilitli(true);
  };
  const handleSaveInstructions = async () => {
    setIsSaving(true);
    try {
      await updateProjectInstructions(project.id, instructions);
    } finally {
      setIsSaving(false);
    }
  };
  const processFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (!isFileSupported(file.name)) {
        toast.error(`Desteklenmeyen dosya formatı: ${file.name}`);
        continue;
      }
      const addedFile = await addFileToProject(project.id, file);
      if (ragAvailable && addedFile) {
        await handleIndexFile(addedFile.id, addedFile.name, addedFile.content);
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    await processFiles(files);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await processFiles(files);
    }
  };
  const handleIndexFile = async (fileId: string, fileName: string, content: string) => {
    if (!ragAvailable) {
      toast.error("Embedding servisi kullanılamıyor");
      return;
    }
    setFileStatuses(prev => ({
      ...prev,
      [fileId]: {
        ...prev[fileId],
        isProcessing: true,
        error: undefined
      }
    }));
    const indexToastId = `index-${fileId}`;
    try {
      const result = await indexDocument(project.id, {
        id: fileId,
        projectId: project.id,
        name: fileName,
        content,
        mimeType: 'text/plain',
        size: content.length,
        createdAt: new Date()
      }, progress => {
        toast.loading(`${truncateByChars(fileName, TRUNCATE_LIMITS.FILE_NAME_TOAST)} indeksleniyor — ${PHASE_LABELS[progress.phase] ?? progress.phase} ${progress.current}/${progress.total}`, { id: indexToastId });
      });
      toast.dismiss(indexToastId);
      if (result.success) {
        setFileStatuses(prev => ({
          ...prev,
          [fileId]: {
            isProcessing: false,
            chunkCount: result.chunksCreated
          }
        }));
        toast.success(`${truncateByChars(fileName, TRUNCATE_LIMITS.FILE_NAME_TOAST)} indekslendi (${result.chunksCreated} chunk)`);
      } else {
        setFileStatuses(prev => ({
          ...prev,
          [fileId]: {
            isProcessing: false,
            chunkCount: 0,
            error: result.error
          }
        }));
        toast.error(`İndeksleme hatası: ${result.error}`);
      }
    } catch (error) {
      toast.dismiss(indexToastId);
      setFileStatuses(prev => ({
        ...prev,
        [fileId]: {
          isProcessing: false,
          chunkCount: 0,
          error: 'Beklenmeyen hata'
        }
      }));
      toast.error("İndeksleme başarısız");
    }
  };
  const handleIndexAllFiles = async () => {
    if (!ragAvailable || project.files.length === 0) return;
    setIsIndexingAll(true);
    setIndexingProgress({
      current: 0,
      total: project.files.length
    });
    try {
      const result = await indexProjectFiles(project.id, project.files.map(f => ({
        ...f,
        createdAt: new Date()
      })), (fileIndex, totalFiles, progress) => {
        setIndexingProgress({
          current: fileIndex + 1,
          total: totalFiles
        });
        setFileStatuses(prev => ({
          ...prev,
          [progress.fileId]: {
            ...prev[progress.fileId],
            isProcessing: true
          }
        }));
      });
      await loadFileStatuses();
      if (result.failed === 0) {
        toast.success(`Tüm dosyalar indekslendi (${result.successful} dosya)`);
      } else {
        toast.warning(`${result.successful} dosya indekslendi, ${result.failed} başarısız`);
      }
    } catch (error) {
      toast.error("Toplu indeksleme başarısız");
    } finally {
      setIsIndexingAll(false);
      setIndexingProgress(null);
    }
  };
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };
  const getFileStatusBadge = (fileId: string) => {
    const status = fileStatuses[fileId];
    if (!status) return null;
    if (status.isProcessing) {
      return <Badge variant="secondary" className="gap-1 shrink-0">
          <Loader2 className="h-3 w-3 animate-spin" />
          İşleniyor
        </Badge>;
    }
    if (status.error) {
      return <Badge variant="destructive" className="gap-1 shrink-0">
          <AlertCircle className="h-3 w-3" />
          Hata
        </Badge>;
    }
    if (status.chunkCount > 0) {
      return <Badge variant="default" className="gap-1 bg-primary shrink-0">
          <CheckCircle className="h-3 w-3" />
          {status.chunkCount} chunk
        </Badge>;
    }
    return <Badge variant="outline" className="text-muted-foreground shrink-0">
        İndekslenmedi
      </Badge>;
  };
  return <div className="h-full flex flex-col min-w-0 overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-border dark:border-[#474747] relative">
        {tabs.map(tab => <button key={tab.id} onClick={() => !tab.disabled && setActiveTab(tab.id)} disabled={tab.disabled} className={cn("flex-1 flex items-center justify-center gap-2 py-3 text-xs font-medium transition-colors mx-0 px-[11px] relative", activeTab === tab.id ? "text-primary dark:text-[#C41718]" : "text-muted-foreground dark:text-[#999999] hover:text-foreground", tab.disabled && "opacity-50 cursor-not-allowed hover:text-muted-foreground")}>
            {tab.icon}
            {tab.label}
            {activeTab === tab.id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary dark:bg-[#C41718]" />}
          </button>)}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 min-w-0">
        <div className="p-4 overflow-hidden">
          {activeTab === "memory" && <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="text-sm font-medium">Proje Belleği</h3>
                  {/* KİLİT, düzenlemeyi korur — EKLEMEYİ değil. Sohbetteki
                      öneri kartı sona tek satır ekliyor ve sen ona tek tek
                      onay veriyorsun. Düzenleme ise yazılmış bir şeyi
                      değiştirip siliyor, kimse görmüyor ve bu projedeki
                      bütün sohbetleri etkiliyor. Kilit tam olarak bu ikisini
                      ayırmak için var. */}
                  <Button variant="outline" size="sm" onClick={kilidiCevir} className="h-7 gap-1.5 px-2 text-xs">
                    {bellekKilitli ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
                    {bellekKilitli ? "Düzenle" : "Kilitle"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  AI'ın bu proje hakkında <strong>bilmesi gereken</strong> bilgileri yazın:
                  bağlam, gerçekler, terimler. Her sohbette bağlam olarak kullanılır.
                  Uzun belgeler için "Dökümanlar" sekmesini kullanın.
                </p>
              </div>

              {bellekKilitli ? (
                /* Kilitli görünüm doğrudan `project.memory`'yi okuyor —
                   arada bayatlayabilecek bir kopya yok. */
                maddeleriCoz(project.memory).length > 0 ? (
                  <ul className="space-y-1.5">
                    {maddeleriCoz(project.memory).map((madde, i) => (
                      <li key={i} className="flex gap-2.5 rounded-lg bg-muted px-3 py-2.5 text-[13px] leading-relaxed">
                        <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                        <span className="min-w-0 break-words">{madde}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-lg bg-muted px-3 py-6 text-center text-xs text-muted-foreground">
                    Bellek boş. Sohbette kalıcı bir bilgi geçtiğinde ekleme önerisi çıkar.
                  </p>
                )
              ) : (
                <>
                  <Textarea value={bellekTaslagi} onChange={e => setBellekTaslagi(e.target.value)} placeholder="Proje notları, bağlam, önemli bilgiler..." className="min-h-[200px] resize-none" />
                  <Button onClick={handleSaveMemory} disabled={isSaving || !bellekKirli} className="w-full">
                    {isSaving ? "Kaydediliyor..." : "Kaydet"}
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    Her satır ayrı bir madde. Satır başına bir bilgi yazın.
                  </p>
                </>
              )}
            </div>}

          {activeTab === "instructions" && <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-2">Sistem Talimatları</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  AI'ın bu projede her sohbette <strong>nasıl davranacağını</strong> belirleyin:
                  üslup, format ve kurallar. (Ne bileceği değil, nasıl yanıtlayacağı.)
                </p>
              </div>
              <Textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Bu projede Türkçe yanıt ver. Kod örneklerinde TypeScript kullan..." className="min-h-[200px] resize-none" />
              <Button onClick={handleSaveInstructions} disabled={isSaving || instructions === (project.instructions || "")} className="w-full">
                {isSaving ? "Kaydediliyor..." : "Kaydet"}
              </Button>
            </div>}

          {activeTab === "files" && <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-2">Proje Dökümanları</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Proje ile ilgili referans dosyalarını yükleyin. 
                  Dosyalar indekslenip RAG ile sohbetlerde kullanılacak.
                </p>
              </div>

              {/* RAG Status */}
              <div className={cn("p-3 rounded-lg text-sm overflow-hidden", ragAvailable ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                {ragAvailable === null ? <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    <span className="truncate">RAG durumu kontrol ediliyor...</span>
                  </div> : ragAvailable ? <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle className="h-4 w-4 shrink-0" />
                    <span className="truncate">RAG aktif {ragModel && `(${ragModel})`}</span>
                  </div> : <div className="flex items-center gap-2 min-w-0">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span className="truncate">Embedding servisi bağlı değil</span>
                  </div>}
              </div>

              {/* Upload Area */}
              <div
                /* Pencere seviyesindeki sohbet bırakma alanı burayı DIŞARIDA bırakıyor:
                   buraya bırakılan dosya sohbete değil PROJEYE gitmeli. */
                data-proje-birakma
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={cn(
                  "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all duration-200 relative",
                  isDragging
                    ? "border-primary bg-primary/10 scale-[1.02]"
                    : "border-border hover:border-primary/50"
                )}
              >
                <Upload className={cn("h-8 w-8 mx-auto mb-2 transition-colors", isDragging ? "text-primary" : "text-muted-foreground")} />
                <p className={cn("text-sm transition-colors", isDragging ? "text-primary font-medium" : "text-muted-foreground")}>
                  {isDragging ? "Dosyaları buraya bırakın" : "Dosya yüklemek için tıklayın veya sürükleyin"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  .txt, .md, .json, .csv, .docx, .pdf, .xlsx, .pptx dosyaları
                </p>
                <input ref={fileInputRef} type="file" multiple accept={getAcceptedFileTypes()} onChange={handleFileUpload} className="hidden" />
              </div>

              {/* Index All Button */}
              {project.files.length > 0 && ragAvailable && <Button onClick={handleIndexAllFiles} disabled={isIndexingAll} variant="outline" className="w-full">
                  {isIndexingAll ? <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      İndeksleniyor... ({indexingProgress?.current}/{indexingProgress?.total})
                    </> : <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Tüm Dosyaları İndeksle
                    </>}
                </Button>}

              {/* Indexing Progress */}
              {isIndexingAll && indexingProgress && <Progress value={indexingProgress.current / indexingProgress.total * 100} />}

              {/* File List */}
              {project.files.length > 0 && <div className="space-y-2 min-w-0">
                  {project.files.map(file => <div key={file.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg group min-w-0 overflow-hidden">
                      <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
                        <File className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <p className="text-sm font-medium truncate w-full" title={file.name}>{truncateByChars(file.name, TRUNCATE_LIMITS.FILE_NAME_LIST)}</p>
                          <div className="flex items-center gap-2 flex-wrap min-w-0 max-w-full">
                            <p className="text-xs text-muted-foreground">
                              {formatFileSize(file.size)}
                            </p>
                            {getFileStatusBadge(file.id)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {ragAvailable && <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleIndexFile(file.id, file.name, file.content)} disabled={fileStatuses[file.id]?.isProcessing} title="Yeniden indeksle">
                            <RefreshCw className={cn("h-4 w-4", fileStatuses[file.id]?.isProcessing && "animate-spin")} />
                          </Button>}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Dökümanı silmek istediğinize emin misiniz?</AlertDialogTitle>
                              <AlertDialogDescription>
                                "{truncateByChars(file.name, 40)}" dosyası kalıcı olarak silinecektir. Bu işlem geri alınamaz.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>İptal</AlertDialogCancel>
                              <AlertDialogAction onClick={() => removeFileFromProject(project.id, file.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Evet, Sil
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>)}
                </div>}

              {project.files.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">
                  Henüz dosya yüklenmedi
                </p>}
            </div>}
        </div>
      </ScrollArea>

      {/* Kilit uyarıları. Tek diyalog, iki hâl: kilidi açma ve kaydedilmemiş
          değişikliği atma. Kilidi açmak sessiz bir işlem olmamalı — buradaki
          bir satır bu projedeki HER sohbete gidiyor ve yanlış kalırsa hata
          vermiyor, model sessizce ona göre davranıyor. */}
      <AlertDialog open={bellekUyarisi !== null} onOpenChange={(acik) => { if (!acik) setBellekUyarisi(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bellekUyarisi === "ac" ? "Proje belleğini düzenlemek üzeresiniz" : "Kaydedilmemiş değişiklikler var"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bellekUyarisi === "ac"
                ? "Buradaki her madde, bu projedeki her sohbette modele gönderiliyor. Bir maddeyi değiştirmek ya da silmek modelin bundan sonraki bütün yanıtlarını etkiler. Yanlış kalan bir madde hata vermez, model sessizce ona göre davranır."
                : "Bellekte kaydetmediğiniz değişiklikler var. Kilitlerseniz bu değişiklikler atılır."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (bellekUyarisi === "ac") {
                  // Taslak KİLİT AÇILIRKEN dolduruluyor: o ana kadarki en
                  // güncel metin alınmış oluyor.
                  setBellekTaslagi(project.memory || "");
                  setBellekKilitli(false);
                } else {
                  setBellekKilitli(true);
                }
                setBellekUyarisi(null);
              }}
            >
              {bellekUyarisi === "ac" ? "Düzenlemeyi aç" : "Değişiklikleri at"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>;
}