"""Stage 6 — where the bar is, frame by frame.

Segmentation runs on BAR movement rather than on pose, which is the spec's
choice and the right one: the bar is a rigid object with a known size, while a
hip landmark under a hoodie is an estimate. If the bar cannot be found, the
honest answer is to say so rather than to fall back on a body part and quietly
change what is being measured.

Plates are found by Hough circles on a downscaled frame. Downscaling is not
only for speed — the transform is more stable when the radius range is small
in absolute pixels, and a 92 px plate on a 1080-wide frame becomes a 41 px
plate at 480, which is comfortably inside a tight search band.

Both plates sit at the same height on the bar, so the bar's vertical position
is the mean of the detected centres. Using the mean rather than one plate also
survives one end being briefly occluded by the lifter.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from .thresholds import thresholds

#: Detection runs at this short side. Fixed rather than proportional so the
#: radius band below means the same thing on any input resolution — and so two
#: clips of the same lift at different resolutions track identically, which
#: determinism (G7) would otherwise not survive.
DETECT_SHORT_SIDE = 480


@dataclass(frozen=True)
class BarSeries:
    """The bar's path through the clip, in DETECTION pixels.

    `y` grows downward, as image coordinates do throughout this codebase.
    `found` marks frames where a plate was actually detected rather than
    interpolated, so a caller can tell measurement from inference.
    """

    x: np.ndarray
    y: np.ndarray
    radius: np.ndarray
    found: np.ndarray
    fps: float

    def __len__(self) -> int:
        return int(self.x.size)

    @property
    def coverage(self) -> float:
        """Fraction of frames where the bar was genuinely detected."""
        return float(self.found.mean()) if self.found.size else 0.0


def _detect(frame: np.ndarray, scale: float) -> tuple[float, float, float] | None:
    """The bar's centre in one frame, or None."""
    grey = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    grey = cv2.medianBlur(grey, 5)

    # A competition plate is 450 mm across. Filmed so a whole lifter fits the
    # frame, it spans somewhere between a twelfth and a fifth of the short
    # side — wide enough for framing differences, tight enough to reject wheels,
    # clock faces and light fittings.
    short = min(grey.shape[:2])
    min_r = max(6, int(short * 0.05))
    max_r = max(min_r + 4, int(short * 0.22))

    circles = cv2.HoughCircles(
        grey,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=short * 0.15,
        param1=120,
        param2=30,
        minRadius=min_r,
        maxRadius=max_r,
    )
    if circles is None:
        return None

    found = np.round(circles[0]).astype(np.float64)

    # Both plates share a height, so the pair with the closest y is the bar.
    # Any single circle is taken as-is; more than two means something round is
    # in the background and the two most level candidates win.
    if len(found) >= 2:
        order = np.argsort(found[:, 1])
        gaps = np.diff(found[order][:, 1])
        pick = order[int(np.argmin(gaps)) : int(np.argmin(gaps)) + 2]
        chosen = found[pick]
    else:
        chosen = found[:1]

    cx, cy, radius = chosen[:, 0].mean(), chosen[:, 1].mean(), chosen[:, 2].mean()
    return float(cx / scale), float(cy / scale), float(radius / scale)


def track(path: Path, fps: float) -> BarSeries:
    """Follow the bar through every frame."""
    capture = cv2.VideoCapture(str(path))
    xs: list[float] = []
    ys: list[float] = []
    rs: list[float] = []
    ok: list[bool] = []

    try:
        while True:
            read, frame = capture.read()
            if not read:
                break

            short = min(frame.shape[:2])
            scale = DETECT_SHORT_SIDE / short if short > DETECT_SHORT_SIDE else 1.0
            small = (
                cv2.resize(frame, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
                if scale < 1.0
                else frame
            )

            hit = _detect(small, scale)
            if hit is None:
                xs.append(np.nan)
                ys.append(np.nan)
                rs.append(np.nan)
                ok.append(False)
            else:
                xs.append(hit[0])
                ys.append(hit[1])
                rs.append(hit[2])
                ok.append(True)
    finally:
        capture.release()

    return BarSeries(
        x=_fill(np.asarray(xs)),
        y=_fill(np.asarray(ys)),
        radius=_fill(np.asarray(rs)),
        found=np.asarray(ok, dtype=bool),
        fps=fps,
    )


def _fill(series: np.ndarray) -> np.ndarray:
    """Interpolate short gaps; leave long ones as NaN.

    A gap of a few frames is a plate briefly lost behind a thigh, and linear
    interpolation across it is a fair reconstruction. A long gap is not a gap —
    it is the bar being absent — and inventing a path across it would fabricate
    movement that never happened. The ceiling comes from thresholds.yaml.
    """
    missing = np.isnan(series)
    if missing.all() or not missing.any():
        return series

    limit = int(thresholds().value("pose.max_interpolated_gap_frames"))
    index = np.arange(series.size)
    filled = series.copy()
    filled[missing] = np.interp(index[missing], index[~missing], series[~missing])

    # Re-open any run of missing frames longer than the limit.
    run = 0
    for i, gap in enumerate(missing):
        run = run + 1 if gap else 0
        if not gap and run == 0:
            continue
        if run > limit:
            filled[i - run + 1 : i + 1] = np.nan

    return filled
