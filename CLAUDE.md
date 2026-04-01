# Profiler

eRepublik citizen profile scanner. See SPEC.md for full specification.

## Stack
- Runtime: Bun
- Language: TypeScript
- Database: SQLite (bun:sqlite)
- HTTP: got-scraping

## Commands
```bash
bun install                    # install deps
bun test                       # run tests
bun run scan                   # start scanner
bun run api                    # start API server
bun run dev                    # dev mode with watch
```

## Architecture
- `src/config.ts` — env var parsing
- `src/db/` — SQLite schema + queries
- `src/scanner/` — crawl logic, fetcher, parser, retry
- `src/vpn/` — Gluetun VPN rotation
- `src/telegram/` — notifications
- `src/api/` — REST API server
