"""Centralized exception hierarchy for Telegram Knowledge Engine."""

from __future__ import annotations


class TKEError(Exception):
    """Base exception for all Telegram Knowledge Engine errors."""


class ConfigurationError(TKEError):
    """Raised when environment or application configuration is invalid or missing."""


class DomainValidationError(TKEError, ValueError):
    """Raised when a domain model fails construction or invariant validation."""


class DatabaseError(TKEError):
    """Raised when a local database or repository operation fails."""


class MigrationError(DatabaseError):
    """Raised when applying or verifying SQLite schema migrations fails."""
