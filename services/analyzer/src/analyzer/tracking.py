"""Stage 6 — where the bar is, frame by frame.

Segmentation runs on BAR movement rather than on pose, which is the spec's
choice and the right one: the bar is a rigid object of known size, while a hip
landmark under a hoodie is an estimate.

WHAT THE FIRST REAL CLIP TAUGHT THIS MODULE. The original version asked Hough
for circles in every frame independently and took whatever came back. On stick
figures that was flawless. On 61 seconds of real deadlifts it reported 100%
coverage and produced a path that jumped a median of 81 px and a maximum of
992 px per frame — a barbell cannot move 992 px in 1/60th of a second. It was
finding *a* circle every frame, just a different one each time: light
fittings, plates racked on the wall, a fan. The segmenter turned that scatter
plot into SEVENTY-ONE reps and nothing anywhere said "I am not sure".

Two things follow, and they are the whole design now:

**CONTINUITY.** The bar is one object with momentum. Once found, it is looked
for NEAR where it was, and a candidate that moved implausibly far is rejected
rather than believed. This costs nothing and buys almost everything — it also
makes the search dramatically cheaper, because a small window beats a whole
frame, and the first version was too slow to finish a 3692-frame clip inside a
five-minute test timeout.

**COHERENCE, NOT COVERAGE.** "I found a circle" is not "I found the bar".
Coverage was the old confidence signal and it read 100% on pure noise. What is
reported now is the fraction of frames genuinely LOCKED — tracked continuously
from a previous position — which is a number that can fall, and therefore a
number that can trigger an abstention.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from .thresholds import thresholds

#: Detection runs at this short side. Fixed rather than proportional so the
#: radius band means the same thing on any input, and so two clips of the same
#: lift at different resolutions track identically — which determinism (G7)
#: would otherwise not survive.
DETECT_SHORT_SIDE = 480


@dataclass(frozen=True)
class BarSeries:
    """The bar's path through the clip, in SOURCE pixels, y down."""

    x: np.ndarray
    y: np.ndarray
    radius: np.ndarray
    #: Frames where the bar was genuinely located, by acquisition or by lock.
    found: np.ndarray
    #: Frames located by CONTINUITY from the previous one, which is the only
    #: evidence that it is the same object throughout.
    locked: np.ndarray
    fps: float
    height: int

    def __len__(self) -> int:
        return int(self.x.size)

    @property
    def coverage(self) -> float:
        """Fraction of frames with any detection. Kept for diagnostics only.

        Deliberately NOT the confidence signal: this read 1.0 on the clip that
        produced 71 reps from noise.
        """
        return float(self.found.mean()) if self.found.size else 0.0

    @property
    def coherence(self) -> float:
        """Fraction of frames tracked continuously. THIS is the confidence."""
        return float(self.locked.mean()) if self.locked.size else 0.0

    @property
    def radius_spread(self) -> float:
        """p95/p5 of the tracked radius. 1.0 is a rigid object; 3.0 is several.

        THE SECOND CONFIDENCE SIGNAL, and it exists because the first one
        missed. Coherence asks "was each frame continuous with the last"; a
        lock can satisfy that at every step and still end up somewhere else
        entirely, one plausible step at a time. This asks the question
        coherence cannot: was it the same SIZE of thing throughout.

        Measured 3.25 on a clip whose coherence of 64% cleared a 60% floor.
        """
        seen = self.radius[self.found & np.isfinite(self.radius)]
        if seen.size == 0:
            return float("inf")
        low = float(np.percentile(seen, 5))
        high = float(np.percentile(seen, 95))
        return high / low if low > 0 else float("inf")

    @property
    def travel_in_radii(self) -> float:
        """Vertical range of the path, measured in PLATE RADII.

        THE PLATE IS ITS OWN RULER. Stage 5 does not exist, so there is no
        px-per-metre and no distance can be published — but a ratio needs no
        calibration, and the one rigid object of known size in the frame is
        the very thing being tracked. A competition plate is 450 mm across, so
        one radius is about 22 cm whatever the camera did.

        That makes this a claim about physics rather than a tuned heuristic:
        a squat, a deadlift, a press and a bench all move the bar further than
        22 cm, so a path that does not is not a set of reps. It is the check
        that catches the failure the other two miss — an object held with
        perfect coherence and perfect size stability, because it is a fixture
        on the wall and fixtures are very stable indeed.

        A ROBUST range, p5 to p95, not min to max. Min-max is one bad frame
        away from meaningless, and it was: on the clip that prompted this the
        sustained lock moved 0.5 radii while a handful of stray acquisitions
        near the start stretched min-max to 4.2, which would have waved the
        clip straight through the gate this property exists to close.

        Clipping the extremes also costs a real set very little — the bar
        pauses at both ends of a rep, so the top and bottom 5% of frames are
        mostly the turnarounds it already spent time at.
        """
        seen = self.y[np.isfinite(self.y)]
        radii = self.radius[np.isfinite(self.radius)]
        if seen.size == 0 or radii.size == 0:
            return 0.0
        median_radius = float(np.median(radii))
        if median_radius <= 0:
            return 0.0
        span = float(np.percentile(seen, 95) - np.percentile(seen, 5))
        return span / median_radius


