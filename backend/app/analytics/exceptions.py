"""Custom exceptions for the Veridex Analytics Engine."""


class AnalyticsError(Exception):
    """Base exception for all analytics errors."""


class InvalidTimeRangeError(AnalyticsError):
    """Raised when an analytics time range is invalid or exceeds supported boundaries."""


class InvalidGranularityError(AnalyticsError):
    """Raised when an unsupported time granularity is requested for trend analytics."""


class InvalidPaginationError(AnalyticsError):
    """Raised when pagination parameters exceed maximum bounds or are invalid."""


class TenantIsolationError(AnalyticsError):
    """Raised when a tenant isolation violation or mismatch is detected."""
