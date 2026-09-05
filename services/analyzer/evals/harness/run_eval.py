"""`make eval` — run every golden clip, score every gate, write report.json.

Exits 0 even with red gates. A failing gate is data; the loop reads the report,
not the exit code. `--strict` exits 1 on any red gate, which is what CI calls.

The analyzer is invoked IN-PROCESS rather than as a subprocess. Determinism (G7)
compares two runs, and a subprocess boundary would hide exactly the class of
bug that gate exists to catch — a module-level cache or an unseeded RNG that
behaves differently on a second call within one interpreter.
"""

from __future__ import annotations

import argparse
import json
import platform
import sys
import time
import traceback
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .gates import ALL_GATES, Outcome, worst_red
from .loader import Clip, ManifestError, load_manifest

REPORT = Path(__file__).resolve().parents[1] / "report.json"


def _analyze(clip: Clip) -> tuple[dict[str, Any] | None, str | None, int | None]:
    """Run the analyzer over one clip.

    Every exception is caught and recorded rather than propagated: one bad clip
    must not end the eval run, because the run's whole purpose is to tell us how
    many clips are bad.
    """
    started = time.perf_counter()
    try:
        from analyzer.cli import analyze_video

        result = analyze_video(
            video=clip.path,
            exercise=clip.exercise,
            view=clip.view_requested,
        )
        elapsed = int((time.perf_counter() - started) * 1000)
        return result, None, elapsed
    except NotImplementedError as exc:
        # The stub. Expected until the pipeline exists, and reported as a
        # blocked gate rather than a crash.
        return None, f"not_implemented: {exc}", None
    except Exception:  # noqa: BLE001 — deliberately broad, see docstring
        return None, traceback.format_exc(limit=6), int((time.perf_counter() - started) * 1000)


def run(strict: bool = False) -> int:
    try:
        clips = load_manifest()
    except ManifestError as exc:
        # A malformed manifest is not a red gate — it means the ground truth
        # itself is broken and nothing measured against it would mean anything.
        print(f"MANIFEST INVALID: {exc}", file=sys.stderr)
        return 2

    outcomes: list[Outcome] = []
    for clip in clips:
        if not clip.present:
            outcomes.append(Outcome(clip=clip, result=None, error=None, runtime_ms=None))
            continue

        result, error, elapsed = _analyze(clip)
        repeat = None
        if result is not None:
            repeat, _, _ = _analyze(clip)
        outcomes.append(
            Outcome(clip=clip, result=result, error=error, runtime_ms=elapsed, repeat=repeat)
        )

    gates = [gate(outcomes) for gate in ALL_GATES]
    next_gate = worst_red(gates)

    present = [o for o in outcomes if o.clip.present]
    report = {
        "generated_at": datetime.now(UTC).isoformat(),
        "python": platform.python_version(),
        "clips": {
            "total": len(clips),
            "present": len(present),
            "missing_footage": [o.clip.id for o in outcomes if not o.clip.present],
        },
        "gates": [g.as_dict() for g in gates],
        "summary": {
            "green": sum(1 for g in gates if g.verdict == "green"),
            "red": sum(1 for g in gates if g.verdict == "red"),
            "blocked": sum(1 for g in gates if g.verdict == "blocked"),
        },
        # What Loop A should work on next, decided here rather than by eye, so
        # the choice is reproducible and recorded.
        "next_gate": next_gate.id if next_gate else None,
        "next_gate_reason": (
            f"highest severity red ({next_gate.severity}), blocks {len(next_gate.blocks)} stage(s)"
            if next_gate
            else "no red gates — check for blocked ones before declaring success"
        ),
    }

    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    _print(report)

    if strict and report["summary"]["red"]:
        return 1
    return 0


def _print(report: dict[str, Any]) -> None:
    clips = report["clips"]
    print(f"\n  clips: {clips['present']}/{clips['total']} present")
    if clips["missing_footage"]:
        print(f"  awaiting footage: {', '.join(clips['missing_footage'])}")
    print()

    mark = {"green": "PASS", "red": "FAIL", "blocked": "----"}
    for gate in report["gates"]:
        value = "" if gate["value"] is None else f"{gate['value']:.3g}"
        print(
            f"  [{mark[gate['verdict']]}] {gate['id']:<28} "
            f"{gate['severity']:<8} {value:>8}  {gate['detail']}"
        )

    summary = report["summary"]
    print(
        f"\n  {summary['green']} green · {summary['red']} red · "
        f"{summary['blocked']} blocked"
    )
    if report["next_gate"]:
        print(f"  next: {report['next_gate']} — {report['next_gate_reason']}")
    print(f"  report: {REPORT}\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the analyzer eval suite.")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="exit non-zero when any gate is red (for CI)",
    )
    args = parser.parse_args()
    return run(strict=args.strict)


if __name__ == "__main__":
    raise SystemExit(main())
