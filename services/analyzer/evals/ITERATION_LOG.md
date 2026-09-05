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
Notes   : Runtime environment is missing Python, ffmpeg and make — see
          BLOCKERS at the foot of the handover. Nothing here has been EXECUTED,
          only written and statically validated, and that distinction is the
          reason iteration 1 must begin by running `make eval` rather than
          trusting this table.
