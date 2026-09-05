"""Stage 1 — probe the video and decide whether to go on.

The cheapest stage and the one that carries the hard rule: **abstain over
guess**. Everything downstream produces numbers, and numbers are persuasive. A
clip too sparse or too small to measure has to be refused HERE, before anything
has the chance to render a confident-looking answer from data that cannot
support it.

A NOTE ON ffprobe. The spec names ffprobe, and ffprobe is the right tool —
specifically for rotation metadata, which OpenCV reports unreliably across
backends. ffmpeg is not installed on this machine, so this uses OpenCV's
container properties instead and rotation is NOT yet checked. That is a real
gap against the spec rather than a substitution, and it is recorded in the
iteration log rather than quietly absorbed: a portrait clip carrying a rotation
flag will currently be analysed sideways.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2

from .result import QualityReason
from .thresholds import thresholds


@dataclass(frozen=True)
class Probe:
    """What the container claims about itself."""

    fps: float
    frame_count: int
    width: int
    height: int

    @property
    def duration_s(self) -> float:
        # From frames and fps rather than a duration property, which several
        # OpenCV backends do not populate at all.
        return self.frame_count / self.fps if self.fps > 0 else 0.0

    @property
    def short_side(self) -> int:
        return min(self.width, self.height)


def probe(path: Path) -> Probe | None:
    """Read the container's properties, or None if it cannot be opened."""
    if not path.is_file():
        return None

    capture = cv2.VideoCapture(str(path))
    try:
        if not capture.isOpened():
            return None
        result = Probe(
            fps=float(capture.get(cv2.CAP_PROP_FPS)),
            frame_count=int(capture.get(cv2.CAP_PROP_FRAME_COUNT)),
            width=int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)),
            height=int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT)),
        )
    finally:
        capture.release()

    # A file that opens but reports nothing is not a video we can work with,
    # and is more honest to refuse than to divide by.
    if result.fps <= 0 or result.frame_count <= 0:
        return None
    return result


def check(path: Path) -> tuple[Probe | None, QualityReason | None]:
    """Probe and validate. Returns the probe, and a reason to refuse if any.

    Order matters and is cheapest-first, but more importantly it is
    MOST-FUNDAMENTAL-first: a file that will not open has no frame rate to
    complain about, and telling someone their frame rate is too low when the
    file is corrupt sends them to fix the wrong thing.
    """
    found = probe(path)
    if found is None:
        return None, "unreadable_video"

    limits = thresholds()

    if found.fps < limits.value("ingest.min_fps"):
        return found, "fps_below_minimum"

    if found.duration_s > limits.value("ingest.max_duration_s"):
        return found, "duration_too_long"

    if found.short_side < limits.value("ingest.min_short_side_px"):
        return found, "resolution_too_low"

    return found, None
