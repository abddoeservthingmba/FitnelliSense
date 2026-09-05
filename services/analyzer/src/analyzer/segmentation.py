"""Stage 7 — where one rep starts and the next begins.

Smoothing happens HERE, before any velocity is taken, and that ordering is the
whole reason this stage works. Differentiating a noisy signal amplifies the
noise: a centroid that wobbles by two pixels becomes a velocity that crosses
zero a dozen times inside one descent, and each crossing looks exactly like a
rep boundary. Smooth first, then differentiate.

A rep is an excursion: the bar goes down, turns, and comes back up. In image
coordinates `y` grows downward, so a squat's bottom is a MAXIMUM in y. The
turnarounds are where vertical velocity crosses zero.

Rejecting non-reps is the hard half. A re-grip, a shuffle and a half-rep all
produce a perfectly good excursion with two clean zero-crossings, and the only
thing separating them from a real rep is how far the bar travelled.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.signal import find_peaks, savgol_filter

from .thresholds import thresholds


@dataclass(frozen=True)
class Rep:
    """One rep, in frame indices. Phases tile `[start, end)` exactly."""

    index: int
    eccentric: tuple[int, int]
    bottom: tuple[int, int]
    concentric: tuple[int, int]
    lockout: tuple[int, int]

    @property
    def frames(self) -> tuple[int, int]:
        return (self.eccentric[0], self.lockout[1])

    @property
    def rom_px(self) -> float:
        return self._rom

    _rom: float = 0.0


def smooth(y: np.ndarray) -> np.ndarray:
    """Savitzky-Golay over the vertical trace.

    Chosen over a moving average because it preserves the shape of a
    turnaround. A box filter flattens the peak, which moves the bottom of the
    rep by several frames and puts G3's boundary error there for free.
    """
    limits = thresholds()
    window = int(limits.value("segmentation.smoothing_window_frames"))
    order = int(limits.value("segmentation.smoothing_polyorder"))

    # The filter needs an odd window no longer than the signal, and an order
    # below the window. Clamped rather than raising: a very short clip is a
    # real input, and refusing to smooth it would be worse than smoothing it
    # lightly.
    window = min(window, y.size if y.size % 2 == 1 else y.size - 1)
    if window <= order or window < 3:
        return y
    if window % 2 == 0:
        window -= 1

    return savgol_filter(y, window_length=window, polyorder=order)


def segment(y_raw: np.ndarray, exercise: str) -> list[Rep]:
    """Every rep in the clip, in order.

    `y_raw` is the bar's vertical position per frame, in pixels, y down.
    """
    if y_raw.size < 3 or np.isnan(y_raw).all():
        return []

    # NaN runs are frames where the bar was genuinely lost. Held at the last
    # known value rather than dropped, so frame indices stay aligned with the
    # video — an off-by-N in the index is far worse than a flat segment.
    y = _hold(y_raw)
    y = smooth(y)

    # Bottoms are maxima in y. Prominence keeps the transform from finding
    # every ripple; it is derived from the signal's own range rather than set
    # in pixels, so it means the same thing at any distance from the bar.
    span = float(np.ptp(y))
    if span <= 0:
        return []

    limits = thresholds()
    bottoms, _ = find_peaks(y, prominence=span * 0.05)
    if bottoms.size == 0:
        return []

    # The top on each side of a bottom, which bounds the excursion.
    tops, _ = find_peaks(-y, prominence=span * 0.05)
    edges = np.concatenate(([0], tops, [y.size - 1]))

    candidates: list[tuple[int, int, int, float]] = []
    for bottom in bottoms:
        before = edges[edges < bottom]
        after = edges[edges > bottom]
        if before.size == 0 or after.size == 0:
            continue
        start, end = int(before[-1]), int(after[0])
        # The shallower side, so a rep is only as deep as its weakest half —
        # a descent from standing that comes back up halfway is not a rep.
        rom = float(min(y[bottom] - y[start], y[bottom] - y[end]))
        if rom > 0:
            candidates.append((start, int(bottom), end, rom))

    if not candidates:
        return []

    # Reference from the main cluster rather than from every candidate: real
    # reps group near the top of the range, decoys sit far below and would drag
    # a plain median down into them. See thresholds.yaml.
    roms = np.array([c[3] for c in candidates])
    fraction = float(limits.value("segmentation.rom_reference_fraction_of_max"))
    cluster = roms[roms >= roms.max() * fraction]
    reference = float(np.median(cluster))

    key = f"segmentation.{exercise}.min_rom_ratio"
    try:
        ratio = float(limits.value(key))
    except KeyError:
        # An exercise with no entry is not silently given someone else's
        # threshold; it gets no reps, and the caller reports none found.
        return []

    floor = reference * ratio
    kept = [c for c in candidates if c[3] >= floor]

    return [_phases(i, *c, y=y) for i, c in enumerate(kept, start=1)]


def _phases(index: int, start: int, bottom: int, end: int, rom: float, *, y: np.ndarray) -> Rep:
    """Split one excursion into the four phases, tiling it exactly.

    The bottom is a SPAN, not an instant: the bar pauses, and calling one frame
    "the bottom" would put the eccentric and concentric boundaries on top of
    each other. Its width is where the bar sits within a few percent of its
    lowest point.
    """
    depth = y[bottom]
    near = depth - (depth - y[start]) * 0.05

    left = bottom
    while left > start and y[left - 1] >= near:
        left -= 1
    right = bottom
    while right < end - 1 and y[right + 1] >= near:
        right += 1

    return Rep(
        index=index,
        eccentric=(start, left),
        bottom=(left, right),
        concentric=(right, end),
        # Lockout is zero-width here: it runs to the next rep's start, which
        # this function cannot see. The caller closes it.
        lockout=(end, end),
        _rom=rom,
    )


def close_lockouts(reps: list[Rep], last_frame: int) -> list[Rep]:
    """Extend each lockout to the next rep, so the phases tile the whole set."""
    closed: list[Rep] = []
    for i, rep in enumerate(reps):
        end = reps[i + 1].eccentric[0] if i + 1 < len(reps) else last_frame
        closed.append(
            Rep(
                index=rep.index,
                eccentric=rep.eccentric,
                bottom=rep.bottom,
                concentric=rep.concentric,
                lockout=(rep.concentric[1], max(end, rep.concentric[1])),
                _rom=rep.rom_px,
            )
        )
    return closed


def _hold(series: np.ndarray) -> np.ndarray:
    """Forward-fill NaNs, then back-fill any leading ones."""
    filled = series.copy()
    missing = np.isnan(filled)
    if not missing.any():
        return filled
    if missing.all():
        return np.zeros_like(filled)

    index = np.arange(filled.size)
    known = index[~missing]
    previous = np.maximum.accumulate(np.where(missing, 0, index))
    filled = filled[np.where(previous == 0, known[0], previous)]
    return filled
