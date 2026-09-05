"""Phase boundaries — gate G3 (`phase_boundary_error`).

Measured on synthetic clips only, and GATES.md says so: a boundary label on
real footage is four hand-placed frame indices per rep, each carrying its own
error of a frame or two, and a 3-frame target measured against that would be
measuring the labeller.

The boundary that matters most is the eccentric start. It is where a rep
begins, so an error there shifts every duration in the rep and lands directly
in tempo scoring.
"""

from __future__ import annotations

import statistics
from pathlib import Path

import pytest

from analyzer.cli import analyze_video
from evals.harness.loader import load_manifest

CLIPS = Path(__file__).resolve().parents[1] / "evals" / "clips" / "synthetic"

pytestmark = pytest.mark.skipif(
    not (CLIPS / "S01_squat_side_clean.mp4").is_file(),
    reason="synthetic clips not generated",
)

PHASES = ("eccentric", "bottom", "concentric", "lockout")


def _errors(clip_id: str) -> dict[str, list[int]]:
    clip = next(c for c in load_manifest() if c.id == clip_id)
    result = analyze_video(video=clip.path, exercise=clip.exercise, view=clip.view_requested)

    by_phase: dict[str, list[int]] = {name: [] for name in PHASES}
    for label, got in zip(clip.reps, result["reps"], strict=True):
        for name in PHASES:
            by_phase[name].append(abs(got["phases"][name][0] - label.phases[name][0]))
    return by_phase


def test_median_boundary_error_within_three_frames():
    """The gate itself, over every boundary of every rep."""
    every = [e for errors in _errors("S01").values() for e in errors]
    assert statistics.median(every) <= 3, f"median {statistics.median(every)} frames"


def test_eccentric_start_is_not_the_previous_rep_lockout():
    """The specific defect this iteration exists to fix.

    Bounding an excursion by the previous TOP puts the eccentric start at the
    moment the last rep finished rising, swallowing the whole lockout. On S01
    that is a consistent 13-frame error — the lockout's exact length, which is
    what gives it away as structural rather than noise.
    """
    assert statistics.median(_errors("S01")["eccentric"]) <= 3


def test_last_rep_does_not_run_to_the_end_of_the_clip():
    """With no top detected after the final ascent, the rep used to absorb the tail."""
    assert statistics.median(_errors("S01")["lockout"]) <= 3


def test_holds_on_the_clip_with_decoys():
    """S02's decoys must not drag the boundaries of the real reps around."""
    every = [e for errors in _errors("S02").values() for e in errors]
    assert statistics.median(every) <= 3, f"median {statistics.median(every)} frames"
