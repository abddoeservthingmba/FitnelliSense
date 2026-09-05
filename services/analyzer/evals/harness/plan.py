"""The frame plan for a synthetic clip — used to DRAW it and to LABEL it.

One function, two callers, and that is the entire point. The first draft of this
manifest carried hand-written phase boundaries beside the generator config, and
they were already wrong: `round(0.15 * 30)` is 4 frames, not the 5 that had been
typed, and the fifth rep of S01 ran 30 frames past the requested duration and
would have been silently truncated.

Labels that are written by hand next to the parameters they are supposed to
describe will drift from them, and a drifted label on a synthetic clip is the
worst kind of test failure: the pipeline is measured against a clip that does
not exist. So the manifest no longer states them. `phase_plan` computes the
spans, `synth.generate` draws exactly those spans, and `loader` reads exactly
those spans back as ground truth. They cannot disagree.

The clip's duration is derived here too, rather than requested, so a tempo
change can never quietly cut off the last rep.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

#: Frames of stillness before the first rep and after the last. Enough for the
#: segmenter to establish a standing baseline, which it needs in order to know
#: what "not moving" looks like for this clip.
LEAD_IN_S = 1.0
TAIL_S = 1.0

PHASE_ORDER = ("eccentric", "bottom", "concentric", "lockout")


@dataclass(frozen=True)
class RepPlan:
    index: int
    phases: dict[str, tuple[int, int]]

    @property
    def frames(self) -> tuple[int, int]:
        return (self.phases["eccentric"][0], self.phases["lockout"][1])


def _frames(seconds: float, fps: int) -> int:
    """Seconds to whole frames.

    `int(x + 0.5)` rather than `round`, because Python's `round` is
    round-half-to-even: `round(4.5)` is 4 and `round(5.5)` is 6. That is correct
    for statistics and surprising for frame counts, and it is exactly what made
    the hand-written labels wrong.
    """
    return int(seconds * fps + 0.5)


def phase_plan(cfg: dict[str, Any]) -> list[RepPlan]:
    """The frame span of every phase of every rep, in order."""
    fps = int(cfg["fps"])
    tempo = cfg["tempo"]

    durations = {
        "eccentric": _frames(float(tempo["ecc_s"]), fps),
        "bottom": _frames(float(tempo["bottom_s"]), fps),
        "concentric": _frames(float(tempo["con_s"]), fps),
        "lockout": _frames(float(tempo["lockout_s"]), fps),
    }

    cursor = _frames(LEAD_IN_S, fps)
    plans: list[RepPlan] = []

    for index in range(1, int(cfg["reps"]) + 1):
        phases: dict[str, tuple[int, int]] = {}
        for name in PHASE_ORDER:
            span = durations[name]
            phases[name] = (cursor, cursor + span)
            cursor += span
        plans.append(RepPlan(index=index, phases=phases))

    return plans


def total_frames(cfg: dict[str, Any]) -> int:
    """Clip length, derived rather than requested.

    A `duration_s` in the config could disagree with the reps it is supposed to
    contain — and did, in the first draft, cutting the last rep off S01.
    """
    fps = int(cfg["fps"])
    plans = phase_plan(cfg)
    end = plans[-1].frames[1] if plans else _frames(LEAD_IN_S, fps)

    # Decoys may sit past the final rep, so the tail is measured from whichever
    # is later.
    for decoy in cfg.get("decoys") or []:
        decoy_end = _frames(float(decoy["at_s"]), fps) + max(4, fps // 3)
        end = max(end, decoy_end)

    return end + _frames(TAIL_S, fps)


def depth_ok(cfg: dict[str, Any]) -> bool:
    """Whether the generated reps reach depth.

    `depth_ratio` is the fraction of the standing-hip-to-knee distance the hip
    travels. At exactly 1.0 the hip finishes level with the knee; above 1.0 it
    passes below. The label is derived from the same number the drawing uses,
    so a generator tweak cannot leave a stale `depth_ok` behind.
    """
    return float(cfg["depth_ratio"]) > 1.0
