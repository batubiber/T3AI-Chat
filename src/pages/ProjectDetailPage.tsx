import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProject } from "@/contexts/ProjectContext";
import { ChatProvider } from "@/contexts/ChatContext";
import { DocumentEditProvider } from "@/contexts/DocumentEditContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ProjectWorkspace } from "@/components/ProjectWorkspace";
import { SidebarProvider } from "@/components/ui/sidebar";

const ProjectDetailPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { projects, switchProject, refreshProject, isLoading } = useProject();
  const project = projects.find((p) => p.id === projectId);

  useEffect(() => {
    if (projectId) {
      switchProject(projectId);
      refreshProject(projectId);
    }
    return () => {
      switchProject(null);
    };
  }, [projectId]);

  if (isLoading) {
    return (
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <div className="min-h-screen bg-background dark:bg-[#222222] flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Yükleniyor...</div>
        </div>
      </ThemeProvider>
    );
  }

  if (!project) {
    return (
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <div className="min-h-screen bg-background dark:bg-[#222222] flex flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">Proje bulunamadı</p>
          <Button onClick={() => navigate("/projects")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Projelere Dön
          </Button>
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <ChatProvider projectId={projectId} project={project}>
        {/* Sohbet girişi burada da render ediliyor; provider olmadan düzenleme
            hook'u ağacı çökertiyordu (siyah ekran). */}
        <DocumentEditProvider>
          <SidebarProvider defaultOpen={true}>
            <ProjectWorkspace key={project.id} project={project} />
          </SidebarProvider>
        </DocumentEditProvider>
      </ChatProvider>
    </ThemeProvider>
  );
};

export default ProjectDetailPage;
