"""Reads the committed fixture snapshots shipped with the port."""

from __future__ import annotations

import json
from importlib.resources import files
from typing import Any


def read_fixture_json(filename: str) -> Any:
    """Reads a committed fixture as parsed JSON."""
    return json.loads(read_fixture_text(filename))


def read_fixture_text(filename: str) -> str:
    """Reads a committed fixture as raw text."""
    return files("ukdata").joinpath("fixtures").joinpath(filename).read_text(encoding="utf-8")
