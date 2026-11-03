"""Organization (HotelGroup) model — allows one owner to manage multiple hotels."""
from django.db import models
from django.conf import settings
from apps.common.models import TimestampedModel


class Organization(TimestampedModel):
    """A hotel group or ownership entity that can own multiple hotels."""
    name = models.CharField(max_length=255, unique=True)
    slug = models.SlugField(max_length=255, unique=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='owned_organizations',
    )
    website = models.URLField(blank=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    logo = models.ImageField(upload_to='organizations/logos/', blank=True, null=True)

    class Meta:
        verbose_name = 'organization'
        verbose_name_plural = 'organizations'
        ordering = ['name']

    def __str__(self) -> str:
        return self.name
