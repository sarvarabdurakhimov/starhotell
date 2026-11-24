"""Throttle classes shared by the API views."""
from rest_framework.throttling import ScopedRateThrottle


class OptionalScopedRateThrottle(ScopedRateThrottle):
    """ScopedRateThrottle that is off where no rate is configured for its scope
    (development settings clear all rates), instead of raising ImproperlyConfigured."""

    def get_rate(self):
        return self.THROTTLE_RATES.get(self.scope)
