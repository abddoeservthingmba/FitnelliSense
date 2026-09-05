"""Load and validate the golden-set manifest.

The manifest is ground truth. Every gate is scored against it, so a malformed
or self-contradictory label does not produce a visible error — it quietly moves
the target the whole loop is aiming at. This module therefore validates hard and
refuses to return a partially-understood manifest.

Validation is structural only. It cannot tell whether a human labelled a rep's
depth correctly; it can tell whether the phases are contiguous, whether the rep
count matches the number of labelled reps, and whether a clip that claims to
abstain also claims to have findings. Those are the errors that actually occur.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from itertools import pairwise
from pathlib import Path
from typing import Any, Literal

import yaml

MANIFEST = Path(__file__).resolve().parents[1] / "clips" / "manifest.yaml"
CLIPS_DIR = MANIFEST.parent

Status = Literal["ok", "insufficient_quality", "unsupported_exercise", "no_reps_detected"]

#: The four phases, in the order they must occur within a rep.
PHASE_ORDER = ("eccentric", "bottom", "concentric", "lockout")


class ManifestError(Exception):
    """The manifest cannot be trusted. Never downgraded to a warning."""


@dataclass(frozen=True)
class RepLabel:
    index: int
    depth_ok: bool | None
    frames: tuple[int, int] | None
    phases: dict[str, tuple[int, int]]

    def boundaries(self) -> dict[str, int]:
        """The four start frames, which is what G3 compares against."""
        return {name: span[0] for name, span in self.phases.items()}


@dataclass(frozen=True)
class FaultLabel:
    rule_id: str
    severity: str
    #: None means "this fault occurs somewhere in the set, reps not yet
    #: labelled". Gates needing per-rep attribution skip these rather than
    #: assuming every rep.
    reps: list[int] | None


@dataclass(frozen=True)
class Clip:
    id: str
    source: Literal["synthetic", "real"]
    file: str
    exercise: str
    view_requested: str
    view_true: str
    expected_status: Status
    expected_quality_reason: str | None
    true_rep_count: int | None
    reps: list[RepLabel]
    known_faults: list[FaultLabel]
    generator: dict[str, Any] | None
    expected_calibration_method: str | None
    notes: str
    raw: dict[str, Any] = field(repr=False, default_factory=dict)

    @property
    def path(self) -> Path:
        return CLIPS_DIR / self.file

    @property
    def present(self) -> bool:
        """Whether the footage actually exists on disk.

        A stub with no file is not a failure — it is a slot waiting to be
        filled, and it is excluded from gate denominators rather than counted
        against them. Scoring a gate over footage nobody has recorded would
        report a number that means nothing.
        """
        return self.path.is_file()

    @property
    def should_abstain(self) -> bool:
        return self.expected_status == "insufficient_quality"

    @property
    def labelled_reps(self) -> bool:
        """True when per-rep labels exist to compare against."""
        return bool(self.reps)


def _tuple2(value: Any, where: str) -> tuple[int, int]:
    if not isinstance(value, list) or len(value) != 2:
        raise ManifestError(f"{where}: expected a [start, end] pair, got {value!r}")
    start, end = value
    if not isinstance(start, int) or not isinstance(end, int):
        raise ManifestError(f"{where}: frame indices must be integers, got {value!r}")
    if end < start:
        raise ManifestError(f"{where}: end frame {end} precedes start frame {start}")
    return (start, end)


def _parse_rep(raw: dict[str, Any], clip_id: str) -> RepLabel:
    where = f"{clip_id} rep {raw.get('index')}"
    phases_raw = raw.get("phases") or {}

    phases: dict[str, tuple[int, int]] = {}
    for name in PHASE_ORDER:
        if name in phases_raw:
            phases[name] = _tuple2(phases_raw[name], f"{where} phase {name}")

    # Phases must tile the rep without gaps or overlaps. A gap means some frames
    # belong to no phase, which makes a boundary error undefined rather than
    # large — and G3 would then be measuring nothing.
    present = [name for name in PHASE_ORDER if name in phases]
    for earlier, later in pairwise(present):
        if phases[earlier][1] != phases[later][0]:
            raise ManifestError(
                f"{where}: {earlier} ends at {phases[earlier][1]} but {later} "
                f"starts at {phases[later][0]}; phases must be contiguous"
            )

    frames = _tuple2(raw["frames"], f"{where} frames") if raw.get("frames") else None
    if frames and present:
        span_start, span_end = phases[present[0]][0], phases[present[-1]][1]
        if (span_start, span_end) != frames:
            raise ManifestError(
                f"{where}: frames {frames} disagree with phase span "
                f"[{span_start}, {span_end}]"
            )

    return RepLabel(
        index=int(raw["index"]),
        depth_ok=raw.get("depth_ok"),
        frames=frames,
        phases=phases,
    )


def _derived_reps(raw: dict[str, Any]) -> list[RepLabel]:
    """Labels for a synthetic clip, computed from its generator config.

    A synthetic clip's ground truth IS its generator parameters, so the manifest
    does not state the boundaries and cannot contradict them. The first draft
    hand-wrote them beside the config and they were already wrong — off by a
    frame from Python's round-half-to-even, with the last rep running past the
    requested duration. Deriving removes the possibility rather than testing for
    it.
    """
    from .plan import depth_ok, phase_plan

    cfg = raw["generator"]
    ok = depth_ok(cfg)
    return [
        RepLabel(
            index=plan.index,
            depth_ok=ok,
            frames=plan.frames,
            phases=dict(plan.phases),
        )
        for plan in phase_plan(cfg)
    ]


def _parse_clip(raw: dict[str, Any]) -> Clip:
    clip_id = raw.get("id")
    if not isinstance(clip_id, str):
        raise ManifestError(f"clip is missing a string id: {raw!r}")

    for required in ("source", "file", "exercise", "expected_status"):
        if required not in raw:
            raise ManifestError(f"{clip_id}: missing required field {required!r}")

    if raw.get("reps") and raw.get("generator"):
        raise ManifestError(
            f"{clip_id}: a synthetic clip must not hand-write `reps` — they are "
            "derived from `generator` so the two cannot drift apart"
        )

    if raw.get("generator") and raw["expected_status"] == "ok":
        reps = _derived_reps(raw)
    else:
        reps = [_parse_rep(rep, clip_id) for rep in raw.get("reps") or []]

    faults = [
        FaultLabel(
            rule_id=str(f["rule_id"]),
            severity=str(f["severity"]),
            reps=f.get("reps"),
        )
        for f in raw.get("known_faults") or []
    ]

    clip = Clip(
        id=clip_id,
        source=raw["source"],
        file=raw["file"],
        exercise=raw["exercise"],
        view_requested=raw.get("view_requested", "side"),
        view_true=str(raw.get("view_true", raw.get("view_requested", "side"))),
        expected_status=raw["expected_status"],
        expected_quality_reason=raw.get("expected_quality_reason"),
        true_rep_count=raw.get("true_rep_count"),
        reps=reps,
        known_faults=faults,
        generator=raw.get("generator"),
        expected_calibration_method=raw.get("expected_calibration_method"),
        notes=str(raw.get("notes", "")).strip(),
        raw=raw,
    )
    _check_consistency(clip)
    return clip


def _check_consistency(clip: Clip) -> None:
    """Catch labels that contradict each other.

    These are the mistakes that happen in practice: a rep added to the list but
    the count not updated, or an abstain clip that also carries expected
    findings. Both would score a gate against an impossible target.
    """
    if clip.true_rep_count is not None and clip.reps:
        if len(clip.reps) != clip.true_rep_count:
            # For a synthetic clip this means `true_rep_count` disagrees with
            # `generator.reps`, which is a manifest bug rather than a labelling
            # one — and exactly the drift deriving the labels is meant to stop.
            raise ManifestError(
                f"{clip.id}: true_rep_count is {clip.true_rep_count} but "
                f"{len(clip.reps)} reps are labelled"
            )

    indices = [rep.index for rep in clip.reps]
    if indices != list(range(1, len(indices) + 1)):
        raise ManifestError(f"{clip.id}: rep indices must be 1..n in order, got {indices}")

    if clip.should_abstain:
        if clip.expected_quality_reason is None:
            raise ManifestError(
                f"{clip.id}: expects insufficient_quality but names no reason. "
                "An abstention the user cannot act on is not much better than a "
                "wrong answer."
            )
        if clip.known_faults:
            raise ManifestError(
                f"{clip.id}: expects insufficient_quality yet lists known_faults. "
                "A clip cannot both abstain and produce verdicts."
            )
        if clip.true_rep_count is not None:
            raise ManifestError(
                f"{clip.id}: expects insufficient_quality yet asserts a rep count. "
                "If the footage is unreadable the count is unknowable."
            )

    if clip.source == "real" and clip.reps and not clip.raw.get("labelled_by"):
        raise ManifestError(
            f"{clip.id}: real clip carries rep labels but no labelled_by. "
            "Provenance is required before a human label can be trusted."
        )


def load_manifest(path: Path = MANIFEST) -> list[Clip]:
    """Parse and validate the manifest, or raise."""
    if not path.is_file():
        raise ManifestError(f"manifest not found at {path}")

    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or "clips" not in data:
        raise ManifestError("manifest must be a mapping containing a `clips` list")

    clips = [_parse_clip(raw) for raw in data["clips"]]

    seen: set[str] = set()
    for clip in clips:
        if clip.id in seen:
            raise ManifestError(f"duplicate clip id {clip.id!r}")
        seen.add(clip.id)

    if not clips:
        raise ManifestError("manifest contains no clips")

    return clips
