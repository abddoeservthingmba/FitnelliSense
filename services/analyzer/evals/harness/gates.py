"""Gate definitions and scoring.

Each gate returns one of three verdicts, and the third one matters:

    green    — target met
    red      — target not met
    blocked  — could not be evaluated (no footage, or the stage does not exist)

`blocked` is not a soft `red`. A gate that never ran is not evidence, and
reporting it as a failure invites tuning against a number nobody measured. The
loop protocol picks the highest-severity RED gate; blocked gates are reported
and skipped.

`blocks` lists the downstream stages a red gate makes untrustworthy. It is the
documented tie-break for Loop A step 2 — on equal severity, work the gate
blocking the most stages.
"""

from __future__ import annotations

import statistics
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Any, Literal

from .loader import Clip

Verdict = Literal["green", "red", "blocked"]
Severity = Literal["critical", "high", "medium", "low"]

SEVERITY_RANK: dict[Severity, int] = {"critical": 3, "high": 2, "medium": 1, "low": 0}


@dataclass
class GateResult:
    id: str
    severity: Severity
    verdict: Verdict
    value: float | None
    target: str
    blocks: list[str]
    detail: str
    #: Per-clip contributions, so a red gate can be read without rerunning.
    breakdown: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "severity": self.severity,
            "verdict": self.verdict,
            "value": self.value,
            "target": self.target,
            "blocks": self.blocks,
            "detail": self.detail,
            "breakdown": self.breakdown,
        }


@dataclass(frozen=True)
class Outcome:
    """What the analyzer returned for one clip, plus how it went."""

    clip: Clip
    result: dict[str, Any] | None
    error: str | None
    runtime_ms: int | None
    #: Second run, for the determinism gate. None when not double-run.
    repeat: dict[str, Any] | None = None
    #: The stage does not exist yet, as opposed to existing and failing.
    not_implemented: bool = False

    @property
    def ran(self) -> bool:
        return self.result is not None and self.error is None

    @property
    def crashed(self) -> bool:
        """An actual failure, as distinct from a stage nobody has written.

        The distinction is not pedantry. Without it, `NotImplementedError` from
        the stub makes G9 red on iteration 1 and the loop dutifully selects
        "fix the unhandled exceptions" as the highest-severity work — when the
        real task is to write the pipeline at all. A gate that reports the
        absence of code as a defect in code sends the loop somewhere useless.
        """
        return self.error is not None and not self.not_implemented


def _blocked(
    gate_id: str, severity: Severity, target: str, blocks: list[str], why: str
) -> GateResult:
    return GateResult(gate_id, severity, "blocked", None, target, blocks, why)


def gate_rep_count(outcomes: Sequence[Outcome]) -> GateResult:
    blocks = ["kinematics", "rules", "scoring", "coaching"]
    eligible = [
        o for o in outcomes
        if o.clip.present and not o.clip.should_abstain and o.clip.true_rep_count is not None
    ]
    if not eligible:
        return _blocked(
            "rep_count_exact", "high", "15/15 exact", blocks,
            "no present clip carries a labelled rep count",
        )

    hits = {
        o.clip.id: (o.result or {}).get("set", {}).get("rep_count")
        for o in eligible
    }
    matched = sum(1 for o in eligible if hits[o.clip.id] == o.clip.true_rep_count)
    value = matched / len(eligible)

    return GateResult(
        "rep_count_exact", "high",
        "green" if matched == len(eligible) else "red",
        value, "15/15 exact", blocks,
        f"{matched}/{len(eligible)} clips matched exactly",
        {o.clip.id: {"expected": o.clip.true_rep_count, "got": hits[o.clip.id]} for o in eligible},
    )


def gate_depth_agreement(outcomes: Sequence[Outcome]) -> GateResult:
    blocks = ["depth_score"]
    agree = total = 0
    breakdown: dict[str, Any] = {}

    for o in outcomes:
        if not (o.clip.present and o.ran and o.clip.labelled_reps):
            continue
        reps = (o.result or {}).get("reps", [])
        per_clip = []
        for label in o.clip.reps:
            if label.depth_ok is None:
                continue
            got = next((r for r in reps if r.get("index") == label.index), None)
            if got is None:
                total += 1
                per_clip.append({"rep": label.index, "expected": label.depth_ok, "got": None})
                continue
            tripped = any(
                f.get("rule_id") == "squat_depth_insufficient" for f in got.get("findings", [])
            )
            predicted_ok = not tripped
            total += 1
            if predicted_ok == label.depth_ok:
                agree += 1
            per_clip.append({"rep": label.index, "expected": label.depth_ok, "got": predicted_ok})
        if per_clip:
            breakdown[o.clip.id] = per_clip

    if total == 0:
        return _blocked(
            "depth_verdict_agreement", "high", ">= 95%", blocks,
            "no present clip carries per-rep depth labels",
        )

    value = agree / total
    return GateResult(
        "depth_verdict_agreement", "high",
        "green" if value >= 0.95 else "red",
        value, ">= 95%", blocks,
        f"{agree}/{total} reps agreed", breakdown,
    )


