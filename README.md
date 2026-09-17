# T3AI Chat

**Self-hosted, air-gapped enterprise AI chat platform with fully client-side hybrid RAG** — built for Turkish-language document intelligence in environments with zero internet access.

`v2.1.25` · React 18 + TypeScript + Vite · Express · vLLM · IndexedDB (Dexie) · Vitest

## What it does

T3AI Chat is a full-stack chat application deployed on an isolated (air-gapped) network, serving LLMs through vLLM. Users chat with large models, attach documents (PDF/DOCX/XLSX/CSV/MD), and get answers grounded in their own files through a **retrieval-augmented generation (RAG) pipeline that runs entirely in the browser** — document chunks and vectors live in IndexedDB, never on a server.

## Key features

### Hybrid retrieval (dense + lexical)
- **bge-m3 dense embeddings** (1024-dim, served via vLLM) fused with **Okapi BM25** (k1=1.5, b=0.75) using **Reciprocal Rank Fusion** (k=60)
- **Turkish-aware lexical pipeline**: `tr-TR` locale case folding (İ/ı-safe), apostrophe suffix cutting (`Ankara'nın → ankara`), ASCII diacritic folding (`GÜNEŞ ↔ gunes`) — makes exact identifiers, part codes, and numeric values retrievable where pure dense embeddings fail
- **MMR diversity selection** over the fused candidate pool, cross-scope dedup, corpus-versioned LRU index caching
- **Adaptive query classification** (factual / comparison / code / conversational / exploratory) drives per-query topK, thresholds, and diversity weights
- Runtime **kill-switch** (`localStorage`) reverts to pure dense retrieval without a rebuild

### Table-aware document pipeline
- PDF (pdf.js), DOCX (mammoth, HTML tables → Markdown), XLSX (per-sheet, header-repeated row packing), CSV/MD/TXT
- Chunker **protects tables as atomic units** — a table is never split mid-row, so tabular specs survive retrieval intact (validated on 100+ page table-heavy documents)

### OCR ingestion (scanned documents)
- Scanned PDF pages and DOCX-embedded images are converted to text via the vLLM-served **Unlimited-OCR** model and indexed alongside native document text
- Turkish diacritics and table structure validated end-to-end; fully fail-open (OCR unavailable → falls back to v2.1.23 behavior)

### Resilience by design (fail-open)
- Embedding service outage never blocks chat: 4-second deadline, then **lexical-only degraded search** with a visible notice; degraded results are never cached
- Budgeted fallbacks at every level: conversation-attachment injection on semantic miss, token-capped full-file fallback, context/history/output token accounting against real model windows

### Built-in evaluation & observability
- **`__ragEval` console harness**: seeds a fictional fixture corpus, runs a 25-case Turkish eval (identifier / numeric / paraphrase) in dense-only vs hybrid mode, reports hit@k
- Debug flags for per-query score tables (dense / BM25 / RRF), retrieval-cache stats, Prometheus model-metrics endpoint

### Multi-model serving
- Chat: GLM-class model (131K context) · Vision & summarization: Gemma-class 31B (256K context) — both via vLLM behind an Express proxy with streaming, client-disconnect abort handling, and runtime-configurable system prompts

## Architecture

```
Browser ──► Nginx ──► React SPA (RAG lives here: Dexie/IndexedDB,
   │                  chunking, hybrid search, MMR, token budgeting)
   │
   └──► /api ──► Express backend ──► vLLM (chat · vision · embeddings)
                                     └─ Prometheus metrics aggregation
```

Index time: parse → table-protected chunking (512-char, overlap) → content-hash dedup → batched embeddings → IndexedDB.
Query time: classify → embed (deadline-raced) → dense + BM25 legs over one corpus load → RRF fuse → MMR → token-budgeted context assembly → streamed LLM answer.

## Development

```bash
npm run dev          # frontend (port 8080, proxies /api → :3001)
npm run dev:backend  # Express backend (port 3001)
npm run dev:all      # both
npm test             # Vitest unit suite (retrieval/tokenizer/BM25/RRF)
npm run build        # production build
```

## Deployment

Docker Compose (frontend + backend + nginx), designed for **offline/air-gapped delivery**: images are built online, `docker save`'d, checksummed, and transferred to the isolated network. `nginx.conf` and `docker-compose.yml` ship with placeholder hosts (`vllm-a.example`, `vllm-b.example`) — point them at your own model servers.

Key environment variables: `VLLM_ENDPOINT`, `EMBEDDING_ENDPOINT` (bge-m3), `SUMMARY_VLLM_ENDPOINT`, model context/token caps — see `.env.example`.

## Engineering practice

- Every feature starts as a written design spec and a step-by-step plan, then is built test-first
- Retrieval changes ship behind kill-switches with eval evidence; every release is verified against a lint/typecheck/test parity baseline

## Roadmap

- Vision captioning fallback (Gemma) for non-textual figures; cross-encoder reranking stage

## License

**All rights reserved.** © 2026 Batuhan Biber.

The source code is published for viewing and reference only. No permission is granted to use, copy, modify, distribute, or build upon it, in whole or in part, without prior written consent from the author. See [`LICENSE`](LICENSE).

Bu kaynak kod yalnız inceleme amacıyla yayımlanmıştır; yazarın yazılı izni olmadan kullanılamaz, kopyalanamaz, değiştirilemez ve dağıtılamaz.
