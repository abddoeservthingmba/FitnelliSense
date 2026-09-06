"""Stage 1 — probe the video and decide whether to go on.

The cheapest stage and the one that carries the hard rule: **abstain over
guess**. Everything downstream produces numbers, and numbers are persuasive. A
clip too sparse or too small to measure has to be refused HERE, before anything
has the chance to render a confident-looking answer from data that cannot
support it.

ffprobe IS USED WHERE IT EXISTS, and only for the thing OpenCV cannot report:
rotation metadata. Frame rate and dimensions come from OpenCV either way,
because those it reads reliably and a second source would only invite the two
to disagree.

Where ffprobe is absent the pipeline still runs — dimensions, frame rate and
duration are all checkable without it — but rotation goes UNKNOWN rather than
being assumed zero. Assuming zero is the failure this module exists to prevent:
a portrait clip analysed sideways produces angles wrong by ninety degrees with
no symptom at all.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

import cv2

from .decode import open_video
from .result import QualityReason
from .rotation import RotationError, rotation_from_probe
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
    """Read the container's properties, or None if it cannot be opened.

    Through `open_video`, so width and height describe the frames a caller
    will actually be handed. A portrait clip reports 1080x1920 here even
    though the container stores 1920x1080, because that is what comes out of
    `read()` — and `min_short_side_px` compared against the container's
    numbers would be checking a resolution nobody decodes.
    """
    if not path.is_file():
        return None

    capture = open_video(path)
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


def _ffprobe(path: Path) -> dict[str, object] | None:
    """Stream metadata from ffprobe, or None when it is not installed.

    Not an error when missing. ffmpeg is a separate install and the rest of
    ingest works without it; what is lost is rotation, and that loss is
    reported rather than papered over.
    """
    binary = shutil.which("ffprobe")
    if binary is None:
        return None

    try:
        completed = subprocess.run(
            [
                binary,
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height:stream_tags=rotate:stream_side_data=rotation",
                "-of",
                "json",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None

    if completed.returncode != 0:
        return None
    try:
        return json.loads(completed.stdout)
    except json.JSONDecodeError:
        return None


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

    # Rotation before the numeric limits. A clip whose orientation is unknown
    # cannot be measured at all, so arguing about its resolution first would be
    # answering the wrong question.
    payload = _ffprobe(path)
    if payload is not None:
        try:
            rotation_from_probe(payload)
        except RotationError:
            return found, "ambiguous_rotation"

    limits = thresholds()

    if found.fps < limits.value("ingest.min_fps"):
        return found, "fps_below_minimum"

    if found.duration_s > limits.value("ingest.max_duration_s"):
        return found, "duration_too_long"

    if found.short_side < limits.value("ingest.min_short_side_px"):
        return found, "resolution_too_low"

    return found, None
