# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

T3AI Chat is a full-stack AI chat application (Turkish AI assistant) with React frontend and Node.js backend, designed for enterprise deployment with vLLM integration.

## Commands

```bash
# Development
npm run dev              # Frontend only (port 8080, proxies /api to :3001)
npm run dev:backend      # Backend only (port 3001, watches for changes)
npm run dev:all          # Run both concurrently

# Build & Lint
npm run build            # Production build to dist/  (TİP DENETİMİ YAPMAZ)
npm run lint             # ESLint check

# Tip denetimi — DİKKAT
npx tsc --noEmit -p tsconfig.app.json    # DOĞRU
npx tsc --noEmit                         # YANLIŞ: hiçbir şeyi kontrol etmez!
# Kök tsconfig.json'da "files": [] var ve yalnız referans tutuyor; bayraksız
# çalıştırılan tsc sessizce 0 döner. `npm run build` de (vite) tip denetlemez,
# yani tip hataları ikisinden de kaçabilir.

# Docker Deployment
docker-compose build     # Build frontend & backend images
docker-compose up -d     # Start services
docker-compose logs -f   # Stream logs
```

## Architecture

```
User Browser → Nginx (port 80)
                ├→ /        → Frontend (React SPA, port 3000)
                └→ /api     → Backend (Express, port 3001) → vLLM Server(s)
```

**Frontend** (`src/`): React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- `contexts/ChatContext.tsx` - Chat state management, message sending, streaming
- `contexts/ProjectContext.tsx` - Project CRUD, file management
- `lib/localDb.ts` - Dexie (IndexedDB) database operations
- `lib/contextManager.ts` - Message context selection for LLM
- `lib/harmonyParser.ts` - Harmony format parsing for extended reasoning
- `lib/thinkFilter.ts` - Filters reasoning/thinking content from responses

**Backend** (`server/index.js`): Express server proxying to vLLM
- `POST /api/chat` - Streaming chat endpoint (proxies to vLLM)
- `POST /api/summarize` - Conversation summarization
- `GET /api/health` - Health check with model info
- `GET /api/model-metrics` - Prometheus metrics aggregation

## Key Patterns

- **State Management**: React Context API (ChatContext, ProjectContext)
- **Data Persistence**: Dexie (IndexedDB) for offline-first local storage
- **UI Components**: shadcn/ui library in `src/components/ui/`
- **Streaming**: Backend uses AbortController for client disconnect handling

## Environment Variables

Key variables in `.env` (see `.env.example`):
- `VLLM_ENDPOINT` - vLLM API URL
- `VLLM_API_KEY` - API key for vLLM
- `VITE_MODEL_NAME` - Active model name
- `SUMMARY_VLLM_ENDPOINT` - Separate summarization endpoint

## TypeScript Configuration

Non-strict mode is used (`strictNullChecks: false`, `noImplicitAny: false`). Path alias `@/*` maps to `./src/*`.

## Deployment

- Docker Compose orchestrates frontend, backend, and nginx containers
