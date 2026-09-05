"""The magic-number scan (G10).

AST, not grep. A regex cannot tell a comparison threshold from a version string,
an array index, or a number inside a docstring, and a scan that cries wolf gets
suppressed rather than fixed — at which point the gate is worse than absent
because it looks like coverage.

The rule is narrow and absolute: **no float literal may appear in a rule
module**. Every comparison value comes from `thresholds.yaml`, because Loop C
sweeps thresholds from that file and a number inlined in Python is a number
nobody can tune, audit, or attribute to a source.

Integers are allowed. `reps[0]`, `range(3)` and `len(x) - 1` are structure, not
policy. Floats are where thresholds hide.
"""

from __future__ import annotations

import ast
from pathlib import Path
from typing import Any

RULES_DIR = Path(__file__).resolve().parents[2] / "src" / "analyzer" / "rules"

#: Structural constants with no threshold meaning. Deliberately tiny — every
#: addition here is a hole in the gate, so each one has to earn its place.
ALLOWED_FLOATS = frozenset({0.0, 1.0, 2.0, 100.0})


class _FloatFinder(ast.NodeVisitor):
    def __init__(self, path: Path) -> None:
        self.path = path
        self.hits: list[dict[str, Any]] = []

    def visit_Constant(self, node: ast.Constant) -> None:
        if isinstance(node.value, float) and node.value not in ALLOWED_FLOATS:
            self.hits.append(
                {
                    "file": str(self.path.name),
                    "line": node.lineno,
                    "value": node.value,
                    "hint": "move this to thresholds.yaml and reference it by key",
                }
            )
        self.generic_visit(node)


def scan_rule_modules(directory: Path = RULES_DIR) -> list[dict[str, Any]]:
    """Every disallowed float literal in the rule modules."""
    if not directory.is_dir():
        return []

    hits: list[dict[str, Any]] = []
    for path in sorted(directory.rglob("*.py")):
        finder = _FloatFinder(path)
        finder.visit(ast.parse(path.read_text(encoding="utf-8"), filename=str(path)))
        hits.extend(finder.hits)
    return hits
