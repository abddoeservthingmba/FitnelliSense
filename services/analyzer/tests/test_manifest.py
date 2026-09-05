"""The golden set is ground truth, so it gets tested like code.

Every gate is scored against these labels. A manifest that parses but is
internally inconsistent does not raise — it silently moves the target, which is
the most expensive kind of bug in an eval loop because it makes every subsequent
measurement wrong in a way that looks like progress.
"""

from __future__ import annotations

from itertools import pairwise

import pytest

from evals.harness.loader import ManifestError, load_manifest

GOLDEN_SET_SIZE = 15
REQUIRED_ABSTAIN_CLIPS = 3


def test_manifest_parses():
    assert load_manifest()


def test_golden_set_is_the_documented_size():
    """G1 targets 15/15. If the manifest drifts, the gate silently changes."""
    assert len(load_manifest()) == GOLDEN_SET_SIZE


def test_has_enough_abstain_fixtures():
    """G6 is unmeasurable without clips that must abstain."""
    clips = load_manifest()
    abstaining = [c for c in clips if c.should_abstain]
    assert len(abstaining) >= REQUIRED_ABSTAIN_CLIPS

    # Each must name a DIFFERENT reason. Three clips that all fail for low
    # light would test one code path three times and leave two untested.
    reasons = {c.expected_quality_reason for c in abstaining}
    assert len(reasons) == len(abstaining), f"abstain reasons must be distinct, got {reasons}"


def test_every_abstain_clip_names_a_machine_readable_reason():
    for clip in load_manifest():
        if clip.should_abstain:
            assert clip.expected_quality_reason
            assert clip.expected_quality_reason.islower()
            assert " " not in clip.expected_quality_reason


def test_synthetic_clips_are_fully_labelled():
    """Synthetic labels are generator parameters, so there is no excuse for a gap."""
    for clip in load_manifest():
        if clip.source != "synthetic" or clip.should_abstain:
            continue
        assert clip.true_rep_count is not None
        assert len(clip.reps) == clip.true_rep_count
        for rep in clip.reps:
            assert rep.depth_ok is not None
            assert set(rep.phases) == {"eccentric", "bottom", "concentric", "lockout"}


def test_unsafe_fault_is_covered():
    """G4's recall is computed over labelled `unsafe` faults. Zero of them makes it unmeasurable."""
    clips = load_manifest()
    unsafe = [f for c in clips for f in c.known_faults if f.severity == "unsafe"]
    assert unsafe, "no clip carries an `unsafe` fault — G4 can never be scored"


def test_set_level_rules_have_a_fixture():
    """`velocity_loss_fatigue` and `rom_inconsistency` need a long, fatiguing set."""
    rule_ids = {f.rule_id for c in load_manifest() for f in c.known_faults}
    assert "velocity_loss_fatigue" in rule_ids
    assert "rom_inconsistency" in rule_ids


def test_view_contradiction_fixture_exists():
    """A clip where the requested view is wrong is the only test of that warning."""
    clips = load_manifest()
    assert any(c.view_requested != c.view_true for c in clips)


def test_uncalibrated_fixture_exists():
    """The no-calibration path must suppress velocity rather than guess a scale."""
    clips = load_manifest()
    assert any(c.expected_calibration_method == "none" for c in clips)


def test_synthetic_labels_are_derived_not_written(tmp_path):
    """A generated clip may not carry hand-written boundaries.

    The first draft did, and they were already wrong — off by a frame from
    Python's round-half-to-even, with the last rep running past the requested
    duration. Two sources of truth for the same fact will always drift; this
    makes the second one impossible rather than merely discouraged.
    """
    bad = tmp_path / "manifest.yaml"
    bad.write_text(
        "schema_version: '0.1.0'\n"
        "clips:\n"
        "  - id: X4\n"
        "    source: synthetic\n"
        "    file: x.mp4\n"
        "    exercise: back_squat\n"
        "    expected_status: ok\n"
        "    generator:\n"
        "      fps: 30\n"
        "      reps: 1\n"
        "      depth_ratio: 1.1\n"
        "      resolution: [1080, 1920]\n"
        "      tempo: { ecc_s: 1.0, bottom_s: 0.2, con_s: 0.8, lockout_s: 0.5 }\n"
        "    reps:\n"
        "      - { index: 1, depth_ok: true }\n",
        encoding="utf-8",
    )
    with pytest.raises(ManifestError, match="must not hand-write"):
        load_manifest(bad)


def test_derived_phases_are_contiguous_and_in_order():
    """The property G3 measures against. If it fails, G3 measures nothing."""
    for clip in load_manifest():
        if clip.source != "synthetic" or not clip.reps:
            continue
        for rep in clip.reps:
            spans = [rep.phases[name] for name in ("eccentric", "bottom", "concentric", "lockout")]
            for (_, end), (start, _) in pairwise(spans):
                assert end == start
            assert rep.frames == (spans[0][0], spans[-1][1])


def test_rejects_inconsistent_rep_count(tmp_path):
    bad = tmp_path / "manifest.yaml"
    bad.write_text(
        "schema_version: '0.1.0'\n"
        "clips:\n"
        "  - id: X1\n"
        "    source: synthetic\n"
        "    file: x.mp4\n"
        "    exercise: back_squat\n"
        "    expected_status: ok\n"
        "    true_rep_count: 3\n"
        "    reps:\n"
        "      - { index: 1, depth_ok: true }\n",
        encoding="utf-8",
    )
    with pytest.raises(ManifestError, match="true_rep_count"):
        load_manifest(bad)


def test_rejects_abstain_clip_that_also_claims_findings(tmp_path):
    bad = tmp_path / "manifest.yaml"
    bad.write_text(
        "schema_version: '0.1.0'\n"
        "clips:\n"
        "  - id: X2\n"
        "    source: real\n"
        "    file: x.mp4\n"
        "    exercise: back_squat\n"
        "    expected_status: insufficient_quality\n"
        "    expected_quality_reason: too_dark\n"
        "    known_faults:\n"
        "      - { rule_id: squat_depth_insufficient, severity: major, reps: null }\n",
        encoding="utf-8",
    )
    with pytest.raises(ManifestError, match="cannot both abstain"):
        load_manifest(bad)


def test_rejects_non_contiguous_phases(tmp_path):
    """A gap between phases makes G3's boundary error undefined, not merely large."""
    bad = tmp_path / "manifest.yaml"
    bad.write_text(
        "schema_version: '0.1.0'\n"
        "clips:\n"
        "  - id: X3\n"
        "    source: synthetic\n"
        "    file: x.mp4\n"
        "    exercise: back_squat\n"
        "    expected_status: ok\n"
        "    true_rep_count: 1\n"
        "    reps:\n"
        "      - index: 1\n"
        "        depth_ok: true\n"
        "        frames: [0, 40]\n"
        "        phases:\n"
        "          eccentric: [0, 10]\n"
        "          bottom: [12, 20]\n"
        "          concentric: [20, 30]\n"
        "          lockout: [30, 40]\n",
        encoding="utf-8",
    )
    with pytest.raises(ManifestError, match="contiguous"):
        load_manifest(bad)
