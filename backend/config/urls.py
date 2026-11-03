"""Root URL configuration for HMS SaaS."""
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView


def health_check(request):
    """Basic liveness probe — does not expose internals."""
    return JsonResponse({'status': 'ok'})


urlpatterns = [
    # Admin
    path('admin/', admin.site.urls),

    # Health
    path('health/', health_check, name='health_check'),

    # API v1
    path('api/v1/', include([
        path('auth/', include('apps.users.urls', namespace='users')),
        path('hotels/', include('apps.hotels.urls', namespace='hotels')),
        path('organizations/', include('apps.organizations.urls', namespace='organizations')),
        path('memberships/', include('apps.memberships.urls', namespace='memberships')),
        path('rooms/', include('apps.rooms.urls', namespace='rooms')),
        path('guests/', include('apps.guests.urls', namespace='guests')),
        path('bookings/', include('apps.bookings.urls', namespace='bookings')),
        path('payments/', include('apps.payments.urls', namespace='payments')),
        path('housekeeping/', include('apps.housekeeping.urls', namespace='housekeeping')),
        path('reports/', include('apps.reports.urls', namespace='reports')),
    ])),

    # OpenAPI Schema
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
]
