/**
 * TEMEL ÇİZGİ — 2026-09-07, yerel bge-m3 (vLLM), 35 belge / 108 vaka.
 * Korpus ~12.900 token, bağlam bütçesi 8.000 → korpus bütçenin 1,6 katı.
 *
 *   kip     isabet           MRR     gürültü   parça
 *   taban   53/108  (%49)    0.046   %97       59.0
 *   dense   97/108  (%90)    0.815   %66       11.5
 *   hibrit  105/108 (%97)    0.851   %82       15.1
 *
 * Tür kırılımı (isabet, dense → hibrit):
 *   identifier   27/29 → 29/29     nadir-terim  16/18 → 18/18
 *   numeric      25/25 → 25/25     ayirt-edici  11/11 → 11/11
 *   paraphrase   18/25 → 22/25
 *
 * Kaçan 3 vaka: 2'si geri çağırma kaybı (doğru belge hiç gelmiyor), 1'i
 * komşu parça (doğru belge 1. sırada, hedef parça bitişikte ama havuzda yok).
 *
 * Bir değişikliğin işe yaradığını iddia etmeden önce bu tabloyu yeniden üret.
 *
 * RAG eval harness — konsoldan çalıştırılır (cluster dahil):
 *   __ragEval.seed()    → fixture dokümanları geçici projeye indeksler
 *   __ragEval.run()     → vakaları dense-only vs hybrid koşar, hit@k tablosu basar
 *   __ragEval.cleanup() → fixture projeyi ve chunk'larını siler
 */
import { localDb } from '@/lib/localDb';
import { indexDocument, buildContextFromSearch } from '@/lib/ragService';
import { deleteChunksByProjectId } from '@/lib/vectorSearch';
import { EVAL_DOCS, EVAL_CASES, type EvalCase } from './ragEvalSet';
import type { RagSource } from '@/lib/ragService';
import { estimateTokens } from '@/lib/tokenEstimator';

const EVAL_PROJECT_ID = '__rag_eval__';

async function seed(): Promise<void> {
  await cleanup(); // idempotent
  await localDb.projects.put({
    id: EVAL_PROJECT_ID, name: 'RAG Eval (geçici)',
    createdAt: new Date(), updatedAt: new Date(),
  });
  for (const doc of EVAL_DOCS) {
    const file = {
      id: `${EVAL_PROJECT_ID}_${doc.name}`, projectId: EVAL_PROJECT_ID,
      name: doc.name, content: doc.content, mimeType: 'text/markdown',
      size: doc.content.length, createdAt: new Date(),
    };
    await localDb.projectFiles.put(file);
    const r = await indexDocument(EVAL_PROJECT_ID, file);
    console.log(`seed: ${doc.name} → ${r.chunksCreated} chunk`);
  }
}

/**
 * Bir vakanın ÖLÇÜMÜ.
 *
 * Eskiden tek ölçüt `ctx.content.includes(expectContains)` idi ve `expectFile`
 * alanı yazılmış olduğu hâlde hiç okunmuyordu. Bu ölçüt iki soruyu birbirine
 * karıştırıyor: "doğru bilgi bağlamda var mı" ile "doğru YERDEN geldi mi".
 * Küçük bir korpusta yanlış dosyadan gelen bir parça bile dizgeyi içerebilir.
 */
export interface VakaOlcumu {
  /** Beklenen dizge bağlamda var VE beklenen dosyadan bir parça getirilmiş. */
  isabet: boolean;
  /** Beklenen dosyadan ilk parçanın sırası (1 tabanlı); yoksa 0. */
  sira: number;
  /** 1/sıra — sıralamanın ne kadar öne koyduğunu ölçer. */
  mrr: number;
  /** Getirilen parçaların kaçta kaçı beklenen dosya DIŞINDAN (0..1). */
  gurultu: number;
  /** Getirilen toplam parça. */
  parca: number;
}

function olc(ctx: { content: string; sources: RagSource[] } | null, c: EvalCase): VakaOlcumu {
  if (!ctx || ctx.sources.length === 0) {
    return { isabet: false, sira: 0, mrr: 0, gurultu: 0, parca: 0 };
  }
  const dogruDosya = (s: RagSource) => s.fileName === c.expectFile;
  const sira = ctx.sources.findIndex(dogruDosya) + 1;
  const dogruSayisi = ctx.sources.filter(dogruDosya).length;
  return {
    isabet: ctx.content.includes(c.expectContains) && sira > 0,
    sira,
    mrr: sira > 0 ? 1 / sira : 0,
    gurultu: 1 - dogruSayisi / ctx.sources.length,
    parca: ctx.sources.length,
  };
}

type Kip = 'dense' | 'hibrit' | 'taban';

/**
 * TABAN ÇİZGİSİ — sıralama YAPMADAN, korpusun başından bütçe dolana kadar.
 *
 * Neden gerekli: fixture küçük olduğunda bağlama korpusun büyük bir kısmı
 * giriyor ve hiç sıralama yapmayan bir yöntem bile yüksek "isabet" alıyor.
 * Bu sayı görülmeden hibrit skoru anlamsız — neyin üstüne ne kattığımızı
 * bilemeyiz. Yedek yolun ürettiği bağlamın da aynısı budur.
 */
