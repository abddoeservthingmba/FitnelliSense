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

PY := $(VENV)/bin/python
VENV := .venv

# Windows puts the interpreter somewhere else. Detected rather than assumed,
# because this project is developed on Windows and run in CI on Linux.
ifeq ($(OS),Windows_NT)
  PY := $(VENV)/Scripts/python.exe
endif

.PHONY: setup synth eval eval-strict test lint clean

setup:
	python -m venv $(VENV)
	$(PY) -m pip install --upgrade pip
	$(PY) -m pip install -e ".[dev]"

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

clean:
	rm -rf $(VENV) evals/report.json evals/clips/synthetic
