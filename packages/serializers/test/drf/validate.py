"""DRF validation oracle for Tango serializer parity tests.

Reads a JSON request `{"serializer": <name>, "payload": <data>}` from stdin and
prints DRF's verdict for the matching serializer shape: validity, the error
envelope, and the validated data.
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


class AuthorSerializer(serializers.Serializer):
    name = serializers.CharField(required=True)


class PostSerializer(serializers.Serializer):
    title = serializers.CharField(required=True)
    authorId = serializers.IntegerField(required=True)
    author = AuthorSerializer(read_only=True)


SERIALIZERS = {
    "user": UserSerializer,
    "post": PostSerializer,
}


def normalize(value):
    if isinstance(value, list):
        return [str(item) for item in value]
    if isinstance(value, dict):
        return {key: normalize(item) for key, item in value.items()}
    return str(value)


request = json.load(sys.stdin)
serializer = SERIALIZERS[request["serializer"]](data=request["payload"])
valid = serializer.is_valid()
json.dump(
    {
        "valid": valid,
        "errors": normalize(serializer.errors),
        "validatedData": dict(serializer.validated_data) if valid else None,
    },
    sys.stdout,
)
