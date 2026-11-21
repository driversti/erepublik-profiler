# profiler-old

Single source of truth for every coding agent: `AGENTS.md` and `GEMINI.md` are symlinks to this file.

eRepublik citizen profile scanner (Bun + TypeScript + Postgres). Crawls the full citizen ID range (~10M IDs), stores time-series snapshots, serves a React dashboard. Superseded by `../profiler/` but still deployable.
- Two processes (`web` API+dashboard, `scan` worker) coordinate only through DB rows.
- Spec: `SPEC.md` is partly aspirational (e.g. says SQLite; real DB is Postgres). Defer to the code.

How it fits together (processes, scan pipeline, DB tables, frontend, env vars): [docs/architecture.md](docs/architecture.md).

## Build & test

```bash
bun install                        # backend deps (Bun, not Node)
bun test                           # all tests
bun test tests/scanner/X.test.ts   # one file
bun run scan                       # scanner worker (polls DB for pending scans)
bun run web                        # API + dashboard, default port 3434
bun run dev                        # web with --watch

cd frontend && npm install
npm run dev                        # Vite :5173, proxies /api to localhost:3434
npm run build                      # tsc + vite build -> frontend/dist/ (served by Bun.serve)
```

Local end-to-end: needs Postgres (`DATABASE_URL`), copy `.env.example` to `.env`. `bun run scan` requires a VPN: it exits at startup if the public IP matches `HOME_COUNTRY`.

## Release & deploy

```bash
./release.sh   # builds frontend, multi-arch buildx push to registry.yurii.live/profiler:latest
```

Deploy target: `erepublik@192.168.10.18`, stack at `~/docker/profiler`:
`docker compose pull && docker compose up -d`.
- Stack = `postgres`, `gluetun` (VPN gateway), `profiler-web`, `profiler-scanner`. Web and scanner use `network_mode: "service:gluetun"`; do not recreate `gluetun` or `postgres` needlessly.
- `driversti@192.168.10.11` still runs `profiler-web` + `profiler-postgres` as a read-only archive of an earlier full scan. Never deploy there.
- Not verified from project files (taken from the old CLAUDE.md): the host and stack path.

## Conventions & gotchas

- `API_PORT` defaults to `3434` in `src/config.ts`; compose sets `3000` (published through Gluetun) and the Vite proxy hard-codes `3434`. Don't "fix" without checking all three.
- Bun-only APIs (`Bun.serve`, `Bun.sleep`, `bun:test`); will not run on Node.
- No raw JSON storage: every field is a typed column. New field = parser + schema + queries change.
- No migration tool: `src/db/database.ts` runs `CREATE TABLE IF NOT EXISTS` at startup. For existing deployments add `ALTER TABLE` statements.
- Never assume a `running` scan is alive; check `scan_progress.updated_at` (stale after `HEARTBEAT_STALE_MS` = 2 min).
- Telegram is best-effort: the module swallows errors; don't wrap calls in try/catch.
- Don't disable the VPN IP-leak check (`vpn.checkIpLeak()` at scan startup) without a Telegram alert.
- `Throttle` / cooldown constants in `scanner.ts` are anti-detection tuning; change carefully.
- `docs/superpowers/` is gitignored (local plans/specs).
