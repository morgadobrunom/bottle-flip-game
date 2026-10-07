# Bottle Flip

A mobile-first bottle-flip game for Kenyan telco × brand campaigns. Players hold to charge, release to flip, and land upright on the next crate. A miss ends the run — there are no lives and no continue. Verified Safaricom numbers can win data, airtime, coins, and skins.

The playable loop is a **deterministic simulation** shared by the browser and the API. The phone runs it with a canvas renderer. The server replays the same seed and input log and only then awards coins or mission progress.

## What this repo is

| Layer | Role |
| --- | --- |
| `apps/web` | React UI over a persistent canvas. Talks to the API with cookies + a short-lived Bearer token. |
| `apps/api` | Fastify HTTP API, session/OTP auth, run verification, catalog, missions, tokens, rewards. |
| `apps/api` worker | pg-boss jobs: credit data/airtime, close leaderboard windows, expire OTPs and abandoned runs. |
| `packages/engine` | Physics, seeded RNG, replay, canvas drawing. No React. Used on both client and server. |
| `packages/content` | Zod schemas and seed catalog (bottles, backgrounds, missions, campaign). |
| `packages/shared` | Request/response types, Kenyan phone helpers, Nairobi-time windows, item unlock status. |

Original prototype: [`bottle-flip.html`](bottle-flip.html). Keep it as the feel reference; production play goes through `packages/engine`.

## Run locally

You need **four terminals**: Postgres (PGlite), API, worker, and the web app. No Docker.

### 1. Prerequisites

- Node 22+ (`nvm use` reads [`.nvmrc`](.nvmrc))
- pnpm 9.15

```bash
npx pnpm@9.15.0 install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

`apps/api/.env` points at PGlite on port **5432**. If that port is already a real Postgres, change both `DATABASE_URL` in `.env` and `PGPORT` when you start the DB.

### 2. Database (terminal 1)

From the repo root. Leave this running.

```bash
pnpm dev:db
```

You should see:

```
PGlite listening on postgres://postgres@127.0.0.1:5432/postgres
```

First time only, in a **second** terminal, apply schema and seed (prints disposable token codes like `BF-0000-9I`):

```bash
pnpm db:migrate
pnpm db:seed
```

Re-run seed anytime; it upserts catalog and campaign. Tokens already in the DB are left alone.

### 3. API (terminal 2)

```bash
pnpm dev:api
```

Listens on [http://localhost:8080](http://localhost:8080). Check [http://localhost:8080/health](http://localhost:8080/health) → `{"ok":true}`.

OTP codes print here (`SMS_PROVIDER=console`).

### 4. Worker (terminal 3)

Needed to credit data/airtime after a mission claim. Play and leaderboards work without it.

```bash
pnpm dev:worker
```

You should see `[worker] started`.

### 5. Web (terminal 4)

```bash
pnpm dev:web
```

Open [http://localhost:5173](http://localhost:5173). Hold/release (or Space) to flip.

If **5173 is already taken**, start Vite on another port and match CORS:

```bash
# terminal 4
pnpm --filter @bottle-flip/web exec vite --port 5174 --strictPort

# and in apps/api/.env
CORS_ORIGINS=http://localhost:5174,http://127.0.0.1:5174
```

Then restart `pnpm dev:api`.

### What `pnpm dev` does

`pnpm dev` (Turbo) starts **only** the API and the web app in parallel. It does **not** start PGlite or the worker. Use the four commands above.

### Log in and tokens

1. Play anonymously from Home — no phone required.
2. **Log in to win rewards** → `+254` number (e.g. `712345678`) → accept terms → Send code.
3. Copy the 6-digit code from the **API terminal**.
4. Optional token on login, or **Scan token** with a code from `pnpm db:seed`.

### Useful commands

| Command | What |
| --- | --- |
| `pnpm dev:db` | PGlite Postgres (keep running) |
| `pnpm db:migrate` | Apply Drizzle migrations |
| `pnpm db:seed` | Upsert catalog / campaign / print token codes |
| `pnpm dev:api` | Fastify API with reload |
| `pnpm dev:worker` | pg-boss worker with reload |
| `pnpm dev:web` | Vite on 5173 |
| `pnpm test` | Engine, content, shared, API (in-process PGlite) |
| `pnpm typecheck` | `tsc` across workspaces |
| `pnpm build` | Production API + web bundles |

Stop everything with Ctrl+C in each terminal. PGlite data stays in `apps/api/.pglite`.

---

## Architecture

```
phone browser
    │
    ├─ Cloudflare Pages (planned) ── apps/web
    │                                    │ HTTPS JSON + cookie
    └────────────────────────────────────┼──────────────────► apps/api (Fastify)
                                         │                        │
                                         │                        ├─ Postgres
                                         │                        └─ enqueue jobs
                                         │
                                    worker ── credit provider, SMS
