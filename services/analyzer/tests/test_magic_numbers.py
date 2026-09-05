"""G10, as a unit test as well as a gate.

The scan runs in two places on purpose. As a gate it reports; as a test it
BLOCKS. A magic number is cheap to remove the moment it is written and expensive
once a rule has been tuned around it, so this fails the build rather than
appearing in a report somebody reads later.
"""

from __future__ import annotations

import textwrap

from evals.harness.magic_numbers import scan_rule_modules


def test_no_magic_numbers_in_rule_modules():
    hits = scan_rule_modules()
    assert not hits, "float literals found in rule modules:\n" + "\n".join(
        f"  {h['file']}:{h['line']} -> {h['value']}" for h in hits
    )


def test_scanner_catches_a_threshold(tmp_path):
    """The scan must fail on the thing it exists to catch."""
    (tmp_path / "r.py").write_text(
        textwrap.dedent(
            """
            def evaluate(m):
                return m.torso_change_deg > 12.0
            """
        ),
        encoding="utf-8",
    )
    hits = scan_rule_modules(tmp_path)
    assert len(hits) == 1
    assert hits[0]["value"] == 12.0


def test_scanner_allows_structural_constants(tmp_path):
    """Halving and percentages are structure, not policy."""
    (tmp_path / "r.py").write_text(
        textwrap.dedent(
            """
            def midpoint(a, b):
                return (a + b) / 2.0

            def as_percent(x):
                return x * 100.0
            """
        ),
        encoding="utf-8",
    )
    assert scan_rule_modules(tmp_path) == []


def test_scanner_ignores_integers(tmp_path):
    """`reps[0]` and `range(3)` are indices, not thresholds."""
    (tmp_path / "r.py").write_text(
        textwrap.dedent(
            """
            def first_three(xs):
                return xs[0], len(xs) - 1, list(range(3))
            """
        ),
        encoding="utf-8",
    )
    assert scan_rule_modules(tmp_path) == []


def test_scanner_reads_syntax_not_text(tmp_path):
    """A float inside a docstring is prose. A regex would flag it; the AST does not."""
    (tmp_path / "r.py").write_text(
        textwrap.dedent(
            '''
            def evaluate(m, threshold):
                """Trips above the configured angle, historically around 12.0 deg."""
                return m.angle > threshold
            '''
        ),
        encoding="utf-8",
    )
    assert scan_rule_modules(tmp_path) == []
