"""Analyzer entry point.

    analyze --video in.mp4 --exercise back_squat --view side --out result.json

STATUS: STUB. The pipeline does not exist yet, and this file deliberately does
nothing except refuse. The build order puts the eval harness before any
computer-vision code so that every stage is added against a measurement that
already works — the alternative is writing a pipeline and then inventing an
evaluation that flatters it.

`analyze_video` raises `NotImplementedError`, which the harness records as a
blocked gate rather than a crash. That is the honest starting state: nothing has
been measured, so no gate may claim a value.

The interface is stateless and idempotent on `(video_sha256, exercise, view)` —
the same three inputs must always produce the same output, which is what lets
the API cache a result and what G7 checks on every run.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from . import __version__


def analyze_video(*, video: Path, exercise: str, view: str) -> dict[str, Any]:
    """Analyse one set and return a result conforming to the output schema.

    Raises:
        NotImplementedError: always, until the pipeline is built.
    """
    raise NotImplementedError(
        "the analyzer pipeline is not built yet — "
        "harness and golden set first, by design (build order steps 1-2)"
    )


def main() -> int:
    parser = argparse.ArgumentParser(prog="analyze", description="Analyse one weightlifting set.")
    parser.add_argument("--video", required=True, type=Path)
    parser.add_argument("--exercise", required=True)
    parser.add_argument("--view", required=True, choices=["side", "front", "rear", "45"])
    parser.add_argument("--out", type=Path)
    parser.add_argument("--version", action="version", version=__version__)
    args = parser.parse_args()

    try:
        result = analyze_video(video=args.video, exercise=args.exercise, view=args.view)
    except NotImplementedError as exc:
        print(f"analyze: {exc}", file=sys.stderr)
        return 3

    payload = json.dumps(result, indent=2, sort_keys=True)
    if args.out:
        args.out.write_text(payload + "\n", encoding="utf-8")
    else:
        print(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
