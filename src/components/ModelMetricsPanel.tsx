import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Cpu, Clock, Layers, Zap, AlertCircle } from "lucide-react";
import { adminJetonu, adminJetonuSil } from "@/hooks/useAdminAuth";

interface ModelMetrics {
  online: boolean;
  name: string;
  error?: string;
  gpuCacheUsage: number;
  runningRequests: number;
  waitingRequests: number;
  promptTokensTotal: number;
  generationTokensTotal: number;
  avgTimeToFirstToken?: number;
  avgTokenLatency?: number;
}

interface MetricsResponse {
  timestamp: string;
  models: Record<string, ModelMetrics>;
}

interface ModelMetricsPanelProps {
  backendUrl?: string;
}

// Format token count to readable format (e.g., 1.2k, 15.3k, 1.5M)
const formatTokenCount = (count: number): string => {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}k`;
  }
  return count.toString();
};

// Format milliseconds to readable format
const formatLatency = (seconds: number): string => {
  if (seconds === 0) return "-";
  if (seconds < 0.001) return `${(seconds * 1000000).toFixed(0)}µs`;
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
  return `${seconds.toFixed(2)}s`;
};

export function ModelMetricsPanel({ backendUrl }: ModelMetricsPanelProps) {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  // Use relative URL by default (works with nginx proxy)
  const apiUrl = backendUrl || (import.meta.env.VITE_API_URL || "/api");

  const fetchMetrics = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${apiUrl}/model-metrics`, {
        headers: { Authorization: `Bearer ${adminJetonu()}` },
      });
      if (response.status === 401) {
        adminJetonuSil();
        throw new Error('Oturum süresi doldu, yeniden giriş yapın');
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setMetrics(data);
      setLastFetched(new Date());
    } catch (err) {
      console.error("Failed to fetch metrics:", err);
      setError(err instanceof Error ? err.message : "Metrikler alınamadı");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {lastFetched && (
            <span>
              Son güncelleme: {lastFetched.toLocaleTimeString("tr-TR")}
            </span>
          )}
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={fetchMetrics}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Yenile
        </Button>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {loading && !metrics && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}

      {/* Metrics Grid */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(metrics.models).map(([modelId, model]) => (
            <Card 
              key={modelId} 
              className={`transition-all ${
                model.online 
                  ? "border-green-500/30 bg-gradient-to-br from-green-500/5 to-transparent" 
                  : "border-destructive/30 bg-gradient-to-br from-destructive/5 to-transparent"
              }`}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="truncate">{model.name}</span>
                  <Badge 
                    variant={model.online ? "default" : "destructive"}
                    className={model.online ? "bg-green-500/20 text-green-500 border-green-500/30" : ""}
                  >
                    {model.online ? "Online" : "Offline"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {model.online ? (
                  <>
                    {/* GPU Cache Usage */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Cpu className="h-3 w-3" />
                          GPU Cache
                        </span>
                        <span className="font-medium">
                          {(model.gpuCacheUsage * 100).toFixed(1)}%
                        </span>
                      </div>
                      <Progress 
                        value={model.gpuCacheUsage * 100} 
                        className="h-2"
                      />
                    </div>

                    {/* Requests */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-muted/30 rounded-md p-2">
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Layers className="h-3 w-3" />
                          Running
                        </div>
                        <div className="text-lg font-semibold text-green-500">
                          {model.runningRequests}
                        </div>
                      </div>
                      <div className="bg-muted/30 rounded-md p-2">
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Waiting
                        </div>
                        <div className="text-lg font-semibold text-yellow-500">
                          {model.waitingRequests}
                        </div>
                      </div>
                    </div>

                    {/* Tokens */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-muted/30 rounded-md p-2">
                        <div className="text-xs text-muted-foreground">Prompt</div>
                        <div className="text-sm font-medium">
                          {formatTokenCount(model.promptTokensTotal)}
                        </div>
                      </div>
                      <div className="bg-muted/30 rounded-md p-2">
                        <div className="text-xs text-muted-foreground">Output</div>
                        <div className="text-sm font-medium">
                          {formatTokenCount(model.generationTokensTotal)}
                        </div>
                      </div>
                    </div>

                    {/* Latency */}
                    {(model.avgTimeToFirstToken || model.avgTokenLatency) && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Zap className="h-3 w-3" />
                          TTFT: {formatLatency(model.avgTimeToFirstToken || 0)}
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Zap className="h-3 w-3" />
                          TPS: {formatLatency(model.avgTokenLatency || 0)}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-center py-4 text-muted-foreground text-sm">
                    <AlertCircle className="h-4 w-4 mr-2" />
                    {model.error || "Bağlantı kurulamadı"}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && !metrics && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <Button variant="outline" onClick={fetchMetrics}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Metrikleri Yükle
          </Button>
        </div>
      )}
    </div>
  );
}