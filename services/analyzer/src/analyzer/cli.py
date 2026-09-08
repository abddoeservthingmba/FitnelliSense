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

from . import __version__, barpath, ingest, result, segmentation, tracking


def analyze_video(
    *,
    video: Path,
    exercise: str,
    view: str,
    seed: tracking.Seed | None = None,
) -> dict[str, Any]:
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

    series = tracking.track(video, fps=found.fps, seed=seed)

    # ABSTAIN BEFORE SEGMENTING, on the three signals `tracking.refuse` holds.
    # They live there rather than here because the bar-path export needs the
    # same verdict, and a gate written out at two call sites is a gate that
    # will eventually differ between them.
    refused = tracking.refuse(series)
    if refused is not None:
        return result.abstain(
            reason="bar_not_tracked",
            exercise=exercise,
            runtime_ms=elapsed(),
            frames_processed=found.frame_count,
        )

    # The frame rate reaches segmentation because a rep's trailing pause is
    # bounded in SECONDS: a lockout is under a second whatever the camera was
    # doing, and anything longer is rest rather than a phase of the rep.
    reps = segmentation.segment(series.y, exercise, fps=series.fps)

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


def _parse_seed(raw: str | None) -> tracking.Seed | None:
    """`X,Y` or `X,Y,FRAME`. Raises rather than ignoring a malformed value.

    A tap that silently fails to parse would fall back to the guessing path
    and produce a plausible-looking answer about the wrong object, which is
    the whole failure mode this feature exists to remove.
    """
    if raw is None:
        return None

    parts = raw.split(",")
    if len(parts) not in (2, 3):
        raise SystemExit("--seed must be X,Y or X,Y,FRAME")
    try:
        x, y = float(parts[0]), float(parts[1])
        frame = int(parts[2]) if len(parts) == 3 else 0
    except ValueError as bad:
        raise SystemExit(f"--seed is not numeric: {raw}") from bad
    if frame < 0:
        raise SystemExit("--seed frame cannot be negative")
    return tracking.Seed(x=x, y=y, frame=frame)


def _parse_seed_fraction(raw: str | None) -> tuple[float, float, float] | None:
    """`X,Y` or `X,Y,SECS`, with X and Y as fractions of the frame.

    RANGE-CHECKED, and it raises rather than clamping. A fraction outside [0, 1]
    means the caller measured the tap against something other than the frame —
    a view with letterboxing, or the wrong dimension of a rotated clip — and
    clamping it to the edge would turn that bug into a lock on whatever sits at
    the border of the picture, which is exactly the confident wrong answer this
    pipeline keeps having to be defended against.
    """
    if raw is None:
        return None

    parts = raw.split(",")
    if len(parts) not in (2, 3):
        raise SystemExit("--seed-frac must be X,Y or X,Y,SECS")
    try:
        x, y = float(parts[0]), float(parts[1])
        at_secs = float(parts[2]) if len(parts) == 3 else 0.0
    except ValueError as bad:
        raise SystemExit(f"--seed-frac is not numeric: {raw}") from bad

    if not (0.0 <= x <= 1.0 and 0.0 <= y <= 1.0):
        raise SystemExit(f"--seed-frac x and y must be fractions in 0..1, got {x},{y}")
    if at_secs < 0:
        raise SystemExit("--seed-frac seconds cannot be negative")
    return x, y, at_secs


def main() -> int:
    parser = argparse.ArgumentParser(prog="analyze", description="Analyse one weightlifting set.")
    parser.add_argument("--video", required=True, type=Path)
    parser.add_argument("--exercise", required=True)
    parser.add_argument("--view", required=True, choices=["side", "front", "rear", "45"])
    parser.add_argument("--out", type=Path)
    # The lifter's tap, in UPRIGHT source pixels. Two numbers rather than a
    # richer shape because that is genuinely all it is, and a frame index only
    # when the client let them scrub to pick it.
    parser.add_argument(
        "--seed",
        metavar="X,Y[,FRAME]",
        help="where the plate is, in pixels of the upright frame",
    )
    # THE BAR PATH, for a caller that computes its own metrics.
    #
    # The worker that serves production takes this rather than the result
    # envelope below, because range of motion in metres, velocity and bar drift
    # are already implemented and tested in `packages/domain/bar-path.ts` and
    # the wire contract was written against that implementation. See barpath.py.
    parser.add_argument(
        "--emit-path",
        metavar="FILE",
        type=Path,
        help="write the tracked bar path as JSON and do nothing else",
    )
    # THE TAP AS A PHONE REPORTS IT. Fractions of the upright frame the lifter
    # saw, and a time rather than a frame index, because a client knows neither
    # the source resolution nor the exact frame rate reliably. Resolved against
    # the decoded video in `barpath.bar_path`.
    parser.add_argument(
        "--seed-frac",
        metavar="X,Y[,SECS]",
        help="where the plate is, as fractions of the upright frame (0-1)",
    )
    parser.add_argument("--version", action="version", version=__version__)
    args = parser.parse_args()

    seed = _parse_seed(args.seed)

    # Exits here. Tracking is the expensive part and both outputs need it, but
    # nothing wants both in one run — and running the segmenter to throw its
    # answer away would put a second, unused rep count in the logs of every
    # production analysis, which is exactly the kind of thing that gets read
    # later as if it meant something.
    if args.emit_path is not None:
        barpath.write(
            barpath.bar_path(
                video=args.video,
                seed=seed,
                seed_fraction=_parse_seed_fraction(args.seed_frac),
            ),
            args.emit_path,
        )
        return 0

    analysis = analyze_video(
        video=args.video,
        exercise=args.exercise,
        view=args.view,
        seed=seed,
    )

    # sort_keys so two runs of the same clip serialise identically (G7).
    payload = json.dumps(analysis, indent=2, sort_keys=True)
    if args.out:
        args.out.write_text(payload + "\n", encoding="utf-8")
    else:
        print(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
