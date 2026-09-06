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


@real_only
def test_the_tracked_object_keeps_one_size():
    """Identity is position AND SIZE, and size was the half left unconstrained.

    Position continuity alone permits a lock to step onto a neighbouring
    object, one plausible step at a time, until it is across the room: this
    clip drifted 104% of frame height sideways while the tracked radius ranged
    72-234 px, and every individual step was continuous.

    A plate is rigid and the camera is static, so its apparent size changes
    only with the lifter's own depth. It does not triple.
    """
    found, _ = check(REAL)
    series = tracking.track(REAL, fps=found.fps)
    assert series.radius_spread < 2.0, f"radius spread {series.radius_spread:.2f}x"


def test_a_wall_fixture_is_not_a_set_of_reps():
    """The signal both confidence checks scored GREEN on.

    A tracker locked to something that does not move is perfectly coherent and
    perfectly size-stable — 47.6 s of unbroken lock on the real clip, reported
    as 4 reps. Nothing above could object, because both of them measure how
    WELL it tracked and neither asks whether the thing tracked ever moved.

    Travel is measured in plate radii, which needs no calibration: one radius
    is ~22 cm on a 450 mm plate, and every supported lift moves the bar much
    further than that.
    """
    still = tracking.BarSeries(
        x=np.full(600, 900.0),
        y=np.linspace(600.0, 640.0, 600),  # 40 px of wobble
        radius=np.full(600, 160.0),  # a quarter of a radius of travel
        found=np.ones(600, dtype=bool),
        locked=np.ones(600, dtype=bool),
        fps=60.0,
        height=1080,
    )

    assert still.coherence == 1.0, "a fixture tracks perfectly — that is the trap"
    assert still.radius_spread < 1.1, "and it is perfectly size-stable too"
    assert still.travel_in_radii < 1.0, f"but it went nowhere: {still.travel_in_radii:.2f}r"


def test_travel_ignores_a_stray_frame():
    """p5-p95, because min-max is one bad frame from meaningless.

    On the real clip min-max read 4.22 radii — a few stray acquisitions near
    the start stretching a lock that actually moved 0.5 — and would have waved
    it through the gate written to stop it.
    """
    y = np.full(600, 620.0)
    y[3] = 20.0  # one wild detection
    y[7] = 1050.0
    series = tracking.BarSeries(
        x=np.full(600, 900.0),
        y=y,
        radius=np.full(600, 160.0),
        found=np.ones(600, dtype=bool),
        locked=np.ones(600, dtype=bool),
        fps=60.0,
        height=1080,
    )

    assert series.travel_in_radii < 1.0, "two frames must not manufacture a rep"


def test_the_synthetic_clip_still_tracks_cleanly():
    """The guard. Making everything abstain would satisfy the tests above."""
    clip = SYNTH / "S01_squat_side_clean.mp4"
    if not clip.is_file():
        pytest.skip("synthetic clips not generated")

    result = analyze_video(video=clip, exercise="back_squat", view="side")
    assert result["status"] == "ok"
    assert result["set"]["rep_count"] == 5


def test_real_reps_clear_the_travel_floor_by_a_wide_margin():
    """The floor must only ever catch things that are not moving.

    A threshold that genuine reps merely scrape past is a threshold that will
    start refusing real sets the first time someone films from further away.
    S01 measures 5.3 radii against a floor of 1.0.
    """
    clip = SYNTH / "S01_squat_side_clean.mp4"
    if not clip.is_file():
        pytest.skip("synthetic clips not generated")

    series = tracking.track(clip, fps=30.0)
    assert series.travel_in_radii > 3.0, f"only {series.travel_in_radii:.2f}r of margin"
