import { aracHatasi, type AracSonucu } from '@/lib/harness/tipler';
/** Belge işleri başlangıçtaki sohbet/model kimliğini korur; panel yalnız görünümüdür. */
import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useChat } from './ChatContext';
import { streamDocumentEdits } from '@/lib/docxEditService';
import { loadEditableDocument, formatLabel, type EditableFormat, type AcceptedDocumentEdit, type DocumentEditRejection, type DocumentEdit } from '@/lib/documentEditing';
import { artifactOperations, generateId } from '@/lib/localDb';
import { DocumentEditContext } from './documentEditStore';
import type { UretimTuru } from '@/lib/belgeUretimKapisi';
import type { DuzenlemeHedefi } from '@/lib/belgeDuzenlemeAraci';
import { yerTutuculariBul, degerleriDuzenlemeyeCevir, sablonDegerleriIste } from '@/lib/sablonDoldur';
import { iptaliKontrolEt, type BelgeIslemi } from '@/lib/harness/iptal';

export function DocumentEditProvider({ children }: { children: ReactNode }) {
  const { selectedModel, recordArtifactExchange, activeConversation, belgeUretimDinleyicisiKaydet, stopGeneration, belgeIslemiCalistir } = useChat();
  const activeId = useRef(activeConversation?.id ?? '');
  activeId.current = activeConversation?.id ?? '';
  const panelOwner = useRef<string | null>(null);
  const pendingOwner = useRef<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [currentArtifactId, setCurrentArtifactId] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [paragraphCount, setParagraphCount] = useState(0);
  const [format, setFormat] = useState<EditableFormat | null>(null);
  const [streamedCount, setStreamedCount] = useState(0);
  const [restored, setRestored] = useState<{
    previewHtml: string; blob?: Blob; editCount: number; kaynak: 'duzenleme' | 'uretim';
  } | null>(null);
  const [stateConversationId, setStateConversationId] = useState<string | null>(null);
  const [uretim, setUretim] = useState<{ tur: UretimTuru; talimat: string } | null>(null);
  const [sablonOzet, setSablonOzet] = useState<{ dolu: number; bos: number } | null>(null);
  const [edits, setEdits] = useState<AcceptedDocumentEdit[]>([]);
  const [rejected, setRejected] = useState<DocumentEditRejection[]>([]);

  const gorunur = useCallback((islem: BelgeIslemi) =>
    !islem.signal.aborted && activeId.current === islem.sohbetId && panelOwner.current === islem.runId, []);
  const close = useCallback(() => {
    panelOwner.current = null;
    pendingOwner.current = null;
    setIsOpen(false); setCurrentArtifactId(null); setBuffer(null); setEdits([]); setRejected([]);
    setHasRun(false); setRestored(null); setStateConversationId(null);
    setIsLoading(false); setUretim(null); setSablonOzet(null);
  }, []);
  // Bekleyen arka plan işi sürer; başka sohbetin ekranını güncelleyemez.
  useEffect(() => { close(); }, [activeConversation?.id, close]);


  const panelBaslat = useCallback((islem: BelgeIslemi, name: string, talimat: string, buf: ArrayBuffer | null) => {
    iptaliKontrolEt(islem.signal);
    if (activeId.current !== islem.sohbetId) return;
    panelOwner.current = islem.runId;
    pendingOwner.current = islem.runId;
    setCurrentArtifactId(null);
    setFileName(name); setInstruction(talimat); setBuffer(buf);
    setEdits([]); setRejected([]); setRestored(null); setHasRun(false);
    setSablonOzet(null); setStreamedCount(0); setParagraphCount(0); setFormat(null);
    setStateConversationId(islem.sohbetId); setUretim(null); setIsLoading(true); setIsOpen(true);
  }, []);

  const openFor = useCallback(async (file: File) => {
    const owner = generateId(), sohbetId = activeId.current;
    panelOwner.current = owner;
    const buf = await file.arrayBuffer();
    if (activeId.current !== sohbetId || panelOwner.current !== owner) return;
    panelBaslat({ runId: owner, sohbetId, modelId: selectedModel, signal: new AbortController().signal }, file.name, '', buf);
    setIsLoading(false);
    pendingOwner.current = null;
  }, [selectedModel, panelBaslat]);

  const openArtifact = useCallback(async (artifactId: string) => {
    const owner = generateId(), sohbetId = activeId.current;
    panelOwner.current = owner;
    const a = await artifactOperations.get(artifactId);
    if (!a) { toast.error('Bu artifact bulunamadı'); return; }
    if (a.conversationId !== sohbetId) return;
    const buf = a.editedBlob ? await a.editedBlob.arrayBuffer() : null;
    if (activeId.current !== sohbetId || panelOwner.current !== owner) return;
    panelBaslat({ runId: owner, sohbetId, modelId: selectedModel, signal: new AbortController().signal }, a.fileName, a.instruction, buf);
    setCurrentArtifactId(a.id);
    setRestored({ previewHtml: a.previewHtml, blob: a.editedBlob, editCount: a.editCount, kaynak: a.editCount ? 'duzenleme' : 'uretim' });
    setHasRun(true); setIsLoading(false);
    pendingOwner.current = null;
  }, [selectedModel, panelBaslat]);

  const uretilenBelgeyiAc = useCallback(async (
    sohbetId: string, ad: string, baytlar: Uint8Array, tur: UretimTuru, islem: BelgeIslemi,
  ) => {
    if (sohbetId !== islem.sohbetId) throw new Error('Belge sohbeti işlemle eşleşmiyor.');
    iptaliKontrolEt(islem.signal);
    const mime = tur === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : tur === 'pptx' ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const blob = new Blob([baytlar], { type: mime });
    const { blobSaved, artifactId } = await recordArtifactExchange({ islem, fileName: ad, instruction: '', editCount: 0, editedBlob: blob, previewHtml: '', uretim: true });
    iptaliKontrolEt(islem.signal);
    if (!blobSaved) toast.warning('Dosya tarayıcı deposuna sığmadı; şimdi indirip saklayın.');
    if (panelOwner.current === islem.runId) pendingOwner.current = null;
    if (!gorunur(islem)) toast.success('Belge hazır', { description: ad });
    else {
      setCurrentArtifactId(artifactId);
      setFileName(ad); setInstruction(''); setEdits([]); setRejected([]); setBuffer(null);
      setRestored({ previewHtml: '', blob, editCount: 0, kaynak: 'uretim' });
      setUretim(null); setIsLoading(false); setHasRun(true); setIsOpen(true);
    }
    return { durum: blobSaved ? 'basarili' : 'uyari', artifactId, dosyaAdi: ad, kaynaklar: [], uygulanan: 1, reddedilen: 0, uyarilar: blobSaved ? [] : ['Dosya tarayıcı deposuna sığmadı; yalnız açık panelden indirilebilir.'] } satisfies AracSonucu;
  }, [recordArtifactExchange, gorunur]);

  const belgeUretimiBasladi = useCallback((sohbetId: string, ad: string, tur: UretimTuru, talimat: string, islem: BelgeIslemi) => {
    if (sohbetId !== islem.sohbetId) return;
    panelBaslat(islem, ad, talimat, null);
    if (gorunur(islem)) setUretim({ tur, talimat });
  }, [panelBaslat, gorunur]);
  const belgeUretimiBasarisiz = useCallback((_sohbetId: string, islem: BelgeIslemi) => {
    // İptal sinyali burada beklenir; eski turun hatası yeni paneli kapatamaz.
    if (panelOwner.current === islem.runId && pendingOwner.current === islem.runId) close();
  }, [close]);

  const runWith = useCallback(async (buf: ArrayBuffer, name: string, talimat: string, islem: BelgeIslemi, kullaniciMesaji = true) => {
    iptaliKontrolEt(islem.signal);
    if (!talimat.trim()) return aracHatasi('arguman', 'Düzenleme talimatı boş.', true);
    panelBaslat(islem, name, talimat, buf);
    const uyarilar: string[] = [];
    let artifactId: string | undefined;
    try {
      const loaded = await loadEditableDocument(buf, name);
      iptaliKontrolEt(islem.signal);
      if (gorunur(islem)) { setParagraphCount(loaded.unitCount); setFormat(loaded.format); }
      const yerTutucular = yerTutuculariBul(loaded.numberedText);
      let proposed: DocumentEdit[];
      if (yerTutucular.length) {
        const degerler = await sablonDegerleriIste(yerTutucular.map((y) => y.ad), talimat, islem.modelId, islem.sohbetId, islem.signal, islem.butce);
        iptaliKontrolEt(islem.signal);
        proposed = degerleriDuzenlemeyeCevir(yerTutucular, degerler);
        const dolu = new Set(proposed.map((e) => e.reason)).size;
        if (dolu < yerTutucular.length) uyarilar.push(`${yerTutucular.length - dolu} şablon alanı boş kaldı.`);
        if (gorunur(islem)) setSablonOzet({ dolu, bos: yerTutucular.length - dolu });
        if (!dolu) toast.error('Şablon doldurulamadı', { description: 'Model hiçbir alan için değer üretemedi.' });
      } else {
        const akis = await streamDocumentEdits(loaded.numberedText, talimat, islem.modelId,
          () => { if (gorunur(islem)) setStreamedCount((n) => n + 1); },
          formatLabel(loaded.format), islem.sohbetId, loaded.format, islem.signal, islem.butce);
        proposed = akis.edits;
        if (akis.truncated) { uyarilar.push('Model yanıtı yarıda kesildi; değişiklik listesi eksik olabilir.'); toast.warning(uyarilar[uyarilar.length - 1]); }
      }
      iptaliKontrolEt(islem.signal);
      const { accepted, rejected: bad } = loaded.validate(proposed);
      if (accepted.length) {
        const { blob } = await loaded.apply(accepted.map((a) => a.edit));
        iptaliKontrolEt(islem.signal);
        const previewHtml = await loaded.renderPreview(await blob.arrayBuffer(), accepted.map((a) => ({ text: a.after, locationLabel: a.locationLabel })));
        iptaliKontrolEt(islem.signal);
        const kayit = await recordArtifactExchange({ islem, fileName: name, instruction: talimat, kullaniciMesaji, editCount: accepted.length, editedBlob: blob, previewHtml });
        iptaliKontrolEt(islem.signal);
        artifactId = kayit.artifactId;
        if (!kayit.blobSaved) { uyarilar.push('Dosya tarayıcı deposuna sığmadı; yalnız açık panelden indirilebilir.'); toast.warning(uyarilar[uyarilar.length - 1]); }
        if (!gorunur(islem)) toast.success('Belge hazır', { description: name });
      } else if (!yerTutucular.length) {
        if (bad.length) toast.warning(`${bad.length} öneri uygulanamadı`);
        else toast.info('Model değiştirilecek bir şey bulmadı');
      }
      if (gorunur(islem)) { setCurrentArtifactId(artifactId ?? null); setEdits(accepted); setRejected(bad); setHasRun(true); }
      if (bad.length) uyarilar.push(`${bad.length} öneri uygulanamadı.`);
      if (!accepted.length && bad.length) return { ...aracHatasi('duzenleme', 'Önerilerin hiçbiri belgeye uygulanamadı.', true), reddedilen: bad.length };
      if (!accepted.length && yerTutucular.length) return aracHatasi('bos-sablon', 'Şablonda doldurulabilecek bir değer bulunamadı; gerekli alan bilgilerini belirtin.');
      if (!accepted.length) uyarilar.push('Dosyada uygulanabilir bir değişiklik bulunmadı; yeni belge kaydedilmedi.');
      return { durum: uyarilar.length ? 'uyari' : 'basarili', artifactId, dosyaAdi: name, kaynaklar: [name], uygulanan: accepted.length, reddedilen: bad.length, uyarilar } satisfies AracSonucu;
    } catch (err) {
      if (pendingOwner.current === islem.runId && panelOwner.current === islem.runId) close();
      throw err;
    } finally {
      if (pendingOwner.current === islem.runId) pendingOwner.current = null;
      if (panelOwner.current === islem.runId) setIsLoading(false);
    }
  }, [panelBaslat, gorunur, recordArtifactExchange, close]);

  const manuelCalistir = useCallback(async (isiYap: (islem: BelgeIslemi) => Promise<unknown>) => {
    try {
      await belgeIslemiCalistir(async (islem) => {
        try { await isiYap(islem); }
        catch (err) {
          if (islem.signal.aborted) {
            belgeUretimiBasarisiz(islem.sohbetId, islem);
            toast.info('Belge işlemi durduruldu');
          } else throw err;
        }
      });
    } catch (err) {
      toast.error('Belge işlemi tamamlanamadı', { description: err instanceof Error ? err.message : 'Bilinmeyen hata' });
    }
  }, [belgeIslemiCalistir, belgeUretimiBasarisiz]);
  const openAndRun = useCallback((file: File, talimat: string) => manuelCalistir(async (islem) => {
    const buf = await file.arrayBuffer();
    await runWith(buf, file.name, talimat, islem);
  }), [manuelCalistir, runWith]);
  const artifactDuzenle = useCallback(async (artifactId: string, talimat: string, islem: BelgeIslemi, kullaniciMesaji: boolean) => {
    const a = await artifactOperations.get(artifactId);
    iptaliKontrolEt(islem.signal);
    if (!a || a.conversationId !== islem.sohbetId) throw new Error('Belge bu sohbete ait değil.');
    if (!a.editedBlob) throw new Error('Önceki dosya saklanmamış. Belgeyi yeniden ekleyin.');
    const buf = await a.editedBlob.arrayBuffer();
    return runWith(buf, a.fileName, talimat, islem, kullaniciMesaji);
  }, [runWith]);
  const continueFromArtifact = useCallback((id: string, talimat: string) => manuelCalistir((islem) => artifactDuzenle(id, talimat, islem, true)), [manuelCalistir, artifactDuzenle]);
  const run = useCallback((talimat: string) => manuelCalistir(async (islem) => {
    if (buffer) await runWith(buffer, fileName, talimat, islem);
  }), [buffer, fileName, manuelCalistir, runWith]);
  const belgeDuzenlemeIstendi = useCallback(async (sohbetId: string, hedef: DuzenlemeHedefi, talimat: string, islem: BelgeIslemi) => {
    iptaliKontrolEt(islem.signal);
    if (sohbetId !== islem.sohbetId) throw new Error('Belge sohbeti işlemle eşleşmiyor.');
    if (hedef.tur === 'dosya') return runWith(await hedef.dosya.arrayBuffer(), hedef.dosya.name, talimat, islem, false);
    else return artifactDuzenle(hedef.artifactId, talimat, islem, false);
  }, [runWith, artifactDuzenle]);

  useEffect(() => {
    belgeUretimDinleyicisiKaydet({ basladi: belgeUretimiBasladi, bitti: uretilenBelgeyiAc, basarisiz: belgeUretimiBasarisiz, duzenle: belgeDuzenlemeIstendi });
  }, [belgeUretimDinleyicisiKaydet, belgeUretimiBasladi, uretilenBelgeyiAc, belgeUretimiBasarisiz, belgeDuzenlemeIstendi]);
  const hide = useCallback(() => setIsOpen(false), []);
  const show = useCallback(() => setIsOpen(true), []);
  const stop = useCallback(() => {
    stopGeneration(activeId.current);
  }, [stopGeneration]);
  return <DocumentEditContext.Provider value={{ isOpen, artifactId: currentArtifactId, fileName, buffer, isLoading, hasRun, instruction, paragraphCount, format, streamedCount,
    edits, rejected, restored, stateConversationId, uretim, sablonOzet,
    openFor, openAndRun, openArtifact, uretilenBelgeyiAc, continueFromArtifact, run, hide, show, close, stop,
  }}>{children}</DocumentEditContext.Provider>;
}
