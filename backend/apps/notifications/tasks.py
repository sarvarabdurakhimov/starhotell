"""Celery background tasks for notifications."""
import logging
from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_booking_confirmation_email(self, booking_id: int):
    """Send booking confirmation email asynchronously with retries."""
    try:
        from apps.bookings.models import Booking
        booking = Booking.objects.select_related('guest', 'hotel', 'room').get(pk=booking_id)

        subject = f"Booking Confirmation - {booking.reference}"
        message = (
            f"Dear {booking.guest.full_name},\n\n"
            f"Thank you for your reservation at {booking.hotel.name}.\n"
            f"Booking Reference: {booking.reference}\n"
            f"Check-in: {booking.check_in}\n"
            f"Check-out: {booking.check_out}\n"
            f"Total: {booking.total_amount} {booking.currency}\n\n"
            f"We look forward to welcoming you!"
        )

        recipient = booking.guest.email
        if recipient:
            send_mail(
                subject=subject,
                message=message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[recipient],
                fail_silently=False,
            )
            logger.info("Sent booking confirmation email for %s to %s", booking.reference, recipient)
    except Exception as exc:
        logger.error("Error sending booking email for %s: %s", booking_id, exc)
        raise self.retry(exc=exc)
