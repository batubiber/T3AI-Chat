import React, { useState, useRef, useEffect, ChangeEvent } from "react";
import { Send, Square, Plus, X, Quote, ArrowUp, FileText, FileCode, FileSpreadsheet, FolderGit2, Presentation, Loader2 } from "lucide-react";
import { SeviyeSecici } from "@/components/SeviyeSecici";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useChat } from "@/contexts/ChatContext";
import { modelSupportsVision } from "@/lib/modelConfig";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { parseFile, isFileSupported, isPdfFile, isXlsxFile, isPptxFile, isCodeFile, getFileTypeDescription, getAcceptedFileTypes } from "@/lib/fileParser";
import { useDocumentEditOptional } from "@/contexts/documentEditStore";
import { genisModaGec, metinKutuYuksekligi, gonderilebilirMi } from "@/lib/girdiDuzeni";
import { cn } from "@/lib/utils";
import { duzenlemeHedefiCoz } from "@/lib/belgeDuzenlemeAraci";
import { cipeDonsunMu, mesajiBirlestir } from "@/lib/yapistirmaCipi";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { detectEditableFormat, formatLabel, ATTACHMENT_MARKER } from "@/lib/documentEditing";
import { artifactOperations } from "@/lib/localDb";
import { zipDepoOku } from "@/lib/repoZip";
import { atlamaOzeti } from "@/lib/repoIngest";
import { useSidebar } from "@/components/ui/sidebar";
import { useRipple, useLaunchEffect } from "@/hooks/useAnimeTransition";


const MAX_IMAGE_SIZE = 50 * 1024 * 1024; // 50MB
// Doküman dosyası AĞA ÇIKMAZ — tarayıcıda parse edilip yalnız çıkarılan metin
// gönderilir. Bu yüzden sınır nginx/backend değil, sadece tarayıcı belleğini
// korumak için. 20MB PDF/DOCX'e göre konmuştu; görsel ağırlıklı sunumlar rahat
// aşıyor (proje panelinde zaten hiç sınır yok).
const MAX_DOC_SIZE = 500 * 1024 * 1024; // 500MB for documents
const MAX_DOCS_PER_MESSAGE = 5;

interface PendingDocument {
  id: string;
  name: string;
  size: number;
  kind: "pdf" | "xlsx" | "pptx" | "code" | "repo" | "text";
  /** Depo (zip) ise indekslenecek dosyalar */
  repoFiles?: { name: string; content: string }[];
  /** Ham dosya — düzenleme özelliği orijinal baytlara ihtiyaç duyar
   *  (parse edilmiş metinden .docx geri üretilemez) */
  file: File;
  content: string;
  status: "parsing" | "ready" | "indexing" | "indexed" | "error";
  error?: string;
  /** 0-100 progress for parsing/indexing phases */
  progress?: number;
  /** Sub-phase label for indexing */
  phaseLabel?: string;
}