```

Hosting in the product design is Cloudflare Pages (web), Fly.io `jnb` (api + worker), managed Postgres, Sentry. Those deploy files are not in the repo yet.

---

## Packages

### `packages/engine` — the game

The simulation is the source of truth. One `Sim(seed)` produces platforms, charge, flight, landing, and death. The browser and the API must get **bit-identical** results from the same seed and `{ tick, type: 'down' | 'up' }` log.

**Why extra care is needed**

- `Math.random()` is not replayable. Gameplay RNG is [mulberry32](packages/engine/src/rng.ts) seeded per run. Particles and stars on the canvas use a separate, non-gameplay `Math.random()`.
- `Math.sin` is not specified bit-for-bit across V8 and JavaScriptCore. Moving platforms use a polynomial [`dsin`](packages/engine/src/dmath.ts) built from `+ - * / Math.round`.
- The loop is a **fixed timestep** of `1/120` s (`STEP`). Rendering interpolates between ticks. Charge power is “how many ticks the pointer was down”, so replay does not depend on wall-clock frame rate.

**`Sim` states** (`packages/engine/src/sim.ts`)

| State | Meaning |
| --- | --- |
| `idle` | Bottle is standing. A press starts charging. |
| `charge` | Power follows a triangle wave over 0.85 s (0 → 1 → 0). |
| `fly` | Gravity, spin, and a landing check on the tick the bottle crosses `y = 0`. |
| `settle` | Short pause after a landing before the next throw. |
| `dead` | Miss. The run is over. Extra ticks only animate the fall. |

Landing: if the bottle’s x is inside a crate, it is a **perfect** (center 34%), **ok**, **edge**, or **lip** (just off the crate — it tips). Missing the crate entirely is **gap** (overshot) or **short**. A lip/gap/short ends the run. Landing on the crate you already occupy does not add a flip.

Difficulty grows with flips: crates get narrower, gaps get wider, and some later crates drift using `dsin`.

**Replay** (`packages/engine/src/replay.ts`) re-applies inputs on the matching ticks, requires a miss to finish, and rejects unordered logs, input after death, runs that never miss, and runs that exceed 30 minutes of sim time.

**Renderer** (`packages/engine/src/render.ts`) draws sky, crates, bottle, particles. Colors come from a catalog `Theme` (`bottle` + `background`), not hardcoded skins. Camera follows the bottle; ground is a fraction of canvas height.

### `packages/content` — campaign data as code

Schemas live in `src/schemas.ts`. Seed data in `src/seed.ts` is upserted into Postgres so a new brand activation is a data change, not a UI rewrite.

**Unlocks**

- `default` — everyone has it (Classic bottle, Night soda background).
- `coins` — buy with in-game coins.
- `level` — `level = 1 + floor(lifetimeFlips / 10)`.
- `sponsored` — granted when the named mission is claimed (brand can + brand bar unlock with the weekly data drop).

**Economy** (`src/rules.ts`)

- Coins for a run: `flips + 2 × perfects`. The API computes this after replay, never trusts the client.
- External rewards (`data`, `airtime`) carry a `costKes` used to debit the campaign budget.
- Coins and item rewards do not spend the KES budget.

**Seed campaign `launch`**

- Brand placeholder `[BRAND]`, Africa/Nairobi, KES 250,000 budget, 100 MB daily data cap per player.
- Weekly drop: play 5 games + redeem a bottle token + verify phone → 100 MB.
- Daily / achievement / streak missions grant coins or the Neon bottle.

### `packages/shared` — contract between web and API

- `api.ts` — Zod bodies (`OtpVerifyBody`, `RunSubmitBody`, …) and TypeScript response types (`PlayerView`, `MeResponse`, …). Phone numbers never leave the API unmasked.
- `phone.ts` — Kenyan numbers to `+254…`; UI mask `+254 7•• ••• 312`.
- `periods.ts` — daily / ISO-week / monthly windows in a named timezone. Keys look like `2026-10-06`, `2026-W41`, `2026-10`. `once` is the whole timeline.
- `items.ts` — given owned ids, level, and equipped id, returns `equipped | owned | buy | level | sponsored`.

---

## API (`apps/api`)

Fastify 5, Drizzle, `pg`, jose JWTs, pg-boss. Two Node processes from the same codebase:

- `src/server.ts` — HTTP, starts a pg-boss client so it can **enqueue** jobs.
- `src/worker.ts` — **consumes** those jobs and schedules close-windows / cleanup.

### Auth

1. **Anonymous.** `POST /sessions/device` creates a player + device + session. The web app does this on first load so play never waits on a phone number.
2. **Access token.** JWT HS256, 15 minutes, claims `sub` (player id), `sid` (session), `ver` (verified). Sent as `Authorization: Bearer`.
3. **Refresh.** Opaque token, stored as SHA-256, httpOnly cookie `bf_refresh` on path `/auth`, 90 days, rotated on each use (`POST /auth/refresh`).
4. **OTP.** `POST /auth/otp/request` then `POST /auth/otp/verify`. Codes are HMAC’d with `OTP_PEPPER` (not stored in plaintext). 5 minute TTL, 5 attempts, 45 s resend gap, rate limits per phone and IP. On success the anonymous player is **merged** into the phone-owned player (coins, items, runs move over). Optional bottle token is redeemed in the same verify call. Consent (terms + optional brand SMS) is written with a copy version for Kenya DPA.

Merged-away players get 401 if something still holds their old id.

### Run verification

```
POST /runs/start  →  { runId, seed }
  client plays, records inputs
