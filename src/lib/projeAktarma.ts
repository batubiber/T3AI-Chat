/**
 * Proje dışa/içe aktarma — SAF kısım.
 *
 * IndexedDB'ye hiç dokunmuyor: asıl risk id eşlemesi, o da burada ve
 * tamamen testlenebilir. Öksüz bir referans (var olmayan sohbete bağlı mesaj,
 * var olmayan belgeye bağlı parça) sessizce bozuk bir projeye yol açar.
 *
 * İKİ SENARYO TEK AKIŞ:
 *   paylaşım → sohbetler ve indeks hariç; küçük dosya, alıcı yeniden indeksler
 *   yedek    → her şey dahil; büyük dosya ama embedding servisine ihtiyaç yok
 *
 * İÇE AKTARMA HER ZAMAN YENİ PROJE ÜRETİR. Üzerine yazan yol bilerek yok:
 * aynı dosyayı iki kez almak kopya üretir, veri kaybettirmez.
 */

import type {
  LocalProject, LocalProjectFile, LocalConversation, LocalMessage,
  LocalDocument, LocalChunk,
} from './localDb';

export const AKTARMA_TURU = 't3ai-proje';
export const AKTARMA_SURUMU = 1;

export interface AktarmaDosyasi {
  tur: string;
  surum: number;
  disaAktarilma: string;
  proje: LocalProject;
  dosyalar: LocalProjectFile[];
  sohbetler?: LocalConversation[];
  mesajlar?: LocalMessage[];
  belgeler?: LocalDocument[];
  parcalar?: LocalChunk[];
}

export interface DisaGirdi {
  proje: LocalProject;
  dosyalar: LocalProjectFile[];
  /** Verilirse sohbetler ve mesajlar da yazılır (yedek senaryosu). */
  sohbetler?: LocalConversation[];
  mesajlar?: LocalMessage[];
  /** Verilirse arama indeksi de yazılır; dosyayı belirgin şekilde büyütür. */
  belgeler?: LocalDocument[];
  parcalar?: LocalChunk[];
}

export interface Hazir {
  proje: LocalProject;
  dosyalar: LocalProjectFile[];
  sohbetler: LocalConversation[];
  mesajlar: LocalMessage[];
  belgeler: LocalDocument[];
  parcalar: LocalChunk[];
}

export type IdUret = () => string;

/**
 * Dışa aktarma dosyasını kurar.
 *
 * `artifactId` BİLEREK yazılmıyor: artifact kaydı `editedBlob` (Blob) taşıyor
 * ve Blob JSON'da `{}` olup sessizce kayboluyor. Aktarsaydık alıcıda
 * çalışmayan bir indirme kartı görünürdü; ölü düğme göstermektense referansı
 * atmak dürüst.
 */
export function disaAktarmaKur(girdi: DisaGirdi, simdi: Date): AktarmaDosyasi {
  const sohbetVar = Array.isArray(girdi.sohbetler) && girdi.sohbetler.length > 0;
  const sohbetIdleri = new Set((girdi.sohbetler ?? []).map((s) => s.id));

  const dosya: AktarmaDosyasi = {
    tur: AKTARMA_TURU,
    surum: AKTARMA_SURUMU,
    disaAktarilma: simdi.toISOString(),
    proje: girdi.proje,
    dosyalar: girdi.dosyalar,
  };

  if (sohbetVar) {
    dosya.sohbetler = girdi.sohbetler;
    dosya.mesajlar = (girdi.mesajlar ?? []).map((m) => {
      const { artifactId: _atilan, ...kalan } = m;
      return kalan as LocalMessage;
    });
  }

  if (girdi.parcalar) {
    // Sohbete bağlı parçalar sohbetin malı. Sohbetler aktarılmıyorsa onlar da
    // aktarılmamalı, yoksa alıcıda hiçbir sohbete bağlanamayan parça kalır.
    dosya.parcalar = girdi.parcalar.filter(
      (p) => !p.conversationId || sohbetIdleri.has(p.conversationId),
    );
    const kullanilanBelgeler = new Set(dosya.parcalar.map((p) => p.documentId));
    dosya.belgeler = (girdi.belgeler ?? []).filter((b) => kullanilanBelgeler.has(b.id));
  }

  return dosya;
}

