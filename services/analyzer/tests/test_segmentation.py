"""Rep segmentation — gate G1 (`rep_count_exact`).

Exact match, not tolerance. A set of 5 reported as 4 is not 80% right; it is a
different set, and every per-rep number downstream is indexed by rep, so a
miscount corrupts all of them.

S02 is the clip that matters here. It contains three real reps plus three
decoy movements — a re-grip at 10% of range, a shuffle at 14%, and a partial
at 35% — and counting any of them is the failure mode this stage exists to
prevent. Anyone can count clean reps; rejecting the things that look like reps
is the job.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from analyzer.cli import analyze_video

CLIPS = Path(__file__).resolve().parents[1] / "evals" / "clips" / "synthetic"

pytestmark = pytest.mark.skipif(
    not (CLIPS / "S01_squat_side_clean.mp4").is_file(),
    reason="synthetic clips not generated — run `make synth`",
)


def _analyse(name: str) -> dict:
    return analyze_video(video=CLIPS / name, exercise="back_squat", view="side")


def test_counts_five_clean_reps():
    assert _analyse("S01_squat_side_clean.mp4")["set"]["rep_count"] == 5


def test_rejects_regrips_shuffles_and_partials():
    """Three real reps, three decoys. Counting 6 is the classic failure."""
    assert _analyse("S02_squat_side_partials.mp4")["set"]["rep_count"] == 3


def test_a_counted_set_is_reported_as_ok():
    """`no_reps_detected` is for a clip with no reps, not one we did not read."""
    assert _analyse("S01_squat_side_clean.mp4")["status"] == "ok"


def test_every_rep_carries_contiguous_phases():
    """The schema requires them, and G3 measures against them.

    Phases must tile the rep exactly: a gap would mean frames belonging to no
    phase, which makes a boundary error undefined rather than merely large.
    """
    reps = _analyse("S01_squat_side_clean.mp4")["reps"]
    assert len(reps) == 5

    for index, rep in enumerate(reps, start=1):
        assert rep["index"] == index
        spans = [rep["phases"][name] for name in ("eccentric", "bottom", "concentric", "lockout")]
        for (_, end), (start, _) in zip(spans, spans[1:], strict=False):
            assert end == start, f"rep {index} phases are not contiguous"
        assert rep["frames"] == [spans[0][0], spans[-1][1]]


def test_reps_are_in_order_and_do_not_overlap():
    reps = _analyse("S01_squat_side_clean.mp4")["reps"]
    for earlier, later in zip(reps, reps[1:], strict=False):
        assert earlier["frames"][1] <= later["frames"][0]


def test_velocity_is_suppressed_without_calibration():
    """Pixels per second is not a number anyone can train on.

    With no scale, a velocity in m/s would be invented. The spec is explicit:
    suppress velocity and displacement, keep angles, and never fall back
    silently.
    """
    result = _analyse("S01_squat_side_clean.mp4")
    assert result["quality"]["calibration_method"] == "none"
    assert result["quality"]["px_per_metre"] is None
    for rep in result["reps"]:
        assert rep["mean_con_velocity_ms"] is None
        assert rep["peak_velocity_ms"] is None
        assert rep["rom_m"] is None


def test_low_quality_clip_still_counts_nothing():
    """Segmentation must not run on a clip ingest refused (G6 must stay green)."""
    result = _analyse("S03_lowfps_abstain.mp4")
    assert result["status"] == "insufficient_quality"
    assert result["set"]["rep_count"] == 0
    assert result["reps"] == []
