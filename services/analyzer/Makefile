# Eval harness for the analyzer.
#
#   make setup     create the venv and install pinned dependencies
#   make synth     regenerate the synthetic golden clips
#   make eval      run every golden clip, score every gate, write evals/report.json
#   make test      unit tests, including the magic-number scan
#
# `make eval` is the loop's instrument. It ALWAYS exits 0 unless the harness
# itself broke: a failing gate is data, not a crash, and the loop protocol reads
# the report rather than the exit code. `make eval-strict` exits non-zero on any
# red gate, which is what CI should call.

# THE VIRTUALENV LIVES OUTSIDE THE REPO, on purpose.
#
# mediapipe, opencv, scipy and jax come to roughly half a gigabyte. That is a
# machine-level concern, not a project one: it does not belong beside the source
# any more than a compiler does. Keeping it out means the project directory
# stays small enough to copy, search and back up without thinking about it, and
# there is no half-gigabyte directory one careless `.gitignore` edit away from
# being committed.
#
# Override VENV to put it anywhere, which is what CI does — a container has
# nothing to protect and is thrown away regardless.
VENV ?= $(HOME)/.virtualenvs/ascension-analyzer
PY := $(VENV)/bin/python

# Windows puts the interpreter somewhere else. Detected rather than assumed,
# because this project is developed on Windows and run in CI on Linux.
ifeq ($(OS),Windows_NT)
  PY := $(VENV)/Scripts/python.exe
endif

.PHONY: setup synth eval eval-strict test lint clean clean-venv

setup:
	python -m venv $(VENV)
	$(PY) -m pip install --upgrade pip
	$(PY) -m pip install -e ".[dev]"
	@echo
	@echo "  venv: $(VENV)   (outside the repo, by design)"
	@echo "  the project directory itself stays around 100 KB"

synth:
	$(PY) -m evals.harness.synth

eval:
	$(PY) -m evals.harness.run_eval

eval-strict:
	$(PY) -m evals.harness.run_eval --strict

test:
	$(PY) -m pytest -q

lint:
	$(PY) -m ruff check src evals tests

# Removes the generated artefacts INSIDE the project. Deliberately leaves the
# virtualenv alone — it is expensive to rebuild, lives elsewhere, and nothing
# in the repo depends on its absence. `make clean-venv` when that is really
# what is wanted.
clean:
	rm -rf evals/report.json evals/clips/synthetic
	find . -name __pycache__ -type d -prune -exec rm -rf {} +

clean-venv:
	rm -rf $(VENV)
