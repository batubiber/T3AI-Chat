import React, { useState, useEffect, useCallback, useRef } from "react";
import { Quote } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TextSelectionPopupProps {
  onQuote: (text: string) => void;
  /** Seçili metin için hazır bir istek gönderir (alıntı + talimat). */
  onAction?: (text: string, instruction: string) => void;
  containerRef?: React.RefObject<HTMLElement>;
}

export function TextSelectionPopup({ onQuote, onAction, containerRef }: TextSelectionPopupProps) {
  const [selectedText, setSelectedText] = useState("");
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  const handleSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setIsVisible(false);
      return;
    }

    const text = selection.toString().trim();
    if (!text || text.length < 3) {
      setIsVisible(false);
      return;
    }

    // Find if selection is within any message element (user or assistant)
    const findMessageElement = (node: Node | null): HTMLElement | null => {
      if (!node) return null;
      
      // If it's a text node, get the parent element first
      let element: HTMLElement | null = null;
      if (node.nodeType === Node.TEXT_NODE) {
        element = node.parentElement;
      } else if (node instanceof HTMLElement) {
        element = node;
      }
      
      if (!element) return null;
      
      // Use closest to find the message container with data-role
      const messageContainer = element.closest('[data-role="user"], [data-role="assistant"]');
      if (messageContainer) return messageContainer as HTMLElement;
      
      return null;
    };

    // Get range for additional fallback nodes
    const range = selection.getRangeAt(0);
    
    // Try multiple nodes to find the message element (handles edge selections)
    const messageElement = 
      findMessageElement(selection.anchorNode) ||
      findMessageElement(selection.focusNode) ||
      findMessageElement(range.startContainer) ||
      findMessageElement(range.endContainer);
      
    if (!messageElement) {
      setIsVisible(false);
      return;
    }

    // Get selection position (reuse range from above)
    const rect = range.getBoundingClientRect();
    
    // Position popup above the selection
    const x = rect.left + rect.width / 2;
    const y = rect.top - 10;

    setSelectedText(text);
    setPosition({ x, y });
    setIsVisible(true);
  }, []);

  const handleQuoteClick = useCallback(() => {
    if (selectedText) {
      onQuote(selectedText);
      setIsVisible(false);
      // Clear selection
      window.getSelection()?.removeAllRanges();
    }
  }, [selectedText, onQuote]);

  useEffect(() => {
    const handleMouseUp = () => {
      // Small delay to ensure selection is complete
      setTimeout(handleSelection, 10);
    };

    const handleMouseDown = (e: MouseEvent) => {
      // Hide popup when clicking outside of it
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setIsVisible(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsVisible(false);
      }
    };

    const handleScroll = () => {
      setIsVisible(false);
    };

    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("scroll", handleScroll, true);

    // Touch support
    document.addEventListener("touchend", handleMouseUp);

    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("touchend", handleMouseUp);
    };
  }, [handleSelection]);

  if (!isVisible || !position) return null;

  // Calculate safe position (don't go off screen)
  const popupWidth = 140;
  const popupHeight = 40;
  let adjustedX = position.x - popupWidth / 2;
  let adjustedY = position.y - popupHeight;

  // Keep within viewport
  if (adjustedX < 10) adjustedX = 10;
  if (adjustedX + popupWidth > window.innerWidth - 10) {
    adjustedX = window.innerWidth - popupWidth - 10;
  }
  if (adjustedY < 10) {
    // Show below selection instead
    adjustedY = position.y + 30;
  }

  const eylemler: { etiket: string; talimat: string }[] = [
    { etiket: "Yeniden yaz", talimat: "Bu bölümü anlamını koruyarak daha akıcı ve düzgün Türkçeyle yeniden yaz." },
    { etiket: "Sadeleştir", talimat: "Bu bölümü teknik olmayan birinin anlayacağı şekilde sadeleştir." },
    { etiket: "Açıkla", talimat: "Bu bölümü açıkla; hangi bilgiye dayandığını ve ne anlama geldiğini anlat." },
  ];

  return (
    <div
      ref={popupRef}
      className="fixed z-[100] animate-in fade-in-0 zoom-in-95 duration-150"
      style={{
        left: adjustedX,
        top: adjustedY,
      }}
    >
      {/* Alıntı BİRİNCİL eylem olarak kaldı; yanına hazır talimatlar eklendi.
          Popup'ın işi seçili metni modele taşımak — "Modele Sor" kullanıcının
          kendi sorusunu yazmasını, diğerleri sık isteği tek tıkla geçmesini
          sağlıyor. */}
      <div className="flex items-center overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
        <Button
          onClick={handleQuoteClick}
          variant="ghost"
          className="h-auto gap-2 rounded-none px-3 py-2 text-popover-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <Quote className="h-4 w-4" />
          <span className="text-sm font-medium">Modele Sor</span>
        </Button>
        {onAction && (
          <>
            <span className="h-6 w-px shrink-0 bg-border" aria-hidden />
            {eylemler.map((e) => (
              <Button
                key={e.etiket}
                onClick={() => {
                  if (!selectedText) return;
                  onAction(selectedText, e.talimat);
                  setIsVisible(false);
                  window.getSelection()?.removeAllRanges();
                }}
                variant="ghost"
                className="h-auto rounded-none px-2.5 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                {e.etiket}
              </Button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