def _motion_mask(background: cv2.BackgroundSubtractorMOG2, grey: np.ndarray) -> np.ndarray:
    """Which pixels are moving in this frame.

    THE DISCRIMINATOR THAT WAS MISSING, and the reason the first two attempts
    failed on real footage. Hough finds every circular thing in a gym: ceiling
    lights, a wall fan, plates racked on the wall, wheels. Choosing between
    them by "the two circles at the most similar height" is a precise
    description of a row of ceiling lights, so that is what it locked onto —
    a static object, tracked with perfect coherence, entirely wrong.

    The camera is static by scope. So the room does not move and the bar does,
    and that separates them completely where geometry could not.

    Dilated because a plate's EDGE moves more than its centre — the centre of a
    dark plate against a dark floor can sit still in pixel terms while the disc
    plainly travels. Without the dilation the mask is a ring and the centre
    falls outside it.
    """
    foreground = background.apply(grey)
    # Shadows come back as 127; only true foreground counts.
    _, binary = cv2.threshold(foreground, 200, 255, cv2.THRESH_BINARY)
    kernel = np.ones((9, 9), np.uint8)
    return cv2.dilate(binary, kernel, iterations=2)


def _moving(mask: np.ndarray, x: float, y: float) -> bool:
    """Whether a candidate centre sits in something that is actually moving."""
    h, w = mask.shape[:2]
    cx, cy = int(round(x)), int(round(y))
    if not (0 <= cx < w and 0 <= cy < h):
        return False
    # A small neighbourhood rather than the exact pixel: the centre estimate is
    # a few pixels loose and one pixel is a coin flip.
    x0, x1 = max(0, cx - 6), min(w, cx + 7)
    y0, y1 = max(0, cy - 6), min(h, cy + 7)
    return bool(mask[y0:y1, x0:x1].any())


def _circles(grey: np.ndarray, min_r: int, max_r: int, min_dist: float):
    return cv2.HoughCircles(
        grey,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=min_dist,
        param1=120,
        param2=30,
        minRadius=min_r,
        maxRadius=max_r,
    )


def _prepare(frame: np.ndarray) -> tuple[np.ndarray, float]:
    short = min(frame.shape[:2])
    scale = DETECT_SHORT_SIDE / short if short > DETECT_SHORT_SIDE else 1.0
    small = (
        cv2.resize(frame, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        if scale < 1.0
        else frame
    )
    grey = cv2.medianBlur(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY), 5)
    return grey, scale


def _radius_band(grey: np.ndarray) -> tuple[int, int]:
    short = min(grey.shape[:2])
    min_r = max(6, int(short * 0.05))
    return min_r, max(min_r + 4, int(short * 0.22))


