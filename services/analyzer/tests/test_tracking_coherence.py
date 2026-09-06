"""Bar tracking must be coherent, or say it is not.

THE FAILURE THIS EXISTS TO PREVENT. On the first real clip ever fed to this
pipeline — 61 s of deadlifts at 60 fps — tracking reported 100% coverage and
the analyzer returned SEVENTY-ONE reps. Hough was finding a circle in every
frame, just a different circle each time: light fittings, plates on the rack,
a fan. Median frame-to-frame movement was 81 px and the maximum was 992 px.

A barbell cannot move 992 px between two frames. The path was a scatter plot,
and the segmenter did exactly what it was told with it.

Coverage was never the right signal. "I found a circle" is not "I found the
bar", and reporting the first as confidence is what let a wrong answer through
with no warning. The gate is CONTINUITY: the same object, moving plausibly.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from analyzer import tracking
from analyzer.cli import analyze_video
from analyzer.ingest import check

REAL = Path(__file__).resolve().parents[1] / "evals" / "clips" / "real" / "USER_latest.mp4"
SYNTH = Path(__file__).resolve().parents[1] / "evals" / "clips" / "synthetic"

real_only = pytest.mark.skipif(not REAL.is_file(), reason="no real clip present")


@real_only
def test_real_clip_does_not_invent_reps():
    """The headline. Either count sensibly or abstain — never 71."""
    result = analyze_video(video=REAL, exercise="deadlift", view="side")

    if result["status"] == "ok":
        # A 61-second set of deadlifts cannot contain more than ~20 reps.
        assert result["set"]["rep_count"] <= 20, result["set"]["rep_count"]
    else:
        assert result["status"] in {"insufficient_quality", "no_reps_detected"}
        assert result["set"]["rep_count"] == 0
        assert result["reps"] == []


@real_only
def test_incoherent_tracking_is_reported_as_such():
    """Tracking must expose HOW WELL it tracked, not merely whether it found something."""
    found, _ = check(REAL)
    series = tracking.track(REAL, fps=found.fps)
    assert 0.0 <= series.coherence <= 1.0


@real_only
def test_a_scatter_plot_is_not_called_a_bar_path():
    """Continuity, measured directly on the series tracking produces."""
    found, _ = check(REAL)
    series = tracking.track(REAL, fps=found.fps)

    kept = series.y[series.found]
    if kept.size > 2:
        jumps = np.abs(np.diff(kept))
        # A plate crosses a fraction of the frame per frame, not most of it.
        assert np.median(jumps) < found.height * 0.05, f"median jump {np.median(jumps):.0f}px"


def test_the_synthetic_clip_still_tracks_cleanly():
    """The guard. Making everything abstain would satisfy the tests above."""
    clip = SYNTH / "S01_squat_side_clean.mp4"
    if not clip.is_file():
        pytest.skip("synthetic clips not generated")

    result = analyze_video(video=clip, exercise="back_squat", view="side")
    assert result["status"] == "ok"
    assert result["set"]["rep_count"] == 5
