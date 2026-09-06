"""Open a video the same way everywhere, with gravity pointing down.

THE BUG THIS EXISTS TO KILL. Phones record portrait video as a LANDSCAPE
frame plus a rotation flag, and the flag is metadata rather than pixels.
OpenCV reads it — `CAP_PROP_ORIENTATION_META` was 90 on the first real clip —
and does not apply it, because `CAP_PROP_ORIENTATION_AUTO` defaults to 0.

So a 1080x1920 portrait deadlift decoded as 1920x1080 with the lifter lying on
their side, and every stage downstream measured the wrong axis. Segmentation
runs on `y`; the bar's real vertical travel was in `x`. The symptoms all
pointed somewhere else entirely:

    y travel   11% of frame  ->  read as "this object barely moves"
    x drift    53% of frame  ->  ignored; THESE WERE THE REPS
    verdict    1 rep, then 4 reps, then abstain

Three iterations of tracker work chased that, and the tracker was fine. It had
locked onto the plate and followed it accurately the whole time. Nothing in
the pipeline was wrong except which way was down.

An analyser that measures lifts cannot be agnostic about gravity, so
orientation is resolved ONCE, here, at decode — not carried downstream as a
number every consumer has to remember to apply. Every capture in the codebase
goes through this function.
"""

from __future__ import annotations

from pathlib import Path

import cv2


def open_video(path: Path) -> cv2.VideoCapture:
    """A capture that yields UPRIGHT frames.

    `CAP_PROP_ORIENTATION_AUTO` must be set BEFORE the first read, and it
    changes what the frame-size properties report, which is the point: callers
    then see the dimensions of the frames they will actually be handed rather
    than the container's.
    """
    capture = cv2.VideoCapture(str(path))
    capture.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)
    return capture


def rotation_degrees(path: Path) -> int:
    """The rotation the container asks for, 0 if it asks for none.

    Reported for diagnostics and for the ingest cross-check against ffprobe.
    `open_video` has already applied it; nobody should be rotating frames by
    hand off the back of this.
    """
    capture = cv2.VideoCapture(str(path))
    try:
        meta = capture.get(cv2.CAP_PROP_ORIENTATION_META)
    finally:
        capture.release()
    return int(meta) % 360 if meta else 0