POST /runs/:id/submit  { inputs, claimed: { flips, perfects, endTick } }
  replay(seed, inputs)
  claimed must match
  wall-clock must not be wildly faster than simulated time
  then coins and stats are written
```

Rejects: expired TTL (default 40 min), already submitted, replay error, claimed mismatch, `too_fast` (`elapsed < played × 0.85 − 3s`). Anonymous runs are verified too so coins survive later OTP merge. Max 20 starts per player per minute.

### Other routes

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/health` | `SELECT 1` |
| GET/PATCH | `/me` | Player + campaign; nickname, equipped skins, sound |
| GET | `/catalog` | Bottles/backgrounds with unlock status and coin balance |
| POST | `/items/:id/buy` | Coin purchase in a transaction with a row lock |
| GET | `/leaderboard?period=` | Daily/weekly/monthly; **verified players with flips > 0 only** |
| GET | `/missions` | Progress for the current window |
| POST | `/missions/:id/claim` | Grants coins/item immediately; data/airtime via a job |
| GET | `/tokens/:code` | Validity, remaining tokens this week |
| POST | `/tokens/:code/redeem` | Verified players only |
| GET | `/rewards/:id` | Status for the “you won” screen (polls until credited/failed) |
| POST | `/auth/logout` | Revoke session, clear cookie |

### Budget and caps

Issuing a data/airtime reward **locks the campaign row** (`SELECT … FOR UPDATE`), checks `spentKes + cost ≤ rewardBudgetKes`, and for mission data also checks the player’s **daily MB cap**. `source_ref` is unique per player so double-claim is impossible. A failed credit **refunds** the KES spend.

### Jobs (`src/jobs`, `src/worker.ts`)

| Job | When | Effect |
| --- | --- | --- |
| `credit-reward` | After a mission/leaderboard claim that pays data or airtime | Call credit provider (stub today). Retry up to 6 times with backoff. SMS on success. Refund budget on final failure. |
| `close-leaderboard-windows` | Cron `5 * * * *` Africa/Nairobi | Snapshot each just-closed window once; issue prize-band rewards inside savepoints |
| `cleanup` | Every 15 minutes | Drop old OTPs, mark abandoned runs, prune expired sessions and events > 400 days, requeue stuck rewards |

SMS: `console` (prints the OTP, used locally) or Africa’s Talking. Credit: `stub` until a Safaricom partner API is wired.

### Database (`src/db/schema.ts`)

| Table | Purpose |
| --- | --- |
| `players` | Coins, best/lifetime flips, equipped skins, `verified_at`, `merged_into` |
| `devices` / `sessions` / `otp_requests` | Auth |
| `campaigns` | Brand, dates, timezone, budget, `spent_kes`, prize bands |
| `catalog_items` / `player_items` | Skins and ownership |
| `runs` | Seed, input log, verified stats, status `started \| verified \| rejected \| abandoned` |
| `tokens` | Printed under-cap codes |
| `missions` / `mission_progress` | Rules JSON + claim per `(player, mission, period_key)` |
| `rewards` | Pending → processing → credited/failed |
| `leaderboard_windows` | Closed-window snapshots |
| `consents` | Brand marketing opt-in with copy version |
| `events` | Append-only analytics for later brand reporting |

