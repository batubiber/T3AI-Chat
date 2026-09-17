import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { SurumBekcisi } from "@/components/SurumBekcisi";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProjectProvider } from "@/contexts/ProjectContext";
import { cleanupOrphanedChunks, primeRagHealth } from "@/lib/ragService";
import { primeOcrHealth } from "@/lib/ocrService";
import { loadRuntimeConfig } from "@/lib/runtimeConfig";
import "@/dev/ragEval";
import Index from "./pages/Index";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const AppContent = () => {
  useEffect(() => {
    // Sunucu .env'inden runtime ayarları çek (sistem promptu vb.)
    loadRuntimeConfig();
    cleanupOrphanedChunks();
    // RAG health cache'ini erkenden ısıt → ilk mesaj (özellikle döküman yükleyince) RAG'siz kalmasın
    primeRagHealth();
    // OCR health cache'ini erkenden ısıt → ilk taranmış doküman yüklemesi OCR'sız kalmasın
    primeOcrHealth();
    // Sistem bilgi bankası kaldırıldı — eski sürüm anahtarını temizle
    localStorage.removeItem("system_knowledge_index_version");
  }, []);

  return (
    <>
      <Toaster />
      <Sonner />
      <SurumBekcisi />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ProjectProvider>
        <AppContent />
      </ProjectProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