def gate_phase_boundary(outcomes: Sequence[Outcome]) -> GateResult:
    blocks = ["tempo_score", "dropped_eccentric", "velocity_metrics"]
    errors: list[int] = []
    breakdown: dict[str, Any] = {}

    for o in outcomes:
        if not (o.clip.present and o.ran and o.clip.labelled_reps):
            continue
        reps = (o.result or {}).get("reps", [])
        per_clip: list[int] = []
        for label in o.clip.reps:
            got = next((r for r in reps if r.get("index") == label.index), None)
            if got is None:
                continue
            phases = got.get("phases", {})
            for name, start in label.boundaries().items():
                span = phases.get(name)
                if not span:
                    continue
                per_clip.append(abs(int(span[0]) - start))
        if per_clip:
            errors.extend(per_clip)
            breakdown[o.clip.id] = {"median": statistics.median(per_clip), "n": len(per_clip)}

    if not errors:
        return _blocked(
            "phase_boundary_error", "medium", "<= 3 frames median", blocks,
            "no phase boundaries were produced to compare",
        )

    value = float(statistics.median(errors))
    return GateResult(
        "phase_boundary_error", "medium",
        "green" if value <= 3 else "red",
        value, "<= 3 frames median", blocks,
        f"median {value:.1f} frames over {len(errors)} boundaries", breakdown,
    )


def _rule_confusion(outcomes: Sequence[Outcome], severity: str) -> tuple[int, int, int]:
    """Return (true_positives, false_positives, false_negatives) for a severity."""
    tp = fp = fn = 0
    for o in outcomes:
        if not (o.clip.present and o.ran):
            continue
        emitted = {
            f.get("rule_id")
            for f in (o.result or {}).get("set", {}).get("findings", [])
            if f.get("severity") == severity
        }
        labelled = {f.rule_id for f in o.clip.known_faults if f.severity == severity}
        tp += len(emitted & labelled)
        fp += len(emitted - labelled)
        fn += len(labelled - emitted)
    return tp, fp, fn


def gate_unsafe_recall(outcomes: Sequence[Outcome]) -> GateResult:
    tp, _fp, fn = _rule_confusion(outcomes, "unsafe")
    if tp + fn == 0:
        return _blocked(
            "unsafe_rule_recall", "critical", ">= 0.90", [],
            "no present clip carries a labelled `unsafe` fault (see R05)",
        )
    value = tp / (tp + fn)
    return GateResult(
        "unsafe_rule_recall", "critical",
        "green" if value >= 0.90 else "red",
        value, ">= 0.90", [],
        f"recall {value:.2f} (tp={tp} fn={fn})",
    )


def gate_minor_precision(outcomes: Sequence[Outcome]) -> GateResult:
    tp, fp, _fn = _rule_confusion(outcomes, "minor")
    if tp + fp == 0:
        return _blocked(
            "minor_rule_precision", "medium", ">= 0.80", [],
            "no `minor` findings were emitted",
        )
    value = tp / (tp + fp)
    return GateResult(
        "minor_rule_precision", "medium",
        "green" if value >= 0.80 else "red",
        value, ">= 0.80", [],
        f"precision {value:.2f} (tp={tp} fp={fp})",
    )


def gate_no_verdict_on_low_quality(outcomes: Sequence[Outcome]) -> GateResult:
    """The hard rule: abstain, and say why, or fail."""
    eligible = [o for o in outcomes if o.clip.present and o.clip.should_abstain]
    if not eligible:
        return _blocked(
            "no_verdict_on_low_quality", "critical", "0 verdicts", [],
            "no present clip is labelled insufficient_quality (see R10-R12, S03)",
        )

    violations: dict[str, str] = {}
    for o in eligible:
        result = o.result or {}
        status = result.get("status")
        if status != "insufficient_quality":
            violations[o.clip.id] = f"status was {status!r}, expected insufficient_quality"
            continue
        if result.get("set", {}).get("findings"):
            violations[o.clip.id] = "abstained but still emitted findings"
            continue
        reason = result.get("quality", {}).get("reason")
        if reason != o.clip.expected_quality_reason:
            violations[o.clip.id] = (
                f"reason was {reason!r}, expected {o.clip.expected_quality_reason!r}"
            )

    return GateResult(
        "no_verdict_on_low_quality", "critical",
        "green" if not violations else "red",
        float(len(violations)), "0 verdicts", [],
        f"{len(violations)} of {len(eligible)} abstain clips misbehaved",
        violations,
    )