Migrations: `apps/api/drizzle/`. Local Postgres without Docker is PGlite behind the wire protocol (`scripts/dev-db.ts`). Tests use in-process PGlite.

---

## Web (`apps/web`)

React 19, React Router 7, TanStack Query 5, Vite. One **full-screen canvas** lives in the layout (`GameStage`). Routes are overlays (`Home`, `Play`, sheets). The idle bottle on Home is the real sim in attract mode, not a screenshot.

| Route | Screen |
| --- | --- |
| `/` | Title, brand slot, PLAY, login/rewards, Customize, Scan token |
| `/play` | `POST /runs/start`, HUD, pause (leave abandons), submit on miss, game-over card |
| `/customize` | Mini preview canvas; buy / equip / lock toasts |
| `/t`, `/t/:code` | Token entry and landing (QR deep link) |
| `/login`, `/login/verify` | `+254` + consents, then 6-digit OTP |
| `/rewards/leaderboard`, `/rewards/missions` | Period pills, prizes, sticky “you”; weekly drop + claim |
| `/rewards/won/:id` | Polls reward status, Share |
| `/settings` | Sound, nickname, verify / log out |
| `/terms`, `/privacy` | Placeholder legal copy |

**Session** (`src/api/client.ts`, `session.tsx`): in-memory access token; bootstrap tries refresh cookie then device session. `localStorage` caches `/me` and equipped theme for a fast first paint. Offline play is practice only — submit needs the network.

**Input:** window-level pointer and Space. Clicks on `button, a, input, …, [data-no-flip]` do not flip. Hidden tab auto-pauses.

---

## Environment variables

Copy `apps/api/.env.example` → `apps/api/.env` and `apps/web/.env.example` → `apps/web/.env`. See [Run locally](#run-locally) for the four terminals.

| Variable | Default / notes |
| --- | --- |
| `DATABASE_URL` | Must match PGlite: `postgres://postgres@127.0.0.1:5432/postgres` |
| `PGPORT` | PGlite listen port (`5432`) |
| `PORT` / `HOST` | API `8080` / `0.0.0.0` |
| `JWT_SECRET` | Dev default rejected in staging/production |
| `OTP_PEPPER` | Same |
| `CORS_ORIGINS` | `http://localhost:5173` (comma-separated) |
| `COOKIE_SECURE` | Must be true in staging/production |
| `CAMPAIGN_ID` | `launch` |
| `SMS_PROVIDER` | `console` \| `africastalking` |
| `CREDIT_PROVIDER` | `stub` |
| `RUN_TTL_MINUTES` | `40` |
| `SENTRY_DSN` | Optional |
| `VITE_API_URL` | Web → API, default `http://localhost:8080` |
| `VITE_SENTRY_DSN` / `VITE_SENTRY_ENVIRONMENT` | Optional |
| `VITE_E2E=1` | Exposes `window.__bf` for scripted play tests |

---

## File map

```
apps/api/src/
  server.ts          HTTP process: pool, pg-boss, listen, graceful shutdown
  worker.ts          Job process: credit, close windows, cleanup + cron
  app.ts             Fastify plugins, Bearer hook, error mapping, /health
  config.ts          Zod-parsed env
  instrument.ts      Sentry (must load first)
  auth/tokens.ts     JWT, refresh hash, OTP HMAC
  db/schema.ts       Drizzle tables
  db/client.ts       pg Pool + drizzle
  db/seed-content.ts Upsert catalog/campaign/missions/dev tokens
  routes/            Thin HTTP → services
  services/          Auth, players, runs, catalog, missions, rewards, tokens, leaderboard
  jobs/              Worker implementations
  providers/         SMS + credit adapters
  queue.ts           pg-boss wrapper + in-memory queue for tests

apps/web/src/
  main.tsx           Router + providers
  api/               Fetch client, Query hooks, session bootstrap
  game/              GameController, GameStage, theme, SFX
  routes/            One file per screen
  state/cache.ts     localStorage / sessionStorage
  styles.css         Wireframe palette (night, soda, mint, …)

packages/engine/src/ sim, replay, render, rng, dmath
packages/content/src/ schemas, rules, seed
packages/shared/src/  api, phone, periods, items
```

## Product rules (short)

- A miss ends the run. No lives.
- Coins only after server replay.
- Leaderboards: verified + flips > 0, best run in the Nairobi window.
- Rewards only to a verified `+254` line; UI always shows a mask.
- Campaign cannot overspend: row lock + unique `source_ref`.
- Anonymous play is first-class; login is for ranking and data/airtime.
