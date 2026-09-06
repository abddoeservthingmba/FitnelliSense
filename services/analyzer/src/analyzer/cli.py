"""Analyzer entry point.

    analyze --video in.mp4 --exercise back_squat --view side --out result.json

STATUS: stages 1, 6 and 7 of 11 — ingest, bar tracking, rep segmentation.

The build order puts the eval harness before any computer-vision code, so every
stage is added against a measurement that already works. The alternative is
writing a pipeline and then inventing an evaluation that flatters it.

What that means for a caller today: a set comes back counted, with rep spans
and phase boundaries, and with every angle, distance and velocity null. Those
are null rather than estimated, because the stages that would measure them do
not exist and a plausible-looking number is worse than an absent one.

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

from . import __version__, ingest, result, segmentation, tracking
from .thresholds import thresholds


def analyze_video(*, video: Path, exercise: str, view: str) -> dict[str, Any]:
    """Analyse one set and return a result conforming to the output schema.

    INGEST, BAR TRACKING AND SEGMENTATION ARE BUILT. Pose, calibration,
    kinematics, rules and scoring are not, so a counted set comes back with
    rep spans and phases and nothing else: every angle, every distance and
    every velocity is null.

    They are null rather than absent, and rather than filled in from pixels.
    A pixel ROM is a real measurement of nothing anyone can act on — it changes
    with how far away the phone was — so publishing it as a number would invite
    exactly the comparison it cannot support.
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

    series = tracking.track(video, fps=found.fps)

    # ABSTAIN BEFORE SEGMENTING. This is the check whose absence let a scatter
    # plot become 71 reps: tracking had no way to say "I do not believe this",
    # so segmentation was handed noise and did its job faithfully on it.
    #
    # THREE SIGNALS, AND EACH ONE IS HERE BECAUSE THE ONES BEFORE IT MISSED.
    #
    # Coherence asks whether each frame followed from the last. A lock can
    # satisfy that at every step and still walk onto a different object
    # entirely, one plausible step at a time: 64% coherence cleared this floor
    # on a clip that tracked three different sizes of thing.
    #
    # Radius spread asks whether it stayed the SAME object. A rigid plate in
    # front of a static camera does not change size.
    #
    # Travel asks whether that object ever MOVED LIKE A BARBELL. Both checks
    # above score perfectly on a light fitting, because a light fitting is the
    # most coherent, most size-stable thing in the room — 47.6 s of unbroken
    # lock, reported as 4 reps. Nothing that holds still is doing a set.
    limits = thresholds()
    incoherent = series.coherence < float(limits.value("tracking.min_coherence"))
    inconsistent = series.radius_spread > float(limits.value("tracking.max_radius_spread_ratio"))
    motionless = series.travel_in_radii < float(limits.value("tracking.min_travel_plate_radii"))
    if incoherent or inconsistent or motionless:
        return result.abstain(
            reason="bar_not_tracked",
            exercise=exercise,
            runtime_ms=elapsed(),
            frames_processed=found.frame_count,
        )

    reps = segmentation.close_lockouts(
        segmentation.segment(series.y, exercise),
        last_frame=len(series),
    )

    # STAGE 5 IS NOT BUILT, so there is no scale. Reported as "none" rather
    # than left null: null would mean nobody looked, "none" means we looked and
    # found nothing to measure against. The spec forbids a silent fallback, and
    # this is the difference between the two.
    if not reps:
        return result.envelope(
            status="no_reps_detected",
            exercise=exercise,
            runtime_ms=elapsed(),
            calibration_method="none",
            frames_processed=found.frame_count,
        )

    return result.envelope(
        status="ok",
        exercise=exercise,
        runtime_ms=elapsed(),
        calibration_method="none",
        frames_processed=found.frame_count,
        reps=[_rep_to_wire(rep, series.fps) for rep in reps],
    )


def _rep_to_wire(rep: segmentation.Rep, fps: float) -> dict[str, Any]:
    """One rep in schema shape.

    Durations ARE published: a phase length in seconds needs only the frame
    rate, which the container states. Distances and velocities are not, because
    they need a scale that does not exist yet.
    """
    return {
        "index": rep.index,
        "status": "ok",
        "frames": [rep.frames[0], rep.frames[1]],
        "phases": {
            "eccentric": list(rep.eccentric),
            "bottom": list(rep.bottom),
            "concentric": list(rep.concentric),
            "lockout": list(rep.lockout),
        },
        "rom_m": None,
        "ecc_s": round((rep.eccentric[1] - rep.eccentric[0]) / fps, 3) if fps > 0 else None,
        "con_s": round((rep.concentric[1] - rep.concentric[0]) / fps, 3) if fps > 0 else None,
        "mean_con_velocity_ms": None,
        "peak_velocity_ms": None,
        "angles": {"knee_min_deg": None, "hip_min_deg": None, "torso_incl_max_deg": None},
        "bar_path": {"horizontal_drift_m": None, "drift_pct_bar_length": None},
        "findings": [],
    }


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