def _acquire(grey: np.ndarray, mask: np.ndarray) -> tuple[float, float, float] | None:
    """Find the bar with no prior — among things that are MOVING.

    The height-similarity heuristic that used to select the pair is gone. It
    was the bug: ceiling lights are level with each other by construction, so
    "most level pair" reliably picked the ceiling. Motion decides now, and
    among moving candidates the largest is taken, because a plate is the
    biggest moving disc in a gym.
    """
    min_r, max_r = _radius_band(grey)
    found = _circles(grey, min_r, max_r, min(grey.shape[:2]) * 0.15)
    if found is None:
        return None

    candidates = [c for c in np.round(found[0]).astype(np.float64) if _moving(mask, c[0], c[1])]
    if not candidates:
        return None

    best = max(candidates, key=lambda c: c[2])
    return float(best[0]), float(best[1]), float(best[2])


def _follow(
    grey: np.ndarray,
    mask: np.ndarray,
    last: tuple[float, float, float],
    held_radius: float,
    max_jump: float,
    max_deviation: float,
) -> tuple[float, float, float] | None:
    """Find the bar NEAR where it was AND THE SIZE IT WAS, or return None.

    A window rather than the whole frame. This is what makes the result a path
    instead of a scatter plot, and it is also why the pass is fast enough to
    finish: the search area is a fraction of the frame.

    THE SECOND CONSTRAINT IS NOT OPTIONAL, and leaving it out cost an entire
    iteration. Position continuity alone says "something plausible is here",
    not "the same thing is here": the jump limit is sized for a bar, which
    also makes it big enough to step onto whatever is next door. Over a 61 s
    clip the lock walked 104% of frame height SIDEWAYS — a deadlift does not —
    while the tracked radius ranged from 72 px to 234 px. Every single step
    was continuous. The sequence was still not a barbell.

    A plate is rigid and the camera is static, so its apparent size is fixed
    up to the lifter's own depth change. Size is therefore the cheapest
    identity check available, and the one that was missing.
    """
    lx, ly, _ = last
    pad = max_jump + held_radius * 2
    h, w = grey.shape[:2]

    x0, x1 = max(0, int(lx - pad)), min(w, int(lx + pad))
    y0, y1 = max(0, int(ly - pad)), min(h, int(ly + pad))
    if x1 - x0 < 16 or y1 - y0 < 16:
        return None

    # The size band is the search band. Asking Hough for radii the bar cannot
    # have wastes time and invites exactly the wrong answers.
    lo = max(1, int(held_radius * (1.0 - max_deviation)))
    hi = max(lo + 2, int(np.ceil(held_radius * (1.0 + max_deviation))))

    window = grey[y0:y1, x0:x1]
    found = _circles(window, lo, hi, max(8.0, lo * 1.5))
    if found is None:
        return None

    candidates = np.round(found[0]).astype(np.float64)
    candidates[:, 0] += x0
    candidates[:, 1] += y0

    # Hough's minRadius/maxRadius are a hint rather than a guarantee, so the
    # band is enforced here too.
    same_size = [c for c in candidates if abs(c[2] - held_radius) <= held_radius * max_deviation]
    if not same_size:
        return None

    # Nearest to the last known position, then checked against the ceiling.
    # Nearest alone is not enough: with nothing else in the window the nearest
    # candidate can still be somewhere the bar could not have reached.
    #
    # MOTION GATES ACQUISITION, NOT FOLLOWING. Requiring movement every frame
    # loses the bar the moment it pauses — at lockout, and at the bottom of a
    # squat — because a stationary object is learned as background within a
    # second. That regressed both synthetic clips from correct counts to
    # abstaining.
    #
    # Acquisition already rejected the ceiling; once the right object is held,
    # continuity of position and size is what keeps it, and a plate that stops
    # moving is still the plate.
    near = min(same_size, key=lambda c: float(np.hypot(c[0] - lx, c[1] - ly)))
    if float(np.hypot(near[0] - lx, near[1] - ly)) > max_jump:
        return None

    return (float(near[0]), float(near[1]), float(near[2]))


