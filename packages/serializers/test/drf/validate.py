"""DRF validation oracle for Tango serializer parity tests.

Reads JSON payload from stdin and prints DRF's error envelope for a simple serializer
shape matching the Tango test model.
"""

import json
import sys

import django
from django.conf import settings

settings.configure(
    INSTALLED_APPS=["rest_framework"],
    USE_I18N=False,
    SECRET_KEY="tango",
)
django.setup()

from rest_framework import serializers  # noqa: E402


class UserSerializer(serializers.Serializer):
    email = serializers.CharField(required=True)
    age = serializers.IntegerField(required=False, allow_null=True)
    active = serializers.BooleanField(required=False, default=True)
    name = serializers.CharField(required=True)


def normalize(value):
    if isinstance(value, list):
        return [str(item) for item in value]
    if isinstance(value, dict):
        return {key: normalize(item) for key, item in value.items()}
    return str(value)


payload = json.load(sys.stdin)
serializer = UserSerializer(data=payload)
serializer.is_valid()
json.dump(normalize(serializer.errors), sys.stdout)
