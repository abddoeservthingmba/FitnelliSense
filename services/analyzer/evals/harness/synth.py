"""Generate the synthetic golden clips.

WHY SYNTHETIC CLIPS EXIST: their labels are not opinions. The rep count, phase
boundaries and depth of a generated clip are the parameters the generator was
handed, so a disagreement is unambiguously the pipeline's fault. Real footage
can never offer that — a human label is itself a measurement with error.

WHAT THEY CANNOT DO: a stick figure has perfect contrast, no clothing, no motion
blur and a blank background. These clips can prove the segmentation maths is
right. They can prove nothing whatsoever about whether MediaPipe finds a hip
under a hoodie, which is why twelve real slots sit beside them.

Everything is drawn from an explicit seed and integer frame arithmetic — no
wall-clock, no RNG without a seed, no floating-point frame indices. The clips
must be byte-identical when regenerated or G7 is testing the generator's noise
rather than the analyzer's determinism.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import yaml

from .plan import phase_plan, total_frames

OUT_DIR = Path(__file__).resolve().parents[1] / "clips" / "synthetic"
MANIFEST = Path(__file__).resolve().parents[1] / "clips" / "manifest.yaml"

# Colours are deliberately flat and high-contrast: the generator is not trying
# to look realistic, it is trying to be unambiguous.
BACKGROUND = (24, 20, 18)
BODY = (235, 235, 235)
PLATE = (60, 180, 75)
BAR = (200, 200, 200)


@dataclass(frozen=True)
class Skeleton:
    """A side-on stick figure, in image coordinates (+y down).

    Proportions are a rough 1.75 m adult scaled to the frame. They do not need
    anatomical accuracy — they need to be FIXED, so that hip and knee heights
    are exactly computable and the depth label is exact.
    """

    hip: tuple[int, int]
    knee: tuple[int, int]
    ankle: tuple[int, int]
    shoulder: tuple[int, int]
    head: tuple[int, int]
    bar: tuple[int, int]


def _pose(t: float, cfg: dict[str, Any], height: int, width: int) -> Skeleton:
    """The figure at squat depth `t`, where 0 is standing and 1 is the bottom."""
    cx = width // 2
    ground = int(height * 0.92)

    # Segment lengths, fixed fractions of frame height.
    shank = int(height * 0.135)
    thigh = int(height * 0.145)
    torso = int(height * 0.180)

    depth_ratio = float(cfg["depth_ratio"])

    # Standing hip height, and how far it drops. `depth_ratio` > 1 means the hip
    # finishes BELOW knee level, which in image coordinates means a larger y.
    hip_standing = ground - shank - thigh
    knee_y = ground - shank
    drop = (knee_y - hip_standing) * depth_ratio

    hip_y = int(round(hip_standing + drop * t))
    # The knee tracks forward as depth increases, as a real squat does.
    knee_x = int(round(cx + thigh * 0.28 * t))
    shoulder_y = hip_y - torso
    # Torso inclines forward with depth, so torso-angle rules have signal.
    shoulder_x = int(round(cx - torso * 0.42 * t))

    return Skeleton(
        hip=(cx, hip_y),
        knee=(knee_x, knee_y),
        ankle=(cx, ground),
        shoulder=(shoulder_x, shoulder_y),
        head=(shoulder_x, shoulder_y - int(height * 0.055)),
        bar=(shoulder_x, shoulder_y - int(height * 0.012)),
    )


def _draw(frame: np.ndarray, s: Skeleton, height: int) -> None:
    thickness = max(2, height // 240)
    for a, b in (
        (s.ankle, s.knee),
        (s.knee, s.hip),
        (s.hip, s.shoulder),
    ):
        cv2.line(frame, a, b, BODY, thickness, lineType=cv2.LINE_AA)

    cv2.circle(frame, s.head, int(height * 0.030), BODY, -1, lineType=cv2.LINE_AA)

    # The bar, with a plate at each end. The plate is what scale calibration
    # looks for, so its diameter is a fixed fraction of frame height and is
    # recorded in the manifest for the calibration gate to check against.
    plate_r = int(height * 0.048)
    half = int(height * 0.115)
    bx, by = s.bar
    cv2.line(frame, (bx - half, by), (bx + half, by), BAR, thickness, lineType=cv2.LINE_AA)
    for side in (-1, 1):
        cv2.circle(frame, (bx + side * half, by), plate_r, PLATE, -1, lineType=cv2.LINE_AA)


def _depth_track(cfg: dict[str, Any]) -> list[float]:
    """Depth in [0, 1] for every frame, built from the SAME plan that labels it.

    Driving the drawing from `phase_plan` rather than from a second copy of the
    tempo arithmetic is what makes the labels trustworthy: there is no second
    copy to drift.
    """
    total = total_frames(cfg)
    track = [0.0] * total

    for rep in phase_plan(cfg):
        ecc_start, ecc_end = rep.phases["eccentric"]
        bot_start, bot_end = rep.phases["bottom"]
        con_start, con_end = rep.phases["concentric"]

        # Cosine easing, so velocity is zero at each turnaround. A linear ramp
        # would put a discontinuity at every boundary and hand the segmenter a
        # signal no human being produces.
        span = max(1, ecc_end - ecc_start)
        for i in range(ecc_start, min(ecc_end, total)):
            track[i] = 0.5 - 0.5 * math.cos(math.pi * (i - ecc_start) / span)

        for i in range(bot_start, min(bot_end, total)):
            track[i] = 1.0

        span = max(1, con_end - con_start)
        for i in range(con_start, min(con_end, total)):
            track[i] = 0.5 + 0.5 * math.cos(math.pi * (i - con_start) / span)

        # lockout stays at 0.0, already initialised

    for decoy in cfg.get("decoys") or []:
        fps = int(cfg["fps"])
        at = int(float(decoy["at_s"]) * fps + 0.5)
        amp = float(decoy["amplitude_ratio"])
        span = max(4, fps // 3)
        for i in range(span):
            index = at + i
            if 0 <= index < total:
                track[index] = max(
                    track[index], amp * (0.5 - 0.5 * math.cos(2 * math.pi * i / span))
                )

    return track


def generate(clip: dict[str, Any]) -> Path:
    cfg = clip["generator"]
    width, height = (int(v) for v in cfg["resolution"])
    fps = int(cfg["fps"])

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR.parent / clip["file"]
    path.parent.mkdir(parents=True, exist_ok=True)

    # mp4v rather than H.264: it is present in every opencv-python wheel, so the
    # clips regenerate identically on any machine without a system ffmpeg.
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
    if not writer.isOpened():
        raise RuntimeError(f"could not open a video writer for {path}")

    try:
        for t in _depth_track(cfg):
            frame = np.full((height, width, 3), BACKGROUND, dtype=np.uint8)
            _draw(frame, _pose(t, cfg, height, width), height)
            writer.write(frame)
    finally:
        writer.release()

    return path


def main() -> int:
    manifest = yaml.safe_load(MANIFEST.read_text(encoding="utf-8"))
    made = 0
    for clip in manifest["clips"]:
        if clip.get("source") != "synthetic":
            continue
        path = generate(clip)
        print(f"  wrote {path.relative_to(MANIFEST.parent)}")
        made += 1
    print(f"\n  {made} synthetic clip(s) generated\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
