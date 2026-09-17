import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Image, Download, Loader2, Timer, FileImage, RotateCcw, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useChat } from "@/contexts/ChatContext";
import { DEFAULT_MODEL_ID } from "@/lib/modelConfig";
import { ImageGeneratorLoading } from "./ImageGeneratorLoading";
interface ImageGeneratorProps {
  onImageGenerated?: (imageData: GeneratedImageResult) => void;
}

export interface GeneratedImageResult {
  b64_json: string;
  revised_prompt?: string;
  inference_time_s: number;
  file_size_bytes: number;
}

// Base64 string -> gerçek byte sayısı
const calculateFileSize = (base64: string): number => {
  let padding = 0;
  if (base64.endsWith("==")) padding = 2;
  else if (base64.endsWith("=")) padding = 1;
  return Math.floor((base64.length * 3) / 4) - padding;
};

// Formatlanmış gösterim
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

interface ImageGenerationParams {
  prompt: string;
  negative_prompt?: string;
  size: string;
  num_inference_steps: number;
  guidance_scale: number;
  seed?: number;
}

const SIZE_OPTIONS = [
  { value: "512x512", label: "512×512" },
  { value: "1024x1024", label: "1024×1024" },
  { value: "1536x1536", label: "1536×1536" },
];

export function ImageGenerator({ onImageGenerated }: ImageGeneratorProps) {
  const { setSelectedModel } = useChat();
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [size, setSize] = useState("1024x1024");
  const [inferenceSteps, setInferenceSteps] = useState(50);
  const [guidanceScale, setGuidanceScale] = useState(7.5);
  const [seed, setSeed] = useState<string>("");

  const [isModerating, setIsModerating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<GeneratedImageResult | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startTimer = () => {
    setElapsedTime(0);
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedTime((Date.now() - startTimeRef.current) / 1000);
    }, 100);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Lütfen bir prompt girin");
      return;
    }

    // Step 1: Guardrail - Prompt moderation
    setIsModerating(true);
    try {
      const moderationResponse = await fetch("/api/moderate-image-prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      if (moderationResponse.ok) {
        const moderationResult = await moderationResponse.json();
        if (!moderationResult.safe) {
          toast.error("Uygunsuz içerik tespit edildi", {
            description: moderationResult.reason || "Bu prompt ile görsel üretilemez.",
          });
          setIsModerating(false);
          return;
        }
      }
    } catch (error) {
      console.error("Moderation check failed:", error);
      // Fail open: if moderation check fails, continue with generation
    }
    setIsModerating(false);

    // Step 2: Image generation
    setIsGenerating(true);
    setGeneratedImage(null);
    startTimer();

    abortControllerRef.current = new AbortController();

    try {
      const params: ImageGenerationParams = {
        prompt: prompt.trim(),
        size,
        num_inference_steps: inferenceSteps,
        guidance_scale: guidanceScale,
      };

      if (negativePrompt.trim()) {
        params.negative_prompt = negativePrompt.trim();
      }

      if (seed.trim()) {
        const seedNum = parseInt(seed, 10);
        if (!isNaN(seedNum)) {
          params.seed = seedNum;
        }
      }

      const response = await fetch("/vllm-8003/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...params,
          n: 1,
          response_format: "b64_json",
        }),
        signal: abortControllerRef.current.signal,
      });

      // Check Content-Type before parsing
      const contentType = response.headers.get("content-type");

      if (!response.ok) {
        const errorText = await response.text();

        // Check if we got HTML instead of JSON (nginx 404, server error, etc.)
        if (errorText.trim().startsWith("<!") || errorText.includes("<html")) {
          throw new Error(
            `Görsel üretim servisi şu an erişilebilir değil (${response.status}). ` +
              `Lütfen servisin çalıştığından emin olun.`,
          );
        }

        throw new Error(`API hatası: ${response.status} - ${errorText}`);
      }

      // Verify we got JSON response
      if (!contentType?.includes("application/json")) {
        const textResponse = await response.text();
        console.error("Expected JSON but got:", contentType);
        console.error("Response preview:", textResponse.substring(0, 200));

        if (textResponse.trim().startsWith("<!") || textResponse.includes("<html")) {
          throw new Error("Görsel üretim servisi HTML yanıtı döndürdü. " + "Servis yapılandırmasını kontrol edin.");
        }
        throw new Error(`Beklenmeyen yanıt formatı: ${contentType}`);
      }

      const data = await response.json();

      if (data.data && data.data.length > 0) {
        const b64 = data.data[0].b64_json;
        const result: GeneratedImageResult = {
          b64_json: b64,
          revised_prompt: data.data[0].revised_prompt,
          inference_time_s: data.inference_time_s || elapsedTime,
          file_size_bytes: calculateFileSize(b64),
        };

        setGeneratedImage(result);
        onImageGenerated?.(result);
        toast.success("Görsel başarıyla oluşturuldu!");
      } else {
        throw new Error("API'den görsel alınamadı");
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        toast.info("Görsel üretimi iptal edildi");
      } else {
        console.error("Image generation error:", error);
        toast.error((error as Error).message || "Görsel oluşturulurken hata oluştu");
      }
    } finally {
      setIsGenerating(false);
      stopTimer();
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsGenerating(false);
    stopTimer();
  };

  const handleDownload = () => {
    if (!generatedImage) return;

    const link = document.createElement("a");
    link.href = `data:image/png;base64,${generatedImage.b64_json}`;
    link.download = `qwen-image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Görsel indirildi");
  };

  const handleBackToChat = () => {
    // Eğer görsel üretimi devam ediyorsa, iptal et
    if (isGenerating && abortControllerRef.current) {
      abortControllerRef.current.abort();
      stopTimer();
      setIsGenerating(false);
    }
    setSelectedModel(DEFAULT_MODEL_ID);
  };

  const handleReset = () => {
    setPrompt("");
    setNegativePrompt("");
    setSize("1024x1024");
    setInferenceSteps(50);
    setGuidanceScale(7.5);
    setSeed("");
    setGeneratedImage(null);
    setElapsedTime(0);
  };

  return (
    <div className="flex-1 overflow-auto p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={handleBackToChat} className="h-9 w-9" title="Sohbete Dön">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="p-2 rounded-lg bg-primary/10">
            <Image className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Qwen Image - Görsel Üretici</h2>
            <p className="text-sm text-muted-foreground">Metin açıklamasından görsel oluşturun</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Controls */}
          <div className="space-y-5">
            {/* Prompt */}
            <div className="space-y-2">
              <Label htmlFor="prompt">Prompt</Label>
              <Textarea
                id="prompt"
                placeholder="Oluşturmak istediğiniz görseli detaylıca açıklayın. En iyi sonuçlar için İngilizce prompt önerilir..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[100px] resize-none"
                disabled={isGenerating || isModerating}
              />
            </div>

            {/* Negative Prompt */}
            <div className="space-y-2">
              <Label htmlFor="negative-prompt">Negatif Prompt (Opsiyonel)</Label>
              <Textarea
                id="negative-prompt"
                placeholder="Görselde olmasını istemediğiniz özellikler..."
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                className="min-h-[60px] resize-none"
                disabled={isGenerating || isModerating}
              />
            </div>

            {/* Size */}
            <div className="space-y-2">
              <Label>Boyut</Label>
              <div className="flex gap-2">
                {SIZE_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    variant={size === option.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSize(option.value)}
                    disabled={isGenerating || isModerating}
                    className="flex-1"
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Inference Steps */}
            <div className="space-y-3">
              <div className="flex justify-between">
                <Label>Inference Steps</Label>
                <span className="text-sm text-muted-foreground font-mono">{inferenceSteps}</span>
              </div>
              <Slider
                value={[inferenceSteps]}
                onValueChange={([val]) => setInferenceSteps(val)}
                min={20}
                max={150}
                step={5}
                disabled={isGenerating || isModerating}
              />
              <p className="text-xs text-muted-foreground">Daha yüksek değer = daha kaliteli ama daha yavaş</p>
            </div>

            {/* Guidance Scale */}
            <div className="space-y-3">
              <div className="flex justify-between">
                <Label>Guidance Scale</Label>
                <span className="text-sm text-muted-foreground font-mono">{guidanceScale.toFixed(1)}</span>
              </div>
              <Slider
                value={[guidanceScale]}
                onValueChange={([val]) => setGuidanceScale(val)}
                min={1}
                max={20}
                step={0.5}
                disabled={isGenerating || isModerating}
              />
              <p className="text-xs text-muted-foreground">Prompt'a ne kadar sadık kalınacağını belirler</p>
            </div>

            {/* Seed */}
            <div className="space-y-2">
              <Label htmlFor="seed">Seed (Opsiyonel)</Label>
              <Input
                id="seed"
                type="number"
                placeholder="Rastgele"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                disabled={isGenerating || isModerating}
              />
              <p className="text-xs text-muted-foreground">Aynı seed = tekrarlanabilir sonuçlar</p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              {isModerating ? (
                <Button disabled className="flex-1">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Prompt kontrol ediliyor...
                </Button>
              ) : isGenerating ? (
                <Button onClick={handleStop} variant="destructive" className="flex-1">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Durdur ({elapsedTime.toFixed(1)}s)
                </Button>
              ) : (
                <Button
                  onClick={handleGenerate}
                  className="flex-1 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                  disabled={!prompt.trim()}
                >
                  Görsel Üret
                </Button>
              )}
              <Button
                onClick={handleReset}
                variant="outline"
                size="icon"
                disabled={isGenerating || isModerating}
                title="Sıfırla"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Right: Result */}
          <div className="space-y-4">
            <Card
              className={cn(
                "relative aspect-square overflow-hidden flex items-center justify-center",
                "bg-muted/30 border-dashed",
              )}
            >
              {isGenerating ? (
                <ImageGeneratorLoading elapsedTime={elapsedTime} />
              ) : generatedImage ? (
                <img
                  src={`data:image/png;base64,${generatedImage.b64_json}`}
                  alt="Generated image"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground p-4">
                  <Image className="h-16 w-16 opacity-30" />
                  <p className="text-sm text-center">Görsel burada görüntülenecek</p>
                </div>
              )}
            </Card>

            {/* Meta Info & Download */}
            {generatedImage && (
              <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Timer className="h-4 w-4" />
                    <span className="font-mono">{generatedImage.inference_time_s.toFixed(1)}s</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <FileImage className="h-4 w-4" />
                    <span className="font-mono">{formatFileSize(generatedImage.file_size_bytes)}</span>
                  </div>
                </div>
                <Button onClick={handleDownload} variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  İndir
                </Button>
              </div>
            )}

            {/* Revised Prompt */}
            {generatedImage?.revised_prompt && (
              <div className="p-3 rounded-lg bg-muted/30 text-sm">
                <p className="text-xs text-muted-foreground mb-1">İşlenen Prompt:</p>
                <p className="text-foreground/80">{generatedImage.revised_prompt}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
