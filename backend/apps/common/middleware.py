"""Custom middleware for request correlation IDs and other cross-cutting concerns."""
import uuid
import logging
from django.utils.deprecation import MiddlewareMixin

logger = logging.getLogger(__name__)
REQUEST_ID_HEADER = 'X-Request-ID'


class RequestIDMiddleware(MiddlewareMixin):
    """Attach a unique request ID to every request for tracing."""

    def process_request(self, request):
        request_id = request.META.get(f'HTTP_{REQUEST_ID_HEADER.upper().replace("-", "_")}') or str(uuid.uuid4())
        request.request_id = request_id

    def process_response(self, request, response):
        request_id = getattr(request, 'request_id', '')
        response[REQUEST_ID_HEADER] = request_id
        return response
