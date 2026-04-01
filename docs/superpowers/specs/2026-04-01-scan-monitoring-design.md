# Scan Monitoring & Control — Design Spec

**Date:** 2026-04-01  
**Status:** Approved

---

## Overview

Add a dedicated Scan Management page to the profiler UI that lets the user monitor collection progress in real time, start and stop the scanner process, and manually retry citizen IDs that failed after exhausting all retries.

---

## 1. Database

### `failed_citizens` (new table)

Records citizen IDs that could not be collected after all retry attempts are exhausted.

```sql
CREATE TABLE failed_citizens (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id      INTEGER NOT NULL REFERENCES scans(id),
  citizen_id   INTEGER NOT NULL,
  failed_at    TEXT NOT NULL,
  error_message TEXT NOT NULL,
  status_code  INTEGER,
  retry_count  INTEGER NOT NULL,
  retried_at   TEXT
);
```

Indexes: `(scan_id)`, `(citizen_id)`, `(retried_at)` (NULL = not yet retried).

**Relationship to `scan_errors`:**  
`scan_errors` records every individual error attempt. `failed_citizens` records only the final "gave up" verdict after all retries are exhausted. Both tables coexist.

---

## 2. Retry Logic

### Current behaviour
5 backoff steps × up to 3 VPN rotations. No differentiation by error type.

### New behaviour

**5xx errors:** up to 10 retries with extended exponential backoff:
```
[1000, 2000, 4000, 8000, 16000, 30000, 60000, 60000, 60000, 60000] ms
```

**All other retryable errors** (network timeouts, 403, 429): keep existing 5-step backoff `[1s, 2s, 4s, 8s, 16s]`.

**On exhaustion:** insert into `failed_citizens` with `retry_count`, `error_message`, `status_code`, and move to next ID. VPN rotation still triggers after all backoff steps for a given rotation attempt.

### Config changes (`config.ts`)
- `backoffSteps5xx: number[]` — 10-step array above
- `backoffSteps` — existing 5-step array, renamed to `backoffStepsDefault` for clarity

---

## 3. API Endpoints

### Process management

The API server tracks the scanner child process in memory (PID + spawn time). On each status poll, it verifies the PID is still alive to handle unexpected crashes.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/scan/status` | Current scanner state and progress |
| `POST` | `/api/scan/start` | Spawn scanner; 409 if already running |
| `POST` | `/api/scan/stop` | Send SIGTERM; 409 if not running |

**`GET /api/scan/status` response:**
```json
{
  "state": "running",
  "scan_id": 5,
  "start_id": 9730001,
  "end_id": 9740000,
  "current_id": 9735420,
  "progress_pct": 54.2,
  "eta_seconds": 312,
  "rate_per_min": 280,
  "stats": {
    "alive": 3210,
    "dead": 1890,
    "banned": 42,
    "errors": 3,
    "skipped": 8
  }
}
```
When idle: `{ "state": "idle" }`.

**`POST /api/scan/start` request body:**
```json
{ "start_id": 9730001, "end_id": 9740000, "scan_type": "full" }
```

### Failed citizens

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/failed-citizens` | Paginated list (`?scan_id=&limit=&offset=`) |
| `POST` | `/api/failed-citizens/retry` | Re-queue IDs |

**`POST /api/failed-citizens/retry` request body:**
```json
{ "ids": [9731042, 9732105] }
```
or
```json
{ "all": true }
```

Retry spawns a mini-scan over only the listed citizen IDs. It reuses the existing scanner with a temporary range derived from the IDs. Sets `retried_at` on the `failed_citizens` rows.

---

## 4. Frontend — Scan Management Page

**Route:** `/scan`  
**Nav label:** Scan

### Layout

```
┌─ Scan Status ────────────────────────────────────────────┐
│  State: RUNNING   Scan #5   9730001 – 9740000            │
│  Current ID: 9,735,420                                    │
│  ████████████░░░░░░░░  54%   ETA: ~5m   280 IDs/min      │
│  Alive: 3,210  Dead: 1,890  Banned: 42  Errors: 3        │
└──────────────────────────────────────────────────────────┘

┌─ Start New Scan ──────────────────────────────────────────┐
│  Start ID: [__________]  End ID: [__________]             │
│  Type: ● Full  ○ Alive                                    │
│                          [ Start Scan ]  [ Stop Scan ]    │
└──────────────────────────────────────────────────────────┘

┌─ Failed Citizens ─────────────────────────────────────────┐
│  ☐  Citizen ID   Error            Status  Retries  Retried│
│  ☐  9,731,042    Connection reset  —       5        —     │
│  ☐  9,732,105    HTTP 503          503     10       —     │
│                              [ Retry Selected ]           │
└──────────────────────────────────────────────────────────┘
```

### Behaviour

- Status card polls `GET /api/scan/status` every **3 seconds** while `state === "running"`, pauses when idle.
- Start button disabled while running; Stop button disabled while idle.
- Start form validates `start_id < end_id` before submitting.
- Failed citizens table shows only unretried rows by default (toggle to show all).
- Retry Selected re-queues checked IDs and optimistically marks them as retried in the UI.

---

## 5. Out of Scope

- Scheduled/automatic scans (cron)
- Multiple concurrent scans
- Automatic retry of failed citizens
- Authentication/authorization on scan control endpoints
