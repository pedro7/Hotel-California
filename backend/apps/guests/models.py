from django.db import models

from .normalization import normalize_document, normalize_phone


class Guest(models.Model):
    name = models.CharField(max_length=150, db_index=True)
    document = models.CharField(max_length=30, unique=True)
    phone = models.CharField(max_length=20, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def save(self, *args, **kwargs):
        self.name = self.name.strip()
        self.document = normalize_document(self.document)
        self.phone = normalize_phone(self.phone)
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.name} ({self.document})'
