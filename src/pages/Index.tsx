import { useState, useEffect } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ChatSidebar } from "@/components/ChatSidebar";
import { ChatWorkspace } from "@/components/ChatWorkspace";
import { ChatProvider } from "@/contexts/ChatContext";
import { DocumentEditProvider } from "@/contexts/DocumentEditContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SplashScreen, useSplashScreen } from "@/components/SplashScreen";

const SIDEBAR_STORAGE_KEY = "t3ai-sidebar-open";

const Index = () => {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored !== null ? stored === "true" : true;
  });

  const { showSplash, handleComplete } = useSplashScreen();
  const [splashComplete, setSplashComplete] = useState(!showSplash);

  const onSplashComplete = () => {
    handleComplete();
    setSplashComplete(true);
  };

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarOpen));
  }, [sidebarOpen]);

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <ChatProvider>
        {/* DocumentEditProvider ChatProvider'ın İÇİNDE: seçili modeli oradan okuyor */}
        <DocumentEditProvider>
          {showSplash && <SplashScreen onComplete={onSplashComplete} />}
          <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <div className="flex h-svh w-full bg-background overflow-hidden p-3 gap-3">
              <ChatSidebar />
              <ChatWorkspace splashComplete={splashComplete} />
            </div>
          </SidebarProvider>
        </DocumentEditProvider>
      </ChatProvider>
    </ThemeProvider>
  );
};

export default Index;
