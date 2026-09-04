# Security review — 2026-09-01

Done before handing the APK to trial users. That handover is the point at which
the threat model changes: until now the only account was the developer's, and
from here there are real accounts holding real data, driven by clients that can
send whatever they like.

This records what was checked, what was found, and what was deliberately left
alone. An unchecked item is not the same as a safe one, so the "not covered"
section is part of the document rather than an omission.

---

## What was found and fixed

### 1. Drizzle ORM SQL injection advisory — HIGH

`drizzle-orm < 0.45.2` mis-escapes SQL identifiers
([GHSA](https://github.com/advisories/GHSA-hcqf-qmpq-3fqr)). The API was on
0.44.7.

**Actual exposure: none.** The vulnerable path is `sql.identifier`, `sql.raw`
and `.unsafe()`, none of which appear in production code — every raw `sql`
template in `src/` is a static schema definition, and user input reaches queries
only as a bound parameter. In `searchMatches`, `${pattern}` inside a `sql`
template is a placeholder, not string concatenation.

Upgraded to 0.45.2 regardless. "We happen not to call the vulnerable function"
is a property a future commit can silently remove.

### 2. Weak-but-long passwords accepted

The 12-character floor (FR-AUTH-02) let through `passwordpassword`,
`aaaaaaaaaaaa`, `123456789012` and `sam.carter1234` — all twelve or more
characters, all in cracking dictionaries. Trial users pick passwords like this.

`packages/domain/src/password-strength.ts` rejects five patterns: too short, a
repeated unit, a keyboard or alphabet run, a small list of long breach entries,
and the user's own email or display name. Deliberately no composition rules —
those produce `Passw0rd!`, which is worse. 16 tests, 100% branch coverage.

Enforced in `auth-service`, not in the Zod schema, because the identity check
needs the email and name, and because `@fi/shared` and `@fi/domain` are
independent packages that should stay that way.

On password reset it runs **before** the code is consumed, so a rejected
password does not burn the user's one-time code.

### 3. Android auto-backup was enabled

`android:allowBackup="true"` is the Expo default. It permits app data to be
extracted through `adb backup` and copied into cloud backups.

Session tokens live in `expo-secure-store`, which is Keystore-backed, and the
Keystore key is not itself backed up — so the exposure was ciphertext without
its key rather than plain tokens. Set to `false` anyway: it costs nothing, and
the reasoning above depends on an implementation detail of a dependency.

### 4. Transitive advisories

- `decode-uri-component` (via `expo-router` → `query-string`): DoS on malformed
  percent-encoded input, reachable through deep links. Overridden to `>=0.5.0`.
- `esbuild` (via `drizzle-kit`): dev-server request forgery, build-time only.
  Overridden to `>=0.25.0`.

Five advisories became two. Both remaining are `uuid` inside
`@expo/config-plugins` → `xcode`, which generates **iOS** projects — build-time
only, and this repo does not build iOS. Not overridden, because forcing a
version inside Expo's plugin chain risks breaking prebuild for no gain.

### 5. CI was failing on every run

Not a vulnerability, but a security control that was not running.
`pnpm/action-setup` fails outright when the workflow passes `version:` _and_
`package.json` carries `packageManager` — it will not guess which wins. Every
job died at setup, so typecheck, lint, tests and the coverage gate had not run
in CI at all.

Removed the input; the version now comes from `packageManager`. Node also now
comes from `.node-version` — the same file Render reads — because CI was
testing Node 20 while production ran 24.

---

## What was verified as already correct

Checked, not assumed.

| Area                    | Finding                                                                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tenant isolation**    | 20 ID-addressed operations attempted across accounts; every one answers 404. `tests/isolation.integration.test.ts`                                                                        |
| **IDOR via child rows** | `workout_sets`, `workout_exercises` and `routine_exercises` carry no `user_id`. `ownedSet` joins up to `workouts.userId` before any write, and 404s otherwise                             |
| **List endpoints**      | Verified empty for a non-owner — an id-guessing attack is the obvious one, but a list that forgot its predicate needs no guessing                                                         |
| **Enumeration**         | Login, password reset and reset-confirm all return byte-identical bodies for unknown and wrong. `/admin/*` returns 404, not 403, to a non-admin                                           |
| **Admin gating**        | One namespace-wide `preHandler`, so a new admin route cannot be added without the guard                                                                                                   |
| **Password storage**    | argon2id. Login hashes a dummy password for absent accounts so timing does not distinguish them                                                                                           |
| **Tokens**              | Access 15m JWT; refresh opaque, 30d, hashed with a pepper, rotated on use. Reuse of a rotated token revokes the whole family                                                              |
| **Forged tokens**       | A malformed token and a one-character-tampered valid token both 401                                                                                                                       |
| **Transport**           | HTTPS only. HSTS one year with subdomains in production. `usesCleartextTraffic` absent, and the default for this target SDK is off                                                        |
| **Headers**             | `@fastify/helmet` registered                                                                                                                                                              |
| **Rate limiting**       | Global limit keyed on user id, falling back to IP. Auth endpoints 10/min; food lookup 30/min because it proxies a third party                                                             |
| **Body size**           | 1 MiB globally; 8 MiB only on admin content import                                                                                                                                        |
| **Secrets**             | None in the repo. The shipped APK was unpacked and scanned: no API keys, no connection strings, no private keys — only the public API URL                                                 |
| **APK signing**         | Release cert, not the debug key, and byte-identical to 0.2.0's                                                                                                                            |
| **Admin accounts**      | Zero accounts hold `is_admin`                                                                                                                                                             |
| **PII in logs**         | User ids are hashed; no email, token, code or request body is logged. The mailer logs the provider's error _code_, never its message, because a Resend 403 quotes the recipient's address |
| **Leaderboard**         | Opt-in, off by default. Published fields are a closed allowlist: name, level, rank, XP, volume, activity count                                                                            |

---

## Accepted, with reasons

**Registration is open.** Anyone holding the APK can create an account. Raised
and deliberately kept: the app is on no store, distribution is by direct link,
and the alternatives (invite code, email allowlist) add friction to a trial
whose purpose is feedback. Exposure is bounded by who receives the APK. An
invite code remains about thirty lines if that changes.

**Register leaks whether an email exists** — 409 "An account already exists for
that email". Unavoidable: the user has to be told why their signup failed. Login
and reset, where enumeration actually matters, do not leak.

**Email verification gates nothing.** A product decision on record. Unverified
accounts are fully functional with a dismissible reminder. The cost is that an
unverified user cannot recover a forgotten password.

**No account lockout after repeated failures.** Rate limiting only. With a
12-character floor, pattern rejection, argon2id and 10 attempts a minute per IP,
lockout would mainly offer a way to deny service to a known address.

**From is a `gmail.com` address via Brevo**, so DMARC alignment fails and some
codes will be filtered as spam. A verified domain is the fix; the code already
supports it.

---

## Not covered

Honest gaps, so nobody reads this as a clean bill of health:

- No penetration test, and no independent review — this is a self-audit.
- No fuzzing of the API surface. Zod bounds every input, which is not the same
  as having tried to break it.
- No load or denial-of-service testing. The free Render instance would be
  trivial to exhaust.
- Neon backups are the provider's defaults; the restore procedure in the runbook
  is still marked UNVERIFIED.
- No formal secret-rotation procedure. Every key in play — Brevo, Resend,
  Render, the database, and now the **Cloudflare R2 S3 credentials and account
  API token** — has been pasted into a chat, and two of them into a screenshot.
  All of them work, all of them should be rolled before this is anything other
  than a private trial.

  The R2 pair is the one to do first: it grants read and write on a bucket that
  will hold video of people training. It is at least scoped to that single
  bucket with Object Read & Write only, which is why the lifecycle
  configuration could not be read back with it — the narrow scope is working as
  intended and should not be widened.

- No monitoring or alerting. A failure is visible only by reading logs.
