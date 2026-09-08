"""Stage 7 — where one rep starts and the next begins.

Smoothing happens HERE, before any velocity is taken, and that ordering is the
whole reason this stage works. Differentiating a noisy signal amplifies the
noise: a centroid that wobbles by two pixels becomes a velocity that crosses
zero a dozen times inside one descent, and each crossing looks exactly like a
rep boundary. Smooth first, then differentiate.

A rep is an excursion: the bar leaves a rest position, turns, and comes back.
The turnarounds are where vertical velocity crosses zero.

WHICH WAY IT LEAVES DEPENDS ON THE LIFT, and assuming otherwise was this
module's second real defect. A squat, a bench and a press start at the top and
go down first, so in image coordinates — where `y` grows downward — the middle
of the rep is a MAXIMUM in y. A DEADLIFT STARTS ON THE FLOOR and goes up first,
so the middle of its rep is a MINIMUM, and the maxima are the bar lying at rest
between reps.

Modelling every lift the first way did not merely mislabel the phases. It built
each deadlift "rep" around the bar's time ON THE FLOOR, so one reported rep was
the lowering of a real one, then the rest, then the pull of the next. The rest
sat in the MIDDLE of the span, where no amount of trimming the ends could reach
it. Both directions are handled here by flipping the sign of the signal, so the
maths below has exactly one form and only the phase NAMES swap.

REST IS NOT PART OF A REP, which was the first defect. Phases used to tile the
whole clip, each rep's trailing pause running to the start of the next, and on
synthetic clips of back-to-back reps nothing revealed that as an assumption.
The first real set — 61 s containing three deadlifts and about 25 s of standing
around — reported reps of 20.1 s, 9.1 s and 22.4 s. Frames between reps now
belong to no rep at all.

Rejecting non-reps is the hard half. A re-grip, a shuffle and a half-rep all
produce a perfectly good excursion with two clean zero-crossings, and the only
thing separating them from a real rep is how far the bar travelled.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

import numpy as np
from scipy.signal import find_peaks, savgol_filter

from .thresholds import thresholds

#: The bar is lowered first — squat, bench, press. The rep runs
#: eccentric, bottom, concentric, lockout.
ECCENTRIC_FIRST = "eccentric_first"

#: The bar is lifted first — the deadlift, which starts on the floor. The rep
#: runs concentric, lockout, eccentric, bottom. Same four phases, same order of
#: ROLES within the movement; a different order in TIME.
CONCENTRIC_FIRST = "concentric_first"


@dataclass(frozen=True)
class Rep:
    """One rep, in frame indices. Its four phases tile `frames` exactly."""

    index: int
    eccentric: tuple[int, int]
    bottom: tuple[int, int]
    concentric: tuple[int, int]
    lockout: tuple[int, int]
    #: The rep's own extent, from its first phase to its last.
    #:
    #: STORED RATHER THAN DERIVED from `eccentric[0]` and `lockout[1]`, which
    #: is what it used to be. That derivation quietly assumed the phases run in
    #: field order, which is true of a squat and false of a deadlift — whose
    #: rep opens with the concentric and closes with the bar back on the floor.
    frames: tuple[int, int]

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


def segment(y_raw: np.ndarray, exercise: str, fps: float) -> list[Rep]:
    """Every rep in the clip, in order, with its phases closed.

    `y_raw` is the bar's vertical position per frame, in pixels, y down.
    """
    if y_raw.size < 3 or np.isnan(y_raw).all():
        return []

    limits = thresholds()
    try:
        cycle = str(limits.value(f"segmentation.{exercise}.cycle"))
        ratio = float(limits.value(f"segmentation.{exercise}.min_rom_ratio"))
    except KeyError:
        # An exercise with no entry is not silently given someone else's
        # thresholds; it gets no reps, and the caller reports none found.
        return []

    # NaN runs are frames where the bar was genuinely lost. Held at the last
    # known value rather than dropped, so frame indices stay aligned with the
    # video — an off-by-N in the index is far worse than a flat segment.
    y = smooth(_hold(y_raw))

    span = float(np.ptp(y))
    if span <= 0:
        return []

    # THE SIGN CARRIES THE DIRECTION OF THE LIFT, and it is the only thing that
    # differs between a squat and a deadlift here. `motion` is built so that its
    # PEAKS are always the middle of a rep — the bottom of a squat, the lockout
    # of a deadlift — and its troughs are always the rest position the bar
    # returns to. Everything downstream is then one piece of maths rather than
    # two that have to be kept in step.
    motion = y if cycle == ECCENTRIC_FIRST else -y

    # Prominence keeps the transform from finding every ripple. Derived from
    # the signal's own range rather than set in pixels, so it means the same
    # thing at any distance from the bar.
    turns, _ = find_peaks(motion, prominence=span * 0.05)
    if turns.size == 0:
        return []

    # The rest position on each side of a turnaround, which bounds the
    # excursion.
    rests, _ = find_peaks(-motion, prominence=span * 0.05)
    edges = np.concatenate(([0], rests, [motion.size - 1]))

    candidates: list[tuple[int, int, int, float]] = []
    for turn in turns:
        before = edges[edges < turn]
        after = edges[edges > turn]
        if before.size == 0 or after.size == 0:
            continue
        start, end = int(before[-1]), int(after[0])
        # The shallower side, so a rep is only as deep as its weakest half —
        # a descent from standing that comes back up halfway is not a rep.
        rom = float(min(motion[turn] - motion[start], motion[turn] - motion[end]))
        if rom > 0:
            candidates.append((start, int(turn), end, rom))

    if not candidates:
        return []

    # Reference from the main cluster rather than from every candidate: real
    # reps group near the top of the range, decoys sit far below and would drag
    # a plain median down into them. See thresholds.yaml.
    roms = np.array([c[3] for c in candidates])
    fraction = float(limits.value("segmentation.rom_reference_fraction_of_max"))
    cluster = roms[roms >= roms.max() * fraction]
    reference = float(np.median(cluster))

    floor = reference * ratio
    kept = [c for c in candidates if c[3] >= floor]

    reps = [_phases(i, *c, motion=motion, cycle=cycle) for i, c in enumerate(kept, start=1)]
    return _close_tails(reps, last_frame=y.size, fps=fps, cycle=cycle)


def _phases(
    index: int,
    start: int,
    turn: int,
    end: int,
    rom: float,
    *,
    motion: np.ndarray,
    cycle: str,
) -> Rep:
    """Split one excursion into the four phases, tiling it exactly.

    Written against `motion`, whose peak is the middle of the rep whichever way
    the lift goes, so there are three spans to find and they are the same three
    for a squat and a deadlift:

      `away`  — the bar leaving the rest position, up to the turnaround
      `hold`  — the pause at the turnaround
      `back`  — the return to the rest position

    Only the NAMES depend on the lift, and they are assigned at the bottom.

    THE REP BEGINS WHERE THE BAR STARTS MOVING, not at the previous peak. Those
    are different frames whenever the lifter is still between reps, which is
    always: `start` and `end` here are peaks, and the still time either side of
    them belongs to the neighbouring pauses, not to this rep. Taking the peak
    put a consistent 13-frame error on S01 — exactly the length of the lockout
    it was swallowing.

    The turnaround is a SPAN, not an instant: the bar pauses there, and calling
    one frame "the bottom" would stack the two boundaries on top of each other.
    """
    limits = thresholds()
    onset = float(limits.value("segmentation.motion_onset_velocity_fraction"))
    leaving = float(limits.value("segmentation.left_rest_position_rom_fraction"))

    # Speed within this excursion only. A set-wide peak would let one explosive
    # rep raise the bar for every other rep's onset.
    speed = np.abs(np.gradient(motion[start : end + 1]))
    floor = float(speed.max()) * onset if speed.size and speed.max() > 0 else 0.0

    # FINDING THE EDGE OF THE MOVEMENT IS TWO QUESTIONS, AND ONE TEST CANNOT
    # ANSWER BOTH. Answering them separately is the whole of this block.
    #
    # `start` and `end` are peaks somewhere in the middle of however long the
    # bar sat still, so both ends have to be walked in across a plateau, and a
    # per-frame velocity test cannot cross one on real footage. Over the seven
    # seconds this clip's barbell lay untouched on the floor the tracked
    # centroid jittered 0.7-1.7 px per frame against an onset floor of 0.96, so
    # walking FORWARD — stopping at the first frame above the floor — stopped
    # on the first noise spike and put the start of a pull 3.4 s before the
    # lifter had touched the bar. On a synthetic clip the centroid is exact,
    # there is no jitter, and none of this shows.
    #
    # Displacement crosses the plateau reliably, because noise wanders inside a
    # band a few pixels wide and a lift leaves it for good. But it cannot place
    # the boundary: a gate large enough to clear the jitter is reached well
    # after the movement began, and on the synthetic clips a gate wide enough
    # for the real one put the eccentric start SIX frames late against a
    # three-frame budget. Sweeping it produced no value that satisfied both —
    # G3 wanted 0.015 or less and the real clip wanted 0.05 or more, which is
    # a signal that the shape was wrong rather than the number.
    #
    # So displacement is used only to reach a frame that is UNMISTAKABLY inside
    # the movement, and velocity walks back from there to the edge. That
    # reverses the direction of the fragile test and fixes it: walking back
    # stops at the first frame BELOW the floor, and inside a real movement the
    # bar is travelling 3-12 px per frame, so no noise dip ever reaches down to
    # the floor to stop it early. The gate then costs nothing in precision and
    # can be set purely for robustness.
    gate = rom * leaving

    moving = start
    while moving < turn and motion[moving] - motion[start] < gate:
        moving += 1
    away_start = moving
    while away_start > start and abs(motion[away_start] - motion[away_start - 1]) > floor:
        away_start -= 1

    moving = end
    while moving > turn and motion[moving] - motion[end] < gate:
        moving -= 1
    back_end = moving
    while back_end < end and abs(motion[back_end + 1] - motion[back_end]) > floor:
        back_end += 1

    # THE TURNAROUND IS WHERE THE BAR IS NOT MOVING, not where it is furthest.
    #
    # Defining it as "within 5% of the deepest point" measured the wrong thing:
    # with a cosine turnaround the bar sits within 5% of depth for far longer
    # than it is actually stationary, so the span came out 14 frames against a
    # true 6 and dragged the concentric start three frames late with it.
    #
    # FOUND THE SAME WAY AS THE ENDS, which is not a coincidence: it is the
    # same question — where does a movement meet a stillness — asked about the
    # other side of the pause. Reach a frame that is unmistakably inside the
    # movement, then let velocity walk back to the edge.
    #
    # A per-frame walk outward from the turnaround has the fragility the rep's
    # ends had. On the real clip's second rep the lifter held the lockout for
    # 1.7 s; the walk met a noise spike 0.1 s in, called the hold over, and
    # handed the remaining 1.6 s to the eccentric — reporting a 3.3 s lowering
    # of a bar that took 1.5 s to reach the floor. Every phase duration in the
    # rep was wrong, and `ecc_s` goes straight into tempo scoring.
    moving = turn
    while moving > away_start and motion[turn] - motion[moving] < gate:
        moving -= 1
    hold_start = moving
    while turn > hold_start > 0 and abs(motion[hold_start] - motion[hold_start - 1]) > floor:
        hold_start += 1

    moving = turn
    while moving < back_end - 1 and motion[turn] - motion[moving] < gate:
        moving += 1
    hold_end = moving
    while hold_end > turn and abs(motion[hold_end + 1] - motion[hold_end]) > floor:
        hold_end -= 1

    away = (away_start, hold_start)
    hold = (hold_start, hold_end)
    back = (hold_end, back_end)
    # Zero-width for now. The trailing pause is bounded by `_close_tails`,
    # which can see the next rep and the frame rate; this function can see
    # neither.
    tail = (back_end, back_end)

    if cycle == CONCENTRIC_FIRST:
        # The deadlift: pull, hold at the top, lower, bar back on the floor.
        return Rep(
            index=index,
            concentric=away,
            lockout=hold,
            eccentric=back,
            bottom=tail,
            frames=(away[0], tail[1]),
            _rom=rom,
        )

    return Rep(
        index=index,
        eccentric=away,
        bottom=hold,
        concentric=back,
        lockout=tail,
        frames=(away[0], tail[1]),
        _rom=rom,
    )


def _close_tails(reps: list[Rep], *, last_frame: int, fps: float, cycle: str) -> list[Rep]:
    """Give each rep its trailing pause, and END IT.

    The pause after the last movement of a rep is a real phase — a squat's
    lockout, a deadlift's touch-down — and it has to be closed by something
    this rep cannot see, because it runs past the excursion the peaks bounded.

    It used to be closed by the NEXT REP'S START, so the phases tiled the whole
    clip end to end. That is right for a set with no rest in it, which is every
    synthetic clip in the golden set and no real one. On the first real set it
    made the nine seconds the lifter spent standing over the bar between two
    pulls part of a rep, and reported that rep as nine seconds long.

    Now the pause is capped: past `max_end_pause_s` the lifter is resting, not
    lifting, and those frames belong to NO REP. The phases still tile each rep
    exactly — the gap is between reps, not inside one.
    """
    limits = thresholds()
    cap = float(limits.value("segmentation.max_end_pause_s"))
    # A clip with no frame rate cannot convert seconds to frames. Falling back
    # to the old behaviour is better than capping at zero frames, which would
    # delete the phase entirely.
    longest = int(round(cap * fps)) if fps > 0 else last_frame

    closed: list[Rep] = []
    for i, rep in enumerate(reps):
        settled = rep.frames[1]
        following = reps[i + 1].frames[0] if i + 1 < len(reps) else last_frame
        end = max(settled, min(following, settled + longest))
        tail = (settled, end)
        finished = replace(rep, frames=(rep.frames[0], end))
        closed.append(
            replace(finished, bottom=tail)
            if cycle == CONCENTRIC_FIRST
            else replace(finished, lockout=tail)
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
