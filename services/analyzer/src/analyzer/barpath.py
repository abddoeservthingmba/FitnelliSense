"""The bar path, as data, for a caller that will do its own arithmetic.

WHY THIS EXISTS SEPARATELY FROM `cli.analyze_video`. The metrics a lifter reads
— range of motion in metres, mean concentric velocity, bar drift, velocity loss
across a set — are already implemented, tested and depended upon by the API's
`analysisResultSchema`, in `packages/domain/src/bar-path.ts`. That module's own
docstring states the seam this file is built to:

    "This module is deliberately ignorant of how the point was tracked.
     Whether it came from a vision model, an optical-flow patch or someone
     tapping the plate frame by frame, the input is the same: a sequence of
     positions in pixels with timestamps."

So the analyser's job stops at the path. Reimplementing metres and velocity
here would put the same arithmetic in two languages, and the project's own rule
is that domain logic lives in exactly one place — `packages/domain`. It would
also be the WORSE of the two copies: the TypeScript one is unit-tested at 100%
branch coverage and is what the wire contract was written against.

WHAT TRAVELS AND WHAT DOES NOT. Pixels and a plate radius travel. Metres do
not, because a metre is a claim about scale and scale is the consumer's to
establish from the ruler this file hands it. Reps do not either — the same
reasoning, and `detectReps` already takes a `startsAt` for the lift direction.

The gates DO travel, as a status and a reason, because refusing a clip is a
statement about the TRACKING and only this side can make it. A consumer handed
3692 samples has no way to know they describe a wall fan.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np

from . import ingest, tracking

#: The shape of the payload below. Its consumer is a separate deployable that
#: is versioned and released independently, so the two can only stay in step if
#: the contract says out loud which version it is.
#:
#: Bump the MINOR for an added field, the MAJOR for a changed or removed one.
PATH_SCHEMA_VERSION = "1.0.0"


def bar_path(
    *,
    video: Path,
    seed: tracking.Seed | None = None,
    seed_fraction: tuple[float, float, float] | None = None,
) -> dict[str, Any]:
    """Track the bar and return its path, or say why it cannot be measured.

    `seed_fraction` is `(x, y, at_secs)` with x and y as FRACTIONS of the
    upright frame, which is how a phone reports a tap. Resolved here, after the
    probe, because this is the first point at which the decoded frame size and
    frame rate are known — and they are not knowable anywhere else. A client
    reports the size of the view it drew, and Android reports a rotated clip's
    dimensions inconsistently enough that the pipeline spent three iterations
    measuring deadlifts sideways.

    `seed` in pixels still works and takes precedence, because the CLI's
    `--seed` and the eval harness both use it.

    `samples` are in SOURCE pixels of the UPRIGHT frame, y DOWN — the raw image
    convention, unflipped. The flip to "up is positive" happens exactly once,
    in `toMetres` on the consuming side, and doing it here as well would invert
    every concentric in the app.

    Only frames where the bar was genuinely located appear. A gap in `t_ms` is
    therefore a real gap, and it is left as one: interpolating across a long
    occlusion would fabricate movement, and the consumer cannot tell invented
    samples from measured ones.
    """
    found, reason = ingest.check(video)
    if reason is not None:
        return _envelope(status="insufficient_quality", reason=reason, probe=found)

    assert found is not None

    if seed is None and seed_fraction is not None:
        fx, fy, at_secs = seed_fraction
        seed = tracking.Seed(
            x=fx * found.width,
            y=fy * found.height,
            # Rounded to the nearest frame. A tap is worth about a tenth of a
            # second of the lifter's precision, so a frame either way is noise
            # against it — and `_acquire_at` searches around the point anyway.
            frame=max(0, min(found.frame_count - 1, int(round(at_secs * found.fps)))),
        )

    series = tracking.track(video, fps=found.fps, seed=seed)

    quality = {
        "coherence": round(series.coherence, 4),
        "radius_spread": round(series.radius_spread, 4)
        if np.isfinite(series.radius_spread)
        else None,
        "travel_plate_radii": round(series.travel_in_radii, 4),
    }

    refused = tracking.refuse(series)
    if refused is not None:
        return _envelope(
            status="insufficient_quality", reason=refused, probe=found, quality=quality
        )

    radius = tracking.plate_radius_px(series)
    if radius is None:
        # Belt and braces: `refuse` cannot pass with no detections, since
        # coherence would be zero. Kept because the consumer divides by this
        # number, and a null reaching it would surface as a scale of infinity
        # rather than as a refusal.
        return _envelope(
            status="insufficient_quality", reason="bar_not_tracked", probe=found, quality=quality
        )

    return _envelope(
        status="ok",
        reason=None,
        probe=found,
        quality=quality,
        plate_radius_px=round(radius, 3),
        samples=_samples(series),
    )


def _samples(series: tracking.BarSeries) -> list[list[float]]:
    """`[t_ms, x, y]` per located frame.

    A THREE-ELEMENT ARRAY RATHER THAN AN OBJECT, and it is the one place here
    where terseness beats self-description: a 61-second clip at 60 fps is over
    3600 samples, and repeating three key names on each one triples the payload
    for no reader — the only consumer is a program, and the order is stated in
    this docstring and in the schema version above.
    """
    usable = series.found & np.isfinite(series.x) & np.isfinite(series.y)
    indices = np.flatnonzero(usable)
    fps = series.fps if series.fps > 0 else 0.0

    return [
        [
            round(index / fps * 1000.0, 3) if fps > 0 else float(index),
            round(float(series.x[index]), 3),
            round(float(series.y[index]), 3),
        ]
        for index in indices
    ]


def _envelope(
    *,
    status: str,
    reason: str | None,
    probe: ingest.Probe | None,
    quality: dict[str, Any] | None = None,
    plate_radius_px: float | None = None,
    samples: list[list[float]] | None = None,
) -> dict[str, Any]:
    """One shape whether it worked or not.

    A refusal carries the same keys as a success, with `samples` empty rather
    than absent. A consumer that has to ask which fields exist this time is a
    consumer that will eventually read one that is not there.
    """
    return {
        "path_schema_version": PATH_SCHEMA_VERSION,
        "status": status,
        "reason": reason,
        "fps": probe.fps if probe is not None else None,
        "frame_count": probe.frame_count if probe is not None else 0,
        # Post-rotation, because these describe the frames that were actually
        # decoded — see `ingest.probe`.
        "width": probe.width if probe is not None else None,
        "height": probe.height if probe is not None else None,
        # The RADIUS, not the diameter. A 450 mm plate is 450 mm across, so the
        # consumer doubles this before calibrating; saying which one this is
        # matters more than saving it the multiplication.
        "plate_radius_px": plate_radius_px,
        "quality": quality
        or {"coherence": None, "radius_spread": None, "travel_plate_radii": None},
        "samples": samples or [],
    }


def write(payload: dict[str, Any], out: Path) -> None:
    """Serialise deterministically, for the same reason the result envelope is.

    `sort_keys` so two runs of the same clip produce byte-identical files (G7).
    """
    out.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