async function tabanBaglami(c: EvalCase): Promise<{ content: string; sources: RagSource[] }> {
  const chunks = await localDb.chunks.where('projectId').equals(EVAL_PROJECT_ID).toArray();
  chunks.sort((a, b) => {
    const d = (a.metadata?.fileName || '').localeCompare(b.metadata?.fileName || '');
    return d !== 0 ? d : (a.metadata?.chunkIndex || 0) - (b.metadata?.chunkIndex || 0);
  });
  const parcalar: string[] = [];
  const sources: RagSource[] = [];
  let token = 0;
  for (const ch of chunks) {
    const t = estimateTokens(ch.content);
    if (token + t > 8000) break;
    parcalar.push(ch.content);
    sources.push({
      fileName: ch.metadata?.fileName || 'bilinmeyen',
      chunkIndex: ch.metadata?.chunkIndex || 0,
      score: 0,
      retrieval: 'conversation',
    });
    token += t;
  }
  return { content: parcalar.join('\n\n'), sources };
}

async function runMode(kip: Kip): Promise<VakaOlcumu[]> {
  if (kip === 'taban') {
    const cikti: VakaOlcumu[] = [];
    for (const c of EVAL_CASES) cikti.push(olc(await tabanBaglami(c), c));
    return cikti;
  }

  const prevValue = localStorage.getItem('rag-hybrid-off');
  localStorage.setItem('rag-hybrid-off', kip === 'dense' ? '1' : '0');
  try {
    const cikti: VakaOlcumu[] = [];
    for (const c of EVAL_CASES) {
      const ctx = await buildContextFromSearch(c.query, EVAL_PROJECT_ID, { maxTokens: 8000 });
      cikti.push(olc(ctx, c));
    }
    return cikti;
  } finally {
    // Döngü içinde hata fırlarsa bile bayrak eski haline döner; aksi halde
    // kill-switch takılı kalır ve kullanıcının gerçek sohbetlerinde
    // kalıcı bayrak sızıntısı önlenir (deliberate rag-hybrid-off=1 korunur).
    if (prevValue === null) {
      localStorage.removeItem('rag-hybrid-off');
    } else {
      localStorage.setItem('rag-hybrid-off', prevValue);
    }
  }
}

const yuzde = (n: number, toplam: number) => `${((n / toplam) * 100).toFixed(0)}%`;
const ort = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function ozet(ad: string, olcumler: VakaOlcumu[]) {
  const n = olcumler.length;
  return {
    kip: ad,
    'isabet': `${olcumler.filter((o) => o.isabet).length}/${n} (${yuzde(olcumler.filter((o) => o.isabet).length, n)})`,
    'MRR': ort(olcumler.map((o) => o.mrr)).toFixed(3),
    'ort. gürültü': yuzde(ort(olcumler.map((o) => o.gurultu)), 1),
    'ort. parça': ort(olcumler.map((o) => o.parca)).toFixed(1),
  };
}

async function run(): Promise<void> {
  const taban = await runMode('taban');
  const dense = await runMode('dense');
  const hibrit = await runMode('hibrit');

  console.log('\n=== ÖZET ===');
  console.table([ozet('taban (sıralama yok)', taban), ozet('dense', dense), ozet('hibrit', hibrit)]);

  const kazanc = ort(hibrit.map((o) => o.mrr)) - ort(taban.map((o) => o.mrr));
  console.log(
    kazanc <= 0.02
      ? `\n⚠️  Hibrit, sıralama yapmayan tabana göre MRR'de yalnız ${kazanc.toFixed(3)} kazandırıyor.\n` +
        `   Bu fixture bir iyileştirmeyi ÖLÇEMEYECEK kadar küçük — vaka ve belge sayısı artmadan\n` +
        `   buradan çıkan hiçbir sayıya güvenme.`
      : `\n✓ Hibrit tabana göre MRR'de +${kazanc.toFixed(3)} kazandırıyor; fixture ayrım yapabiliyor.`,
  );

  console.log('\n=== TÜRE GÖRE (isabet) ===');
  console.table(
    // Türler VERİDEN türetiliyor: fixture'a yeni bir tür eklenince tablo
    // sessizce eksik kalmasın.
    [...new Set(EVAL_CASES.map((c) => c.kind))].sort().map((kind) => {
      const idx = EVAL_CASES.map((c, i) => (c.kind === kind ? i : -1)).filter((i) => i >= 0);
      const al = (m: VakaOlcumu[]) => `${idx.filter((i) => m[i].isabet).length}/${idx.length}`;
      return { tür: kind, taban: al(taban), dense: al(dense), hibrit: al(hibrit) };
    }),
  );

  console.log('\n=== KAÇIRILAN VAKALAR (hibrit) ===');
  const kacan = EVAL_CASES.map((c, i) => ({ c, o: hibrit[i] })).filter((x) => !x.o.isabet);
  if (kacan.length === 0) console.log('  yok');
  else
    console.table(
      kacan.map((x) => ({
        soru: x.c.query.slice(0, 46),
        beklenen: x.c.expectFile,
        'sıra': x.o.sira || '—',
        'gürültü': yuzde(x.o.gurultu, 1),
      })),
    );
}

async function cleanup(): Promise<void> {
  await deleteChunksByProjectId(EVAL_PROJECT_ID);
  await localDb.projectFiles.where('projectId').equals(EVAL_PROJECT_ID).delete();
  await localDb.projects.delete(EVAL_PROJECT_ID);
}

declare global { interface Window { __ragEval?: { seed: typeof seed; run: typeof run; cleanup: typeof cleanup } } }
if (typeof window !== 'undefined') window.__ragEval = { seed, run, cleanup };
