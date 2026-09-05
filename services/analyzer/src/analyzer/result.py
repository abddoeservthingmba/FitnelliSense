"""Building the output envelope.

One place that knows the shape of a result, so an abstention and a full
analysis cannot drift into different structures. A client that has to ask
"which fields exist this time" is a client that will get it wrong.

EVERY NUMBER IS OMITTED RATHER THAN ZEROED when it is not known. A score of 0
and a score of "we could not measure this" are different claims, and the second
one is not expressible as a number — hence `None` throughout rather than
defaults that read as measurements.
"""

from __future__ import annotations

from typing import Any, Literal

from . import __version__
from .thresholds import thresholds

Status = Literal["ok", "insufficient_quality", "unsupported_exercise", "no_reps_detected"]

#: Why a clip was refused. Machine-readable, so the client can map each to a
#: specific instruction rather than showing one generic apology.
QualityReason = Literal[
    "unreadable_video",
    "fps_below_minimum",
    "duration_too_long",
    "resolution_too_low",
    "ambiguous_rotation",
    "low_keypoint_confidence",
    "subject_occluded",
    "multiple_subjects",
]

#: The score components. Listed here so an abstention publishes the same keys
#: as a success, all null — the client renders one shape either way.
SCORE_KEYS = ("overall", "form", "depth", "tempo", "consistency", "power")


def _empty_scores() -> dict[str, None]:
    return dict.fromkeys(SCORE_KEYS)


def envelope(
    *,
    status: Status,
    exercise: str,
    runtime_ms: int,
    reason: QualityReason | None = None,
    view_detected: str | None = None,
    view_confidence: float | None = None,
    mean_keypoint_confidence: float | None = None,
    calibration_method: str | None = None,
    px_per_metre: float | None = None,
    frames_processed: int = 0,
    reps: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """A result conforming to the output schema.

    `runtime_ms` is the only field permitted to differ between two runs of the
    same clip — G7 excludes it and compares everything else byte for byte.
    """
    return {
        "schema_version": "0.1.0",
        "status": status,
        "quality": {
            "reason": reason,
            "view_detected": view_detected,
            "view_confidence": view_confidence,
            "mean_keypoint_confidence": mean_keypoint_confidence,
            "calibration_method": calibration_method,
            "px_per_metre": px_per_metre,
        },
        "exercise": exercise,
        "set": {
            "rep_count": len(reps or []),
            "scores": _empty_scores(),
            "findings": [],
            "coaching": [],
        },
        "reps": list(reps or []),
        "artifacts": {
            "annotated_video": None,
            "bar_path_svg": None,
            "keypoints_parquet": None,
        },
        "diagnostics": {
            "analyzer_version": __version__,
            "thresholds_version": thresholds().version,
            "runtime_ms": runtime_ms,
            "frames_processed": frames_processed,
        },
    }


def abstain(
    *,
    reason: QualityReason,
    exercise: str,
    runtime_ms: int,
    frames_processed: int = 0,
) -> dict[str, Any]:
    """Refuse to analyse, and say why.

    Cannot carry findings, reps or scores — not by convention but by
    construction, because `envelope` has no parameters for them. The hard rule
    of the service is that a refusal never leaks a verdict, and the cheapest
    way to guarantee that is to make the value unrepresentable.
    """
    return envelope(
        status="insufficient_quality",
        exercise=exercise,
        runtime_ms=runtime_ms,
        reason=reason,
        frames_processed=frames_processed,
    )
