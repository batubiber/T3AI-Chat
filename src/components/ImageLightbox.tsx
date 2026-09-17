import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, Download } from "lucide-react";
import { useState, useEffect } from "react";

interface ImageLightboxProps {
  images: string[];
  initialIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImageLightbox({ images, initialIndex, open, onOpenChange }: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setCurrentIndex(initialIndex);
    setZoom(1);
  }, [initialIndex, open]);

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
    setZoom(1);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
    setZoom(1);
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.5, 3));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.5, 0.5));
  };

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = images[currentIndex];
    link.download = `image-${currentIndex + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") handlePrev();
    if (e.key === "ArrowRight") handleNext();
    if (e.key === "Escape") onOpenChange(false);
  };

  if (!images.length) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-[95vw] max-h-[95vh] w-auto h-auto p-0 bg-black/95 border-none overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4 z-50 h-10 w-10 rounded-full bg-black/50 hover:bg-black/70 text-white"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-5 w-5" />
        </Button>

        {/* Image counter */}
        {images.length > 1 && (
          <div className="absolute top-4 left-4 z-50 px-3 py-1.5 rounded-full bg-black/50 text-white text-sm">
            {currentIndex + 1} / {images.length}
          </div>
        )}

        {/* Toolbar */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-2 rounded-full bg-black/50">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-white hover:bg-white/20"
            onClick={handleZoomOut}
            disabled={zoom <= 0.5}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-white text-sm min-w-[3rem] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-white hover:bg-white/20"
            onClick={handleZoomIn}
            disabled={zoom >= 3}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-white/30 mx-1" />
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-white hover:bg-white/20"
            onClick={handleDownload}
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>

        {/* Navigation arrows */}
        {images.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 top-1/2 -translate-y-1/2 z-50 h-12 w-12 rounded-full bg-black/50 hover:bg-black/70 text-white"
              onClick={handlePrev}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-1/2 -translate-y-1/2 z-50 h-12 w-12 rounded-full bg-black/50 hover:bg-black/70 text-white"
              onClick={handleNext}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </>
        )}

        {/* Image container */}
        <div 
          className="w-full h-full min-h-[50vh] flex items-center justify-center p-12 overflow-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) onOpenChange(false);
          }}
        >
          <img
            src={images[currentIndex]}
            alt={`Resim ${currentIndex + 1}`}
            className="max-w-full max-h-[80vh] object-contain rounded-lg transition-transform duration-200"
            style={{ transform: `scale(${zoom})` }}
            draggable={false}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
