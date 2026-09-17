import { cn } from "@/lib/utils";
import { Palette } from "lucide-react";

interface ImageGeneratorLoadingProps {
  elapsedTime: number;
}

export function ImageGeneratorLoading({ elapsedTime }: ImageGeneratorLoadingProps) {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Soft gradient background */}
      <div className="absolute inset-0 overflow-hidden rounded-lg">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5" />
      </div>
      
      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center gap-5">
        {/* Minimal loading indicator */}
        <div className="relative flex items-center justify-center">
          {/* Single rotating ring */}
          <div className="absolute w-20 h-20 rounded-full border-2 border-primary/20 border-t-primary animate-spin" 
               style={{ animationDuration: '1.5s' }} 
          />
          
          {/* Static icon container */}
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Palette className="w-7 h-7 text-primary" />
          </div>
        </div>
        
        {/* Text content */}
        <div className="text-center space-y-2">
          <p className="text-base font-medium text-foreground">
            Görsel oluşturuluyor
          </p>
          
          {/* Timer */}
          <div className={cn(
            "inline-block px-3 py-1 rounded-full text-sm font-mono",
            "bg-muted/50"
          )}>
            {elapsedTime.toFixed(1)}s
          </div>
          
          {/* Status message */}
          <p className="text-xs text-muted-foreground">
            {elapsedTime < 20 
              ? "Yaratıcılık başlıyor..."
              : elapsedTime < 50 
                ? "Detaylar işleniyor..."
                : "Son rötuşlar yapılıyor..."
            }
          </p>
        </div>
      </div>
    </div>
  );
}