def track(path: Path, fps: float) -> BarSeries:
    """Follow the bar through every frame, and report how well it was followed."""
    limits = thresholds()
    jump_ratio = float(limits.value("tracking.max_jump_frame_height_ratio"))
    patience = int(limits.value("tracking.reacquire_after_frames"))
    deviation = float(limits.value("tracking.max_radius_deviation_ratio"))
    memory = int(limits.value("tracking.radius_memory_frames"))

    # History of 200 frames: long enough to learn a static gym, short enough
    # that a lifter standing still briefly does not become background.
    background = cv2.createBackgroundSubtractorMOG2(
        history=200, varThreshold=32, detectShadows=True
    )

    capture = cv2.VideoCapture(str(path))
    xs: list[float] = []
    ys: list[float] = []
    rs: list[float] = []
    ok: list[bool] = []
    lock: list[bool] = []

    last: tuple[float, float, float] | None = None
    # The size the bar is BELIEVED to be, as a median of recent detections.
    # A median rather than the last value: one noisy frame must not be able to
    # move the size band, because moving the band is how the lock escapes it.
    recent: list[float] = []
    missing = 0
    height = 0

    try:
        while True:
            read, frame = capture.read()
            if not read:
                break

            height = frame.shape[0]
            grey, scale = _prepare(frame)
            mask = _motion_mask(background, grey)
            # The ceiling is in DETECTION pixels, because that is the space the
            # search happens in.
            max_jump = grey.shape[0] * jump_ratio

            held = float(np.median(recent)) if recent else 0.0
            hit = (
                _follow(grey, mask, last, held, max_jump, deviation)
                if last is not None and recent
                else None
            )
            locked = hit is not None

            if hit is None:
                missing += 1
                # Only re-acquire once continuity is genuinely lost. Doing it
                # every frame is what produced the scatter plot.
                if last is None or missing > patience:
                    hit = _acquire(grey, mask)
                    if hit is not None:
                        # A fresh acquisition is a new object, so the size
                        # memory of the old one must go with it. Keeping it
                        # would either reject the new bar forever or slowly
                        # blend two objects into one average that is neither.
                        recent = []
                        missing = 0

            if hit is None:
                xs.append(np.nan)
                ys.append(np.nan)
                rs.append(np.nan)
                ok.append(False)
                lock.append(False)
            else:
                last = hit
                missing = 0
                recent.append(hit[2])
                if len(recent) > memory:
                    recent.pop(0)
                xs.append(hit[0] / scale)
                ys.append(hit[1] / scale)
                rs.append(hit[2] / scale)
                ok.append(True)
                lock.append(locked)
    finally:
        capture.release()

    return BarSeries(
        x=_fill(np.asarray(xs, dtype=np.float64)),
        y=_fill(np.asarray(ys, dtype=np.float64)),
        radius=_fill(np.asarray(rs, dtype=np.float64)),
        found=np.asarray(ok, dtype=bool),
        locked=np.asarray(lock, dtype=bool),
        fps=fps,
        height=height,
    )


def _fill(series: np.ndarray) -> np.ndarray:
    """Interpolate short gaps; leave long ones as NaN.

    A few missing frames is a plate behind a thigh, and interpolating is a fair
    reconstruction. A long gap is the bar being absent, and inventing a path
    across it would fabricate movement that never happened.
    """
    missing = np.isnan(series)
    if missing.all() or not missing.any():
        return series

    limit = int(thresholds().value("pose.max_interpolated_gap_frames"))
    index = np.arange(series.size)
    filled = series.copy()
    filled[missing] = np.interp(index[missing], index[~missing], series[~missing])

    run = 0
    for i, gap in enumerate(missing):
        run = run + 1 if gap else 0
        if run > limit:
            filled[i - run + 1 : i + 1] = np.nan

    return filled
