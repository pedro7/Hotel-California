from django.contrib import admin

from .models import Reservation


@admin.register(Reservation)
class ReservationAdmin(admin.ModelAdmin):
    list_display = ['id', 'guest', 'check_in_date', 'check_out_date', 'has_car', 'status']
    list_filter = ['status', 'has_car']
    search_fields = ['guest__name', 'guest__document', 'guest__phone']
    autocomplete_fields = ['guest']
