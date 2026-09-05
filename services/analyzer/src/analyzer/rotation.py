"""Reading rotation metadata, and refusing it when it cannot be trusted.

WHY THIS MATTERS MORE THAN IT LOOKS. A phone records landscape sensor data and
writes a rotation flag; the player applies it on the way out. A pipeline that
ignores the flag measures a portrait squat sideways — and every angle it
produces is wrong by ninety degrees while looking entirely plausible. There is
no symptom. The numbers are just wrong.

Every clip in the golden set will come off a phone, which is why this had to
close before the footage arrives rather than after it.

TWO SOURCES, AND THEY CAN DISAGREE. Modern files carry a Display Matrix side
packet; older ones carry a `rotate` tag; some carry both. When they conflict
there is no principled way to pick, so the clip is refused. Guessing is a coin
flip that silently rotates the entire analysis, and `ambiguous_rotation` exists
in the schema precisely so that this can be said out loud.
"""

from __future__ import annotations

from typing import Any

#: Rotations a camera can actually record. Anything else is corruption or a
#: hand-edited file, not an orientation.
RIGHT_ANGLES = (0, 90, 180, 270)


class RotationError(ValueError):
    """The rotation cannot be determined, so the clip must be refused."""


def _normalise(degrees: float) -> int:
    """Fold any angle into 0-359.

    ffmpeg reports the display matrix as a NEGATIVE angle — a clip a player
    turns 90 degrees clockwise is reported as -90. Both conventions land on the
    same normalised value here, which is why the two sources can be compared at
    all.
    """
    return int(round(degrees)) % 360


def rotation_from_probe(payload: dict[str, Any]) -> int:
    """The clip's rotation in degrees, or raise if it is ambiguous."""
    streams = payload.get("streams") or []
    if not streams:
        return 0
    stream = streams[0]

    found: list[int] = []

    for side_data in stream.get("side_data_list") or []:
        if "rotation" in side_data:
            found.append(_normalise(float(side_data["rotation"])))

    tag = (stream.get("tags") or {}).get("rotate")
    if tag is not None:
        try:
            found.append(_normalise(float(tag)))
        except (TypeError, ValueError) as exc:
            raise RotationError(f"unreadable rotate tag {tag!r}") from exc

    if not found:
        return 0

    unique = set(found)
    if len(unique) > 1:
        raise RotationError(f"sources disagree: {sorted(unique)}")

    rotation = unique.pop()
    if rotation not in RIGHT_ANGLES:
        raise RotationError(f"{rotation} degrees is not a camera orientation")

    return rotation
