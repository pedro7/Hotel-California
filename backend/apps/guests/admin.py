from django.contrib import admin

from .models import Guest


@admin.register(Guest)
class GuestAdmin(admin.ModelAdmin):
    list_display = ['name', 'document', 'phone']
    search_fields = ['name', 'document', 'phone']
