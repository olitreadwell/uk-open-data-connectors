"""Error types shared by every UK source adapter."""

from __future__ import annotations


class UkSourceError(Exception):
    """Base error for the UK data source adapters."""


class UkSourceApiError(UkSourceError):
    """A source answered with a non-success HTTP status or the request failed."""

    def __init__(self, source: str, message: str) -> None:
        self.source = source
        super().__init__(f"{source}: {message}")


class UkSourceParseError(UkSourceError):
    """A source returned a payload that did not match its expected shape."""

    def __init__(self, source: str, message: str) -> None:
        self.source = source
        super().__init__(f"{source}: {message}")
