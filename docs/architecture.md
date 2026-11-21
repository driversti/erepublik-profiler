# profiler-old Architecture

Reference for how the scanner, API and dashboard fit together. The essentials (build, test, release) live in [`../CLAUDE.md`](../CLAUDE.md). Full spec: [`../SPEC.md`](../SPEC.md) (partly aspirational; defer to the code, especially around storage).

## Stack

- **Runtime**: Bun (lockfile `bun.lock`; not Node). TypeScript, ESM.
- **DB**: PostgreSQL 17 via the `postgres` package (NOT SQLite; SPEC.md is stale on this).
- **HTTP**: `got-scraping` (TLS fingerprint rotation to evade Cloudflare).
- **Frontend**: React 18 + Vite + Tailwind + TanStack Query + Recharts (separate `frontend/` project).
- **VPN**: Gluetun + Surfshark WireGuard, rotated via the Gluetun HTTP control API.

## Two processes, one database

The system is two long-running processes sharing a Postgres DB. They never call each other; coordination is entirely through DB rows.

### Process 1: `bun run web` (API + dashboard)

`src/index.ts` -> `src/api/server.ts` -> `Bun.serve` on `API_PORT`.

- `src/api/routes.ts`: all REST endpoints, hand-rolled URL matching (no router framework). Serves `frontend/dist/` as static fallback.
- `src/api/process-manager.ts`: `ProcessManager` is the only way to start/stop/inspect scans. It does NOT spawn processes; it inserts a `scans` row with `status='pending'` and reads progress from the DB.

### Process 2: `bun run scan` (scanner worker)

`src/index.ts` -> `src/scanner/worker.ts` polls every 5s for a `pending` scan to claim, or a stale `running` scan to reclaim (heartbeat-based crash recovery).

Pipeline per scan:
1. `worker.ts` claims the scan (CAS update `pending` -> `running`).
2. `scanner.ts` runs the loop: `fetcher.ts` (got-scraping GET) -> `parser.ts` (typed fields) -> DB inserts.
3. Checkpoint every `CHECKPOINT_INTERVAL` IDs (default 100) so a crashed scan resumes from `last_processed_id`.
4. On 403/429/Cloudflare/timeout: exponential backoff with jitter; after 5 retries rotate VPN via `src/vpn/vpn.ts`; after 3 rotations log to `failed_citizens` and skip.
5. The `Throttle` class in `scanner.ts` applies a slow `COOLDOWN_DELAY_MS` (200ms) for the first 30 requests after each VPN rotation, then drops to `BASE_DELAY_MS` (10ms). Repeated quick blocks lengthen the cooldown. This is anti-detection tuning; touch carefully.

### Scan types

`scan_type` drives the source of IDs:
- `full`: iterates `start_id..end_id` linearly.
- `alive`: re-scans only `citizen_id`s whose latest snapshot is `status='alive'` (~20-30K IDs).
- `retry`: re-runs `failed_citizens` rows queued via the API.

Lifecycle: `pending -> running -> (finished | failed | cancelling -> cancelled)`. `cancelling` is set by `ProcessManager.stop()`; the scan loop checks status periodically and exits cleanly.

## Database

Schema is created at startup in `src/db/database.ts` (idempotent `CREATE TABLE IF NOT EXISTS`; no migration tool). Tables:

- `scans`: one row per scan cycle, owns lifecycle status.
- `snapshots`: primary data table, ~50 typed columns, one row per citizen per scan. No raw JSON stored.
- `achievements`: normalized medals (`medal_type`, `count`) per citizen per scan.
- `organizations`: org accounts are logged here, not in `snapshots`.
- `failed_citizens`: IDs that hit max retries; can be re-queued for a `retry` scan.
- `scan_errors`: per-request error log (status code, retryable flag).
- `checkpoint`: last processed ID, for resume.
- `scan_progress`: live counters (alive/dead/banned/not_found/errors, rate_per_min). Updated less often than `scans.total_scanned`.

`snapshots.status` values: `'alive' | 'dead' | 'banned' | 'not_found'`.

## Frontend

`frontend/src/`: pages in `pages/`, shared bits in `components/`, API client in `api/client.ts` plus TanStack Query hooks in `api/hooks.ts`. The dev server proxies `/api/*` to `localhost:3434`; in prod `Bun.serve` serves the built `frontend/dist/` from the same origin.

## Environment variables

See `.env.example`. Notable: `POSTGRES_PASSWORD`, `DATABASE_URL`, `API_PORT`, `BASE_DELAY_MS`, `CHECKPOINT_INTERVAL`, `BOT_TOKEN`/`CHAT_ID`/`TOPIC_ID` (Telegram, optional), `HOME_COUNTRY` (IP leak check), `GLUETUN_API_URL`, `WIREGUARD_PRIVATE_KEY`/`WIREGUARD_ADDRESSES`/`SERVER_COUNTRIES` (Surfshark).

## Deployment topology

`docker-compose.yml` runs `postgres`, `gluetun` (VPN gateway), `profiler-web` and `profiler-scanner`. Web and scanner use `network_mode: "service:gluetun"` so all egress goes through the VPN; the web port 3000 is published through Gluetun (compose sets `API_PORT=3000`, while the code default is 3434). The Dockerfile runs `bun run src/index.ts web`; compose overrides `command` per service.
