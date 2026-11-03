"""Housekeeping task tracking."""
from django.db import models
from django.conf import settings
from apps.common.models import TimestampedModel


class HousekeepingStatus(models.TextChoices):
    DIRTY = 'dirty', 'Needs Cleaning'
    IN_PROGRESS = 'in_progress', 'Cleaning In Progress'
    CLEAN = 'clean', 'Cleaned'
    INSPECTED = 'inspected', 'Inspected & Approved'


class HousekeepingTask(TimestampedModel):
    hotel = models.ForeignKey('hotels.Hotel', on_delete=models.CASCADE, related_name='housekeeping_tasks')
    room = models.ForeignKey('rooms.Room', on_delete=models.CASCADE, related_name='housekeeping_tasks')
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_tasks'
    )
    status = models.CharField(
        max_length=20, choices=HousekeepingStatus.choices, default=HousekeepingStatus.DIRTY, db_index=True
    )
    notes = models.TextField(blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'Task Room {self.room.room_number} ({self.status})'
