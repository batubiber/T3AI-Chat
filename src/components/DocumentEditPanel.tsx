import { useMemo, useState, useEffect, useRef } from "react";
import { Check, X, Download, AlertTriangle, Loader2, FileEdit, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { diffWords } from "@/lib/wordDiff";
// DOCX'e özel değil: dosya adına göre DOCX/PPTX motoru seçilir.
// (Doğrudan docxEditor.applyEdits çağrılıyordu; PPTX'te "Geçerli bir Word
//  belgesi değil" diye patlıyor, önizleme ve indirme çalışmıyordu.)
import {
  applyDocumentEdits,
  renderDocumentPreview,
  unitLabel,
  detectEditableFormat,
  type EditableFormat,
  type AcceptedDocumentEdit,
  type DocumentEditRejection,
} from "@/lib/documentEditing";
import { LoadingState } from "./LoadingState";
import { TUR_ETIKETI } from "@/lib/belgeUretimKapisi";
import { useDocumentEdit } from "@/contexts/documentEditStore";

/**
 * Eski/yeni metni üst üste, DÜZELTİ İŞARETİ diliyle gösterir.
 *
 * Metin serif dizilir çünkü o metin BELGENİN kendisi — arayüz fontuyla
 * dizilince kullanıcının cümlesi arayüz öğesi gibi okunuyordu. Soldaki −/+
 * sütunu hangi satırın hangisi olduğunu renkten bağımsız söylüyor (renk körü
 * kullanıcı için tek ayırt edici renk olmasın).
 */
function DiffView({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => diffWords(before, after), [before, after]);

  const satir = (yon: "eski" | "yeni") => {
    const atla = yon === "eski" ? "added" : "removed";
    const vurgu = yon === "eski" ? "a-sil" : "a-ekle";
    return (
      <div className="a-diff-satir" data-yon={yon}>
        <span aria-hidden className="a-gutter">
          {yon === "eski" ? "\u2212" : "+"}
        </span>
        <p className="whitespace-pre-wrap break-words">
          {parts
            .filter((p) => p.op !== atla)
            .map((p, i) => (
              <span key={i} className={p.op === "same" ? "a-nots" : vurgu}>
                {p.text}
              </span>
            ))}
        </p>
      </div>
    );
  };

  return (
    <div className="a-diff space-y-0.5">
      {satir("eski")}
      {satir("yeni")}
    </div>
  );
}

/**
 * XLSX düzenlemelerinin IZGARA görünümü.
 *
 * Neden ayrı: hücre düzenlemesi tablo verisi. Düz metin diff'inde her hücre iki
 * satır tutuyor (eski/yeni) ve on hücrelik bir düzeltme yirmi satıra yayılıyor,
 * adresler hizasız kalıyor. Izgarada adres kolonu alt alta taranabiliyor.
 *
 * DOCX/PPTX bu görünümü KULLANMAZ: oradaki birim paragraf, uzunluğu tabloya
 * sığmıyor ve kelime bazlı vurgu (hangi kelime değişti) asıl bilgi.
 */
function DiffTable({
  edits,
  rejected,
  accepted,
  onToggle,
}: {
  edits: AcceptedDocumentEdit[];
  rejected: DocumentEditRejection[];
  accepted: boolean[];
  onToggle: (i: number) => void;
}) {
  return (
    <table className="a-diff-tablo">
      <thead>
        <tr>
          <th className="a-kol-onay" aria-label="Uygula" />
          <th className="a-kol-adres">Hücre</th>
          <th>Eski</th>
          <th>Yeni</th>
        </tr>
      </thead>
      <tbody>
        {edits.map((item, i) => (
          <tr key={`k${i}`} data-durum={accepted[i] ? "uygulanacak" : "cikarildi"}>
            <td className="a-kol-onay">
              <button
                type="button"
                aria-pressed={accepted[i]}
                className={cn(
                  "a-onay flex h-5 w-5 items-center justify-center rounded border",
                  accepted[i]
                    ? "border-transparent text-white"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
                style={accepted[i] ? { background: "hsl(var(--a-ekle))" } : undefined}
                onClick={() => onToggle(i)}
                title={accepted[i] ? "Uygulanıyor — çıkarmak için tıkla" : "Uygula"}
              >
                <Check className="h-3 w-3" />
              </button>
            </td>
            <td className="a-kol-adres">
              <span className="a-koordinat">
                {item.locationLabel ?? item.edit.paragraph}
              </span>
              {item.occurrences > 1 && (
                <span className="a-koordinat ml-1 opacity-70">{item.occurrences}×</span>
              )}
            </td>
            <td className="a-hucre-deger">
              <span className="a-sil">{item.before}</span>
            </td>
            <td className="a-hucre-deger">
              <span className="a-ekle">{item.after}</span>
            </td>
          </tr>
        ))}
        {rejected.map((r, i) => (
          <tr key={`r${i}`} data-durum="reddedildi">
            <td className="a-kol-onay">
              <AlertTriangle
                className="h-3 w-3"
                style={{ color: "hsl(var(--a-uyari))" }}
                aria-label="Uygulanamadı"
              />
            </td>
            <td className="a-kol-adres">
              <span className="a-koordinat">{r.locationLabel ?? r.edit.paragraph}</span>
            </td>
            <td colSpan={2} style={{ fontSize: "var(--a-label)" }}>
              {r.message}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * ÜRETİM bekleme ekranı — düzenlemeden ayrı, çünkü aşamalar farklı.
 *
 * Düzenlemede model akışla öneri gönderiyor ve ilerleme GERÇEK (gelen öneri
 * sayısı). Üretimde akış yok (`stream: false`), dolayısıyla elimizde yalnız
 * geçen süre var. Bu yüzden burada yüzde ya da çubuk YOK — uydurma ilerleme
 * göstermektense adımı dürüstçe yazıyoruz.
 */
function UretimWorkingState({
  talimat,
  tur,
}: {
  talimat: string;
  tur: 'docx' | 'xlsx' | 'pptx';
}) {
  const [elapsed, setElapsed] = useState(0);
  const startAt = useRef(Date.now());
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Aşamalar gerçek sırayı yansıtıyor: önce model içeriği yazıyor (uzun),
  // sonra dosya kuruluyor (saniyenin altında, o yüzden ayrı aşama değil).
  const asama = elapsed < 25 ? 'İçerik yazılıyor' : 'Model hâlâ yazıyor';

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">İstenen</p>
        <p className="text-sm">{talimat}</p>
      </div>
      <div className="space-y-2 rounded-lg border p-3">
        <LoadingState label={asama} variant="drive" startAt={startAt.current} />
        <p className="text-xs text-muted-foreground">
          {TUR_ETIKETI[tur]} hazırlanıyor
          {elapsed >= 25 ? ' · uzun belgelerde normal' : ''}
        </p>
      </div>
      <div className="space-y-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2 rounded-lg border border-dashed p-3 opacity-40">
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Bekleme ekranı. Model AKIŞLA yanıt veriyor, o yüzden gösterilen ilerleme
 * gerçek: gelen öneri sayısı. Uydurma yüzde yok.
 */
function WorkingState({
  instruction,
  paragraphCount,
  format,
  streamedCount,
}: {
  instruction: string;
  paragraphCount: number;
  format: EditableFormat | null;
  streamedCount: number;
}) {
  // Sayaç yalnız AŞAMA metnini seçmek için; görünen süreyi LoadingState tutuyor
  const [elapsed, setElapsed] = useState(0);
  const startAt = useRef(Date.now());
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const stage =
    streamedCount > 0
      ? `${streamedCount} değişiklik önerildi`
      : elapsed < 20
        ? "Belge okunuyor"
        : "Model düşünüyor";

  // Birim adı formata göre: Excel'de "paragraf" yazmak yanlıştı
  const unit = format ? unitLabel(format) : "birim";

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">İstenen</p>
        <p className="text-sm">{instruction}</p>
      </div>
      <div className="space-y-2 rounded-lg border p-3">
        <LoadingState
          label={stage}
          variant={streamedCount > 0 ? "dots" : "drive"}
          startAt={startAt.current}
        />
        <p className="text-xs text-muted-foreground">
          {paragraphCount > 0 ? `${paragraphCount} ${unit} inceleniyor` : "Belge hazırlanıyor"}
          {elapsed >= 20 && streamedCount === 0 ? " · uzun belgelerde normal" : ""}
        </p>
      </div>
      <div className="space-y-3" aria-hidden>
        {Array.from({ length: Math.max(1, 3 - streamedCount) }, (_, i) => i).map((i) => (
          <div key={i} className="space-y-2 rounded-lg border border-dashed p-3 opacity-40">
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DocumentEditPanel() {
  const {
    fileName, buffer, isLoading, hasRun, instruction, paragraphCount, format, streamedCount, stop,
    edits, rejected, restored, hide, uretim, sablonOzet,
  } = useDocumentEdit();
  // Varsayılan: hepsi kabul. Kullanıcı beğenmediğini tek tek çıkarır.
  const [accepted, setAccepted] = useState<boolean[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewError, setPreviewError] = useState("");

  useEffect(() => {
    setAccepted(edits.map(() => true));
  }, [edits]);

  const acceptedCount = accepted.filter(Boolean).length;
  const toggle = (i: number) => setAccepted((prev) => prev.map((v, k) => (k === i ? !v : v)));

  /** Kabul edilen düzenlemeleri uygulanmış BELGEYİ render eder. Seçim değişince
   *  yenilenir; kullanıcı ne indireceğini birebir görüyor. */
  useEffect(() => {
    // Kayıttan açıldı: önizleme hazır, yeniden üretmeye gerek yok
    if (restored) {
      setPreviewHtml(restored.previewHtml);
      setPreviewError("");
      return;
    }
    if (!buffer || !hasRun || isLoading) return;
    let cancelled = false;
    (async () => {
      try {
        const chosen = edits.filter((_, i) => accepted[i]);
        const { blob } = await applyDocumentEdits(buffer, fileName, chosen.map((a) => a.edit));
        const html = await renderDocumentPreview(
          await blob.arrayBuffer(),
          fileName,
          chosen.map((a) => ({ text: a.after, locationLabel: a.locationLabel })),
        );
        if (!cancelled) {
          setPreviewHtml(html);
          setPreviewError("");
        }
      } catch (err) {
        if (!cancelled) {
          setPreviewError(err instanceof Error ? err.message : "Önizleme oluşturulamadı");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [buffer, fileName, hasRun, isLoading, edits, accepted, restored]);

  const buildBlob = async () => {
    const chosen = edits.filter((_, i) => accepted[i]);
    return { chosen, ...(await applyDocumentEdits(buffer!, fileName, chosen.map((a) => a.edit))) };
  };

  const handleDownload = async () => {
    // Kayıttan açıldıysa saklı SONUÇ dosyası indirilir (orijinal yok)
    if (restored) {
      if (!restored.blob) {
        toast.error("Dosya saklanmamış", {
          description: "Tarayıcı deposuna sığmadığı için kaydedilemedi. Belgeyi yeniden ekleyip tekrar çalıştırın.",
        });
        return;
      }
      const url = URL.createObjectURL(restored.blob);
      const a = document.createElement("a");
      a.href = url;
      // Üretilen belge hiç "düzenlenmiş" değil — ad olduğu gibi kalır.
      a.download = restored.kaynak === 'uretim'
        ? fileName
        : fileName.replace(/\.(docx|pptx|xlsx)$/i, (m) => "-duzenlenmis" + m);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("İndirildi", { description: a.download });
      return;
    }
    if (!buffer) return;
    if (acceptedCount === 0) {
      toast.error("Hiç değişiklik seçilmedi");
      return;
    }
    setIsBuilding(true);
    try {
      const { chosen, blob, applied, failed } = await buildBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName.replace(/\.(docx|pptx|xlsx)$/i, (m) => "-duzenlenmis" + m);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (failed.length > 0) {
        toast.warning(`${applied.length}/${chosen.length} değişiklik uygulandı`, {
          description: `${failed.length} tanesi uygulanamadı — büyük ihtimalle önceki bir değişiklik aynı metni zaten değiştirdi.`,
          duration: 10000,
        });
      } else {
        toast.success(`${applied.length} değişiklik uygulandı`, { description: a.download });
      }
    } catch (err) {
      toast.error("Dosya oluşturulamadı", {
        description: err instanceof Error ? err.message : "Bilinmeyen hata",
      });
    } finally {
      setIsBuilding(false);
    }
  };

  const handleCopy = async () => {
    const text = new DOMParser().parseFromString(previewHtml, "text/html").body.textContent || "";
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Belge metni kopyalandı");
    } catch {
      toast.error("Kopyalanamadı");
    }
  };

  const showResults = hasRun && !isLoading;
  /* Okunabilir satır uzunluğu yalnız düz metin belgesinde anlamlı; tablo ve
     slayt önizlemesi tam genişliği kullanmalı. Kayıttan açılan artifact'te
     format state'te olmadığı için ad üzerinden çözülüyor. */
  /* Izgara YALNIZ tablo verisinde: hücre düzenlemesi kısa ve adreslenebilir.
     Paragraf düzenlemesi tabloya sığmaz ve orada asıl bilgi hangi KELİMENİN
     değiştiği. */
  const izgaraGorunumu = detectEditableFormat(fileName) === "xlsx";

  const onizlemeSinif = cn(
    "t3ai-docx-onizleme p-4",
    detectEditableFormat(fileName) === "docx" && "t3ai-metin-olcu",
  );

  return (
    <div className="t3ai-artifact flex h-full w-full flex-col overflow-hidden rounded-lg border bg-background">
      {/* Başlık: dosya adı birincil satır, sayaç ikincil. Uzantı ayrı bir
          damga olarak mono — adın sonundaki ".xlsx" gürültüsü yerine bilgi. */}
      <div data-artifact-header className="grid min-h-16 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b bg-muted/20 px-3 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <FileEdit className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-1.5">
              <p
                className="truncate font-medium leading-tight"
                style={{ fontSize: "var(--a-title)" }}
                title={fileName}
              >
                {fileName.replace(/\.(docx|pptx|xlsx)$/i, "")}
              </p>
              <span className="a-koordinat shrink-0 uppercase">
                {(fileName.split(".").pop() || "").toLowerCase()}
              </span>
            </div>
            {/* Kayıttan açıldıysa seçim yapılamaz: oran değil, saklı sayı yazılır.
                Önceden "0/0 değişiklik uygulanıyor" görünüyordu. */}
            {sablonOzet ? (
              <p
                className="leading-tight text-muted-foreground"
                style={{ fontSize: "var(--a-label)" }}
              >
                <span className="tabular-nums">{sablonOzet.dolu}</span> alan dolduruldu
                {sablonOzet.bos > 0 ? (
                  <> · <span className="tabular-nums">{sablonOzet.bos}</span> alan boş</>
                ) : null}
              </p>
            ) : restored?.kaynak === 'uretim' ? (
              <p
                className="leading-tight text-muted-foreground"
                style={{ fontSize: "var(--a-label)" }}
              >
                Bu belge sohbetten üretildi
              </p>
            ) : restored ? (
              <p
                className="leading-tight text-muted-foreground"
                style={{ fontSize: "var(--a-label)" }}
              >
                <span className="tabular-nums">{restored.editCount}</span> değişiklik uygulandı
              </p>
            ) : showResults && edits.length > 0 ? (
              <p
                className="leading-tight text-muted-foreground"
                style={{ fontSize: "var(--a-label)" }}
              >
                <span className="tabular-nums">{acceptedCount}</span>
                <span className="opacity-50">/{edits.length}</span> değişiklik uygulanacak
              </p>
            ) : null}
          </div>
        </div>
        <div data-artifact-actions className="flex shrink-0 items-center gap-1">
          {showResults && previewHtml && (
            <Button
              variant="ghost"
              size="icon"
              className="workspace-icon-button canli-ikon canli-pop h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={handleCopy}
              title="Belge metnini kopyala"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="workspace-icon-button canli-ikon canli-pop h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground"
            onClick={() => { hide(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-document-toggle]')?.focus()); }}
            title="Paneli kapat"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <ScrollArea className="flex-1">
          <div className="flex justify-end px-4 pt-3"><Button variant="outline" size="sm" onClick={stop}>Durdur</Button></div>
          {uretim ? (
            <UretimWorkingState talimat={uretim.talimat} tur={uretim.tur} />
          ) : (
            <WorkingState
              instruction={instruction}
              paragraphCount={paragraphCount}
              format={format}
              streamedCount={streamedCount}
            />
          )}
        </ScrollArea>
      ) : !hasRun ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          {/* Parıltı yerine işin kendisini anlatan simge: boş ekranın ortasındaki
              parıltı "yapay zekâ ürünü" klişesi, belge simgesi ise burada ne
              olacağını söylüyor. */}
          <FileEdit className="h-4 w-4 text-muted-foreground/60" />
          <p
            className="max-w-[26ch] leading-relaxed text-muted-foreground"
            style={{ fontSize: "var(--a-body)" }}
          >
            Sohbete belgede ne yapılmasını istediğinizi yazın. Düzenlenmiş belge burada görünecek.
          </p>
        </div>
      ) : restored ? (
        <ScrollArea className="flex-1">
          {previewHtml ? (
            <div className={onizlemeSinif} dangerouslySetInnerHTML={{ __html: previewHtml }} />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">
              {restored.kaynak === 'uretim'
                ? "Önizleme yok — dosyayı indirip açabilirsiniz."
                : "Önizleme yok."}
            </p>
          )}
        </ScrollArea>
      ) : edits.length === 0 && rejected.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center">
          <p
            className="max-w-[26ch] leading-relaxed text-muted-foreground"
            style={{ fontSize: "var(--a-body)" }}
          >
            Model bu belgede değiştirilecek bir şey bulmadı.
          </p>
        </div>
      ) : (
        <Tabs defaultValue="belge" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-3 mt-2.5 grid h-8 w-auto grid-cols-2 p-0.5">
            <TabsTrigger value="belge" className="h-7" style={{ fontSize: "var(--a-label)" }}>
              Belge
            </TabsTrigger>
            <TabsTrigger
              value="degisiklikler"
              className="h-7 gap-1.5"
              style={{ fontSize: "var(--a-label)" }}
            >
              Değişiklikler
              {edits.length > 0 && (
                <span className="tabular-nums opacity-55">{edits.length}</span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* BELGE — düzenlenmiş hâli render edilir, değişenler işaretlidir */}
          <TabsContent value="belge" className="mt-0 min-h-0 flex-1">
            <ScrollArea className="h-full">
              {previewError ? (
                <p className="p-4 text-sm text-muted-foreground">{previewError}</p>
              ) : previewHtml ? (
                <div className={onizlemeSinif} dangerouslySetInnerHTML={{ __html: previewHtml }} />
              ) : (
                <div className="flex items-center justify-center p-8">
                  <LoadingState label="Önizleme hazırlanıyor" variant="dots" />
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* DEĞİŞİKLİKLER — tek tek kabul/reddet */}
          <TabsContent value="degisiklikler" className="mt-0 min-h-0 flex-1">
            <ScrollArea className="h-full">
              <div className="space-y-2 p-3">
                {/* Tablo verisinde ızgara, düz metinde kart listesi */}
                {izgaraGorunumu ? (
                  <DiffTable
                    edits={edits}
                    rejected={rejected}
                    accepted={accepted}
                    onToggle={toggle}
                  />
                ) : null}
                {!izgaraGorunumu && edits.map((item, i) => (
                  <div
                    key={i}
                    className="a-kart"
                    data-durum={accepted[i] ? "uygulanacak" : "cikarildi"}
                  >
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="a-koordinat">
                          {item.locationLabel ?? `Paragraf ${item.edit.paragraph}`}
                        </span>
                        {item.occurrences > 1 && (
                          /* Amber DEĞİL: amber "uygulanamayan" demek. Kaç yerde
                             geçtiği bilgi, uyarı değil — nötr ama vurgulu. */
                          <span
                            className="a-koordinat rounded border border-border/70 bg-muted/50 px-1 py-px"
                            style={{ color: "hsl(var(--foreground) / 0.75)" }}
                            title={`Bu metin ${item.occurrences} yerde değişecek`}
                          >
                            {item.occurrences}×
                          </span>
                        )}
                        {item.edit.reason && (
                          <span
                            className="min-w-0 truncate text-muted-foreground"
                            style={{ fontSize: "var(--a-label)" }}
                          >
                            {item.edit.reason}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        aria-pressed={accepted[i]}
                        className={cn(
                          "a-onay flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
                          accepted[i]
                            ? "border-transparent text-white"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                        style={accepted[i] ? { background: "hsl(var(--a-ekle))" } : undefined}
                        onClick={() => toggle(i)}
                        title={accepted[i] ? "Uygulanıyor — çıkarmak için tıkla" : "Uygula"}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <DiffView before={item.before} after={item.after} />
                  </div>
                ))}

                {!izgaraGorunumu && rejected.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 pt-3 pb-0.5">
                      <AlertTriangle
                        className="h-3 w-3 shrink-0"
                        style={{ color: "hsl(var(--a-uyari))" }}
                      />
                      <span
                        className="font-medium uppercase tracking-wide text-muted-foreground"
                        style={{ fontSize: "var(--a-micro)", letterSpacing: "0.06em" }}
                      >
                        Uygulanamayan
                      </span>
                      <span className="a-koordinat">{rejected.length}</span>
                      <Separator className="ml-0.5 flex-1" />
                    </div>
                    {rejected.map((r, i) => (
                      <div key={i} className="a-kart" data-durum="reddedildi">
                        <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="a-koordinat">
                            {r.locationLabel ?? `Paragraf ${r.edit.paragraph}`}
                          </span>
                          <span
                            style={{ fontSize: "var(--a-label)", color: "hsl(var(--a-uyari))" }}
                          >
                            {r.message}
                          </span>
                        </div>
                        <p
                          className="a-diff line-clamp-2 break-words text-muted-foreground"
                          style={{ fontSize: "var(--a-body)" }}
                        >
                          {r.edit.find || "(birimin tamamı)"}
                        </p>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      )}

      {(restored || (showResults && edits.length > 0)) && (
        <div className="space-y-1.5 border-t bg-muted/10 p-3">
          <Button
            className="h-9 w-full gap-2"
            disabled={(!restored && acceptedCount === 0) || isBuilding}
            onClick={handleDownload}
          >
            {isBuilding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span style={{ fontSize: "var(--a-body)" }}>
              {isBuilding ? "Dosya hazırlanıyor" : "Düzenlenmiş dosyayı indir"}
            </span>
          </Button>
          {/* Ölü düğme bırakma: neden basılamadığını ya da ne inileceğini yaz */}
          <p
            className="truncate text-center text-muted-foreground"
            style={{ fontSize: "var(--a-micro)" }}
          >
            {!restored && acceptedCount === 0 ? (
              "Uygulanacak değişiklik seçilmedi"
            ) : (
              <span className="a-koordinat">
                {restored?.kaynak === 'uretim'
                  ? fileName
                  : fileName.replace(/\.(docx|pptx|xlsx)$/i, (m) => "-duzenlenmis" + m)}
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