export function ChatInput() {
  const { state: sidebarState } = useSidebar();
  const [message, setMessage] = useState("");
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<PendingDocument[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);
  const { sendMessage, isStreaming, isSummarizing, stopGeneration, selectedModel, quotedText, setQuotedText, activeConversation, attachConversationDocuments } = useChat();
  const hasMessages = (activeConversation?.messages?.length ?? 0) > 0;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const ripple = useRipple();
  const launchEffect = useLaunchEffect();

  const supportsVision = modelSupportsVision(selectedModel);
  // Provider yoksa null — düzenleme özelliği kapalı kalır, sayfa çökmez
  const docEdit = useDocumentEditOptional();

  /* Uzun yapıştırmalar yazı alanına girmiyor, çipe alınıyor. Modele giden
     metin değişmiyor; gönderirken içerik mesajın başına konuyor. */
  const [yapistirilanlar, setYapistirilanlar] = useState<{ id: string; metin: string }[]>([]);
  const [acikYapistirma, setAcikYapistirma] = useState<string | null>(null);

  /* Gönder düğmesi ile gönderim mantığı AYNI ifadeyi kullanıyor; ayrı
     yazıldıklarında ayrışıp "düğme etkin ama hiçbir şey olmuyor" hatasını
     üretiyorlar (bkz. girdiDuzeni.gonderilebilirMi). */
  const gonderilecekVarMi = gonderilebilirMi({
    metin: message,
    yapistirmaSayisi: yapistirilanlar.length,
    belgeSayisi: selectedDocuments.length,
    resimSayisi: selectedImages.length,
  });

  const yapistirmayiYakala = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const metin = e.clipboardData.getData('text');
    if (!cipeDonsunMu(metin)) return;
    e.preventDefault();
    setYapistirilanlar((o) => [...o, { id: `${Date.now()}-${o.length}`, metin }]);
  };

  /* KOMPAKT / GENİŞ düzen.
     Kompakt: [+] metin [model][efor][gönder] — hepsi tek satırda.
     Geniş:   metin tüm genişliği alır, düğmeler altına iner.

     Karar KARAKTER SAYISIYLA değil ÖLÇÜMLE veriliyor: "iiii" ile "WWWW" aynı
     sayıda karakter ama farklı genişlikte, üstelik kutu genişliği ekrana göre
     değişiyor. Metnin genişliği görünmez bir kopya öğede ölçülüyor. */
  const [genis, setGenis] = useState(false);
  /**
   * Kompakt düzenin metne AYRILMAYAN yatay payı: kapsayıcı dolgusu + düğme
   * arası boşluk + metin alanının kendi dolgusu.
   *
   * SABİT YAZILMIYOR, kompakt moddayken DOM'dan okunup saklanıyor. Geniş
   * moddayken okumak yanlış değer verir (dolgu ve boşluk o düzende farklı) —
   * düğme genişliğinde aynı tuzağa bir kez düşülmüştü.
   *
   * Hesaba katılmadığında metin, biz geniş moda geçmeden ~3 karakter önce
   * sarıyordu.
   */
  const kompaktPayRef = useRef<number | null>(null);
  const kutuRef = useRef<HTMLDivElement>(null);
  const solDugmelerRef = useRef<HTMLDivElement>(null);
  const sagDugmelerRef = useRef<HTMLDivElement>(null);
  const olcerRef = useRef<HTMLSpanElement>(null);

  // Kompakt moddayken gerçek payı ölç ve sakla.
  useEffect(() => {
    if (genis) return;
    const kutu = kutuRef.current;
    const ta = textareaRef.current;
    if (!kutu || !ta) return;
    const kb = getComputedStyle(kutu);
    const tb = getComputedStyle(ta);
    kompaktPayRef.current =
      Number.parseFloat(kb.paddingLeft) + Number.parseFloat(kb.paddingRight) +
      (Number.parseFloat(kb.columnGap) || 0) +
      Number.parseFloat(tb.paddingLeft) + Number.parseFloat(tb.paddingRight);
  }, [genis]);

  useEffect(() => {
    const olcer = olcerRef.current;
    const kutu = kutuRef.current;
    if (!olcer || !kutu) return;
    setGenis(genisModaGec({
      metin: message,
      metinPx: olcer.scrollWidth,
      kutuPx: kutu.clientWidth,
      /* İKİ GRUP AYRI ÖLÇÜLÜYOR, dış kapsayıcı DEĞİL. Geniş moddayken dış
         kapsayıcı `justify-between` ile tüm genişliği kaplıyor; onu ölçünce
         "düğmeler her yeri doldurmuş" çıkıyor ve kompakt moda bir daha
         dönülemiyordu — ölçülerek yakalandı. Grupların kendi genişlikleri ise
         iki düzende de aynı. */
      dugmelerPx:
        (solDugmelerRef.current?.scrollWidth ?? 0) +
        (sagDugmelerRef.current?.scrollWidth ?? 0),
      metinPayiPx: kompaktPayRef.current ?? 36,
    }));
  }, [message]);

  /* Metin alanı BEŞ SATIRA kadar büyüyor, sonra kaydırılıyor.
     Tavan satır cinsinden hesaplanıyor (bkz. metinKutuYuksekligi): sabit
     piksel yazsaydık farklı yazı boyutunda 5 satır tutmazdı.

     `genis` de tetikleyici: düzen değişince metin alanının GENİŞLİĞİ değişiyor,
     dolayısıyla kaç satır sürdüğü de. Yalnız `message`'a bağlıyken ölçüm ESKİ
     düzende yapılıyordu ve geniş moddan dönerken kutu yüksek kalıyordu. */
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const bicem = getComputedStyle(ta);
    const satirPx = Number.parseFloat(bicem.lineHeight) || 20;
    const dikeyPay =
      Number.parseFloat(bicem.paddingTop) + Number.parseFloat(bicem.paddingBottom);
    const { yukseklikPx, kaydirilacak } = metinKutuYuksekligi(ta.scrollHeight, satirPx, dikeyPay);
    ta.style.height = `${yukseklikPx}px`;
    ta.style.overflowY = kaydirilacak ? "auto" : "hidden";
  }, [message, genis]);

  useEffect(() => {
    const handleFocus = () => textareaRef.current?.focus();
    window.addEventListener("t3ai:focus-chat-input", handleFocus);
    return () => window.removeEventListener("t3ai:focus-chat-input", handleFocus);
  }, []);

  /* Geri sarma, bırakılan mesajın metnini girdi kutusuna geri koyuyor: o soruyu
     yeniden sormak isteniyor. Olay üzerinden geliyor çünkü metin bu bileşenin
     kendi durumunda; yukarıdaki odak olayıyla aynı desen. */
  useEffect(() => {
    const yaz = (e: Event) => {
      const metin = (e as CustomEvent<string>).detail;
      if (typeof metin !== "string") return;
      setMessage(metin);
      textareaRef.current?.focus();
    };
    window.addEventListener("t3ai:girdiye-yaz", yaz);
    return () => window.removeEventListener("t3ai:girdiye-yaz", yaz);
  }, []);

  useEffect(() => {
    if (!supportsVision && selectedImages.length > 0) {
      setSelectedImages([]);
    }
  }, [supportsVision, selectedImages.length]);

  // Clipboard paste handler (images only)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!supportsVision) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        processFiles(imageFiles);
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [supportsVision]);

  const docKind = (name: string): PendingDocument["kind"] | null => {
    if (isPdfFile(name)) return "pdf";
    if (isXlsxFile(name)) return "xlsx";
    if (isPptxFile(name)) return "pptx";
    if (isCodeFile(name)) return "code";
    if (isFileSupported(name)) return "text";
    return null;
  };

  const processImage = (file: File) => {
    if (!supportsVision) {
      toast.error("Görüntü desteği yok", { description: "Seçili model görüntü işlemeyi desteklemiyor." });
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      toast.error(`Resim çok büyük (${(file.size / 1024 / 1024).toFixed(1)}MB)`, {
        description: "Maksimum 50MB boyutunda resim yükleyebilirsiniz.",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setSelectedImages((prev) => [...prev, base64]);
    };
    reader.readAsDataURL(file);
  };

  const processDocument = async (file: File, kind: PendingDocument["kind"]) => {
    if (file.size > MAX_DOC_SIZE) {
      toast.error(`Dosya çok büyük (${(file.size / 1024 / 1024).toFixed(1)}MB)`, {
        // Sınırı sabitten türet — elle yazılan sayı sabit değişince yalan söylüyor
        description: `Maksimum ${MAX_DOC_SIZE / 1024 / 1024}MB doküman yükleyebilirsiniz. "${file.name}" eklenmedi.`,
      });
      return;
    }
    if (file.size === 0) {
      toast.error(`${file.name} boş`, { description: "0 bayt boyutundaki dosyalar yüklenemez." });
      return;
    }
    const id = crypto.randomUUID();
    setSelectedDocuments((prev) => {
      if (prev.length >= MAX_DOCS_PER_MESSAGE) {
        toast.error(`En fazla ${MAX_DOCS_PER_MESSAGE} doküman ekleyebilirsiniz`);
        return prev;
      }
      return [
        ...prev,
        { id, name: file.name, size: file.size, kind, file, content: "", status: "parsing", progress: 0, phaseLabel: "okunuyor" },
      ];
    });

    try {
      const parsed = await parseFile(file, (current, total) => {
        const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
        setSelectedDocuments((prev) =>
          prev.map((d) =>
            d.id === id
              ? {
                  ...d,
                  progress: percent,
                  phaseLabel:
                    kind === "pdf" ? `sayfa ${current}/${total}`
                    : kind === "pptx" ? `slayt ${current}/${total}`
                    : "okunuyor",
                }
              : d,
          ),
        );
      });
      if (parsed.metadata?.warnings?.length) {
        for (const w of parsed.metadata.warnings) toast.warning(w, { duration: 6000 });
      }
      if (!parsed.content || parsed.content.trim().length === 0) {
        throw new Error("Dosya içeriği boş veya okunamadı");
      }
      setSelectedDocuments((prev) =>
        prev.map((d) =>
          d.id === id ? { ...d, content: parsed.content, status: "ready", progress: 100, phaseLabel: undefined } : d,
        ),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      toast.error(`${file.name} okunamadı`, { description: msg });
      setSelectedDocuments((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status: "error", error: msg, progress: 0 } : d)),
      );
    }
  };

  /**
   * Zip'i depo olarak alır: süzer, indeksler, NE ALINMADIĞINI söyler.
   *
   * Tek tek dosya kartı açılmıyor — 200 dosyalık bir depoda 200 kart kimseye
   * bir şey anlatmaz. Tek bir özet kartı ve sonunda atlama raporu var.
   */
  const processRepo = async (file: File) => {
    if (file.size > MAX_DOC_SIZE) {
      toast.error(`Zip çok büyük (${(file.size / 1024 / 1024).toFixed(1)}MB)`, {
        description: `Maksimum ${MAX_DOC_SIZE / 1024 / 1024}MB.`,
      });
      return;
    }
    const id = crypto.randomUUID();
    setSelectedDocuments((prev) => [
      ...prev,
      { id, name: file.name, size: file.size, kind: "repo", file, content: "", status: "parsing", progress: 0, phaseLabel: "zip açılıyor" },
    ]);

    let sonuc: Awaited<ReturnType<typeof zipDepoOku>>;
    try {
      sonuc = await zipDepoOku(await file.arrayBuffer(), {}, ({ okunan, toplam }) => {
        setSelectedDocuments((prev) =>
          prev.map((d) =>
            d.id === id
              ? { ...d, progress: toplam ? Math.round((okunan / toplam) * 100) : 0, phaseLabel: `dosya ${okunan}/${toplam}` }
              : d,
          ),
        );
      });
    } catch (err) {
      setSelectedDocuments((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status: "error", error: err instanceof Error ? err.message : "Zip okunamadı" } : d)),
      );
      return;
    }

    if (sonuc.dosyalar.length === 0) {
      setSelectedDocuments((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status: "error", error: "Zip içinde indekslenecek kod dosyası bulunamadı" } : d)),
      );
      return;
    }

    // Süzme raporu — sessiz kesme yok
    const ozet = atlamaOzeti(sonuc.atlanan);
    if (ozet.length > 0) {
      toast.info(`${sonuc.dosyalar.length} dosya alındı, ${sonuc.atlanan.length} tanesi atlandı`, {
        description: ozet.map((o) => `${o.sayi} × ${o.sebep}`).join(" · "),
        duration: 10000,
      });
    }

    setSelectedDocuments((prev) =>
      prev.map((d) =>
        d.id === id
          ? {
              ...d,
              status: "ready",
              progress: 100,
              phaseLabel: undefined,
              // İçerik burada TUTULMUYOR: 300 dosyayı bellekte iki kez taşımanın
              // anlamı yok, indeksleme repoFiles üzerinden gidiyor
              content: `${sonuc.dosyalar.length} dosya`,
              repoFiles: sonuc.dosyalar.map((f) => ({ name: f.path, content: f.content })),
            }
          : d,
      ),
    );
  };

  const processFiles = (files: FileList | File[]) => {
    Array.from(files).forEach((file) => {
      if (file.type.startsWith("image/")) {
        processImage(file);
        return;
      }
      // Zip TEK dosya değil, bir depo: kendi yolundan gidiyor
      if (file.name.toLowerCase().endsWith(".zip")) {
        void processRepo(file);
        return;
      }
      const kind = docKind(file.name);
      if (!kind) {
        toast.error("Desteklenmeyen dosya türü", {
          description: `${getFileTypeDescription(file.name)} desteklenmiyor.`,
        });
        return;
      }
      processDocument(file, kind);
    });
  };

  const handleImageSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    processFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /**
   * Sürükle-bırak PENCERE seviyesinde: dosya sayfanın HERHANGİ bir yerine
   * bırakılabiliyor, illa girdi kutusuna denk getirmek gerekmiyor.
   *
   * Ayrıca tarayıcının YIKICI varsayılanını kapatıyor: dinleyici yokken
   * girdi dışına bırakılan dosyayı tarayıcı açıyor ve kullanıcı sohbet
   * sayfasından çıkmış oluyordu.
   */
  const processFilesRef = useRef(processFiles);
  processFilesRef.current = processFiles;

  useEffect(() => {
    // dragleave alt öğeler arasında gezerken de tetikleniyor; sayaç olmadan
    // katman sürekli yanıp söner.
    let derinlik = 0;

    const dosyaMi = (e: globalThis.DragEvent) => !!e.dataTransfer?.types?.includes('Files');
    // Proje panelinin KENDİ bırakma alanı var; oraya bırakılan dosya sohbete
    // değil projeye gitmeli.
    const projePaneli = (e: globalThis.DragEvent) =>
      e.target instanceof Element && !!e.target.closest('[data-proje-birakma]');

    const gir = (e: globalThis.DragEvent) => {
      if (!dosyaMi(e) || projePaneli(e)) return;
      e.preventDefault();
      derinlik += 1;
      setIsDragging(true);
    };
    const uzerinde = (e: globalThis.DragEvent) => {
      if (!dosyaMi(e) || projePaneli(e)) return;
      e.preventDefault();   // ŞART: bu olmadan tarayıcı dosyayı açar
    };
    const cik = (e: globalThis.DragEvent) => {
      if (!dosyaMi(e)) return;
      derinlik = Math.max(0, derinlik - 1);
      if (derinlik === 0) setIsDragging(false);
    };
    const birak = (e: globalThis.DragEvent) => {
      if (!dosyaMi(e) || projePaneli(e)) return;
      e.preventDefault();
      derinlik = 0;
      setIsDragging(false);
      const dosyalar = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
      // Ref üzerinden: processFiles her render'da yeniden üretiliyor, doğrudan
      // bağımlılık yapılsaydı dinleyiciler her render'da sökülüp takılırdı.
      if (dosyalar.length > 0) processFilesRef.current(dosyalar);
    };

    // Sürükleme iptal edilirse (Escape, pencere dışında bırakma) sayaç
    // dengelenmeden kalır ve katman takılı görünürdü.
    const bitti = () => { derinlik = 0; setIsDragging(false); };

    window.addEventListener('dragend', bitti);
    window.addEventListener('dragenter', gir);
    window.addEventListener('dragover', uzerinde);
    window.addEventListener('dragleave', cik);
    window.addEventListener('drop', birak);
    return () => {
      window.removeEventListener('dragend', bitti);
      window.removeEventListener('dragenter', gir);
      window.removeEventListener('dragover', uzerinde);
      window.removeEventListener('dragleave', cik);
      window.removeEventListener('drop', birak);
    };
  }, []);

  const removeImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const removeDocument = (id: string) => {
    setSelectedDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  // File input accept attribute — always allow docs; images only when vision is on
  const acceptAttr = (() => {
    // Liste fileParser'dan gelir: yeni format eklendiğinde burası kendiliğinden güncellenir
    const docs = `${getAcceptedFileTypes()},.zip`;
    return supportsVision ? `image/*,${docs}` : docs;
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isStreaming || isAttaching) return;
    if (!gonderilecekVarMi) return;

    // Wait for any documents still being parsed
    if (selectedDocuments.some((d) => d.status === "parsing")) {
      toast.info("Dokümanlar hazırlanıyor, lütfen bekleyin...");
      return;
    }

    const readyDocs = selectedDocuments.filter((d) => d.status === "ready");

    /* DÜZENLEME HEDEFİ — "düzenleme mi değil mi" kararı BURADA VERİLMİYOR.
       Eskiden burada ayrı bir kapı modeline sorulurdu ve kullanıcı mesajı
       gönderilmeden önce o gidiş-dönüşü beklerdi. Artık yalnız hedef
       çözülüyor; kararı, cevabı yazan model `belge_duzenle` aracını çağırarak
       veriyor (bkz. belgeDuzenlemeAraci.ts).

       Hedef ÇÖZÜLEMEZSE araç modele hiç tanıtılmıyor — olmayan bir belgeyi
       düzenlemeye kalkmasın. */
    const sonArtifact =
      docEdit && selectedDocuments.length === 0 && message.trim() && activeConversation?.id
        ? await artifactOperations.latestByConversation(activeConversation.id)
        : null;

    const duzenlemeHedefi = docEdit
      ? duzenlemeHedefiCoz({
          hazirBelgeler: readyDocs.map((d) => ({ ad: d.name, dosya: d.file })),
          secilenBelgeSayisi: selectedDocuments.length,
          mesajVar: !!message.trim(),
          sonArtifact: sonArtifact ? { id: sonArtifact.id, ad: sonArtifact.fileName } : null,
          // DOCX, PPTX, XLSX, PDF: dördü de düzenlenebilir
          bicimCoz: (ad) => {
            const b = detectEditableFormat(ad);
            return b ? formatLabel(b) : null;
          },
        })
      : undefined;

    if (textareaRef.current) launchEffect(textareaRef.current);

    /* Yapıştırmalar mesajın başına, alıntı onların da öncesine. Yapıştırma
       yoksa `mesajiBirlestir` yazılan metne dokunmuyor — eski davranış aynen. */
    let messageText = mesajiBirlestir(yapistirilanlar.map((y) => y.metin), message);
    if (quotedText) {
      messageText = `> "${quotedText}"\n\n${messageText}`;
      setQuotedText(null);
    }
    let targetConversationId: string | undefined;

    // Index documents into conversation RAG, then prepend a reference line
    if (readyDocs.length > 0) {
      setIsAttaching(true);
      // Mark ready docs as indexing
      setSelectedDocuments((prev) =>
        prev.map((d) =>
          d.status === "ready" ? { ...d, status: "indexing", progress: 0, phaseLabel: "hazırlanıyor" } : d,
        ),
      );
      const nameToId = new Map(readyDocs.map((d) => [d.name, d.id]));
      try {
        // Depo kartı TEK ama içindeki dosyalar ayrı ayrı indeksleniyor:
        // her dosya kendi yolu ve dili ile parçalansın (chunkFile yola bakıyor)
        const indekslenecek = readyDocs.flatMap((d) =>
          d.repoFiles ?? [{ name: d.name, content: d.content }],
        );
        const { conversationId, indexed, failed } = await attachConversationDocuments(
          indekslenecek,
          (fileName, update) => {
            const docId = nameToId.get(fileName);
            if (!docId) return;
            const label =
              update.phase === "chunking"
                ? "bölümleniyor"
                : update.phase === "embedding"
                  ? `vektör (${update.current}/${update.total})`
                  : "kaydediliyor";
            setSelectedDocuments((prev) =>
              prev.map((d) => (d.id === docId ? { ...d, progress: update.percent, phaseLabel: label } : d)),
            );
          },
        );
        targetConversationId = conversationId;
        // Update final statuses
        setSelectedDocuments((prev) =>
          prev.map((d) => {
            const failure = failed.find((f) => f.name === d.name);
            if (failure) return { ...d, status: "error", error: failure.error };
            if (indexed.find((i) => i.name === d.name)) {
              return { ...d, status: "indexed", progress: 100, phaseLabel: undefined };
            }
            return d;
          }),
        );
        if (indexed.length > 0) {
          const list = indexed.map((d) => d.name).join(", ");
          messageText = `**${ATTACHMENT_MARKER} ${list}**\n\n${messageText}`;
          toast.success(`${indexed.length} doküman sohbete indekslendi`);
        }
        if (failed.length > 0 && indexed.length === 0) {
          // Nothing succeeded — keep input open so user can retry
          setIsAttaching(false);
          return;
        }
      } catch (err) {
        toast.error("Dokümanlar indekslenirken hata oluştu", {
          description: err instanceof Error ? err.message : undefined,
        });
        setIsAttaching(false);
        return;
      }
      setIsAttaching(false);
    }

    const imagesToSend = [...selectedImages];
    setTimeout(() => {
      setMessage("");
      setSelectedImages([]);
      setSelectedDocuments([]);
      setYapistirilanlar([]);
    }, 150);
    await sendMessage(
      messageText,
      imagesToSend.length > 0 ? imagesToSend : undefined,
      targetConversationId,
      duzenlemeHedefi,
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const docIcon = (kind: PendingDocument["kind"]) => {
    if (kind === "xlsx") return <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
    if (kind === "pptx") return <Presentation className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
    if (kind === "code") return <FileCode className="h-4 w-4 text-sky-600 dark:text-sky-400" />;
    if (kind === "repo") return <FolderGit2 className="h-4 w-4 text-violet-600 dark:text-violet-400" />;
    return <FileText className="h-4 w-4 text-red-600 dark:text-red-400" />;
  };

  const acikMetin = yapistirilanlar.find((y) => y.id === acikYapistirma)?.metin ?? '';

  return (
    <div ref={dropZoneRef} className="px-4 py-3 relative">
      {/* Yapıştırılan metnin tamamı — SALT OKUNUR. ChatGPT burada düzenlemeye
          de izin veriyor; yarım sayfalık bir yapıştırmayı modal pencerede
          düzenleyen kimse olmadığı için o kısmı almadık. Kaldırıp yeniden
          yapıştırmak zaten tek tık. */}
      <Dialog open={acikYapistirma !== null} onOpenChange={(a) => !a && setAcikYapistirma(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Yapıştırılan metin · {acikMetin.length.toLocaleString('tr')} karakter
            </DialogTitle>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] text-xs leading-relaxed text-muted-foreground">
            {acikMetin}
          </pre>
        </DialogContent>
      </Dialog>

      {isDragging && (
        <div className="fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50 pointer-events-none border-4 border-dashed border-primary">
          <div className="text-center">
            <Plus className="h-10 w-10 text-primary mx-auto mb-2" />
            <p className="text-primary font-medium">
              {supportsVision ? "Resim veya doküman buraya bırak" : "Doküman buraya bırak"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">PDF, Excel (.xlsx), PowerPoint (.pptx), Word, metin dosyaları</p>
          </div>
        </div>
      )}
      <div className="mx-auto w-full max-w-[800px] transition-all duration-200 ease-linear">
        {quotedText && (
          <div className="flex items-start gap-2 mb-3 p-3 rounded-xl bg-primary/5 border-l-4 border-primary animate-in slide-in-from-bottom-2 duration-200">
            <Quote className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground line-clamp-3 break-words">"{quotedText}"</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setQuotedText(null)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {selectedImages.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3 p-2 rounded-xl bg-muted/30">
            {selectedImages.map((img, index) => (
              <div key={index} className="relative group/img">
                <img
                  src={img}
                  alt={`Seçilen resim ${index + 1}`}
                  className="h-16 w-16 object-cover rounded-lg border border-border"
                />
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Yapıştırma kartı — METNİN KENDİSİNİ gösteriyor, dosya taklidi
            yapmıyor. Önce dosya çipi gibiydi (simge + ad + boyut) ve gerçek
            belge çiplerine öyle benziyordu ki altına "sohbete eklenmedi"
            yazmak zorunda kalmıştık; kullanıcı o notu okuyunca daha da
            karışıyordu. İlk satırları göstermek o soruyu baştan doğurmuyor. */}
        {yapistirilanlar.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {yapistirilanlar.map((y) => (
              <div key={y.id} className="group/yap relative">
                <button
                  type="button"
                  onClick={() => setAcikYapistirma(y.id)}
                  title={`${y.metin.length.toLocaleString('tr')} karakter — tamamını göster`}
                  className="block w-[230px] cursor-pointer rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
                >
                  <span
                    className="block max-h-[76px] overflow-hidden whitespace-pre-wrap [overflow-wrap:anywhere] text-[10px] leading-[1.45] text-muted-foreground [mask-image:linear-gradient(to_bottom,#000_55%,transparent_100%)]"
                  >
                    {y.metin.slice(0, 400)}
                  </span>
                  <span className="mt-2 inline-block rounded border border-border px-1.5 py-0.5 text-[9.5px] tracking-wider text-muted-foreground">
                    YAPIŞTIRILDI
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setYapistirilanlar((o) => o.filter((x) => x.id !== y.id))}
                  aria-label="Yapıştırılan metni kaldır"
                  className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover/yap:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {selectedDocuments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3 p-2 rounded-xl bg-muted/30">
            {selectedDocuments.map((doc) => {
              const isBusy = doc.status === "parsing" || doc.status === "indexing";
              const isError = doc.status === "error";
              const isIndexed = doc.status === "indexed";
              const subText = isError
                ? doc.error || "Bilinmeyen hata"
                : isBusy
                  ? `${doc.phaseLabel ?? "işleniyor"}${doc.progress != null ? ` · ${doc.progress}%` : ""}`
                  : isIndexed
                    ? `İndekslendi · ${formatSize(doc.size)}`
                    : `${getFileTypeDescription(doc.name)} · ${formatSize(doc.size)}`;
              return (
                <div
                  key={doc.id}
                  className={`group/doc flex flex-col gap-1 pl-2 pr-1 py-1.5 rounded-lg border bg-card w-[260px] ${
                    isError ? "border-destructive/50" : isIndexed ? "border-emerald-500/40" : "border-border"
                  }`}
                  title={isError ? doc.error : doc.name}
                >
                  <div className="flex items-center gap-2">
                    {isBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                    ) : (
                      docIcon(doc.kind)
                    )}
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-medium truncate">{doc.name}</span>
                      <span
                        className={`text-[10px] truncate ${isError ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {subText}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDocument(doc.id)}
                      className="h-5 w-5 rounded-full hover:bg-destructive/10 hover:text-destructive flex items-center justify-center shrink-0"
                      aria-label="Dokümanı kaldır"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  {isBusy && (
                    <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-200"
                        style={{ width: `${Math.max(2, doc.progress ?? 0)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptAttr}
            multiple
            onChange={handleImageSelect}
            className="hidden"
          />

          {/* Metin genişliğini ölçen görünmez kopya. Textarea'nın kendisini
              ölçemiyoruz: kompakt moddayken zaten dar, "sığar mıydı" sorusunun
              cevabını vermiyor. Kopya tek satır, sarmıyor, ekranda yok. */}
          <span
            ref={olcerRef}
            aria-hidden
            className="pointer-events-none invisible absolute whitespace-pre text-sm font-medium"
          >
            {message || ' '}
          </span>

          <div
            ref={kutuRef}
            className={cn(
              "bg-card border border-[#E6E6E6] dark:border-[#C41718] dark:bg-[#2C2C2C]",
              "shadow-[0_0_20px_5px_rgba(0,0,0,0.05)] dark:shadow-[0_0_20px_5px_rgba(196,23,24,0.2)]",
              "overflow-hidden transition-[border-radius] duration-200",
              genis
                ? "rounded-[20px] flex flex-col"
                : "rounded-[28px] flex items-center gap-1 pl-2 pr-2 py-1.5",
            )}
          >
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={yapistirmayiYakala}
              /* Kompakt modda KISA yer tutucu: uzun olan tek satıra sığmayıp
                 sarıyordu ve BOŞ kutu, içi doluymuş gibi uzun görünüyordu. */
              placeholder={
                isSummarizing
                  ? "Sohbet özetleniyor, lütfen bekleyin…"
                  : genis
                    ? (supportsVision
                        ? "Aklından geçenleri yaz, resim veya doküman ekle..."
                        : "Aklından geçenleri yaz veya doküman ekle...")
                    : "Aklından geçenleri yaz…"
              }
              className={cn(
                "chat-textarea resize-none rounded-none border-none shadow-none bg-transparent",
                "ring-0 ring-offset-0 outline-none focus:ring-0 focus:border-none focus:outline-none",
                "focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none focus-visible:border-none",
                "transition-none text-sm font-medium placeholder:text-muted-foreground",
                /* Uzun kelimeler kenarda BÖLÜNSÜN. Varsayılan sarma yalnız
                   kelime aralarından kırıyor; boşluksuz uzun bir dizi satıra
                   sığmayınca komple aşağı iniyor ve ÖNCEKİ satırın sonu boş
                   kalıyordu. */
                "[overflow-wrap:anywhere]",
                /* GENİŞ modda `flex-1` YOK: esnek kutu algoritması satır içi
                   yüksekliği eziyor ve metin alanı içerik ne olursa olsun
                   min-content'te kalıyordu — ikinci satırda kaydırma çıkmasının
                   sebebi buydu. Yükseklik artık yalnız efektten geliyor. */
                genis ? "w-full min-h-[56px] py-3 px-4" : "flex-1 min-h-0 py-2 px-2",
              )}
              rows={1}
            />

            <div
              className={cn(
                "flex items-center gap-2",
                /* Geniş modda düğmeler SAĞA toplanıyor; solda dağınık
                   durmak yerine gönder düğmesinin yanında bir küme oluyor. */
                genis ? "justify-end px-3 py-2" : "shrink-0",
              )}
            >
              <div ref={solDugmelerRef} className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="h-10 w-10 rounded-full flex items-center justify-center bg-muted border border-border text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{supportsVision ? "Resim veya doküman ekle" : "Doküman ekle (PDF, Excel, ...)"}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <SeviyeSecici />
              </div>

              <div ref={sagDugmelerRef} className="flex items-center gap-2">
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={() => stopGeneration()}
                    className="h-10 w-10 rounded-full bg-destructive hover:bg-destructive/90 flex items-center justify-center transition-all duration-200 text-destructive-foreground"
                  >
                    <Square className="h-4 w-4 fill-current" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!gonderilecekVarMi || isAttaching}
                    className="h-10 w-10 rounded-full bg-primary flex items-center justify-center transition-all duration-200 disabled:opacity-20 text-primary-foreground"
                    onClick={(e) => {
                      if (message.trim() || selectedImages.length > 0 || selectedDocuments.length > 0) {
                        ripple(e.currentTarget, e);
                      }
                    }}
                  >
                    {isAttaching ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
