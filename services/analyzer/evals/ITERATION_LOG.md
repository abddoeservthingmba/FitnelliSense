# Iteration log

One entry per Loop A iteration, appended, never edited. A log that gets tidied
up afterwards loses the thing it is for: the record of what was believed at the
time and how that belief turned out.

**Every entry states the hypothesis BEFORE the change**, because a hypothesis
written afterwards is a description of what happened, and it always sounds
right. The value of this file is the entries where the hypothesis was wrong.

## Format

```
## Iteration N — <gate id>

Gate targeted : <id> (severity, why it was picked over the others)
Hypothesis    : <one or two sentences, written before touching code>
Failing test  : <path::test_name — committed on its own, before the fix>
Change        : <the minimum change made>

| Gate | Before | After |
|---|---|---|
| ... | ... | ... |

Verdict : improved | no change | regressed
Notes   : what the numbers actually showed, especially if it was not the hypothesis
```

## Rules this log enforces

- A gate that regresses by more than 2% means `git revert`, and the revert is
  logged with what is now believed to have caused it. A regression traded for a
  gain is a decision that has to be made in the open, not absorbed quietly.
- Two consecutive iterations with no net gate improvement means STOP and write
  `BLOCKERS.md`. Grinding past that point is how a week disappears into a
  threshold that was never the problem.
- Eight iterations means stop regardless of state.

---

## Iteration 0 — scaffold

Not a Loop A iteration. Recorded so the starting state is on the record and the
first real iteration has something to compare against.

Built: the eval harness, `GATES.md`, the fixture loader, the golden-set
manifest, the synthetic clip generator, and an analyzer stub that raises
`NotImplementedError`.

| Gate | Status | Value |
|---|---|---|
| G1 `rep_count_exact` | blocked | — |
| G2 `depth_verdict_agreement` | blocked | — |
| G3 `phase_boundary_error` | blocked | — |
| G4 `unsafe_rule_recall` | blocked | — |
| G5 `minor_rule_precision` | blocked | — |
| G6 `no_verdict_on_low_quality` | blocked | — |
| G7 `determinism` | blocked | — |
| G8 `runtime_p95` | blocked | — |
| G9 `no_unhandled_exceptions` | blocked | — |
| G10 `no_magic_numbers` | green | 0 hits (vacuous — no rule modules yet) |

Every gate is `blocked` and that is the correct starting state: the harness runs,
the golden set parses, and the analyzer has not been written. Nothing has been
measured, so nothing claims a value.

**One thing was found and fixed during the scaffold**, worth recording because
it would have corrupted every later measurement: the synthetic clips' phase
boundaries were hand-written beside their generator config and were already
wrong. `round(0.15 * 30)` is 4, not 5 — Python rounds half to even — and S01's
fifth rep ran 30 frames past the requested `duration_s`, so it would have been
silently truncated. The labels are now derived from the same `phase_plan` the
generator draws from, and the loader rejects a synthetic clip that hand-writes
them. A wrong label on a synthetic clip does not look like a bug; it looks like
the pipeline failing, and it would have been debugged in the wrong place.

Verdict : n/a (scaffold)

## Iteration 0b — first execution

Python 3.11.9 installed; the scaffold ran for the first time. Everything above
had been written and statically validated but never executed, and that
distinction paid for itself immediately: **five defects, none of which reading
would have found.**

1. **`numpy==2.1.3` was unresolvable.** mediapipe 0.10.18 declares `numpy<2`
   and pip refused the resolve outright. The pin had been written from habit.
   Now `1.26.4`.
2. **G9 was red for the wrong reason.** The stub's `NotImplementedError` was
   counted as an unhandled exception, so the harness selected
   `no_unhandled_exceptions` as the highest-severity work — pointing the loop
   at "fix the crashes" when the real task is "write the pipeline". `Outcome`
   now separates *not implemented* from *crashed*, and G9 reports blocked
   while the pipeline is a stub. This one mattered: it would have wasted the
   first iteration.
3. **Stale clip ids in two gate messages** — `see R06` and `see R11-R13`, left
   behind when the golden set was cut from 15 real slots to 12. They pointed
   at footage that no longer exists under those names.
4. **A bug in my own test.** `zip(spans, spans[1:], strict=True)` can only ever
   raise: the second list is shorter by one by construction, which is the
   entire point of a pairwise walk. Now `itertools.pairwise`.
5. **Em-dashes rendered as `?`** in the terminal — Windows consoles default to
   cp1252. `report.json` was always UTF-8; only the human-readable output was
   affected.

Verified by running, not by reading:

| Check | Result |
|---|---|
| `pytest` | 26 passed |
| `ruff check` | all checks passed |
| Synthetic clips generated | 3, at 1080x1920 |
| Frame counts vs `phase_plan` | 480 / 427 / 156 — exact |
| Regeneration byte-identical | yes, all three (SHA-256) |
| `make eval` | runs, writes report.json, picks `next_gate` |

The regeneration check matters more than it looks: G7 compares two analyzer
runs, and if the CLIPS were not reproducible the gate would be measuring the
generator's noise rather than the pipeline's determinism.

Gate status now: **1 green, 2 red, 7 blocked.** `next_gate` is
`no_verdict_on_low_quality`, which is the correct first target — S03 must be
rejected at ingest for being 12 fps, and that is the smallest slice of pipeline
that turns any gate green.

Verdict : improved (scaffold now executes)
Notes   : `make` itself is still absent on this machine; the targets are
          invoked directly as `.venv/Scripts/python.exe -m evals.harness.*`.
          The Makefile is unverified for that reason and is the one part of
          the scaffold still taken on trust.
