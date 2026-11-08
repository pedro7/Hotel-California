from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    """Hotel staff member (attendant). Guests are NOT users of the system.

    Custom user model from day one: swapping it after the first migration is
    very painful in Django.
    """