def gate_determinism(outcomes: Sequence[Outcome]) -> GateResult:
    """Byte-identical across two runs, `runtime_ms` excluded."""
    import json

    blocks = ["threshold_tuning"]
    compared = [o for o in outcomes if o.clip.present and o.result and o.repeat]
    if not compared:
        return _blocked(
            "determinism", "critical", "byte-identical", blocks,
            "no clip produced two runs to compare",
        )

    def canonical(payload: dict[str, Any]) -> str:
        clone = json.loads(json.dumps(payload))
        clone.get("diagnostics", {}).pop("runtime_ms", None)
        return json.dumps(clone, sort_keys=True, separators=(",", ":"))

    differing = [o.clip.id for o in compared if canonical(o.result) != canonical(o.repeat)]

    return GateResult(
        "determinism", "critical",
        "green" if not differing else "red",
        float(len(differing)), "byte-identical", blocks,
        f"{len(differing)} of {len(compared)} clips differed between runs",
        {"differing": differing},
    )


def gate_runtime(outcomes: Sequence[Outcome]) -> GateResult:
    timings = [o.runtime_ms for o in outcomes if o.clip.present and o.runtime_ms is not None]
    if not timings:
        return _blocked("runtime_p95", "low", "<= 45000 ms p95", [], "nothing ran")

    ordered = sorted(timings)
    # Nearest-rank p95, which is well-defined on tiny samples where
    # interpolation is not.
    index = max(0, min(len(ordered) - 1, int(round(0.95 * len(ordered))) - 1))
    value = float(ordered[index])
    return GateResult(
        "runtime_p95", "low",
        "green" if value <= 45_000 else "red",
        value, "<= 45000 ms p95", [],
        f"p95 {value:.0f} ms over {len(timings)} clips",
    )


def gate_no_exceptions(outcomes: Sequence[Outcome]) -> GateResult:
    blocks = ["everything"]
    present = [o for o in outcomes if o.clip.present]
    if not present:
        return _blocked("no_unhandled_exceptions", "critical", "0", blocks, "no footage present")

    # A stage that has not been written cannot be said to crash. Reported as
    # blocked so the loop is not sent to fix an exception that is really an
    # absence.
    if all(o.not_implemented for o in present):
        return _blocked(
            "no_unhandled_exceptions", "critical", "0", blocks,
            "the pipeline is a stub — nothing has run to raise",
        )

    failures = {o.clip.id: o.error for o in present if o.crashed}
    return GateResult(
        "no_unhandled_exceptions", "critical",
        "green" if not failures else "red",
        float(len(failures)), "0", blocks,
        f"{len(failures)} of {len(present)} clips raised", failures,
    )


def gate_no_magic_numbers(_outcomes: Sequence[Outcome]) -> GateResult:
    """AST scan of the rule modules. Runs whether or not any footage exists."""
    from .magic_numbers import scan_rule_modules

    hits = scan_rule_modules()
    detail = (
        "no rule modules yet — the scan passed vacuously"
        if not hits and not _rule_modules_exist()
        else f"{len(hits)} float literal(s) outside thresholds.yaml"
    )
    return GateResult(
        "no_magic_numbers", "high",
        "green" if not hits else "red",
        float(len(hits)), "0 hits", ["threshold_tuning"],
        detail, {"hits": hits},
    )


def _rule_modules_exist() -> bool:
    from .magic_numbers import RULES_DIR

    return RULES_DIR.is_dir() and any(RULES_DIR.glob("*.py"))


#: Evaluated in this order; the report preserves it.
ALL_GATES: list[Callable[[Sequence[Outcome]], GateResult]] = [
    gate_rep_count,
    gate_depth_agreement,
    gate_phase_boundary,
    gate_unsafe_recall,
    gate_minor_precision,
    gate_no_verdict_on_low_quality,
    gate_determinism,
    gate_runtime,
    gate_no_exceptions,
    gate_no_magic_numbers,
]


def worst_red(results: Sequence[GateResult]) -> GateResult | None:
    """The gate Loop A should work next.

    Highest severity first; ties broken by how many downstream stages the gate
    blocks, exactly as GATES.md documents. Returns None when nothing is red —
    which does not mean everything is green, since gates may be blocked.
    """
    reds = [r for r in results if r.verdict == "red"]
    if not reds:
        return None
    return max(reds, key=lambda r: (SEVERITY_RANK[r.severity], len(r.blocks)))
