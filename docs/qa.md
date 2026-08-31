# QA checklist

Manual and cross-platform verification. BRD §13.3, §14.4 item 8, §19.1.

Automated coverage lives in CI: domain unit tests at 100% branch coverage,
contract tests, API integration tests against a real Postgres, and the CORS
allowlist test. This file covers what a machine cannot check.

---

## Per feature (Definition of Done, §14.4 item 8)

Before a feature is done, verify it on **an Android device or emulator** and in
**one desktop browser**:

- [ ] Loading state appears and is not a blank screen
- [ ] Empty state explains what to do next and offers a way to do it
- [ ] Error state is recoverable — a retry, not a dead end
- [ ] Offline behaviour is stated, not silent
- [ ] Touch targets are comfortable one-handed (≥44 dp — NFR-U-03)
- [ ] Works with the OS font size at maximum, with no clipping (NFR-U-04)
- [ ] Works in both light and dark mode (NFR-U-06)
- [ ] Every control has a screen-reader label (NFR-U-05)

---

## The golden path (§19.1) — run end to end, on both platforms

- [ ] Register → land on Home
- [ ] Search the library and open an exercise's detail page
- [ ] Reached that detail page in ≤5 interactions from launch (J1 acceptance)
- [ ] Create a routine with ≥3 exercises
- [ ] Start a workout from that routine; the exercises are prefilled
- [ ] Log ≥9 sets with weight and reps
- [ ] Logging one set took ≤3 taps with values prefilled (J2 acceptance)
- [ ] The rest timer starts on set completion and counts down correctly
- [ ] Finish; the summary shows duration, volume and any records
- [ ] The workout appears in history with every set intact
- [ ] A progress chart renders for one of the logged exercises
- [ ] From Home, a specific exercise's trend is ≤3 interactions away (J3)

## Reliability — the ones that matter most (R6)

- [ ] **Kill the app mid-workout** and relaunch: the in-progress workout is
      intact, with every set
- [ ] **Airplane mode:** log a full workout offline; the UI never blocks and
      never shows an error where an offline indicator belongs
- [ ] Reconnect: everything syncs with **no duplicate sets** and no lost sets
- [ ] Log a set, force-quit before the request completes, relaunch: the set is
      there exactly once
- [ ] Two rapid taps on "Finish workout" produce one completed workout, not two
- [ ] Start a workout on the web while one is in progress on the phone: the
      second is refused with a clear message, not a crash (FR-WK-02)

## Rest timer (FR-WK-07, FR-WK-08, §13.2)

- [ ] Android: background the app; the notification fires at the right time
- [ ] Android: lock the screen; the countdown is correct on return, not frozen
- [ ] Web: the countdown is correct after switching tabs for two minutes
- [ ] Web: the "keep this tab open" degradation notice is shown (§13.2 requires
      the gap to be stated, not silent)
- [ ] Skip and +30s both behave, and the timer survives a set being edited

## Units (FR-WK-12)

- [ ] Switch to pounds: every weight on screen converts, and nothing logged
      changes
- [ ] Enter a weight in pounds, switch to kilograms: the value is the same load,
      not the same number
- [ ] A decimal weight (e.g. 82.5) round-trips exactly, with no drift

## Media (FR-MED-07, FR-MED-08)

v1 ships without demonstration media (see `adr/0003-media-in-v1.md`), so the
placeholder path is the normal path and must look deliberate.

- [ ] Every exercise shows the placeholder, never an empty or broken frame
- [ ] Instructions are readable and sufficient without an illustration
- [ ] With a test asset attached: a takedown removes it from the UI on the next
      request, with no deploy, and the exercise page still renders

## CORS (NFR-C-07, NFR-C-10)

CORS breaks the browser only — native Android sends no `Origin` — so it must be
checked in a real browser, not on a device.

- [ ] The web app works against staging from its configured origin
- [ ] A request from an unlisted origin is blocked by the browser
- [ ] The API does not return a bespoke page that leaks the allowlist
- [ ] Direct browser upload to R2 works (bucket CORS is a separate surface)

## Cross-platform sweep (§13.1) — before each phase exit

Required tier, all of it:

- [ ] Android app (primary)
- [ ] Chrome on Android
- [ ] Chrome desktop
- [ ] Edge desktop
- [ ] Safari desktop
- [ ] Tablet browser at the two-column layout (≥900 px — NFR-U-01)

Best-effort, note but do not gate: Firefox desktop, Android 10-era devices,
Safari on iPhone.

## Performance (§19.2)

- [ ] A logged set appears instantly — no perceptible wait, on a slow connection
- [ ] Android cold start to an interactive Home is under 2.5 s on a mid-range
      device
- [ ] Exercise search feels immediate while typing
- [ ] The first request after the database has been idle is slow but succeeds,
      and shows cached data rather than a spinner (NFR-R-06)

## Security spot checks

- [ ] Signing in with a wrong password and with an unknown email give the same
      message and take a similar time
- [ ] Another account's routine, workout or custom exercise returns 404, not 403
- [ ] `/api/v1/admin/exercises` returns 404 for a non-admin
- [ ] No email address, token or request body appears in the API logs
- [ ] A password change signs out every existing session
