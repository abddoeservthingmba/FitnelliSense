"""The harness is scoring instrumentation, so it is tested before it is trusted.

A gate that reports green when it should report red is the worst possible defect
here: it ends the loop early with a broken pipeline and a clean report. These
tests exist so the instrument is known-good before any measurement is believed.
"""

from __future__ import annotations

from evals.harness.gates import (
    Outcome,
    gate_determinism,
    gate_no_verdict_on_low_quality,
    gate_rep_count,
    worst_red,
)
from evals.harness.loader import Clip


def _clip(**overrides) -> Clip:
    base = dict(
        id="T1",
        source="synthetic",
        file="nope.mp4",
        exercise="back_squat",
        view_requested="side",
        view_true="side",
        expected_status="ok",
        expected_quality_reason=None,
        true_rep_count=5,
        reps=[],
        known_faults=[],
        generator=None,
        expected_calibration_method=None,
        notes="",
        raw={},
    )
    base.update(overrides)
    return Clip(**base)


class _Present(Clip):
    """A clip that reports itself present without touching the filesystem."""


def _present(**overrides) -> Clip:
    clip = _clip(**overrides)
    object.__setattr__(clip, "raw", {**clip.raw, "_force_present": True})
    # `present` reads the filesystem; override it on this instance only.
    object.__setattr__(clip, "__class__", type("P", (Clip,), {"present": property(lambda _: True)}))
    return clip


def test_gate_is_blocked_not_red_when_nothing_ran():
    """A gate that never ran is not evidence of failure."""
    result = gate_rep_count([Outcome(clip=_clip(), result=None, error=None, runtime_ms=None)])
    assert result.verdict == "blocked"
    assert result.value is None


def test_rep_count_requires_exact_match():
    clip = _present(true_rep_count=5)
    close = Outcome(
        clip=clip, result={"set": {"rep_count": 4}}, error=None, runtime_ms=10
    )
    assert gate_rep_count([close]).verdict == "red"

    exact = Outcome(
        clip=clip, result={"set": {"rep_count": 5}}, error=None, runtime_ms=10
    )
    assert gate_rep_count([exact]).verdict == "green"


def test_abstain_clip_must_also_give_the_right_reason():
    """Abstaining for the wrong reason sends the user to re-shoot the wrong thing."""
    clip = _present(
        expected_status="insufficient_quality",
        expected_quality_reason="low_keypoint_confidence",
        true_rep_count=None,
    )

    wrong_reason = Outcome(
        clip=clip,
        result={
            "status": "insufficient_quality",
            "quality": {"reason": "fps_below_minimum"},
            "set": {"findings": []},
        },
        error=None,
        runtime_ms=10,
    )
    assert gate_no_verdict_on_low_quality([wrong_reason]).verdict == "red"

    right = Outcome(
        clip=clip,
        result={
            "status": "insufficient_quality",
            "quality": {"reason": "low_keypoint_confidence"},
            "set": {"findings": []},
        },
        error=None,
        runtime_ms=10,
    )
    assert gate_no_verdict_on_low_quality([right]).verdict == "green"


def test_abstain_clip_may_not_smuggle_out_findings():
    clip = _present(
        expected_status="insufficient_quality",
        expected_quality_reason="subject_occluded",
        true_rep_count=None,
    )
    leaky = Outcome(
        clip=clip,
        result={
            "status": "insufficient_quality",
            "quality": {"reason": "subject_occluded"},
            "set": {"findings": [{"rule_id": "squat_depth_insufficient"}]},
        },
        error=None,
        runtime_ms=10,
    )
    assert gate_no_verdict_on_low_quality([leaky]).verdict == "red"


def test_determinism_ignores_runtime_but_nothing_else():
    clip = _present()
    a = {"set": {"rep_count": 5}, "diagnostics": {"runtime_ms": 100}}
    b = {"set": {"rep_count": 5}, "diagnostics": {"runtime_ms": 8000}}
    same = Outcome(clip=clip, result=a, error=None, runtime_ms=100, repeat=b)
    assert gate_determinism([same]).verdict == "green"

    c = {"set": {"rep_count": 4}, "diagnostics": {"runtime_ms": 100}}
    differs = Outcome(clip=clip, result=a, error=None, runtime_ms=100, repeat=c)
    assert gate_determinism([differs]).verdict == "red"


def test_worst_red_prefers_severity_then_blast_radius():
    from evals.harness.gates import GateResult

    low = GateResult("a", "low", "red", 0, "", ["x", "y", "z"], "")
    critical_narrow = GateResult("b", "critical", "red", 0, "", [], "")
    assert worst_red([low, critical_narrow]).id == "b"

    high_narrow = GateResult("c", "high", "red", 0, "", ["x"], "")
    high_wide = GateResult("d", "high", "red", 0, "", ["x", "y", "z"], "")
    assert worst_red([high_narrow, high_wide]).id == "d"


def test_worst_red_is_none_when_nothing_is_red():
    from evals.harness.gates import GateResult

    assert worst_red([GateResult("a", "critical", "blocked", None, "", [], "")]) is None
