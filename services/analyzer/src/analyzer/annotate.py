"""Draw what the analyser saw, so a human can check it.

THE REASON THIS EXISTS. Tracking reported 100% coverage on a clip it was
reading as pure noise, and the only way that surfaced was a rep count so
absurd it could not be ignored. A number cannot show you that the tracker was
following a light fitting. A picture can, in about two seconds.

Every claim in the output is checkable from this video: where the bar was
thought to be, where it was merely inferred, and where the analyser had no
idea. That is the auditable-output rule applied to the stage that has no
numbers of its own — a verdict the user cannot check is a verdict they cannot
trust, and the same is true of a path.

Deliberately plain. No branding, no easing, no gradients: this is an
instrument, and anything decorative here competes with the evidence.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from .tracking import BarSeries

#: BGR. Green where the bar was tracked continuously, amber where it was
#: re-acquired without continuity, red where it was lost entirely.
LOCKED = (120, 220, 120)
ACQUIRED = (60, 190, 240)
LOST = (70, 70, 235)
TRAIL = (230, 230, 230)

#: How many frames of path to keep behind the marker. Long enough to show the
#: shape of a rep, short enough not to become a scribble over a whole set.
TRAIL_FRAMES = 90


def _colour(series: BarSeries, index: int) -> tuple[int, int, int]:
    if not series.found[index]:
        return LOST
    return LOCKED if series.locked[index] else ACQUIRED


def _label(series: BarSeries, index: int) -> str:
    if not series.found[index]:
        return f"frame {index}  LOST"
    return f"frame {index}  {'LOCKED' if series.locked[index] else 'acquired'}"


def render(video: Path, series: BarSeries, out: Path, *, max_frames: int | None = None) -> Path:
    """Write a copy of the clip with the bar path drawn over it."""
    capture = cv2.VideoCapture(str(video))
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = capture.get(cv2.CAP_PROP_FPS) or series.fps

    out.parent.mkdir(parents=True, exist_ok=True)
    writer = cv2.VideoWriter(str(out), cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
    if not writer.isOpened():
        capture.release()
        raise RuntimeError(f"could not open a video writer for {out}")

    thickness = max(2, height // 400)
    index = 0

    try:
        while True:
            read, frame = capture.read()
            if not read or index >= len(series):
                break
            if max_frames is not None and index >= max_frames:
                break

            # The trail, oldest to newest, so the current position draws last
            # and sits on top.
            start = max(0, index - TRAIL_FRAMES)
            for i in range(start, index):
                if np.isnan(series.x[i]) or np.isnan(series.x[i + 1]):
                    continue
                cv2.line(
                    frame,
                    (int(series.x[i]), int(series.y[i])),
                    (int(series.x[i + 1]), int(series.y[i + 1])),
                    TRAIL,
                    max(1, thickness // 2),
                    lineType=cv2.LINE_AA,
                )

            if not np.isnan(series.x[index]):
                centre = (int(series.x[index]), int(series.y[index]))
                radius = int(series.radius[index]) if not np.isnan(series.radius[index]) else 20
                cv2.circle(frame, centre, radius, _colour(series, index), thickness, cv2.LINE_AA)
                cv2.drawMarker(
                    frame,
                    centre,
                    _colour(series, index),
                    cv2.MARKER_CROSS,
                    thickness * 8,
                    thickness,
                )

            # A legend, because the colours mean something specific and a
            # reader should not have to guess which is which.
            cv2.putText(
                frame,
                _label(series, index),
                (16, 40),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                _colour(series, index),
                2,
                cv2.LINE_AA,
            )
            cv2.putText(
                frame,
                f"coherence {series.coherence * 100:.0f}%",
                (16, 76),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                TRAIL,
                2,
                cv2.LINE_AA,
            )

            writer.write(frame)
            index += 1
    finally:
        capture.release()
        writer.release()

    return out
