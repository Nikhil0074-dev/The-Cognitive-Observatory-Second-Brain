# The Cognitive Observatory:Second Brain

Search your notes by meaning, see how they connect, and ask questions of your own knowledge. Notes from Markdown, text, PDF (scans too, via OCR), DOCX, images, Notion, GitHub, Google Drive, OneNote, Zotero and Obsidian vaults are chunked, embedded, stored in Qdrant, linked in a Neo4j graph, clustered, and shown as an interactive map (network, clusters, timeline, node map, 3D universe) with a cited assistant on top.

**Status:** the core pipeline (ingest, embed, search, clustering, auth, MFA, audit, erasure) was verified end to end on real Postgres, Redis and Qdrant. Anything needing Neo4j, OpenAI, Notion, GitHub or an Anthropic key has not been run live. See [docs/verification.md](docs/verification.md) for exactly what was and wasn't tested.

A structured project/thesis report draft (requirements status, design, evaluation, a protocol for the retrieval-quality study that has not been done): [docs/REPORT.md](docs/REPORT.md). For presenting the project (demo script, design reasoning, likely questions, how to describe what is unverified): [docs/VIVA.md](docs/VIVA.md).

## Screenshots
- [Network view (demo data)](docs/screenshots/01-network.png)
- [Cluster view with hulls and labels](docs/screenshots/02-cluster.png)
- [Timeline view](docs/screenshots/03-timeline.png)
- [3D Universe](docs/screenshots/11-universe-3d.png)
- [Synaptic pulse on selection](docs/screenshots/05-synaptic-pulse.png)
- [Discovery with evidence](docs/screenshots/06-insight-evidence.png)
- [Ask your notes, cited answer](docs/screenshots/07-ask-assistant.png)
- [Node map (React Flow)](docs/screenshots/20-node-map.png)
- [Links and backlinks in the note panel](docs/screenshots/22-links-backlinks.png)
- [Team workspace management](docs/screenshots/23-team.png)
- [Topics with an emerging theme](docs/screenshots/24-topics.png)
- [Viewer role: controls hidden](docs/screenshots/25-viewer-view.png)
- [Phone-sized layout](docs/screenshots/26-mobile.png)
- [Real backend, no demo data](docs/screenshots/14-real-backend.png)
- [Settings](docs/screenshots/15-settings.png)
- [MFA setup](docs/screenshots/17-mfa-setup.png)

## Quick start
```bash
cp .env.example .env            # set JWT_SECRET, ENCRYPT_KEY (32 chars); EMBED_PROVIDER=openai + OPENAI_API_KEY for real semantic search
docker compose up --build       # postgres, redis, qdrant, neo4j, backend :3000, frontend :8080
./scripts/smoke.sh              # API smoke test against the running stack
RATE_LIMIT_PER_MIN=1000 ...     # (start the API with this, then) ./scripts/smoke-team.sh  # 49 checks: roles, invites, revocation, transfer, deletion
```
Frontend only, with seeded demo data and no backend: `cd frontend && npm install && VITE_DEMO=true npm run dev`.
Tests: `npm install && npm run build && npm test`. `python scripts/a11y-audit.py` checks accessibility (axe-core), keyboard navigation and pinch zoom in the map and the phone layout (the frontend needs Node >= 20.19). `python scripts/bench.py` (indexing + search latency) and `node scripts/bench-layout.mjs` (layout cost per frame) measure performance; results and caveats are in `docs/verification.md`. `.github/workflows/ci.yml` also runs a job with real Postgres, Redis, Qdrant and Neo4j that executes `smoke.sh`, `smoke-team.sh` and `smoke-graph.sh`: push to GitHub to verify the graph features (never run by the author).

With OpenAI embeddings set `EMBED_DIM=3072` (or keep a smaller `dimensions` value) and `GRAPH_THRESHOLD=0.82`. The offline `hash` embedder is lexical only; use `GRAPH_THRESHOLD` around 0.5 with it. After changing model or dimension run `npm run reindex:all`.

**Local embeddings (BGE etc.):** set `EMBED_PROVIDER=openai-compatible` and `EMBED_BASE_URL` to any server exposing `POST /v1/embeddings` (Hugging Face TEI, Ollama, vLLM, llama.cpp). `docker compose --profile local-embeddings up --build` starts a TEI container serving `BAAI/bge-large-en-v1.5`; use `EMBED_DIM=1024` and `EMBED_QUERY_PREFIX="Represent this sentence for searching relevant passages: "`. The client is tested against a mock server; the TEI image and model quality are not.

**Behind a reverse proxy** (compose does this) set `TRUST_PROXY=1` so rate limits and the audit log use the real client IP; leave it unset when the API is exposed directly.

