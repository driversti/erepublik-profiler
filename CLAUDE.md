# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

eRepublik citizen profile scanner. Crawls the full citizen ID range (~10M IDs), stores time-series snapshots, and serves a React dashboard. Full spec in `SPEC.md` (note: SPEC.md is partly aspirational — defer to the code where they disagree, especially around storage).

## Stack

- **Runtime**: Bun (lockfile is `bun.lock`; not Node)
- **Language**: TypeScript (ESM, `"type": "module"`)
- **DB**: PostgreSQL 17 via the `postgres` package (NOT SQLite — SPEC.md is stale on this)
- **HTTP**: `got-scraping` (TLS fingerprint rotation to evade Cloudflare)
- **Frontend**: React 18 + Vite + Tailwind + TanStack Query + Recharts (separate `frontend/` Vite project)
- **VPN**: Gluetun + Surfshark WireGuard, rotated via Gluetun HTTP control API

## Commands

```bash
bun install                    # backend deps
bun test                       # run all tests
bun test tests/scanner/X.test.ts   # run a single test file
bun run scan                   # start scanner worker (polls DB for pending scans)
bun run web                    # start API server (default port 3434, NOT 3000)
bun run dev                    # web server with --watch

# frontend (separate package)
cd frontend && npm install
cd frontend && npm run dev     # Vite on :5173, proxies /api to localhost:3434
cd frontend && npm run build   # output → frontend/dist/ (served by Bun.serve)

./release.sh                   # multi-arch build + push registry.yurii.live/profiler:latest
```

`API_PORT` defaults to `3434` in `src/config.ts` even though docker-compose and README say `3000`. The frontend's Vite proxy hard-codes `3434`. Don't "fix" this without checking both places.

## Architecture

The system is **two long-running processes** that share a Postgres DB. They never call each other directly — coordination is entirely through DB rows.

### Process 1: `bun run web` (API + dashboard)

`src/index.ts` → `src/api/server.ts` → `Bun.serve` on `API_PORT`.

- `src/api/routes.ts` — all REST endpoints, hand-rolled URL matching (no router framework). Serves `frontend/dist/` as static fallback.
- `src/api/process-manager.ts` — `ProcessManager` class is the only way to start/stop/inspect scans. It does NOT spawn processes; it inserts a `scans` row with `status='pending'` and reads progress from DB. The actual scanning happens in the other process.

### Process 2: `bun run scan` (scanner worker)

`src/index.ts` → `src/scanner/worker.ts` → polls every 5s for a `pending` scan to claim, or a stale `running` scan to reclaim (heartbeat-based crash recovery).

Pipeline per scan:
1. `worker.ts` claims the scan (CAS update `pending` → `running`).
2. `scanner.ts` runs the loop: `fetcher.ts` (got-scraping GET) → `parser.ts` (extract typed fields) → DB inserts.
3. Checkpoint every `CHECKPOINT_INTERVAL` IDs (default 100) so a crashed scan resumes from `last_processed_id`.
4. On 403/429/Cloudflare/timeout: exponential backoff with jitter; after 5 retries, rotate VPN via `src/vpn/vpn.ts`; after 3 rotations, log to `failed_citizens` and skip.
5. The custom `Throttle` class in `scanner.ts` applies a slow `COOLDOWN_DELAY_MS` (200ms) for the first 30 requests after each VPN rotation, then drops to `BASE_DELAY_MS` (10ms). Repeated quick blocks lengthen the cooldown — touch this carefully, it's anti-detection tuning.

### Scan types

`scan_type` column drives the loop's source of IDs:
- `full` — iterates `start_id..end_id` linearly.
- `alive` — re-scans only `citizen_id`s whose latest snapshot is `status='alive'` (~20–30K IDs).
- `retry` — re-runs `failed_citizens` rows that were queued via the API.

Scan lifecycle: `pending → running → (finished | failed | cancelling → cancelled)`. `cancelling` is set by `ProcessManager.stop()`; the scan loop checks status periodically and exits cleanly.

### Database

Schema is created at startup in `src/db/database.ts` (idempotent `CREATE TABLE IF NOT EXISTS` — there is no migration tool). Key tables:

- `scans` — one row per scan cycle, owns the lifecycle status.
- `snapshots` — primary data table, ~50 typed columns, one row per citizen per scan. No raw JSON stored.
- `achievements` — normalized medals (`medal_type`, `count`) per citizen per scan.
- `organizations` — org accounts get logged here, not in `snapshots` (orgs are skipped from main data).
- `failed_citizens` — IDs that hit max retries; can be re-queued for a `retry` scan.
- `scan_errors` — per-request error log (status code, retryable flag).
- `checkpoint` — last processed ID, for resume.
- `scan_progress` — live counters (alive/dead/banned/not_found/errors, rate_per_min). Updated less often than `scans.total_scanned`.

Status values in `snapshots.status`: `'alive' | 'dead' | 'banned' | 'not_found'`.

When changing the schema, edit `src/db/database.ts` AND remember the table will already exist on deployed instances — add `ALTER TABLE` statements rather than relying on the `CREATE TABLE` to apply changes.

### Frontend

`frontend/src/` — pages in `pages/`, shared bits in `components/`, API client in `api/client.ts` + TanStack Query hooks in `api/hooks.ts`. Dev server proxies `/api/*` to backend; in prod, Bun.serve serves the built `frontend/dist/` from the same origin.

## Conventions

- **No raw JSON storage** — every API field of interest is a typed column. Adding a new field = parser change + schema change + queries change.
- **Heartbeat-based crash recovery** — don't assume a `running` scan is alive; check `scan_progress.updated_at` (stale after `HEARTBEAT_STALE_MS = 2min`).
- **Telegram is best-effort** — failures are logged, never thrown. Code that calls `telegram.send` shouldn't await-and-rescue; the telegram module already swallows errors.
- **VPN required** — `src/index.ts` calls `vpn.checkIpLeak()` on `scan` startup and exits if the public IP matches `HOME_COUNTRY`. Don't disable this check without a Telegram alert.
- **`Bun.sleep`, `Bun.serve`, `bun:test`** — Bun-specific APIs are used throughout. This codebase will not run on Node.

## Deployment

`docker-compose.yml` runs four containers: `postgres`, `gluetun` (VPN gateway), `profiler-web` and `profiler-scanner` (both `network_mode: "service:gluetun"` so all egress goes through VPN). The web container exposes port 3000 *through Gluetun* — that's why README says 3000 even though the app's default is 3434; in compose the env sets `API_PORT=3000`.

Deploy target: `192.168.10.11` (driversti), stack at `~/Projects/profiler`. Push via `./release.sh`, then `docker compose pull && docker compose up -d` on the host.
