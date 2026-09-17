import type { AracSonucu } from '@/lib/harness/tipler';
/**
 * Belge düzenleme context nesnesi ve hook'u.
 *
 * Provider bileşeninden AYRI dosyada: bileşen ve bileşen-olmayan export'ları
 * aynı dosyada tutmak react-refresh uyarısı üretiyor (ChatContext'te mevcut,
 * yeni koda taşınmasın diye ayrıldı).
 */
import type { BelgeIslemi } from '@/lib/harness/iptal';
import { createContext, useContext } from 'react';
import type {
  AcceptedDocumentEdit,
  DocumentEditRejection,
  EditableFormat,
} from '@/lib/documentEditing';

export interface DocumentEditContextValue {
  isOpen: boolean;
  /** Paneldeki sonuç kaydı; aynı dosyayı seçmek inceleme seçimlerini sıfırlamaz. */
  artifactId: string | null;
  fileName: string;
  buffer: ArrayBuffer | null;
  isLoading: boolean;
  /** İnceleme yapıldı mı — yapılmadıysa panel yalnız talimat alanını gösterir */
  hasRun: boolean;
  /** Çalıştırılan talimat — bekleme ekranında gösterilir */
  instruction: string;
  /** İncelenen birim sayısı — bekleme ekranında gösterilir */
  paragraphCount: number;
  /** Açık belgenin formatı — birim adı buna göre yazılır ("paragraf"/"hücre") */
  format: EditableFormat | null;
  /** Akışta o ana kadar gelen öneri sayısı */
  streamedCount: number;
  edits: AcceptedDocumentEdit[];
  rejected: DocumentEditRejection[];
  /** Kayıttan açıldıysa: hazır önizleme + sonuç dosyası (orijinal yok) */
  restored: {
    previewHtml: string;
    blob?: Blob;
    editCount: number;
    /** Belge kullanıcı düzenlemesinden mi geldi, yoksa sohbette sıfırdan mı
     *  üretildi — panel metinleri (değişiklik sayısı, dosya adı eki, önizleme
     *  mesajı) buna göre seçilir. */
    kaynak: 'duzenleme' | 'uretim';
  } | null;
  /** Paneli aç (henüz istek atmadan) */
  openFor: (file: File) => Promise<void>;
  /** Otomatik tetikleme: paneli aç ve talimatı hemen çalıştır */
  openAndRun: (file: File, instruction: string) => Promise<void>;
  /** Sohbet geçmişindeki artifact'i geri yükle (önizleme + indirme) */
  openArtifact: (artifactId: string) => Promise<void>;
  /** Sıfırdan üretilmiş belgeyi KAYDEDER, sohbet aktifse panelde gösterir
   *  (düzenleme değil, salt indirme). İlk parametre hangi sohbete ait olduğu. */
  uretilenBelgeyiAc: (
    sohbetId: string, ad: string, baytlar: Uint8Array, tur: 'docx' | 'xlsx' | 'pptx', islem: BelgeIslemi,
  ) => Promise<AracSonucu>;
  /** Üretim sürerken dolu — panel bekleme ekranını buna göre seçiyor. */
  uretim: { tur: 'docx' | 'xlsx' | 'pptx'; talimat: string } | null;
  /** Şablon dolduruldu ise özet; normal düzenlemede null. */
  sablonOzet: { dolu: number; bos: number } | null;
  /** Kayıtlı artifact'in düzenlenmiş dosyası ÜZERİNDE yeni bir tur çalıştır —
   *  kullanıcı belgeyi yeniden eklemek zorunda kalmasın */
  continueFromArtifact: (artifactId: string, instruction: string) => Promise<void>;
  /** Paneldeki durumun ait olduğu sohbet — başka sohbette eski sonuç gösterilmesin */
  stateConversationId: string | null;
  /** Talimatı modele yolla, sonucu doğrula */
  run: (instruction: string) => Promise<void>;
  /** Paneli gizle, durumu KORU (sağ üstteki anahtar ve panelin X'i bunu kullanır) */
  hide: () => void;
  /** Gizlenmiş paneli aynı durumla geri getir */
  show: () => void;
  /** Durumu tamamen bırak — büyük dosyanın buffer'ı bellekte kalmasın */
  close: () => void;
  stop: () => void;
}

export const DocumentEditContext = createContext<DocumentEditContextValue | undefined>(undefined);

export function useDocumentEdit(): DocumentEditContextValue {
  const ctx = useContext(DocumentEditContext);
  if (!ctx) throw new Error('useDocumentEdit, DocumentEditProvider içinde kullanılmalı');
  return ctx;
}

/**
 * Provider YOKSA null döner, hata FIRLATMAZ.
 *
 * ChatInput bunu kullanır: düzenleme özelliği onun için isteğe bağlı bir ek,
 * varlık şartı değil. Katı sürümü kullanınca provider'ı olmayan bir sayfada
 * (proje detayı) tüm ağaç çöküp SİYAH EKRAN veriyordu — kullanıcıya giden
 * bir kesintiydi. Panel katı sürümü kullanmaya devam ediyor; o zaten yalnız
 * provider'ın içinde render ediliyor.
 */
export function useDocumentEditOptional(): DocumentEditContextValue | null {
  return useContext(DocumentEditContext) ?? null;
}
