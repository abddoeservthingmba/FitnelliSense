"""Analyzer entry point.

    analyze --video in.mp4 --exercise back_squat --view side --out result.json

STATUS: STUB. The pipeline does not exist yet, and this file deliberately does
nothing except refuse. The build order puts the eval harness before any
computer-vision code so that every stage is added against a measurement that
already works — the alternative is writing a pipeline and then inventing an
evaluation that flatters it.

`analyze_video` raises `NotImplementedError`, which the harness records as a
blocked gate rather than a crash. That is the honest starting state: nothing has
been measured, so no gate may claim a value.

The interface is stateless and idempotent on `(video_sha256, exercise, view)` —
the same three inputs must always produce the same output, which is what lets
the API cache a result and what G7 checks on every run.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any

from . import __version__, ingest, result


def analyze_video(*, video: Path, exercise: str, view: str) -> dict[str, Any]:
    """Analyse one set and return a result conforming to the output schema.

    STAGE 1 OF 11 IS BUILT. Ingest probes the clip and refuses one it cannot
    measure. Everything after it — pose, calibration, bar tracking, rep
    segmentation, kinematics, rules, scoring — does not exist yet, so a clip
    that PASSES ingest comes back `no_reps_detected`.

    That status is honest rather than convenient: ingest genuinely succeeded
    and nothing downstream found any reps, because nothing downstream is there
    to look. It is a real state in the schema and the client already renders
    it. Returning `ok` with an empty set would claim an analysis happened.
    """
    started = time.perf_counter()

    def elapsed() -> int:
        return int((time.perf_counter() - started) * 1000)

    found, reason = ingest.check(video)
    if reason is not None:
        return result.abstain(
            reason=reason,
            exercise=exercise,
            runtime_ms=elapsed(),
            frames_processed=0,
        )

    assert found is not None
    return result.envelope(
        status="no_reps_detected",
        exercise=exercise,
        runtime_ms=elapsed(),
        # Not "none": calibration has not been ATTEMPTED, which is different
        # from having been tried and failed. Left null until the stage exists.
        calibration_method=None,
        frames_processed=found.frame_count,
    )


def main() -> int:
    parser = argparse.ArgumentParser(prog="analyze", description="Analyse one weightlifting set.")
    parser.add_argument("--video", required=True, type=Path)
    parser.add_argument("--exercise", required=True)
    parser.add_argument("--view", required=True, choices=["side", "front", "rear", "45"])
    parser.add_argument("--out", type=Path)
    parser.add_argument("--version", action="version", version=__version__)
    args = parser.parse_args()

    analysis = analyze_video(video=args.video, exercise=args.exercise, view=args.view)

    # sort_keys so two runs of the same clip serialise identically (G7).
    payload = json.dumps(analysis, indent=2, sort_keys=True)
    if args.out:
        args.out.write_text(payload + "\n", encoding="utf-8")
    else:
        print(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
