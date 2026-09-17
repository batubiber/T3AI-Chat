import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { toast } from "sonner";
import { 
  projectDbOperations, 
  localDbOperations,
  type LocalProject, 
  type LocalProjectFile,
  type LocalConversation 
} from "@/lib/localDb";
import { truncateByChars, TRUNCATE_LIMITS } from "@/lib/utils";
import { parseFile, isFileSupported, getFileTypeDescription } from "@/lib/fileParser";
import { deleteChunksByDocumentId } from "@/lib/vectorSearch";

export interface Project extends LocalProject {
  files: LocalProjectFile[];
  conversations: LocalConversation[];
}

interface ProjectContextType {
  projects: Project[];
  activeProjectId: string | null;
  activeProject: Project | null;
  isLoading: boolean;
  createProject: (name: string, description?: string) => Promise<Project>;
  updateProject: (id: string, updates: Partial<Omit<LocalProject, 'id' | 'createdAt'>>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  switchProject: (id: string | null) => void;
  addFileToProject: (projectId: string, file: File) => Promise<LocalProjectFile>;
  removeFileFromProject: (projectId: string, fileId: string) => Promise<void>;
  updateProjectInstructions: (id: string, instructions: string) => Promise<void>;
  updateProjectMemory: (id: string, memory: string) => Promise<void>;
  refreshProjects: () => Promise<void>;
  refreshProject: (id: string) => Promise<void>;
}

// Use globalThis to maintain stable context identity across HMR
const PROJECT_CONTEXT_KEY = Symbol.for("app.ProjectContext");

function getProjectContext(): React.Context<ProjectContextType | undefined> {
  if (!(globalThis as any)[PROJECT_CONTEXT_KEY]) {
    (globalThis as any)[PROJECT_CONTEXT_KEY] = createContext<ProjectContextType | undefined>(undefined);
  }
  return (globalThis as any)[PROJECT_CONTEXT_KEY];
}

const ProjectContext = getProjectContext();

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const activeProject = projects.find((p) => p.id === activeProjectId) || null;

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const projectData = await projectDbOperations.getAllProjects();
      
      // Create initial example project if no projects exist
      if (projectData.length === 0) {
        const exampleProject = await projectDbOperations.createProject(
          "Örnek Proje",
          "Bu, T3AI Chat'i keşfetmeniz için oluşturulmuş örnek bir projedir. Projeleri kullanarak konuşmalarınızı organize edebilir, dosya ekleyebilir ve özel talimatlar tanımlayabilirsiniz."
        );
        const project: Project = { ...exampleProject, files: [], conversations: [] };
        setProjects([project]);
        setIsLoading(false);
        return;
      }
      
      const projectsWithDetails: Project[] = await Promise.all(
        projectData.map(async (proj) => {
          const [files, conversations] = await Promise.all([
            projectDbOperations.getProjectFiles(proj.id),
            projectDbOperations.getProjectConversations(proj.id),
          ]);
          return { ...proj, files, conversations };
        })
      );