## What it does
- **Ingest:** Markdown/TXT/PDF (poppler `pdftotext`, tesseract OCR for scanned PDFs)/DOCX/image (PNG, JPG, TIFF, WebP; OCR) uploads, Notion, GitHub, Google Drive, OneNote (OAuth, read-only) and Zotero sync, plus Obsidian vault import (.zip, tags and `[[wikilinks]]` become explicit REFERENCES edges) (auto-sync every 6 h, unchanged notes skipped by checksum).
- **Search:** semantic, keyword + semantic hybrid (weighted reciprocal-rank fusion), similar notes, source filters.
- **Graph:** similarity edges in Neo4j, optional LLM contradiction/support edges, k-means and Louvain clusters with generated labels, PageRank sizing, user-accepted connections.
- **Assistant:** retrieval + graph context + citations; gap detection, idea generation and concept extraction (need an Anthropic key); works as an extractive cited fallback without one.
- **Teams:** shared workspaces with owner / editor / viewer roles, invites by email, instant revocation, ownership transfer; the workspace switcher is in the top bar and members are managed in Settings.
- **Topics:** c-TF-IDF keywords per cluster and "emerging topic" detection (recent notes clustering together).
- **Security & privacy:** dependency audit in CI (`npm audit --audit-level=high`); 15-minute JWTs with rotating refresh tokens (reuse detection, sign out everywhere), TOTP MFA with recovery codes, login lockout, encrypted secrets, workspace isolation, audit log without content, full account erasure, helmet and rate limits.

## Configuration
```
DATABASE_URL=postgres://sb:sb@localhost:5432/secondbrain
REDIS_URL=redis://localhost:6379
QDRANT_URL=http://localhost:6333
JWT_SECRET=change-me
ENCRYPT_KEY=0123456789abcdef0123456789abcdef
# EMBED_PROVIDER: openai | hash (offline dev, no key needed)
EMBED_PROVIDER=hash
OPENAI_API_KEY=
EMBED_MODEL=text-embedding-3-large
EMBED_DIM=384
NEO4J_URL=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=secondbrain
# RELATED_TO threshold. 0.82 suits OpenAI embeddings; use ~0.5 with the offline hash embedder.
GRAPH_THRESHOLD=0.82
# Optional: LLM cluster labels + CONTRADICTS/SUPPORTS edges
ANTHROPIC_API_KEY=
LLM_MODEL=claude-haiku-5-5
GRAPH_LLM_EDGES=false
# Set when serving the API to a browser on another origin (comma-separated)
CORS_ORIGIN=
# Auto-sync cadence for connected sources (hours)
SYNC_INTERVAL_HOURS=6
# GitHub Enterprise or a test double
# GITHUB_API_URL=https://api.github.com
# Short-lived access tokens + rotating refresh tokens
ACCESS_TTL_SEC=900
REFRESH_TTL_DAYS=30
# Google Drive (OAuth). Create an OAuth client; add the redirect URI below. Scope used: drive.readonly
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/sources/drive/callback
FRONTEND_URL=http://localhost:8080
# OCR for scanned PDFs and images (tesseract language code, max pages per PDF)
OCR_LANG=eng
OCR_MAX_PAGES=30
# Local embeddings (any OpenAI-compatible /v1/embeddings server). Example for BGE via the compose profile `local-embeddings`:
# EMBED_PROVIDER=openai-compatible
# EMBED_BASE_URL=http://embeddings:80
# EMBED_MODEL=BAAI/bge-large-en-v1.5
# EMBED_DIM=1024
# EMBED_QUERY_PREFIX=Represent this sentence for searching relevant passages: 
# EMBED_API_KEY=
# OneNote (Microsoft Graph OAuth). Register an Entra ID app, redirect URI below, delegated permission Notes.Read
MS_CLIENT_ID=
MS_CLIENT_SECRET=
MS_REDIRECT_URI=http://localhost:3000/api/sources/onenote/callback
MS_TENANT=common
# Per-IP request limit per minute; set TRUST_PROXY=<hops> only when behind a reverse proxy (compose sets 1)
RATE_LIMIT_PER_MIN=100
# TRUST_PROXY=1
```

## Layout
`src/` NestJS API (auth, ingestion, embeddings, search, graph, assistant, audit) · `frontend/src/` React + Vite UI · `db/init.sql` schema · `scripts/smoke.sh` · `docs/` architecture, verification, screenshots · `.github/workflows/ci.yml`

## Not implemented
BERTopic itself (topics use c-TF-IDF on the existing clusters; no UMAP/HDBSCAN), Vault/WAF/Prometheus, real-time collaboration and comments, note authorship (who added what), invite emails (an invite applies when that address registers; nothing is sent). Google Drive, OneNote, Zotero and local embeddings were verified against local mock servers only. The code is compact (~2.5k lines): treat it as a solid foundation, not a finished product.