/** JSON turundan sonra tarihler dize olur; Dexie indeksleri dizeyle bozulur. */
function tariheCevir<T>(kayit: T, alanlar: string[]): T {
  const k = { ...(kayit as Record<string, unknown>) };
  for (const alan of alanlar) {
    const deger = k[alan];
    if (typeof deger === 'string' || typeof deger === 'number') k[alan] = new Date(deger);
  }
  return k as T;
}

function dogrula(ham: unknown): AktarmaDosyasi {
  if (!ham || typeof ham !== 'object' || Array.isArray(ham)) {
    throw new Error('Dosya okunamadı: geçerli bir proje dışa aktarma dosyası değil.');
  }
  const d = ham as Partial<AktarmaDosyasi>;
  if (d.tur !== AKTARMA_TURU) {
    throw new Error('Bu bir proje dışa aktarma dosyası değil.');
  }
  if (typeof d.surum !== 'number' || d.surum > AKTARMA_SURUMU) {
    throw new Error(
      `Dosya sürümü desteklenmiyor (${String(d.surum)}). Uygulamayı güncelleyin.`,
    );
  }
  if (!d.proje || typeof d.proje !== 'object') {
    throw new Error('Dosyada proje bilgisi yok.');
  }
  return d as AktarmaDosyasi;
}

/**
 * Dosyayı, doğrudan veritabanına yazılabilecek TUTARLI bir kayıt kümesine
 * çevirir: tüm id'ler yeniden üretilir, iç bağlantılar yeniden eşlenir,
 * hedefi bulunmayan referanslar düşürülür.
 */
export function iceAktarmayaHazirla(ham: unknown, idUret: IdUret): Hazir {
  const dosya = dogrula(ham);

  const projeId = idUret();
  const sohbetEsleme = new Map<string, string>();
  const mesajEsleme = new Map<string, string>();
  const belgeEsleme = new Map<string, string>();

  for (const s of dosya.sohbetler ?? []) sohbetEsleme.set(s.id, idUret());
  for (const m of dosya.mesajlar ?? []) mesajEsleme.set(m.id, idUret());
  for (const b of dosya.belgeler ?? []) belgeEsleme.set(b.id, idUret());

  const proje = tariheCevir(
    { ...dosya.proje, id: projeId },
    ['createdAt', 'updatedAt'],
  );

  const dosyalar = (dosya.dosyalar ?? []).map((f) =>
    tariheCevir({ ...f, id: idUret(), projectId: projeId }, ['createdAt']),
  );

  const sohbetler = (dosya.sohbetler ?? []).map((s) =>
    tariheCevir(
      { ...s, id: sohbetEsleme.get(s.id)!, projectId: projeId },
      ['createdAt', 'updatedAt'],
    ),
  );

  // Sohbeti aktarılmamış mesaj öksüz kalır — düşürülüyor.
  const mesajlar = (dosya.mesajlar ?? [])
    .filter((m) => sohbetEsleme.has(m.conversationId))
    .map((m) => {
      const { artifactId: _atilan, ...kalan } = m;
      const yeni = {
        ...kalan,
        id: mesajEsleme.get(m.id)!,
        conversationId: sohbetEsleme.get(m.conversationId)!,
      } as LocalMessage;
      // Hedefi aktarılmadıysa alanı hiç yazma; var olmayan bir mesaja işaret
      // eden fork bilgisi arayüzde yanlış bağlantı gösterirdi.
      if (yeni.forkedFrom) {
        const hedef = mesajEsleme.get(yeni.forkedFrom);
        if (hedef) yeni.forkedFrom = hedef;
        else delete yeni.forkedFrom;
      }
      return tariheCevir(yeni, ['createdAt']);
    });

  const belgeler = (dosya.belgeler ?? []).map((b) =>
    tariheCevir({ ...b, id: belgeEsleme.get(b.id)! }, ['createdAt']),
  );

  const parcalar = (dosya.parcalar ?? [])
    .filter((p) => belgeEsleme.has(p.documentId))
    .map((p) => {
      const yeni = {
        ...p,
        id: idUret(),
        documentId: belgeEsleme.get(p.documentId)!,
        projectId: projeId,
      } as LocalChunk;
      if (yeni.conversationId) {
        const hedef = sohbetEsleme.get(yeni.conversationId);
        if (hedef) yeni.conversationId = hedef;
        else delete yeni.conversationId;
      }
      return tariheCevir(yeni, ['createdAt']);
    });

  return { proje, dosyalar, sohbetler, mesajlar, belgeler, parcalar };
}
