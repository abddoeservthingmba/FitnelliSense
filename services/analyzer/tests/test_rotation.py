"""Rotation metadata — the gap left open in iteration 1.

Phones record landscape sensor data plus a rotation flag; the player applies
it. A pipeline that ignores the flag measures a portrait squat sideways, and
every angle it produces is wrong by ninety degrees while looking perfectly
plausible. Every clip in the golden set will come off a phone, so this had to
close before the footage arrives rather than after.

The parsing is tested against ffprobe payloads rather than against rotated
video, because a fixture would need ffmpeg present in every environment that
runs these tests. The decision logic is the part that can be wrong.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from analyzer.cli import analyze_video
from analyzer.rotation import RotationError, rotation_from_probe

CLIPS = Path(__file__).resolve().parents[1] / "evals" / "clips" / "synthetic"


def _stream(**extra) -> dict:
    return {"streams": [{"width": 1080, "height": 1920, **extra}]}


def test_no_metadata_means_no_rotation():
    assert rotation_from_probe(_stream()) == 0


def test_reads_a_display_matrix():
    payload = _stream(side_data_list=[{"side_data_type": "Display Matrix", "rotation": -90}])
    assert rotation_from_probe(payload) == 270


def test_reads_a_rotate_tag():
    assert rotation_from_probe(_stream(tags={"rotate": "90"})) == 90


def test_normalises_to_the_range_zero_to_360():
    payload = _stream(side_data_list=[{"side_data_type": "Display Matrix", "rotation": -450}])
    assert rotation_from_probe(payload) == 270


def test_agreeing_sources_are_not_ambiguous():
    """ffmpeg reports the same rotation twice in some containers. Not a conflict."""
    payload = _stream(
        side_data_list=[{"side_data_type": "Display Matrix", "rotation": -90}],
        tags={"rotate": "270"},
    )
    assert rotation_from_probe(payload) == 270


def test_conflicting_sources_are_refused():
    """Two sources disagreeing is exactly the ambiguity the spec says to reject.

    Guessing which one the phone meant would be a coin flip that silently
    rotates the whole analysis.
    """
    payload = _stream(
        side_data_list=[{"side_data_type": "Display Matrix", "rotation": -90}],
        tags={"rotate": "180"},
    )
    with pytest.raises(RotationError):
        rotation_from_probe(payload)


def test_a_rotation_that_is_not_a_right_angle_is_refused():
    """37 degrees is not a phone orientation; it is a corrupt or hand-edited file."""
    payload = _stream(side_data_list=[{"side_data_type": "Display Matrix", "rotation": 37}])
    with pytest.raises(RotationError):
        rotation_from_probe(payload)


@pytest.mark.skipif(
    not (CLIPS / "S01_squat_side_clean.mp4").is_file(), reason="clips not generated"
)
def test_an_unrotated_clip_still_analyses():
    """The guard against making everything abstain to satisfy the new check."""
    result = analyze_video(
        video=CLIPS / "S01_squat_side_clean.mp4", exercise="back_squat", view="side"
    )
    assert result["status"] == "ok"
    assert result["set"]["rep_count"] == 5
