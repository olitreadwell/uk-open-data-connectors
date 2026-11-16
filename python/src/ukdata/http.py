"""Shared HTTP helpers for the keyless UK adapters."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from collections.abc import Callable
from typing import Any

from .errors import UkSourceApiError, UkSourceParseError

USER_AGENT = "uk-open-data-connectors (Language=Python)"
DEFAULT_TIMEOUT_MS = 30_000

FetchText = Callable[[str, dict[str, str]], str]


def get_text(
    source: str,
    url: str,
    headers: dict[str, str] | None = None,
    fetch_impl: FetchText | None = None,
) -> str:
    """Fetches a URL as text, using the injected fetcher when one is supplied."""
    request_headers = {"user-agent": USER_AGENT}
    request_headers.update(headers or {})
    if fetch_impl is not None:
        try:
            raw = fetch_impl(url, request_headers)
        except UkSourceApiError:
            raise
        except Exception as exc:  # pragma: no cover - exact transport varies
            raise UkSourceApiError(source, f"request failed: {exc}") from exc
        return raw.decode("utf-8") if isinstance(raw, bytes) else str(raw)

    request = urllib.request.Request(url, headers=request_headers)
    try:
        with urllib.request.urlopen(request, timeout=DEFAULT_TIMEOUT_MS / 1000) as response:
            return response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        raise UkSourceApiError(source, f"HTTP {exc.code}") from exc
    except Exception as exc:
        raise UkSourceApiError(source, f"request failed: {exc}") from exc


def get_json(
    source: str,
    url: str,
    headers: dict[str, str] | None = None,
    fetch_impl: FetchText | None = None,
) -> Any:
    """Fetches and decodes a JSON document."""
    text = get_text(source, url, headers, fetch_impl)
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise UkSourceParseError(source, "invalid JSON") from exc
