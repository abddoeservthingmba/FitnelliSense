"""Rest between reps belongs to no rep, and a deadlift starts on the floor.

The defects here were invisible for seven iterations because every clip in the
golden set is a synthetic squat of back-to-back reps — which has no rest in it
to swallow, and goes the same way round as the model. The first correctly
tracked real clip, 61 s containing three deadlifts and about 25 s of standing
around, came back as reps of 20.1 s, 9.1 s and 22.4 s.

These traces are built rather than filmed, so they run everywhere and in a
fraction of a second. That is the point: the arithmetic of "which way does this
lift go" and "when does a rep stop" does not need a camera to be pinned down,
and pinning it down here means the real clip is spent on questions only real
footage can answer.

The noise is not decoration. A tracked centroid jitters a few pixels frame to
frame even when the bar is motionless on the floor, and it was precisely that
jitter — 0.7-1.7 px per frame against a 0.96 px onset floor — that let seven
seconds of rest into a rep. A clean trace passes tests a real one fails.
"""

from __future__ import annotations

from itertools import pairwise

import numpy as np
import pytest

from analyzer import segmentation
from analyzer.thresholds import thresholds

FPS = 60.0
FLOOR_Y = 1400.0
ROM_PX = 400.0

#: The jitter band measured on the real clip: 10 px peak to peak, on a bar
#: that was lying untouched on the floor.
JITTER_PX = 5.0


def _ramp(frames: int, span: float) -> np.ndarray:
    """A cosine turnaround, which is what a bar under control actually does."""
    u = np.linspace(0.0, 1.0, frames, endpoint=False)
    return span * (1.0 - np.cos(np.pi * u)) / 2.0


def _deadlift(
    reps: int = 3,
    *,
    lead_s: float = 2.0,
    pull_s: float = 1.0,
    hold_s: float = 1.5,
    lower_s: float = 1.5,
    rest_s: float = 8.0,
) -> np.ndarray:
    """Floor, pull, hold at the top, lower, floor again — `reps` times.

    In image coordinates y grows downward, so the floor is the LARGEST y and
    the lockout is the smallest. That is the whole of what makes a deadlift the
    opposite of a squat, and it is why modelling every lift as a squat put the
    rest in the middle of a rep instead of between two.
    """
    frames = lambda secs: int(round(secs * FPS))  # noqa: E731
    parts = [np.full(frames(lead_s), FLOOR_Y)]
    for _ in range(reps):
        parts.append(FLOOR_Y - _ramp(frames(pull_s), ROM_PX))
        parts.append(np.full(frames(hold_s), FLOOR_Y - ROM_PX))
        parts.append(FLOOR_Y - ROM_PX + _ramp(frames(lower_s), ROM_PX))
        parts.append(np.full(frames(rest_s), FLOOR_Y))
    trace = np.concatenate(parts)

    # Seeded, so two runs of this test are the same run (G7's premise).
    noise = np.random.default_rng(20260908).uniform(-JITTER_PX, JITTER_PX, trace.size)
    return trace + noise


def _squat(reps: int = 3, *, lead_s: float = 2.0, rest_s: float = 8.0) -> np.ndarray:
    """The same set of movements the other way up: down first, back to standing."""
    return 2.0 * FLOOR_Y - ROM_PX - _deadlift(reps, lead_s=lead_s, rest_s=rest_s)


def _cap_frames() -> int:
    return int(round(float(thresholds().value("segmentation.max_end_pause_s")) * FPS))


def test_a_deadlift_rep_does_not_contain_the_rest_after_it():
    """The headline. Eight seconds of rest is not part of a three-second rep."""
    reps = segmentation.segment(_deadlift(), "deadlift", fps=FPS)
    assert len(reps) == 3

    # Pull + hold + lower is 4 s, and the rep may keep the pause it is allowed.
    longest = (4.0 * FPS) + _cap_frames()
    for rep in reps:
        span = rep.frames[1] - rep.frames[0]
        assert span <= longest, f"rep {rep.index} ran {span / FPS:.1f}s"


def test_the_rest_belongs_to_no_rep_at_all():
    """Frames between reps are allowed to be part of nothing.

    Phases used to tile the clip end to end, which is only harmless when there
    is nothing between reps to absorb.
    """
    reps = segmentation.segment(_deadlift(rest_s=8.0), "deadlift", fps=FPS)
    gaps = [(later.frames[0] - earlier.frames[1]) / FPS for earlier, later in pairwise(reps)]

    assert gaps, "need at least two reps to have a gap between them"
    for gap in gaps:
        # 8 s of rest, less the pause each rep is allowed to keep.
        assert gap > 8.0 - float(thresholds().value("segmentation.max_end_pause_s")) - 1.0


def test_a_deadlift_runs_concentric_first():
    """The bar starts on the floor, so the rep OPENS with the pull.

    Modelling it the other way round did not merely mislabel the phases — it
    built each rep around the bar's time on the floor, so one reported rep was
    the lowering of a real one, the rest, and the pull of the next.
    """
    order = ("concentric", "lockout", "eccentric", "bottom")
    for rep in segmentation.segment(_deadlift(), "deadlift", fps=FPS):
        spans = [getattr(rep, name) for name in order]
        for (_, end), (start, _) in pairwise(spans):
            assert end == start, f"rep {rep.index} phases are not contiguous in {order}"
        assert rep.frames == (spans[0][0], spans[-1][1])


def test_a_squat_still_runs_eccentric_first():
    """The guard. Flipping the deadlift must not flip everything else."""
    order = ("eccentric", "bottom", "concentric", "lockout")
    reps = segmentation.segment(_squat(), "back_squat", fps=FPS)
    assert len(reps) == 3

    for rep in reps:
        spans = [getattr(rep, name) for name in order]
        for (_, end), (start, _) in pairwise(spans):
            assert end == start, f"rep {rep.index} phases are not contiguous in {order}"
        assert rep.frames == (spans[0][0], spans[-1][1])


def test_phase_durations_survive_the_jitter():
    """Each phase must be its own length, not its neighbour's.

    A per-frame velocity walk ends on the first noisy frame it meets. On the
    real clip that ended a 1.7 s lockout after 0.1 s and gave the remaining
    1.6 s to the eccentric, reporting a 3.3 s lowering of a bar that reached
    the floor in 1.5 s. Every duration in the rep was wrong, and `ecc_s` feeds
    tempo scoring directly.
    """
    reps = segmentation.segment(
        _deadlift(pull_s=1.0, hold_s=1.5, lower_s=1.5), "deadlift", fps=FPS
    )

    for rep in reps:
        pull = (rep.concentric[1] - rep.concentric[0]) / FPS
        hold = (rep.lockout[1] - rep.lockout[0]) / FPS
        lower = (rep.eccentric[1] - rep.eccentric[0]) / FPS
        assert pull == pytest.approx(1.0, abs=0.3), f"pull {pull:.2f}s"
        assert hold == pytest.approx(1.5, abs=0.3), f"hold {hold:.2f}s"
        assert lower == pytest.approx(1.5, abs=0.3), f"lower {lower:.2f}s"


def test_an_exercise_with_no_cycle_gets_no_reps():
    """A lift the file says nothing about is not given another lift's model.

    Guessing the direction would be worse than declining: a deadlift segmented
    as a squat produces confident, well-formed, wrong reps rather than an
    obvious failure.
    """
    assert segmentation.segment(_deadlift(), "snatch", fps=FPS) == []
