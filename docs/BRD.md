# Fitness Intelligence Platform
## Business Requirements Document & Developer Specification

| Field | Value |
|---|---|
| Document ID | FIP-BRD-001 |
| Version | **0.1 — FROZEN** |
| Status | Frozen baseline. Feature scope is closed. Changes require a new version or an ADR. |
| Date | 2026-08-31 |
| Owner | Product Owner (TBD) |
| Audience | Product, Engineering, and AI coding agents (Claude Code) |
| Supersedes | Dictated BRD v0 outline; BRD v0.1 draft |
| Next artefact | Milestone 0 — Technical Foundation (see §18) |

> **How to read this document.** Sections 1–7 are the business requirements (the *what* and *why*). Sections 8–16 are the developer specification (the *how*), written to be consumable directly by Claude Code as a build contract. Section 17 lists decisions that must still be made.
>
> **This document is frozen at v0.1.** It is deliberately a baseline, not a living feature backlog. New features go to the PRD; new technical decisions go to `docs/adr/`. The goal is a document that stays readable and gets read — not a 400-page artefact everyone is afraid to touch.

---

## Table of Contents

**Business requirements**
1. [Executive Summary](#1-executive-summary)
2. [Vision, Problem, Solution](#2-vision-problem-solution)
3. [Scope](#3-scope)
4. [Users & Personas](#4-users--personas)
5. [User Journeys](#5-user-journeys)
6. [Functional Requirements](#6-functional-requirements)
7. [Non-Functional Requirements](#7-non-functional-requirements)

**Developer specification**

8. [System Architecture](#8-system-architecture)
9. [Data Model](#9-data-model)
10. [API Specification](#10-api-specification)
11. [Deployment & Infrastructure](#11-deployment--infrastructure)
12. [CORS, Origins & Environment Configuration](#12-cors-origins--environment-configuration)
13. [Platform & Browser Support Matrix](#13-platform--browser-support-matrix)
14. [Repository & Build Conventions](#14-repository--build-conventions)
15. [Roadmap & Milestones](#15-roadmap--milestones)
16. [Claude Code Build Guide](#16-claude-code-build-guide)

**Governance**

17. [Open Questions & Assumptions](#17-open-questions--assumptions)
18. [Risks](#18-risks)
19. [Success Criteria](#19-success-criteria)

---

## 1. Executive Summary

**Product.** A cross-platform fitness tracking and intelligence application, inspired in structure and interaction model by Hevy. The primary focus is fast, reliable **workout logging on Android**, with **full feature parity on web**, built on a foundation that can later support **AI advisory features** and **computer vision (CV) movement analysis**.

**Why now.** Logging apps are commoditised; guidance is not. The differentiator is not the log — it is what the platform tells the user about the log, and eventually what it sees in the user's movement.

**Strategy.** Ship the logging loop first and make it excellent. AI is advisory-only at launch and must never block or gate the core loop. CV is deferred to a separate Python service and is explicitly out of scope for v1.

**Cost posture.** The v1 stack is chosen to run inside free or near-free tiers (Neon Postgres, Cloudflare R2, Expo EAS free builds). This is a deliberate constraint and a named risk (§18).

**Definition of v1 success.** A user can install the Android app or open the web app, create an account, find an exercise, build a routine, log a workout with sets and reps, and see their progress on that exercise over time — with no data loss and no dead ends. This is referred to throughout as the **golden path**.

---

## 2. Vision, Problem, Solution

### 2.1 Vision
Evolve from a simple workout logger into a personalised training assistant. The log becomes the substrate; AI insight and computer vision become the value layer on top of it. Core logging remains reliable, fast, and free.

### 2.2 Problem Statement
Traditional trackers are passive record-keepers. Specifically:

- **P1 — No guidance.** The app records that the user did 3×8 at 80 kg but never says whether that was appropriate, whether to progress, or whether they are stalling.
- **P2 — No movement feedback.** Form is invisible to the app. Users with no coach have no correction loop, which limits progress and increases injury risk.
- **P3 — Friction in logging.** Logging mid-set competes with rest timing and attention. Slow or fiddly logging causes abandonment.
- **P4 — Data without meaning.** History exists but is not surfaced as trends, records, or decisions.

### 2.3 Solution
| Layer | Addresses | Phase |
|---|---|---|
| Structured exercise library with muscle & equipment taxonomy | P4 | 1 |
| Fast workout logging (routines, sets, reps, weight, rest timer) | P3 | 2 |
| History, progress charts, personal records | P4 | 2 |
| AI advisory insights (progression suggestions, plateau detection, summaries) | P1 | 4 |
| Computer vision form analysis (video upload → rep/form feedback) | P2 | 5 |

---

## 3. Scope

### 3.1 In Scope — v1
- Email/password authentication with session management
- User profile: display name, units (kg/lb), bodyweight, experience level, avatar
- Exercise library: system-seeded catalogue + user-created custom exercises
- Muscle taxonomy: muscle groups → muscles, with primary/secondary mapping per exercise
- Equipment taxonomy
- Routines (reusable workout templates) with ordered exercises and target sets
- Live workout session logging: sets, reps, weight, RPE, rest timer, notes
- Workout history with detail view
- Per-exercise progress: volume, estimated 1RM, best set over time
- Personal records (PRs) detection and display
- Android app (Expo) and responsive web app from a shared codebase

### 3.2 In Scope — Later Phases
- AI advisory insights (Phase 4) — **advisory only**, never authoritative, never blocking
- Computer vision form analysis via a separate Python service (Phase 5)
- Video upload to Cloudflare R2 with signed URLs

### 3.3 Explicitly Out of Scope for v1
- iOS build and App Store submission (architecture must not preclude it)
- Social features: following, sharing, feeds, comments, leaderboards
- Nutrition, calorie, or macro tracking
- Wearable / Health Connect / Apple Health integration
- Payments, subscriptions, or paywalls
- Coach or multi-user/team accounts
- Offline-first *conflict resolution* across multiple devices (see §17 Q3)
- Real-time / live CV during a set (video is post-hoc upload only)
- Public-facing admin UI (an internal protected API is sufficient — see §6.9)

### 3.3.1 Deliberately Excluded Technology (v0/v1)

The architecture is **microservice-ready, not microservice-shaped**. The following are excluded by decision, not oversight, and adding any of them requires an ADR:

| Excluded | Why not yet | What we use instead |
|---|---|---|
| Docker / Kubernetes | No orchestration need at one API + one DB | Native Render builds |
| Redis | No cache-pressure or session-store problem yet | Postgres + HTTP cache headers |
| Kafka / event bus | No cross-service eventing in v1 | Direct HTTP; DB-backed job rows for CV |
| Elasticsearch | 500-row exercise library | Postgres `pg_trgm` |
| GraphQL | Single known client | REST with typed client |
| Microservice split of the Node API | Premature boundary cost | One deployable, clean internal modules |
| Third-party analytics / product telemetry | Privacy decision unmade (§17 Q9) | Structured logs only |
| Social features | Not the product thesis | — |

The Node API stays a single deployable service with clean module boundaries. The Python CV service becomes the first genuinely separate service in Phase 5 — deliberately, so the team experiences a real service boundary once rather than nine imagined ones up front.

### 3.4 Non-Goals
The product does not aim to be a general health platform, a social network, or a medical device. It does not diagnose, and it does not prescribe rehabilitation.

---

## 4. Users & Personas

| ID | Persona | Description | Primary Need | Success Signal |
|---|---|---|---|---|
| U1 | **Beginner** | New to structured training, uncertain about exercise selection and form | Templates, clear exercise info, reassurance | Completes 3 workouts in first 2 weeks |
| U2 | **Intermediate** | Trains consistently, follows a program, wants progression | Fast logging, PR tracking, volume trends | Logs ≥80% of planned sessions/month |
| U3 | **Advanced** | Periodised training, high data literacy | Granular data (RPE, tempo), export, no friction | Uses RPE and reviews progress weekly |
| U4 | **Data / AI curious** | Attracted by insights and CV, may be less consistent trainer | Insight quality, novelty, transparency | Engages with insight cards; uploads a form video (Phase 5) |

**Design tension to manage.** U1 needs guardrails and defaults; U3 needs speed and zero hand-holding. Resolution: defaults optimised for U1, with every default overrideable in ≤2 taps and no mandatory wizards after onboarding.

---

## 5. User Journeys

### J1 — Onboarding to Exercise Discovery
1. Land on app → sign up (email + password) or sign in
2. Minimal profile: display name, units, experience level (all skippable except units)
3. Land on Home; empty state offers "Browse exercises" and "Create your first routine"
4. Browse/search exercise library; filter by muscle group, muscle, equipment
5. Open exercise detail: description, primary/secondary muscles, equipment, instructions

**Acceptance:** a new account reaches an exercise detail page in ≤5 interactions from first launch.

### J2 — Workout Creation & Logging
1. Create routine → name it → add exercises (search, multi-select, reorder)
2. Set target sets/reps per exercise (optional)
3. Start workout → from a routine, or empty ("freestyle")
4. Log each set: weight, reps, optional RPE; mark set complete
5. Rest timer auto-starts on set completion; user can skip or adjust
6. Add/remove exercises and sets mid-session
7. Finish workout → summary (duration, total volume, PRs hit) → saved to history

**Acceptance:** logging a single set requires ≤3 taps with prefilled values from the previous set or session.

### J3 — Progress Review
1. History tab: reverse-chronological workout list
2. Open a past workout → full set detail; option to repeat as routine
3. Exercise progress view: chart of best set / estimated 1RM / total volume over time
4. PR list per exercise and overall

**Acceptance:** from Home, a user sees their bench press trend in ≤3 interactions.

### J4 — AI Coach (Phase 4, future)
1. After finishing a workout, an insight card may appear (e.g. plateau flagged, progression suggestion)
2. User can open the insight for reasoning, dismiss it, or mark it unhelpful
3. Insights are labelled as suggestions, are never auto-applied, and never block navigation

### J5 — Computer Vision Analysis (Phase 5, future)
1. User records or uploads a video of a set
2. Video uploads to R2; analysis job is queued to the Python service
3. Asynchronous result: rep count, tempo, and flagged form observations with confidence
4. Explicit disclaimer: informational only, not medical or coaching advice

---

## 6. Functional Requirements

Priority: **M** = Must (v1), **S** = Should (v1 if capacity), **C** = Could (post-v1).

### 6.1 Authentication & Profile

| ID | Requirement | Priority |
|---|---|---|
| FR-AUTH-01 | User can register with email and password; email must be unique and format-validated | M |
| FR-AUTH-02 | Passwords stored using a memory-hard hash (argon2id); never logged or returned | M |
| FR-AUTH-03 | Login returns a short-lived access token (15 min) and a long-lived refresh token (30 d) | M |
| FR-AUTH-04 | Refresh rotation: using a refresh token invalidates it and issues a new one | M |
| FR-AUTH-05 | User can log out, invalidating the current refresh token | M |
| FR-AUTH-06 | Password reset via emailed single-use token, valid 60 min | S |
| FR-AUTH-07 | User can edit profile: display name, units (kg/lb), bodyweight, experience level, avatar | M |
| FR-AUTH-08 | Avatar uploads go to R2; only the object key is stored in Postgres | S |
| FR-AUTH-09 | User can export all their data as JSON | S |
| FR-AUTH-10 | User can delete their account; all owned rows and R2 objects are removed within 30 days | M |

### 6.2 Exercise Library & Taxonomy

| ID | Requirement | Priority |
|---|---|---|
| FR-EX-01 | System ships a seeded catalogue of ≥150 exercises | M |
| FR-EX-02 | Each exercise has: name, slug, description, instructions, equipment, movement pattern, is_unilateral flag | M |
| FR-EX-03 | Muscle taxonomy is two-level: muscle group (e.g. Back) → muscle (e.g. Latissimus Dorsi) | M |
| FR-EX-04 | Each exercise maps to ≥1 primary muscle and 0..n secondary muscles | M |
| FR-EX-05 | User can search exercises by name (case-insensitive, partial match, trigram-backed) | M |
| FR-EX-06 | User can filter by muscle group, muscle, and equipment, combinable | M |
| FR-EX-07 | User can create, edit, and archive custom exercises visible only to them | M |
| FR-EX-08 | Custom exercises use the same taxonomy as system exercises | M |
| FR-EX-09 | Exercises are archived (soft-deleted), never hard-deleted, if referenced by any workout | M |
| FR-EX-10 | Exercise may carry one or more media assets, always via `exercise_media` → `media_assets` with recorded provenance (§6.8). Never a bare URL or R2 key | S |

### 6.3 Routines (Templates)

| ID | Requirement | Priority |
|---|---|---|
| FR-RT-01 | User can create a named routine with an ordered list of exercises | M |
| FR-RT-02 | User can specify target set count, target rep range, and target weight per exercise | S |
| FR-RT-03 | User can reorder, add, and remove exercises within a routine | M |
| FR-RT-04 | User can duplicate a routine | S |
| FR-RT-05 | User can archive a routine without affecting historical workouts derived from it | M |
| FR-RT-06 | Routines support supersets/groups | C |

### 6.4 Workout Logging

| ID | Requirement | Priority |
|---|---|---|
| FR-WK-01 | User can start a workout from a routine (prefilled) or empty | M |
| FR-WK-02 | Only one workout may be in progress per user at a time | M |
| FR-WK-03 | An in-progress workout survives app kill, device restart, and network loss | M |
| FR-WK-04 | User logs per set: weight, reps, optional RPE (1–10, 0.5 steps), optional notes | M |
| FR-WK-05 | Set types supported: normal, warmup, failure, drop set | S |
| FR-WK-06 | New set fields prefill from the previous set, else from the last session for that exercise, else from routine target | M |
| FR-WK-07 | Completing a set starts a rest timer; duration is per-exercise configurable with a global default | M |
| FR-WK-08 | Rest timer fires a local notification when the app is backgrounded (Android) | S |
| FR-WK-09 | User can add/remove exercises and sets mid-workout | M |
| FR-WK-10 | User can finish a workout, producing duration, total volume, set count, and PRs hit | M |
| FR-WK-11 | User can discard an in-progress workout with explicit confirmation | M |
| FR-WK-12 | Weight is stored canonically in kilograms; display converts per user unit preference | M |

### 6.5 History & Progress

| ID | Requirement | Priority |
|---|---|---|
| FR-HP-01 | History lists completed workouts newest-first with cursor pagination | M |
| FR-HP-02 | Workout detail shows every exercise and set as logged | M |
| FR-HP-03 | User can convert a past workout into a new routine | S |
| FR-HP-04 | Per-exercise progress chart with selectable metric: best set weight, estimated 1RM, total volume, total reps | M |
| FR-HP-05 | Estimated 1RM uses Epley: `1RM = w × (1 + r/30)`; formula name displayed | M |
| FR-HP-06 | PRs detected and persisted on workout completion: heaviest weight, best estimated 1RM, best volume-per-set | M |
| FR-HP-07 | Dashboard shows workouts this week, current streak, and 7/30-day volume | S |
| FR-HP-08 | Body measurement logging (bodyweight over time at minimum) | C |

### 6.6 AI Advisory (Phase 4)

| ID | Requirement | Priority |
|---|---|---|
| FR-AI-01 | AI features are advisory only; they never modify user data without explicit confirmation | M (phase 4) |
| FR-AI-02 | Every AI output is visibly labelled as AI-generated | M (phase 4) |
| FR-AI-03 | AI failure or timeout degrades silently; the core loop is unaffected | M (phase 4) |
| FR-AI-04 | Insight types: plateau detection, progression suggestion, volume imbalance, session summary | S (phase 4) |
| FR-AI-05 | Insights are cached and rate-limited per user per day | M (phase 4) |
| FR-AI-06 | User can disable AI features entirely in settings | M (phase 4) |
| FR-AI-07 | User data sent to any third-party model provider requires explicit opt-in consent | M (phase 4) |
| FR-AI-08 | AI output is never persisted as, or promoted to, training data of record. Insights live only in `ai_insights` and never write to `workouts`, `workout_sets`, `personal_records`, or `routines` | M (phase 4) |
| FR-AI-09 | All numbers quoted in an insight are computed deterministically by `packages/domain` and passed to the model as context. The model phrases; it does not calculate | M (phase 4) |
| FR-AI-10 | A global kill switch disables all AI generation via configuration, without a deploy | M (phase 4) |

### 6.7 Computer Vision (Phase 5)

| ID | Requirement | Priority |
|---|---|---|
| FR-CV-01 | User can upload a video (≤60 s, ≤100 MB) against a workout exercise | C |
| FR-CV-02 | Upload uses a presigned R2 PUT URL; the API never proxies video bytes | C |
| FR-CV-03 | Analysis is asynchronous with states: queued, processing, complete, failed | C |
| FR-CV-04 | Output includes rep count, per-rep tempo, and form observations with confidence scores | C |
| FR-CV-05 | Every CV output carries a non-medical, non-diagnostic disclaimer | C |
| FR-CV-06 | User can delete a video and its analysis at any time; deletion propagates to R2 | C |
| FR-CV-07 | CV output is phrased as **observation**, never diagnosis, and never definitive risk language (no "your form is dangerous") | C |
| FR-CV-08 | Every observation carries a confidence score; observations below the configured threshold are suppressed, not shown weakly | C |
| FR-CV-09 | When overall confidence is insufficient, the result is explicitly **"unable to determine"** — never a guess | C |
| FR-CV-10 | CV must not infer injury, pain, or pathology, and must not prescribe rehabilitation or corrective programming | C |
| FR-CV-11 | Phase 5 launch supports a deliberately narrow exercise set (initially back squat, barbell bench press, conventional deadlift). Unsupported movements return "not supported", not a low-quality analysis | C |
| FR-CV-12 | Video is retained only as long as the user keeps the analysis; no silent retention for model improvement without separate opt-in | C |

### 6.8 Media Provenance & Licensing

Exercise media (images, GIFs, demonstration video) is central to the product's usefulness and is the single largest legal exposure in the codebase. "Find a public video and display it" is not an acceptable implementation. Every media asset must be traceable to a source and a licence before it is rendered.

| ID | Requirement | Priority |
|---|---|---|
| FR-MED-01 | Every media asset is a row in `media_assets`; media may not be referenced by URL string anywhere else in the schema or client | M |
| FR-MED-02 | Each asset records: source URL, source/provider name, licence identifier, licence URL, attribution text, copyright status, media type, and the date provenance was verified | M |
| FR-MED-03 | Permitted licence statuses are an explicit allowlist: `public_domain`, `cc0`, `cc_by`, `cc_by_sa`, `licensed_commercial`, `original_work`. Anything else, including `unknown`, is not renderable | M |
| FR-MED-04 | Assets requiring attribution render visible attribution adjacent to the media, on both Android and web. Attribution is not hidden behind a tap | M |
| FR-MED-05 | Delivery mode is explicit per asset: `r2_copy` (mirrored into our bucket) or `external_embed` (hotlinked/embedded at source). A copy is only made where the licence permits redistribution | M |
| FR-MED-06 | `external_embed` assets are health-checked on a schedule; a failing asset is marked `broken` and stops rendering | S |
| FR-MED-07 | Every exercise has a deterministic fallback when media is missing, broken, or unlicensed: a static illustrative placeholder plus the text instructions. Media absence must never produce an empty or broken UI | M |
| FR-MED-08 | A takedown mechanism exists: an admin can mark an asset `removed` and it stops being served within one request cycle, without a deploy and without breaking any exercise page | M |
| FR-MED-09 | Provenance fields are immutable once verified except through an admin action that records who changed them and when | S |
| FR-MED-10 | The seeded v1 library ships with `original_work` or public-domain/CC media only. Any commercially licensed media requires a recorded licence reference before merge | M |

**Rule of thumb for implementation:** if a developer or an agent cannot state the licence of an asset from the database row alone, that asset is not shippable.

### 6.9 Admin & Content Management

The seeded 150 exercises must not be effectively frozen inside a migration. Taxonomy and content need a maintenance path from day one — but a full admin UI is not warranted in v0.

| ID | Requirement | Priority |
|---|---|---|
| FR-ADM-01 | `users.is_admin` gates a protected `/admin` API namespace; admin routes are refused for non-admin tokens and are not discoverable from the client build | M |
| FR-ADM-02 | Admin can create, update, and archive system exercises (`user_id IS NULL`) | M |
| FR-ADM-03 | Admin can manage the taxonomy: muscle groups, muscles, equipment | M |
| FR-ADM-04 | Admin can edit exercise descriptions, instructions, and muscle role mappings | M |
| FR-ADM-05 | Admin can attach, replace, and detach media assets, including provenance fields (§6.8) | M |
| FR-ADM-06 | Admin can list assets flagged `broken` or pending provenance verification, and act on them | S |
| FR-ADM-07 | Content is versioned as data, not code: a seed-sync workflow can export the live catalogue to a checked-in JSON file and re-import it idempotently, so content edits survive a database reset and are reviewable in a pull request | M |
| FR-ADM-08 | All admin mutations are written to an append-only `admin_audit_log` with actor, action, entity, and diff | S |
| FR-ADM-09 | Reserved for future AI metadata on exercises (movement pattern tags, CV keypoint hints, coaching cues) — schema uses a `metadata JSONB` column so this needs no migration later | S |

**v0 acceptance:** a protected admin API plus the seed export/import workflow is sufficient. No admin UI is required. A minimal admin screen is a Phase 3 nice-to-have, not a gate.

---

## 7. Non-Functional Requirements

### 7.1 Performance
| ID | Requirement |
|---|---|
| NFR-P-01 | Set logging is optimistic: UI reflects the change in <100 ms, independent of network |
| NFR-P-02 | p95 API response <400 ms for reads, <600 ms for writes (excluding cold start) |
| NFR-P-03 | Exercise search returns in <300 ms p95 for a 500-row library |
| NFR-P-04 | Android cold start to interactive Home <2.5 s on a mid-range device |
| NFR-P-05 | History and exercise lists are paginated; no unbounded list rendering |

### 7.2 Reliability & Resilience
| ID | Requirement |
|---|---|
| NFR-R-01 | Zero data loss for a logged set once acknowledged locally |
| NFR-R-02 | In-progress workout state persists locally and replays to the server on reconnect |
| NFR-R-03 | All mutating endpoints are idempotent via a client-supplied `Idempotency-Key` |
| NFR-R-04 | Client-generated UUIDv7 primary keys for workout/set entities, enabling offline creation |
| NFR-R-05 | Retries use exponential backoff with jitter; failed mutations queue rather than drop |
| NFR-R-06 | Neon free tier cold starts are expected; client shows optimistic UI, not spinners |

### 7.3 Security & Privacy
| ID | Requirement |
|---|---|
| NFR-S-01 | HTTPS/TLS enforced end to end; HSTS on web |
| NFR-S-02 | Access tokens are short-lived JWTs; refresh tokens are opaque, hashed at rest, and rotated |
| NFR-S-03 | Every query is scoped by `user_id`; ownership is enforced server-side on every request |
| NFR-S-04 | Media in R2 is private; access is exclusively via time-limited presigned URLs (≤15 min) |
| NFR-S-05 | Input validation with a shared schema (Zod) at the API boundary; reject unknown fields |
| NFR-S-06 | Rate limiting on auth endpoints (10/min/IP) and AI endpoints (per-user daily cap) |
| NFR-S-07 | No PII, tokens, or passwords in logs; structured logging with redaction |
| NFR-S-08 | Secrets from environment only; never committed. `.env.example` documents all keys |
| NFR-S-09 | Account deletion removes or anonymises all personal data within 30 days |
| NFR-S-10 | CORS is an explicit per-environment origin allowlist. `*` is never used in staging or production. See §12 |
| NFR-S-11 | Admin routes are additionally origin-restricted and rate-limited independently of user routes |
| NFR-S-12 | Media is served either from R2 via presigned URL or from a licensed external origin recorded in `media_assets`; the client never constructs media URLs itself |

### 7.4 Usability & Accessibility
| ID | Requirement |
|---|---|
| NFR-U-01 | Responsive UI: single-column ≤600 px, two-column ≥900 px; shared component layer |
| NFR-U-02 | Primary logging controls reachable one-handed in the lower 60% of an Android screen |
| NFR-U-03 | Touch targets ≥44×44 dp |
| NFR-U-04 | WCAG 2.1 AA contrast; text scales with OS font size without clipping |
| NFR-U-05 | Screen-reader labels on all interactive elements |
| NFR-U-06 | Dark mode support, following system preference |

### 7.5 Maintainability
| ID | Requirement |
|---|---|
| NFR-M-01 | TypeScript strict mode across client and API; no `any` in committed code |
| NFR-M-02 | Domain types shared between client and API via a single package |
| NFR-M-03 | Migrations are versioned, forward-only, and checked into the repo |
| NFR-M-04 | Business logic (1RM, PR detection, volume) lives in a pure, unit-tested module |
| NFR-M-05 | CI runs typecheck, lint, and tests on every pull request |

### 7.6 Observability

The point of running multiple services is to learn to operate them. Observability is therefore a v1 requirement, kept deliberately small — no tracing stack, no metrics pipeline, no dashboards-as-a-second-product.

| ID | Requirement |
|---|---|
| NFR-O-01 | Every service exposes `GET /health` returning service status, version/commit SHA, and dependency checks (DB reachable; R2 reachable; for CV, model loaded) |
| NFR-O-02 | `GET /health` is shallow and fast (<200 ms) and is safe to poll; a deep check lives at `GET /health/deep` and is rate-limited |
| NFR-O-03 | All logs are structured JSON: timestamp, level, service, requestId, userId (hashed), route, status, durationMs. No free-text-only logs |
| NFR-O-04 | Every request carries a correlation ID: accepted from `X-Request-Id` if present, otherwise generated. It is echoed in the response header, included in every log line for that request, and propagated to the CV service |
| NFR-O-05 | Unhandled errors are captured with the correlation ID and a stack trace, and are counted; an error rate above threshold is visible without reading raw logs |
| NFR-O-06 | Uptime monitoring pings `/health` for each service on an external schedule and alerts on sustained failure |
| NFR-O-07 | Database connectivity and Neon cold-start/suspension events are observable and distinguishable from application errors |
| NFR-O-08 | CV job state is queryable in aggregate: counts by `queued`/`processing`/`complete`/`failed`, and age of the oldest queued job |
| NFR-O-09 | Deployment logs are retained per environment, and a deployed commit SHA is always recoverable from `/health` |
| NFR-O-10 | Logs and error reports carry no PII: no email addresses, no tokens, no raw request bodies containing user content |

### 7.7 Backup, Recovery & Degradation

"No data loss" is the product's core promise, so the failure behaviour of every dependency is specified rather than discovered.

| ID | Requirement |
|---|---|
| NFR-B-01 | Neon's point-in-time restore window is enabled and its actual retention on the current plan is recorded in `docs/adr/`. The tier's real guarantee is documented, not assumed |
| NFR-B-02 | A weekly logical backup (`pg_dump`) is written to R2 under a separate prefix with its own lifecycle policy, independent of the database provider |
| NFR-B-03 | Restore is rehearsed, not theoretical: restoring the latest backup into a fresh Neon branch is a documented, tested procedure run at least once before v1 release |
| NFR-B-04 | Stated recovery expectations for v1: **RPO ≤ 24 h** via logical backup (better via PITR where retention allows), **RTO ≤ 4 h**, single-operator manual recovery. These are honest hobby-tier targets, stated so they are not mistaken for enterprise guarantees |
| NFR-B-05 | R2 object deletion is a two-step policy: application-level soft delete marks the row, and a scheduled job hard-deletes objects after a 30-day grace period. Deletions requested by a user under FR-AUTH-10 complete within that window |
| NFR-B-06 | **If R2 is unavailable:** media and avatars degrade to placeholders (FR-MED-07); uploads queue client-side and retry; no screen errors out and no workout flow is blocked |
| NFR-B-07 | **If the API is unavailable mid-workout:** the workout continues entirely against the local store. Sets are written locally, the outbox accumulates, and the UI shows an unobtrusive offline indicator rather than an error. On reconnect the outbox replays idempotently (NFR-R-03) |
| NFR-B-08 | **If the database is unavailable:** the API returns 503 with a retryable error code; the client treats 503 identically to offline rather than surfacing a failure |
| NFR-B-09 | **If the CV service is unavailable:** analyses stay `queued` and are retried; nothing else in the product is affected |
| NFR-B-10 | JSON export (FR-AUTH-09) is treated as the user's escape hatch and must remain functional whenever the API is up, independent of any other feature's health |

---

## 8. System Architecture

### 8.1 Component Overview

```
┌──────────────────────────────┐     ┌──────────────────────────────┐
│  Expo App (React Native)     │     │  Expo Web (same codebase)    │
│  Android — primary target    │     │  Responsive browser build    │
│  • local store + write queue │     │  • local store + write queue │
└──────────────┬───────────────┘     └───────────────┬──────────────┘
               │            HTTPS / JSON             │
               └──────────────────┬──────────────────┘
                                  ▼
                   ┌──────────────────────────────┐
                   │  Node API (Fastify + TS)     │
                   │  auth · exercises · routines │
                   │  workouts · progress · ai    │
                   └───┬───────────┬───────────┬──┘
                       │           │           │
        ┌──────────────▼──┐  ┌─────▼───────┐  ┌▼─────────────────────┐
        │ Neon Postgres   │  │ Cloudflare  │  │ Python CV Service    │
        │ relational core │  │ R2 (media)  │  │ FastAPI (Phase 5)    │
        └─────────────────┘  └─────────────┘  └──────────────────────┘
                                                        │
                                              ┌─────────▼──────────┐
                                              │ LLM provider       │
                                              │ (Phase 4, opt-in)  │
                                              └────────────────────┘
```

### 8.2 Technology Decisions

| Layer | Choice | Rationale |
|---|---|---|
| Client | Expo (React Native) + React Native Web | One codebase for Android and web; satisfies parity requirement |
| Navigation | Expo Router | File-based routing works across native and web |
| Client state | TanStack Query + local persistence | Cache, optimistic mutations, and offline queue in one model |
| Local store | SQLite (native) / IndexedDB (web) behind one interface | Required for NFR-R-01/R-02 |
| API | Node 20 + Fastify + TypeScript | Low overhead, schema-first validation, fast cold starts |
| ORM | Drizzle | Typed schema, SQL-transparent, first-class migrations |
| Database | Neon Postgres (serverless) | Free tier; branching useful for migration testing |
| Object storage | Cloudflare R2 | Free egress; S3-compatible SDK |
| Validation | Zod, shared package | One schema for client forms and API boundary |
| CV service | Python 3.11 + FastAPI + MediaPipe/OpenCV | Ecosystem fit; isolated so it cannot destabilise the core |
| Auth | Self-hosted JWT + rotating refresh tokens | No vendor lock-in at this stage; revisit at scale |

### 8.3 Offline & Sync Model (v1)

Deliberately simple; single-device assumption.

1. Entities created on-device get a client-generated **UUIDv7** primary key.
2. Mutations are written to the local store first and enqueued in an outbox.
3. The outbox drains in FIFO order on reconnect, each request carrying an `Idempotency-Key`.
4. The server treats a repeat of a known idempotency key as a no-op and returns the original result.
5. Reads are cache-first with background revalidation.
6. Conflict policy for v1: **last-write-wins on the server, keyed on `updated_at`.** Multi-device concurrent editing of the same in-progress workout is out of scope (§17 Q3).

### 8.4 The AI Boundary (architectural rule)

**AI never becomes a source of truth.** This is the single most important architectural constraint in the project and it holds through every phase.

Permitted direction of flow:

```
workout data ──▶ deterministic calculation ──▶ structured context ──▶ AI ──▶ human-readable insight
   (Postgres)     (packages/domain, pure)        (typed JSON)        (LLM)      (ai_insights row)
```

Forbidden:

```
workout data ──▶ AI ──▶ database modification          ✗
AI output    ──▶ personal_records / workout_sets       ✗
AI output    ──▶ any figure shown as a computed metric ✗
```

Concretely:
- Every number an insight mentions — volume, estimated 1RM, trend slope, session count — is computed by `packages/domain` **before** the model is called and passed in as context. The model never does arithmetic that the user sees.
- Plateau and progression detection are **heuristics in `packages/domain`**, unit-tested and deterministic. The LLM's only job is phrasing the finding in readable language.
- AI writes to exactly one table: `ai_insights`. It has no write path to any other entity (FR-AI-08).
- Any user-visible action an insight suggests requires an explicit user tap to apply. There is no auto-apply, ever.
- If the model is unreachable, slow, or returns malformed output, the insight is simply not created. Nothing else changes and nothing is shown (FR-AI-03).

The same boundary applies to CV in Phase 5: pose estimation produces observations in `cv_analyses`, never edits to logged sets.

---

## 9. Data Model

Postgres relational core; media stored in R2 with only object keys persisted in the database.

### 9.1 Entity Relationships

```
users ─1:1─ user_profiles
users ─1:n─ refresh_tokens
users ─1:n─ exercises (custom only; system rows have user_id NULL)
users ─1:n─ routines ─1:n─ routine_exercises ─n:1─ exercises
users ─1:n─ workouts ─1:n─ workout_exercises ─1:n─ workout_sets
                                    └─n:1─ exercises
users ─1:n─ personal_records ─n:1─ exercises
users ─1:n─ ai_insights                          (Phase 4)
workout_exercises ─1:n─ cv_analyses              (Phase 5)

muscle_groups ─1:n─ muscles ─n:m─ exercises  (via exercise_muscles, role=primary|secondary)
equipment ─1:n─ exercises
exercises ─n:m─ media_assets                 (via exercise_media; provenance lives on the asset)
users ─1:n─ admin_audit_log                  (actor; admins only)
```

### 9.2 Schema DDL

```sql
-- ============ Extensions ============
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============ Enums ============
CREATE TYPE unit_system     AS ENUM ('metric','imperial');
CREATE TYPE experience_level AS ENUM ('beginner','intermediate','advanced');
CREATE TYPE muscle_role     AS ENUM ('primary','secondary');
CREATE TYPE set_type        AS ENUM ('normal','warmup','failure','drop');
CREATE TYPE workout_status  AS ENUM ('in_progress','completed','discarded');
CREATE TYPE pr_type         AS ENUM ('heaviest_weight','best_1rm','best_set_volume');
CREATE TYPE insight_type    AS ENUM ('plateau','progression','imbalance','summary');
CREATE TYPE analysis_status AS ENUM ('queued','processing','complete','failed');
CREATE TYPE media_kind      AS ENUM ('image','gif','video');
CREATE TYPE media_delivery  AS ENUM ('r2_copy','external_embed');
CREATE TYPE media_state     AS ENUM ('pending_review','active','broken','removed');
CREATE TYPE licence_status  AS ENUM (
  'public_domain','cc0','cc_by','cc_by_sa','licensed_commercial','original_work','unknown'
);

-- ============ Identity ============
CREATE TABLE users (
  id              UUID PRIMARY KEY,
  email           CITEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  is_admin        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE user_profiles (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name      TEXT NOT NULL,
  units             unit_system NOT NULL DEFAULT 'metric',
  experience         experience_level,
  bodyweight_kg     NUMERIC(5,2),
  date_of_birth     DATE,
  avatar_r2_key     TEXT,
  default_rest_secs INTEGER NOT NULL DEFAULT 90,
  ai_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_user ON refresh_tokens(user_id) WHERE revoked_at IS NULL;

-- ============ Taxonomy ============
CREATE TABLE muscle_groups (
  id    SMALLSERIAL PRIMARY KEY,
  slug  TEXT NOT NULL UNIQUE,
  name  TEXT NOT NULL
);

CREATE TABLE muscles (
  id              SMALLSERIAL PRIMARY KEY,
  muscle_group_id SMALLINT NOT NULL REFERENCES muscle_groups(id),
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL
);

CREATE TABLE equipment (
  id    SMALLSERIAL PRIMARY KEY,
  slug  TEXT NOT NULL UNIQUE,
  name  TEXT NOT NULL
);

-- ============ Exercises ============
CREATE TABLE exercises (
  id            UUID PRIMARY KEY,
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL = system exercise
  name          TEXT NOT NULL,
  slug          TEXT,
  description   TEXT,
  instructions  TEXT,
  equipment_id  SMALLINT REFERENCES equipment(id),
  is_unilateral BOOLEAN NOT NULL DEFAULT FALSE,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- FR-ADM-09: future AI/CV metadata
  archived_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_ex_system_slug ON exercises(slug) WHERE user_id IS NULL;
CREATE INDEX idx_ex_user ON exercises(user_id);
CREATE INDEX idx_ex_name_trgm ON exercises USING gin (name gin_trgm_ops);

CREATE TABLE exercise_muscles (
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  muscle_id   SMALLINT NOT NULL REFERENCES muscles(id),
  role        muscle_role NOT NULL,
  PRIMARY KEY (exercise_id, muscle_id)
);
CREATE INDEX idx_exmus_muscle ON exercise_muscles(muscle_id, role);

-- ============ Routines ============
CREATE TABLE routines (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  notes       TEXT,
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_routines_user ON routines(user_id) WHERE archived_at IS NULL;

CREATE TABLE routine_exercises (
  id             UUID PRIMARY KEY,
  routine_id     UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  exercise_id    UUID NOT NULL REFERENCES exercises(id),
  position       SMALLINT NOT NULL,
  target_sets    SMALLINT,
  target_reps_min SMALLINT,
  target_reps_max SMALLINT,
  target_weight_kg NUMERIC(6,2),
  rest_secs      INTEGER,
  notes          TEXT,
  UNIQUE (routine_id, position)
);

-- ============ Workouts ============
CREATE TABLE workouts (
  id            UUID PRIMARY KEY,           -- client-generated UUIDv7
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  routine_id    UUID REFERENCES routines(id) ON DELETE SET NULL,
  name          TEXT,
  status        workout_status NOT NULL DEFAULT 'in_progress',
  started_at    TIMESTAMPTZ NOT NULL,
  completed_at  TIMESTAMPTZ,
  duration_secs INTEGER,
  total_volume_kg NUMERIC(10,2),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_workouts_user_started ON workouts(user_id, started_at DESC);
-- Enforce FR-WK-02: at most one in-progress workout per user
CREATE UNIQUE INDEX idx_one_active_workout
  ON workouts(user_id) WHERE status = 'in_progress';

CREATE TABLE workout_exercises (
  id          UUID PRIMARY KEY,
  workout_id  UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES exercises(id),
  position    SMALLINT NOT NULL,
  rest_secs   INTEGER,
  notes       TEXT,
  UNIQUE (workout_id, position)
);
CREATE INDEX idx_wex_exercise ON workout_exercises(exercise_id);

CREATE TABLE workout_sets (
  id                  UUID PRIMARY KEY,
  workout_exercise_id UUID NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  position            SMALLINT NOT NULL,
  set_type            set_type NOT NULL DEFAULT 'normal',
  weight_kg           NUMERIC(6,2),
  reps                SMALLINT,
  rpe                 NUMERIC(3,1) CHECK (rpe IS NULL OR (rpe >= 1 AND rpe <= 10)),
  is_completed        BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at        TIMESTAMPTZ,
  notes               TEXT,
  UNIQUE (workout_exercise_id, position)
);

-- ============ Progress ============
CREATE TABLE personal_records (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES exercises(id),
  pr_type     pr_type NOT NULL,
  value       NUMERIC(10,2) NOT NULL,
  reps        SMALLINT,
  weight_kg   NUMERIC(6,2),
  set_id      UUID REFERENCES workout_sets(id) ON DELETE SET NULL,
  achieved_at TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pr_user_ex ON personal_records(user_id, exercise_id, pr_type, achieved_at DESC);

CREATE TABLE body_measurements (
  id            UUID PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  measured_at   DATE NOT NULL,
  bodyweight_kg NUMERIC(5,2),
  notes         TEXT,
  UNIQUE (user_id, measured_at)
);

-- ============ Phase 4: AI ============
CREATE TABLE ai_insights (
  id           UUID PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workout_id   UUID REFERENCES workouts(id) ON DELETE CASCADE,
  insight_type insight_type NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  payload      JSONB,
  model        TEXT,
  dismissed_at TIMESTAMPTZ,
  feedback     SMALLINT,  -- -1 unhelpful, 0 none, 1 helpful
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_insights_user ON ai_insights(user_id, created_at DESC)
  WHERE dismissed_at IS NULL;

-- ============ Phase 5: CV ============
CREATE TABLE cv_analyses (
  id                  UUID PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workout_exercise_id UUID REFERENCES workout_exercises(id) ON DELETE SET NULL,
  video_r2_key        TEXT NOT NULL,
  status              analysis_status NOT NULL DEFAULT 'queued',
  rep_count           SMALLINT,
  result              JSONB,
  error               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ
);
CREATE INDEX idx_cv_user ON cv_analyses(user_id, created_at DESC);

-- ============ Media provenance (FR-MED-*) ============
-- No table other than media_assets may hold a media URL or R2 key.
CREATE TABLE media_assets (
  id               UUID PRIMARY KEY,
  kind             media_kind NOT NULL,
  delivery         media_delivery NOT NULL,
  state            media_state NOT NULL DEFAULT 'pending_review',
  -- Exactly one of these is populated, enforced by CHECK below
  r2_key           TEXT,
  external_url     TEXT,
  -- Provenance: all required before state can become 'active'
  source_url       TEXT NOT NULL,
  source_name      TEXT NOT NULL,
  licence          licence_status NOT NULL DEFAULT 'unknown',
  licence_url      TEXT,
  attribution_text TEXT,
  requires_attribution BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at      TIMESTAMPTZ,
  verified_by      UUID REFERENCES users(id),
  last_checked_at  TIMESTAMPTZ,
  width            SMALLINT,
  height           SMALLINT,
  duration_secs    SMALLINT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT media_one_location CHECK (
    (delivery = 'r2_copy'        AND r2_key IS NOT NULL AND external_url IS NULL) OR
    (delivery = 'external_embed' AND external_url IS NOT NULL AND r2_key IS NULL)
  ),
  -- FR-MED-03: only allowlisted licences may ever render
  CONSTRAINT media_licence_allowlist CHECK (
    state <> 'active' OR licence <> 'unknown'
  ),
  -- FR-MED-02: provenance must be verified before activation
  CONSTRAINT media_verified_before_active CHECK (
    state <> 'active' OR verified_at IS NOT NULL
  ),
  -- FR-MED-04: attribution text required when the licence demands it
  CONSTRAINT media_attribution_present CHECK (
    NOT requires_attribution OR attribution_text IS NOT NULL
  )
);
CREATE INDEX idx_media_state ON media_assets(state);
CREATE INDEX idx_media_recheck ON media_assets(last_checked_at)
  WHERE delivery = 'external_embed' AND state = 'active';

CREATE TABLE exercise_media (
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  media_id    UUID NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  position    SMALLINT NOT NULL DEFAULT 0,
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (exercise_id, media_id)
);
CREATE UNIQUE INDEX idx_exmedia_primary ON exercise_media(exercise_id)
  WHERE is_primary;

-- ============ Admin audit (FR-ADM-08) ============
CREATE TABLE admin_audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    UUID NOT NULL REFERENCES users(id),
  action      TEXT NOT NULL,          -- e.g. 'exercise.update'
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  diff        JSONB,
  request_id  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON admin_audit_log(entity_type, entity_id, created_at DESC);

-- ============ Idempotency ============
CREATE TABLE idempotency_keys (
  key          TEXT PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL,
  response     JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 9.3 Data Rules
- **Canonical units.** All weights persisted in kilograms as `NUMERIC`. Never store floats for weight. Convert at the presentation layer only.
- **Soft delete.** `exercises` and `routines` use `archived_at`. Historical workouts must never break.
- **Cascade discipline.** Workout → exercises → sets cascade on delete. Exercise references from workouts use `RESTRICT`/`SET NULL` semantics, never cascade.
- **Denormalised aggregates.** `workouts.total_volume_kg` and `duration_secs` are computed on completion and stored, so history lists need no joins.
- **Derived values are not stored per set.** Estimated 1RM is computed on read; only PRs are persisted.
- **Media is never a bare string.** `exercises.media_r2_key` does not exist. All media goes through `media_assets` so that provenance cannot be bypassed (FR-MED-01). The database constraints on `media_assets` are the enforcement mechanism, not a code convention — an asset without verified provenance is structurally incapable of being `active`.
- **`media_assets` rows are referenced with `ON DELETE RESTRICT`.** Removing an asset is a state change to `removed`, never a row deletion, so takedowns are instant and reversible (FR-MED-08).
- **AI writes only to `ai_insights`.** Enforced by review and by the API surface: no other table has a write path from the insight service (§8.4).
- **`metadata JSONB` on `exercises`** is the designated home for future AI/CV annotation, so Phase 4/5 needs no migration on a hot table.

---

## 10. API Specification

Base: `/api/v1`. JSON only. Bearer access token in `Authorization`. All mutations accept an optional `Idempotency-Key` header.

### 10.1 Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Create account, return token pair |
| POST | `/auth/login` | Authenticate, return token pair |
| POST | `/auth/refresh` | Rotate refresh token |
| POST | `/auth/logout` | Revoke current refresh token |
| POST | `/auth/password-reset/request` | Send reset email |
| POST | `/auth/password-reset/confirm` | Consume reset token |
| GET | `/me` | Current user + profile |
| PATCH | `/me` | Update profile |
| POST | `/me/avatar-upload-url` | Presigned R2 PUT URL |
| GET | `/me/export` | Full JSON export |
| DELETE | `/me` | Delete account |
| GET | `/taxonomy` | Muscle groups, muscles, equipment (cacheable) |
| GET | `/exercises` | List/search. Params: `q`, `muscleGroupId`, `muscleId`, `equipmentId`, `cursor`, `limit` |
| GET | `/exercises/:id` | Detail with muscle mappings |
| POST | `/exercises` | Create custom exercise |
| PATCH | `/exercises/:id` | Update own custom exercise |
| DELETE | `/exercises/:id` | Archive own custom exercise |
| GET | `/routines` | List own routines |
| POST | `/routines` | Create routine with nested exercises |
| GET | `/routines/:id` | Detail |
| PUT | `/routines/:id` | Replace routine (incl. ordered exercises) |
| DELETE | `/routines/:id` | Archive |
| POST | `/routines/:id/duplicate` | Copy routine |
| GET | `/workouts` | History, cursor-paginated, newest first |
| GET | `/workouts/active` | Current in-progress workout or 404 |
| POST | `/workouts` | Start workout (client-supplied `id`) |
| GET | `/workouts/:id` | Full detail with exercises and sets |
| PATCH | `/workouts/:id` | Update name/notes |
| POST | `/workouts/:id/complete` | Finish; returns summary + PRs hit |
| POST | `/workouts/:id/discard` | Discard in-progress workout |
| POST | `/workouts/:id/exercises` | Add exercise to workout |
| PATCH | `/workouts/:id/exercises/reorder` | Reorder exercises |
| DELETE | `/workouts/:id/exercises/:weId` | Remove exercise |
| POST | `/workouts/:id/exercises/:weId/sets` | Add set |
| PATCH | `/sets/:setId` | Update set (weight/reps/rpe/completed) |
| DELETE | `/sets/:setId` | Delete set |
| POST | `/workouts/:id/sync` | Bulk replay of queued offline mutations |
| GET | `/progress/exercises/:exerciseId` | Time series. Params: `metric`, `from`, `to` |
| GET | `/progress/records` | PR list |
| GET | `/progress/summary` | Dashboard: streak, weekly count, volume |
| GET | `/insights` | Phase 4 — active insights |
| POST | `/insights/:id/dismiss` | Phase 4 |
| POST | `/insights/:id/feedback` | Phase 4 |
| POST | `/cv/upload-url` | Phase 5 — presigned video PUT |
| POST | `/cv/analyses` | Phase 5 — enqueue analysis |
| GET | `/cv/analyses/:id` | Phase 5 — poll status/result |
| GET | `/media/:id/url` | Resolve a media asset to a presigned or external URL + attribution |
| GET | `/admin/exercises` | Admin — list all system exercises incl. archived |
| POST | `/admin/exercises` | Admin — create system exercise |
| PATCH | `/admin/exercises/:id` | Admin — update system exercise, muscles, metadata |
| POST | `/admin/exercises/:id/media` | Admin — attach media asset |
| DELETE | `/admin/exercises/:id/media/:mediaId` | Admin — detach media asset |
| GET | `/admin/taxonomy` | Admin — manage muscle groups, muscles, equipment |
| POST | `/admin/taxonomy/:entity` | Admin — create taxonomy row |
| PATCH | `/admin/taxonomy/:entity/:id` | Admin — update taxonomy row |
| GET | `/admin/media` | Admin — list assets, filter by `state` (pending/broken) |
| POST | `/admin/media` | Admin — register asset with provenance |
| PATCH | `/admin/media/:id` | Admin — update provenance, verify, or set state |
| POST | `/admin/media/:id/takedown` | Admin — set state `removed`, effective immediately |
| GET | `/admin/content/export` | Admin — export catalogue as seed JSON (FR-ADM-07) |
| POST | `/admin/content/import` | Admin — idempotent seed JSON import |
| GET | `/health` | Shallow liveness: status, commit SHA |
| GET | `/health/deep` | Dependency checks: DB, R2, CV service (rate-limited) |

### 10.2 Conventions
- **Errors:** consistent envelope
  ```json
  { "error": { "code": "VALIDATION_ERROR", "message": "reps must be >= 0", "details": [] } }
  ```
  Codes: `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `RATE_LIMITED` (429), `INTERNAL` (500).
- **Pagination:** opaque `cursor` + `limit` (default 20, max 100). Response includes `nextCursor` (null when exhausted).
- **Timestamps:** ISO 8601 UTC, always with offset.
- **Weights over the wire:** always kilograms, numeric string to avoid float drift.
- **Idempotency:** same key + same request hash returns the stored response; same key + different hash returns 409.
- **Ownership:** every handler filters by the authenticated `user_id`. Never trust an ID in a path alone.
- **Correlation:** every request accepts and echoes `X-Request-Id`; the API generates one when absent (NFR-O-04).
- **Admin namespace:** `/admin/*` requires `users.is_admin`. Non-admin tokens receive `404 NOT_FOUND`, not `403`, so the namespace is not enumerable.
- **Media:** responses never contain a raw media URL. They contain a `mediaId`; the client resolves it via `/media/:id/url`, which returns `{ url, expiresAt, attribution, requiresAttribution }`.

### 10.3 Example — Complete Workout

`POST /api/v1/workouts/018f.../complete`

```json
{
  "workout": {
    "id": "018f...",
    "status": "completed",
    "startedAt": "2026-08-31T17:02:11Z",
    "completedAt": "2026-08-31T18:09:44Z",
    "durationSecs": 4053,
    "totalVolumeKg": "8420.00",
    "setCount": 21
  },
  "personalRecords": [
    {
      "exerciseId": "018a...",
      "exerciseName": "Barbell Bench Press",
      "prType": "best_1rm",
      "value": "104.67",
      "weightKg": "90.00",
      "reps": 5,
      "previousValue": "100.00"
    }
  ]
}
```

---

## 11. Deployment & Infrastructure

### 11.1 Target Topology

| Concern | Service | Notes |
|---|---|---|
| Web app | **Expo Web** static export, hosted on Cloudflare Pages | Same codebase as Android; static bundle, no SSR |
| Android app | **Expo / EAS Build** | Internal-testing track first; Play Store submission at Phase 3 exit |
| API | **Render** (Node web service) | Single deployable, auto-deploy from `main` |
| Database | **Neon PostgreSQL** (serverless) | Branch-per-environment; PITR per plan (NFR-B-01) |
| Object storage | **Cloudflare R2** | Private buckets; presigned access only |
| CV service | **Render** (separate Python/FastAPI service) | Phase 5. Independently deployed, independently failing |
| DNS, TLS, CDN | **Cloudflare** | Proxied; HSTS; caching for static web assets |
| CI/CD | **GitHub Actions** | Typecheck, lint, test, then deploy per environment |
| Secrets | Provider environment variables | Never in the repo; `.env.example` is the contract (§14.2) |

### 11.2 Environments

| Environment | Web | API | Database | R2 bucket | Deploys from |
|---|---|---|---|---|---|
| **local** | `localhost:8081` (Expo) | `localhost:3000` | Neon `dev` branch or local Postgres | `fip-media-dev` | working tree |
| **staging** | `staging.<domain>` | `api-staging.<domain>` | Neon `staging` branch | `fip-media-staging` | `main` on merge |
| **production** | `app.<domain>` | `api.<domain>` | Neon `main` branch | `fip-media-prod` | manual promotion / tag |

Rules:
- Environment parity is a requirement: staging differs from production only in scale and data, never in configuration shape.
- Migrations run against staging and are verified there before production. Neon branching makes this cheap — use it.
- Production deploys are manually promoted, not automatic on merge.
- No production data is ever copied into staging or local. Seed data only.

### 11.3 Deployment Rules

| ID | Requirement |
|---|---|
| NFR-D-01 | Every service is independently deployable. Deploying the API must never require deploying the client, and vice versa |
| NFR-D-02 | The API is backward-compatible with the previously released client for at least one version, since Android users update on their own schedule |
| NFR-D-03 | Migrations are forward-only and additive within a release: add column → deploy code that writes it → backfill → later remove the old column in a separate release. Never drop and deploy in one step |
| NFR-D-04 | CI must pass typecheck, lint, and tests before any deploy. A red build cannot reach staging |
| NFR-D-05 | `/health` returns the deployed commit SHA so the running version is always identifiable (NFR-O-09) |
| NFR-D-06 | Rollback is a documented one-step action per service (Render redeploy of the previous build); it is tested once before v1 |
| NFR-D-07 | The CV service is deployed and scaled independently and has no shared runtime with the API. Its total failure must not degrade any core endpoint |
| NFR-D-08 | No Docker, no Kubernetes, no orchestration layer in v0/v1 (§3.3.1). Native platform builds only |
| NFR-D-09 | Free-tier ceilings (Neon storage/compute hours, R2 storage/ops, Render instance hours, EAS build credits) are recorded with current headroom in `docs/adr/0002-infrastructure-tiers.md` and reviewed at each phase exit (R1) |

### 11.4 Android Release Notes
- Expo EAS build profiles: `development`, `preview` (internal testing), `production`.
- Minimum supported Android API level and the actual test device matrix are recorded in the ADR alongside §13.
- Rest-timer background notifications require a permissions and background-execution review per Android version — a named Phase 2 task, not an afterthought (FR-WK-08).

---

## 12. CORS, Origins & Environment Configuration

CORS is specified here rather than discovered at deploy time. This has cost time on previous projects; it is now a requirement with an ID.

### 12.1 Origin Allowlist

| Environment | Allowed origins |
|---|---|
| local | `http://localhost:8081`, `http://localhost:19006`, `http://127.0.0.1:8081` |
| staging | `https://staging.<domain>` |
| production | `https://app.<domain>` |

Origins come from the `CORS_ORIGINS` environment variable as a comma-separated exact-match list. No wildcards. No regex subdomain matching. No `null` origin.

### 12.2 Policy

| ID | Requirement |
|---|---|
| NFR-C-01 | `Access-Control-Allow-Origin` is only ever echoed back for an exact match against the configured allowlist. `*` is never sent in staging or production |
| NFR-C-02 | Allowed methods: `GET, POST, PATCH, PUT, DELETE, OPTIONS` |
| NFR-C-03 | Allowed request headers: `Authorization, Content-Type, Idempotency-Key, X-Request-Id` |
| NFR-C-04 | Exposed response headers: `X-Request-Id`, and pagination headers if used |
| NFR-C-05 | **Tokens are carried in the `Authorization` header, not cookies.** Therefore `Access-Control-Allow-Credentials` is `false` and no cookie-based CSRF surface exists. If cookie auth is ever adopted, this decision requires an ADR and a CSRF strategy |
| NFR-C-06 | Preflight (`OPTIONS`) responses are cached via `Access-Control-Max-Age: 600` |
| NFR-C-07 | **Native Android requests do not send an `Origin` header and are not subject to CORS.** CORS misconfiguration therefore breaks web only — every CORS change must be verified in a browser, not just on device |
| NFR-C-08 | A request from a disallowed origin receives no CORS headers; the browser blocks it. The API does not return a bespoke error page that leaks the allowlist |
| NFR-C-09 | R2 bucket CORS is configured separately and independently for direct browser `PUT` uploads via presigned URL, with the same origin allowlist. This is a distinct configuration surface and is easy to forget |
| NFR-C-10 | An automated test asserts that an allowed origin receives CORS headers and a disallowed origin does not, per environment config |

### 12.3 Configuration Shape

```ts
// apps/api/src/config.ts — parsed once at boot with Zod; the process
// refuses to start on invalid config rather than failing at request time.
const env = z.object({
  NODE_ENV:     z.enum(['development','staging','production']),
  CORS_ORIGINS: z.string().transform(v => v.split(',').map(o => o.trim())),
  // ...
}).parse(process.env);

if (env.NODE_ENV !== 'development' && env.CORS_ORIGINS.includes('*')) {
  throw new Error('Wildcard CORS origin is not permitted outside development');
}
```

That last guard is deliberate: make the unsafe configuration impossible to deploy rather than documented as discouraged.

---

## 13. Platform & Browser Support Matrix

Cross-platform reach is a core product requirement, so support levels are explicit rather than implied by "responsive web".

### 13.1 Support Tiers

| Platform | Tier | Obligation |
|---|---|---|
| Android app (Expo, phone) | **Primary** | Full functionality. Every feature verified here first. Release blocker |
| Chrome on Android | **Required** | Full functionality. Release blocker |
| Chrome desktop (current + 1 previous) | **Required** | Full functionality. Release blocker |
| Edge desktop (current) | **Required** | Full functionality. Release blocker |
| Safari desktop (current + 1 previous) | **Required** | Full functionality. Release blocker |
| Tablet browsers (Android tablet, iPad Safari) | **Required** | Full functionality at two-column layout. Release blocker |
| Safari on iPhone (web) | **Architecture-compatible** | Must not be structurally broken. Formal testing deferred; bugs triaged, not gating |
| iOS native app | **Future** | Out of scope for v1; Expo keeps the path open |
| Android 10-era devices | **Best-effort** | Core logging loop must work. Degraded animation and slower cold start acceptable |
| Firefox desktop | **Best-effort** | Expected to work; bugs fixed opportunistically, not gating |
| IE / legacy Edge | **Unsupported** | No effort |

### 13.2 Capability Divergence

Where platforms differ, behaviour is specified rather than left to whichever implementation happens to run:

| Capability | Android native | Web | Divergence policy |
|---|---|---|---|
| Local persistence | SQLite | IndexedDB | One `LocalStore` interface, two adapters. Feature code never branches on platform |
| Rest-timer alerts | Local notification while backgrounded | Web Notifications API where permitted; otherwise in-tab visual + audio only | Web degradation is acceptable and must be stated in the UI, not silently missing |
| Background execution | Supported | Not reliable | Timers reconcile from a stored end-timestamp on focus, never from a live counter. This is the correct implementation on both platforms |
| Video capture (Phase 5) | Camera or file picker | File picker only | Web users upload; no in-browser capture requirement in v1 |
| Haptics | Yes | No | Enhancement only; never carries information alone |
| Deep links | App links | URL routes | Expo Router keeps route definitions shared |

**Rule:** a capability gap results in a *stated* degraded experience, never a broken screen and never a silently missing function. If a feature cannot degrade acceptably on a Required-tier platform, it is not shipped on either platform until it can.

### 13.3 Verification Obligation

Definition of Done (§14.4) requires manual verification on Android **and** one desktop browser. Before each phase exit, the full Required tier is swept using the checklist in `docs/qa.md`. Playwright E2E runs against Chromium and WebKit to catch Safari-class divergence early rather than at release.

---

## 14. Repository & Build Conventions

### 14.1 Structure (pnpm monorepo)

```
fitness-intelligence/
├─ apps/
│  ├─ mobile/               # Expo app (Android + web targets)
│  │  ├─ app/               # Expo Router routes
│  │  ├─ src/components/
│  │  ├─ src/features/      # auth, exercises, routines, workout, progress
│  │  ├─ src/db/            # local store adapter (SQLite | IndexedDB)
│  │  ├─ src/sync/          # outbox queue, replay
│  │  └─ src/api/           # typed client
│  ├─ api/                  # Fastify server
│  │  ├─ src/routes/
│  │  ├─ src/services/
│  │  ├─ src/db/            # drizzle schema, migrations, seeds
│  │  ├─ src/routes/admin/  # protected admin namespace (§6.9)
│  │  ├─ src/lib/           # auth, r2, idempotency, logging, requestId, cors
│  │  └─ tests/
│  └─ cv/                   # Python FastAPI (Phase 5)
├─ packages/
│  ├─ shared/               # Zod schemas + shared TS types
│  └─ domain/               # pure logic: 1RM, volume, PR detection, unit conversion
├─ content/
│  └─ exercises.seed.json   # catalogue as reviewable data (FR-ADM-07)
├─ docs/
│  ├─ BRD.md                # this document — frozen at v0.1
│  ├─ qa.md                 # manual + cross-platform checklists (§13.3)
│  ├─ runbook.md            # deploy, rollback, restore-from-backup (NFR-B-03)
│  └─ adr/                  # architecture decision records
├─ CLAUDE.md                # agent instructions
└─ pnpm-workspace.yaml
```

### 14.2 Environment Variables

```
# apps/api/.env.example
DATABASE_URL=postgresql://...neon.tech/fip?sslmode=require
JWT_ACCESS_SECRET=
JWT_REFRESH_PEPPER=
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=30d
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=fip-media
CORS_ORIGINS=http://localhost:8081,http://localhost:19006
NODE_ENV=development
COMMIT_SHA=local
LOG_LEVEL=info
R2_BACKUP_PREFIX=backups/
MEDIA_URL_TTL_SECONDS=900
ADMIN_RATE_LIMIT_PER_MIN=30
# Phase 4
AI_PROVIDER_API_KEY=
AI_DAILY_LIMIT_PER_USER=10
```

### 14.3 Testing Strategy

| Level | Target | Tooling |
|---|---|---|
| Unit | `packages/domain` at 100% branch coverage — 1RM, PR detection, volume, unit conversion | Vitest |
| Integration | Every API route against a real Postgres (Neon branch or Docker) | Vitest + supertest |
| Contract | Zod schemas validated in both directions | Vitest |
| E2E | Golden path: register → find exercise → routine → log → history → progress | Maestro (Android) + Playwright (web) |
| Manual | Airplane-mode logging, app-kill mid-workout, timer in background | Checklist in `docs/qa.md` |

### 14.4 Definition of Done (per feature)
1. Zod schema in `packages/shared`; types derived, not duplicated
2. Migration written and applied; seed updated if taxonomy changed
3. API route with ownership check, validation, and idempotency where mutating
4. Client screen with loading, empty, error, and offline states
5. Optimistic mutation with rollback on failure
6. Unit tests for any domain logic; integration test for the route
7. Typecheck and lint clean; no `any`
8. Manually verified on an Android device/emulator **and** in a desktop browser (§13.3)
9. Any media introduced has a `media_assets` row with verified provenance (§6.8)
10. Any new environment variable is added to `.env.example` and to the config schema
11. Requirement IDs satisfied are named in the pull request description

---

## 15. Roadmap & Milestones

### Milestone 0 — Technical Foundation (week 0)
Not a feature phase. Repo scaffold, CI pipeline, all three environments provisioned (Neon branches, R2 buckets, Render services, Cloudflare DNS), CORS verified in a browser against staging, `/health` live for the API, deploy and rollback rehearsed once, first ADRs written (`0001-stack`, `0002-infrastructure-tiers`).
**Exit:** an empty but deployed API answers `/health` in production with a commit SHA, and a rollback has been performed successfully at least once.

### Phase 1 — Foundation (weeks 1–2)
Drizzle schema + migrations, taxonomy and exercise seed data with verified media provenance, auth end to end, profile, protected admin API, seed export/import workflow, Expo shell with routing and theming, structured logging and correlation IDs.
**Exit:** a user can register, log in, and browse the seeded exercise library on Android and web.

### Phase 2 — Core Loop (weeks 3–6)
Routines CRUD, workout session engine, set logging with prefill, rest timer, finish/summary, history list and detail, per-exercise progress chart, PR detection.
**Exit:** the golden path works end to end on both platforms. **This is the v1 release gate.**

### Phase 3 — Stabilise (weeks 7–8)
Offline outbox and replay, idempotency, error/empty/offline states, accessibility pass, cross-platform sweep of the Required tier (§13.1), performance profiling, E2E on Chromium and WebKit, uptime monitoring, backup job plus a rehearsed restore, data export, account deletion with R2 propagation, Android release build.
**Exit:** NFRs in §7 measurably met; a restore from backup has been performed successfully; no known data-loss path.

### Phase 4 — AI Advisory (weeks 9–12)
Deterministic plateau and progression heuristics in `packages/domain` **first**, then LLM phrasing on top (§8.4), opt-in consent flow, caching and rate limits, feedback capture, kill switch.
**Exit:** insights appear post-workout, are dismissible, and total AI failure leaves the app fully functional.

### Phase 5 — Computer Vision (weeks 13+)
Python FastAPI service, pose estimation pipeline, presigned video upload, async job queue and polling, rep counting, form observations with confidence, disclaimers, deletion propagation.
**Exit:** a user uploads a squat video and receives rep count and observations without touching the core loop's reliability.

### Governance After Freeze
BRD v0.1 is frozen. From Milestone 0 onward:
- **New feature idea** → PRD, not this document.
- **New technical decision** → an ADR in `docs/adr/`.
- **Changed requirement** → a new BRD version with a changelog entry, not an in-place edit.

This is what keeps the document short enough that people keep reading it.

### Dependency Order
```
Phase 1 ──▶ Phase 2 ──▶ Phase 3 ──▶ Phase 4 ──▶ Phase 5
                │                       ▲
                └── data volume needed ──┘  (AI requires ≥4 weeks of real logs)
```

---

## 16. Claude Code Build Guide

### 16.1 `CLAUDE.md` Seed Content

Place this at the repo root so every agent session inherits the constraints.
See the live `CLAUDE.md` at the repository root; it is the maintained version of
this seed.

### 16.2 Suggested Task Decomposition

Feed these to Claude Code one at a time. Each is sized to fit a single focused session.

**Milestone 0**
0a. Scaffold repo and CI only: no features. GitHub Actions running typecheck, lint, test.
0b. Fastify app with `/health` (commit SHA), `/health/deep`, structured logging, request-ID middleware, and Zod-validated config that refuses to boot on invalid env or wildcard CORS outside development.
0c. Provision and document staging + production: Neon branches, R2 buckets, Render services, Cloudflare DNS. Verify CORS from a real browser against staging. Write `docs/runbook.md` and perform one rollback.

**Phase 1**
1. Scaffold pnpm monorepo: `apps/api`, `apps/mobile`, `packages/shared`, `packages/domain`. Add TS strict configs, ESLint, Vitest, and a CI workflow running typecheck/lint/test.
2. Define the full Drizzle schema from §9.2. Generate the initial migration. Add `pnpm db:migrate`.
3. Write seed scripts from `content/exercises.seed.json`: muscle groups, muscles, equipment, and ≥150 system exercises with primary/secondary muscle mappings. Every media reference must be a `media_assets` row with a licence — the seed must fail loudly on missing provenance.
3b. Implement the protected `/admin` namespace: exercises, taxonomy, media provenance, takedown, and the content export/import round-trip (FR-ADM-01..08).
4. Implement `packages/domain`: `estimate1RM`, `setVolume`, `workoutVolume`, `kgToLb`/`lbToKg`, `detectPRs`. 100% branch coverage.
5. Implement auth: register, login, refresh with rotation, logout. argon2id hashing. Integration tests per FR-AUTH-01..05.
6. Implement `/me`, `PATCH /me`, `/taxonomy`, `/health`.
7. Scaffold Expo app with Expo Router, theme tokens, dark mode, and a typed API client with token refresh interceptor.
8. Build auth screens and the onboarding profile step. Verify on Android and web.

**Phase 2**
9. Exercise list with search, filters, and cursor pagination — API and client.
10. Exercise detail screen; custom exercise create/edit/archive.
11. Routines: API CRUD with nested ordered exercises; client builder with reorder.
12. Workout session engine: start from routine or empty, enforce single active workout, `GET /workouts/active`.
13. Set logging UI: prefill chain (previous set → last session → routine target), optimistic updates, keypad-optimised inputs.
14. Rest timer with per-exercise duration and Android background notification.
15. Complete workout: compute duration and volume, run `detectPRs`, persist, return summary. Summary screen.
16. History list and detail; "repeat as routine".
17. Progress: `/progress/exercises/:id` time series + chart with metric switcher; PR list; dashboard summary.

**Phase 3**
18. Local store adapter (SQLite native / IndexedDB web) behind one interface.
19. Outbox queue with FIFO replay, `Idempotency-Key`, exponential backoff.
20. Server-side idempotency middleware using the `idempotency_keys` table.
21. Loading/empty/error/offline states for every screen; accessibility pass.
22. E2E golden path: Maestro on Android, Playwright on web.
23. Data export and account deletion including R2 object cleanup and the 30-day grace job (NFR-B-05).
24. Observability: uptime pings on `/health`, error-rate counting, CV job aggregate endpoint. Verify a Neon cold start is distinguishable from an application error.
25. Backup job (`pg_dump` to R2 weekly) plus a documented, rehearsed restore into a fresh Neon branch. Record actual RPO/RTO achieved in the runbook.
26. Cross-platform sweep of the Required tier in §13.1; fix divergences or state the degradation in the UI.

### 16.3 Prompt Pattern

Use this shape for each task:

```
Implement task <N> from docs/BRD.md §16.2.
Requirements: FR-WK-04, FR-WK-06, NFR-P-01, NFR-R-01.
Constraints: read CLAUDE.md. Weights in kg. Optimistic UI.
Do not touch files outside apps/api/src/routes/workouts.ts,
apps/mobile/src/features/workout/, packages/shared/src/workout.ts.
When done: run pnpm typecheck && pnpm test, then summarise what changed
and which requirement IDs are now satisfied.
```

### 16.4 Guardrails for Agent Sessions
- One feature per branch and per session; long sessions drift.
- Never let the agent invent schema changes mid-feature — migrations are explicit tasks.
- Require the agent to run `pnpm typecheck && pnpm test` and paste the output before declaring done.
- If the agent proposes storing weights in pounds, floats, or per-set derived 1RM, reject it and point at §9.3.
- Review every migration by hand. Drizzle diffs can silently drop columns.

---

## 17. Open Questions & Assumptions

These were not specified in the source outline. Assumptions below are what this document currently encodes; each needs confirmation.

| # | Question | Assumption Made | Blocks |
|---|---|---|---|
| Q1 | Authentication method — email/password, or OAuth/magic link? | Email + password with rotating refresh tokens | Phase 1 |
| Q2 | Does "free tier" mean free-forever product, or free infrastructure tiers? | Both: no monetisation in v1, infra within free tiers | Roadmap, §18 |
| Q3 | Multi-device concurrent use expected? | No. Single-device, last-write-wins | Phase 3 sync design |
| Q4 | Offline requirement — full offline-first, or resilient-online? | Resilient-online with an outbox for writes | Phase 3 |
| Q5 | Set model — sets/reps/weight/RPE only, or also tempo, distance, duration? | Weight + reps + RPE. No cardio/time-based exercises in v1 | §9.2 schema |
| Q6 | Are supersets and drop sets in v1? | Drop set as a `set_type`; supersets deferred (FR-RT-06) | Phase 2 scope |
| Q7 | Which LLM provider for Phase 4, and is user data allowed to leave the system? | Provider TBD; explicit opt-in required (FR-AI-07) | Phase 4 |
| Q8 | Is iOS ever a target? | Not in v1, but Expo keeps it open | Build config |
| Q9 | Analytics/telemetry — what may be collected? | None beyond operational logs until a privacy decision is made | Phase 3 |
| Q10 | Team size and timeline? | Weeks in §15 assume one developer plus Claude Code | Roadmap credibility |
| Q11 | Email delivery provider for verification and reset? | TBD; FR-AUTH-06 marked Should, not Must | Phase 1/2 |
| Q12 | Exercise library source and licensing? | **Resolved in §6.8.** Hand-authored text; media restricted to an allowlist of licences with recorded provenance | — |
| Q13 | Domain name and Cloudflare zone? | Placeholder `<domain>` throughout §11–12; must be fixed before Milestone 0 completes | Milestone 0 |
| Q14 | Who are the admin users, and how is the first `is_admin` flag set? | Manual DB flag on the founder account; no self-service admin signup | Phase 1 |
| Q15 | Neon plan and therefore actual PITR retention? | Free tier assumed; real retention to be recorded in ADR 0002 (NFR-B-01) | Milestone 0 |
| Q16 | Error-tracking tool (self-hosted vs hosted vs logs-only)? | Logs-only plus counters for v1; revisit if error volume becomes unreadable | Phase 3 |
| Q17 | Minimum supported Android API level and physical test devices? | Android 10 as best-effort floor (§13.1); device list to be recorded | Phase 1 |

---

## 18. Risks

| ID | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| R1 | **Free-tier limits.** Neon compute suspension causes cold starts; R2 or Neon quotas exceeded as usage grows | High | High | Optimistic UI hides cold starts (NFR-R-06); monitor row and storage counts; keep the DB layer portable via Drizzle so a paid or self-hosted Postgres is a config change |
| R2 | **Privacy.** Workout data is health-adjacent; video is biometric-adjacent | High | Medium | Private R2 with short-lived presigned URLs; explicit opt-in before any data leaves the system; export and deletion in v1; no third-party analytics until decided (Q9) |
| R3 | **AI reliability.** Hallucinated or unsafe training advice | High | Medium | Advisory-only framing; visible AI labelling; heuristic-first with LLM for phrasing; kill switch and per-user rate limits; capture negative feedback |
| R4 | **Scope creep.** AI and CV are the exciting parts and will pull attention off the logging loop | High | High | Phase gate: no Phase 4 work merges until the Phase 2 exit criteria and Phase 3 NFRs are met; §3.3 out-of-scope list is treated as binding |
| R5 | **CV accuracy.** Pose estimation on phone video in gym lighting is unreliable; false form corrections could cause injury | High | High | Confidence thresholds with suppression below threshold; observations phrased as observations, not corrections; explicit non-medical disclaimer (FR-CV-05); narrow to 2–3 well-understood lifts initially |
| R6 | **Data loss during logging.** Losing a set mid-workout is the single most trust-destroying failure | Critical | Medium | Local-first writes; client-generated IDs; idempotent replay; app-kill and airplane-mode tests in the QA checklist |
| R7 | **Web/Android parity drift.** React Native Web diverges on gestures, timers, and storage | Medium | High | Shared component layer with platform-specific leaves only; every feature manually verified on both before Done |
| R8 | **Solo-developer bandwidth.** Timeline in §15 assumes sustained focus | Medium | High | Strict phase gates; ship v1 at Phase 2/3 rather than waiting for AI |
| R9 | **Hevy comparison.** A near-clone with fewer features and no ecosystem struggles to justify itself | Medium | Medium | Compete on the insight layer, not the log; keep the log at parity, not ahead |
| R10 | **Media licensing exposure.** Using publicly available exercise videos/GIFs without recorded provenance invites takedowns or worse, and the media layer touches every exercise page | High | High | §6.8 makes provenance a database constraint rather than a convention; `unknown` licence cannot render; instant takedown path; fallback media so removal never breaks a screen |
| R11 | **Content ossification.** The 150 seeded exercises become effectively frozen inside migrations and painful to correct | Medium | High | Admin API plus `content/exercises.seed.json` round-trip (FR-ADM-07); content is reviewable data in pull requests, not code |
| R12 | **Deployment and CORS friction.** Multi-service deployment with browser + native clients produces exactly the CORS and environment-drift problems that cost time on previous projects | Medium | High | §12 specifies origins, headers, credentials, and R2 bucket CORS up front; boot-time config validation; an automated CORS test; Milestone 0 proves the whole pipeline before any feature exists |
| R13 | **Operational blindness.** Multiple free-tier services fail in ways that look like application bugs (Neon suspension especially) | Medium | High | §7.6: correlation IDs, structured logs, `/health` with commit SHA, uptime pings, cold starts distinguishable from errors |
| R14 | **Recovery is theoretical.** A backup that has never been restored is not a backup | High | Medium | NFR-B-03 makes a rehearsed restore a Phase 3 exit criterion; honest RPO/RTO stated in NFR-B-04 rather than assumed |
| R15 | **Infrastructure learning curve as scope creep.** The desire to learn service architecture pulls toward Kubernetes, queues, and a cloud zoo | Medium | Medium | §3.3.1 excludes them by decision; one API service until the CV boundary in Phase 5 forces a real second service |

---

## 19. Success Criteria

### 19.1 Release Gate (v1)
The golden path completes end to end on **both** Android and web, by a fresh user, with no manual intervention:

- [ ] Register → onboard → Home
- [ ] Search and open an exercise from the seeded library
- [ ] Create a routine with ≥3 exercises
- [ ] Start a workout from that routine
- [ ] Log ≥9 sets with weight and reps
- [ ] Rest timer fires correctly, including from the background on Android
- [ ] Finish the workout; summary shows duration, volume, and any PRs
- [ ] Workout appears in history with all sets intact
- [ ] Progress chart renders for one of the logged exercises
- [ ] Kill the app mid-workout and relaunch: the in-progress workout is intact
- [ ] Log a full workout in airplane mode; it syncs on reconnect with no duplicates
- [ ] Verified on Android **and** on Chrome, Edge, and Safari desktop (§13.1)
- [ ] Every rendered media asset has verified provenance and visible attribution where required
- [ ] A takedown on a media asset removes it from the UI without a deploy and without breaking the exercise page
- [ ] Admin API can create an exercise, attach licensed media, and export/re-import the catalogue idempotently
- [ ] CORS verified from a browser against staging and production; disallowed origin is blocked
- [ ] `/health` returns the deployed commit SHA on every service
- [ ] A backup has been restored into a fresh database branch successfully at least once
- [ ] A rollback has been performed successfully on the API at least once
- [ ] No `any` in the codebase; typecheck, lint, and tests green in CI

### 19.2 Quality Bars
| Metric | Target |
|---|---|
| Set-logging perceived latency | <100 ms |
| API p95 (reads / writes) | <400 ms / <600 ms |
| Android cold start to interactive | <2.5 s |
| Domain module branch coverage | 100% |
| Data-loss incidents in QA | 0 |

### 19.3 Post-Launch Signals (first 90 days)
| Metric | Target |
|---|---|
| Week-1 → week-4 retention | ≥30% |
| Median workouts per active user per week | ≥2 |
| Workouts abandoned mid-session | <10% |
| Crash-free sessions | ≥99.5% |
| AI insight helpful-rate (Phase 4) | ≥60% of rated insights |

---

### Appendix A — Change Log

| Version | Date | Change |
|---|---|---|
| 0.0 | 2026-08-31 | Dictated BRD v0 outline. |
| 0.1-draft | 2026-08-31 | Consolidated. Added requirement IDs, NFR targets, full data model DDL, API specification, repository conventions, Claude Code build guide, open questions. |
| **0.1 (frozen)** | 2026-08-31 | Added §11 Deployment & Infrastructure, §12 CORS & Environment Configuration, §13 Platform & Browser Support Matrix, §6.8 Media Provenance & Licensing, §6.9 Admin & Content Management, §7.6 Observability, §7.7 Backup/Recovery/Degradation, §8.4 the AI boundary rule, §3.3.1 deliberately excluded technology. Strengthened CV safety requirements (FR-CV-07..12). Added `media_assets`, `exercise_media`, `admin_audit_log`, `users.is_admin`, `exercises.metadata`; removed `exercises.media_r2_key`. Added Milestone 0. Resolved Q12; added Q13–Q17. Added risks R10–R15. **Scope frozen: further features go to the PRD, further technical decisions to ADRs.** |

*End of document.*

---

> **Note on this copy.** This file is the repository's transcription of the
> frozen v0.1 baseline, with the source document's mojibake repaired (`§`, `→`,
> `≥`, `×`) and §16.1 pointing at the maintained root `CLAUDE.md` instead of
> duplicating it. The requirements text is otherwise unchanged. Substantive
> changes require a new BRD version, not an edit here.