      setProjects(projectsWithDetails);
    } catch (error) {
      console.error("Error loading projects:", error);
      toast.error("Projeler yüklenirken hata oluştu");
    } finally {
      setIsLoading(false);
    }
  };

  const refreshProjects = async () => {
    await loadProjects();
  };

  const refreshProject = async (id: string) => {
    try {
      const proj = await projectDbOperations.getProject(id);
      if (!proj) return;

      const [files, conversations] = await Promise.all([
        projectDbOperations.getProjectFiles(id),
        projectDbOperations.getProjectConversations(id),
      ]);

      setProjects(prev => 
        prev.map(p => p.id === id ? { ...proj, files, conversations } : p)
      );
    } catch (error) {
      console.error("Error refreshing project:", error);
    }
  };

  const createProject = async (name: string, description?: string): Promise<Project> => {
    try {
      const newProj = await projectDbOperations.createProject(name, description);
      const project: Project = { ...newProj, files: [], conversations: [] };
      setProjects(prev => [project, ...prev]);
      toast.success("Proje oluşturuldu");
      return project;
    } catch (error) {
      console.error("Error creating project:", error);
      toast.error("Proje oluşturulurken hata oluştu");
      throw error;
    }
  };

  const updateProject = async (id: string, updates: Partial<Omit<LocalProject, 'id' | 'createdAt'>>) => {
    try {
      await projectDbOperations.updateProject(id, updates);
      setProjects(prev => 
        prev.map(p => p.id === id ? { ...p, ...updates, updatedAt: new Date() } : p)
      );
    } catch (error) {
      console.error("Error updating project:", error);
      toast.error("Proje güncellenirken hata oluştu");
      throw error;
    }
  };

  const deleteProject = async (id: string) => {
    try {
      // Silinen projenin tüm dosyalarına ait embedding'leri temizle
      const project = projects.find(p => p.id === id);
      if (project) {
        await Promise.all(project.files.map(f => deleteChunksByDocumentId(f.id)));
      }
      await projectDbOperations.deleteProject(id);
      setProjects(prev => prev.filter(p => p.id !== id));
      if (activeProjectId === id) {
        setActiveProjectId(null);
      }
      toast.success("Proje silindi");
    } catch (error) {
      console.error("Error deleting project:", error);
      toast.error("Proje silinirken hata oluştu");
      throw error;
    }
  };

  const switchProject = (id: string | null) => {
    setActiveProjectId(id);
  };

  const addFileToProject = async (projectId: string, file: File): Promise<LocalProjectFile> => {
    const toastId = `parse-${file.name}`;
    try {
      // Check if file type is supported
      if (!isFileSupported(file.name)) {
        const fileType = getFileTypeDescription(file.name);
        throw new Error(`Desteklenmeyen dosya formatı: ${fileType}`);
      }

      // Parse file content (handles both text and DOCX files)
      const parsed = await parseFile(file, (current, total) => {
        toast.loading(`${truncateByChars(file.name, TRUNCATE_LIMITS.FILE_NAME_TOAST)} işleniyor — sayfa ${current}/${total}`, { id: toastId });
      });
      toast.dismiss(toastId);
      if (parsed.metadata?.warnings?.length) {
        for (const w of parsed.metadata.warnings) toast.warning(w, { duration: 6000 });
      }
      const content = parsed.content;
      
      if (!content || content.trim().length === 0) {
        throw new Error('Dosya içeriği boş');
      }
      
      const projectFile = await projectDbOperations.addProjectFile(
        projectId, 
        file.name, 
        content, 
        file.type || 'text/plain',
        file.size
      );
      
      setProjects(prev => 
        prev.map(p => p.id === projectId 
          ? { ...p, files: [...p.files, projectFile], updatedAt: new Date() } 
          : p
        )
      );
      
      const fileTypeDesc = getFileTypeDescription(file.name);
      toast.success(`${truncateByChars(file.name, TRUNCATE_LIMITS.FILE_NAME_TOAST)} eklendi`, {
        description: `${fileTypeDesc} - ${parsed.metadata?.wordCount || 0} kelime`
      });
      return projectFile;
    } catch (error) {
      toast.dismiss(toastId);
      console.error("Error adding file:", error);
      toast.error("Dosya eklenirken hata oluştu", {
        description: error instanceof Error ? error.message : undefined
      });
      throw error;
    }
  };

  const removeFileFromProject = async (projectId: string, fileId: string) => {
    try {
      await deleteChunksByDocumentId(fileId);
      await projectDbOperations.deleteProjectFile(fileId, projectId);
      setProjects(prev => 
        prev.map(p => p.id === projectId 
          ? { ...p, files: p.files.filter(f => f.id !== fileId), updatedAt: new Date() } 
          : p
        )
      );
      toast.success("Dosya silindi");
    } catch (error) {
      console.error("Error removing file:", error);
      toast.error("Dosya silinirken hata oluştu");
      throw error;
    }
  };

  const updateProjectInstructions = async (id: string, instructions: string) => {
    await updateProject(id, { instructions });
  };

  const updateProjectMemory = async (id: string, memory: string) => {
    await updateProject(id, { memory });
  };

  return (
    <ProjectContext.Provider
      value={{
        projects,
        activeProjectId,
        activeProject,
        isLoading,
        createProject,
        updateProject,
        deleteProject,
        switchProject,
        addFileToProject,
        removeFileFromProject,
        updateProjectInstructions,
        updateProjectMemory,
        refreshProjects,
        refreshProject,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error("useProject must be used within a ProjectProvider");
  }
  return context;
}
