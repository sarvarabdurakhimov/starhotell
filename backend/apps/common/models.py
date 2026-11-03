"""Abstract base models shared across the platform."""
from django.db import models


class TimestampedModel(models.Model):
    """Abstract model providing created_at and updated_at timestamps."""
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
