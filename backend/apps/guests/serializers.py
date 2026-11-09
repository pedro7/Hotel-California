import re

from rest_framework import serializers

from .models import Guest
from .normalization import is_valid_cpf, normalize_document, normalize_phone


class GuestSerializer(serializers.ModelSerializer):
    # Uniqueness is checked in validate_document, on the *normalized* value.
    document = serializers.CharField(max_length=30)

    class Meta:
        model = Guest
        fields = ['id', 'name', 'document', 'phone', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Informe o nome do hóspede.')
        return value

    def validate_document(self, value):
        value = normalize_document(value)
        if len(value) < 5:
            raise serializers.ValidationError('Documento inválido.')
        # 11 digits = CPF: check the verification digits. Other documents (RG, passport) are free-form.
        if re.fullmatch(r'\d{11}', value) and not is_valid_cpf(value):
            raise serializers.ValidationError('CPF inválido.')
        duplicates = Guest.objects.filter(document=value)
        if self.instance is not None:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError('Já existe um hóspede com este documento.')
        return value

    def validate_phone(self, value):
        value = normalize_phone(value)
        if not 8 <= len(value) <= 15:
            raise serializers.ValidationError('Telefone inválido.')
        return value
