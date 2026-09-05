"""Ingest: the first stage, and the one that decides whether to go on at all.

These tests capture gate G6 (`no_verdict_on_low_quality`). The rule they
enforce is the hard one from the spec — **abstain over guess**. A clip too
sparse to measure must be refused BEFORE any stage downstream gets the chance
to produce a confident-looking answer from data that cannot support it.

Written before the implementation exists, so they fail first.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from analyzer.cli import analyze_video

CLIPS = Path(__file__).resolve().parents[1] / "evals" / "clips" / "synthetic"

pytestmark = pytest.mark.skipif(
    not (CLIPS / "S03_lowfps_abstain.mp4").is_file(),
    reason="synthetic clips not generated — run `make synth`",
)


def _analyse(name: str) -> dict:
    return analyze_video(video=CLIPS / name, exercise="back_squat", view="side")


def test_low_fps_clip_abstains():
    """S03 is 12 fps against a 24 fps floor."""
    result = _analyse("S03_lowfps_abstain.mp4")
    assert result["status"] == "insufficient_quality"


def test_abstention_names_a_machine_readable_reason():
    """"We could not read this" is only actionable if it says why.

    The reason is checked exactly, not merely for presence: a pipeline that
    abstains for the wrong reason sends the user to re-shoot the wrong thing.
    """
    result = _analyse("S03_lowfps_abstain.mp4")
    assert result["quality"]["reason"] == "fps_below_minimum"


def test_abstention_emits_no_findings_at_all():
    """The whole point of G6. No verdict may escape from a clip we refused."""
    result = _analyse("S03_lowfps_abstain.mp4")
    assert result["set"]["findings"] == []
    assert result["set"]["rep_count"] == 0
    assert result["reps"] == []


def test_abstention_claims_no_scores():
    """A score on a clip we could not read is a number with nothing behind it."""
    scores = _analyse("S03_lowfps_abstain.mp4")["set"]["scores"]
    assert all(value is None for value in scores.values()), scores


def test_a_readable_clip_is_not_refused():
    """S01 is 30 fps and 1080x1920 — ingest must let it through.

    Without this, "abstain on everything" would pass every test above, which is
    the degenerate way to make an abstention gate green.
    """
    result = _analyse("S01_squat_side_clean.mp4")
    assert result["status"] != "insufficient_quality"
    assert result["quality"]["reason"] is None


def test_diagnostics_record_what_was_actually_read():
    """The audit trail. A verdict the user cannot check is one they cannot trust."""
    result = _analyse("S01_squat_side_clean.mp4")
    diagnostics = result["diagnostics"]
    assert diagnostics["analyzer_version"]
    assert diagnostics["thresholds_version"]
    assert isinstance(diagnostics["runtime_ms"], int)


def test_a_missing_file_abstains_rather_than_raising():
    """One unreadable clip must not end an eval run (G9)."""
    result = analyze_video(video=CLIPS / "does-not-exist.mp4", exercise="back_squat", view="side")
    assert result["status"] == "insufficient_quality"
    assert result["quality"]["reason"] == "unreadable_video"
