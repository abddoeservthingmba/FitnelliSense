"""Reading `thresholds.yaml`.

Every number the pipeline compares against comes from here. G10 scans the rule
modules for float literals and fails on any hit, so this is not a convention —
it is the only way a threshold can exist.

Loaded once and cached. Re-reading per clip would let the file change between
two clips of the same eval run, which would break determinism (G7) in a way
that looks like a pipeline bug.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

THRESHOLDS_PATH = Path(__file__).resolve().parents[2] / "thresholds.yaml"


class ThresholdError(KeyError):
    """A threshold was asked for that does not exist.

    Raised rather than defaulted, always. A missing threshold silently falling
    back to a plausible number is how a rule ends up with a value nobody chose
    and nobody can find.
    """


class Thresholds:
    """The threshold file, addressed by dotted key."""

    def __init__(self, data: dict[str, Any]) -> None:
        self._data = data

    @property
    def version(self) -> str:
        return str(self._data.get("version", "unknown"))

    def entry(self, key: str) -> dict[str, Any]:
        """The whole record — value, unit, source, date, enabled."""
        node: Any = self._data
        for part in key.split("."):
            if not isinstance(node, dict) or part not in node:
                raise ThresholdError(f"no threshold {key!r} in thresholds.yaml")
            node = node[part]
        if not isinstance(node, dict) or "value" not in node:
            raise ThresholdError(f"threshold {key!r} has no `value`")
        return node

    def value(self, key: str) -> Any:
        return self.entry(key)["value"]

    def enabled(self, key: str) -> bool:
        """Whether a rule using this threshold may fire for users.

        Defaults TRUE for entries that predate the flag — ingest limits and
        calibration constants are not rules and have no fixture to earn an
        `enabled` from. Rules are marked explicitly; see the file's header.
        """
        return bool(self.entry(key).get("enabled", True))


@lru_cache(maxsize=1)
def thresholds(path: Path = THRESHOLDS_PATH) -> Thresholds:
    return Thresholds(yaml.safe_load(path.read_text(encoding="utf-8")))
