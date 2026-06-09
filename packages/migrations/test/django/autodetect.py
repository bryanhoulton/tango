"""Django migration autodetector oracle for Tango parity tests.

Reads a JSON object {"from": SchemaSnapshot, "to": SchemaSnapshot} on stdin (Tango's
own snapshot format), runs Django's real MigrationAutodetector on the equivalent
model states, and prints a NORMALIZED list of operations on stdout.

The normalized form is the small shared vocabulary both Tango and Django are compared
on (create_table / drop_table / add_column / drop_column / alter_column /
rename_column / rename_table). Django-only noise (model options, unique/index ops,
managers) is intentionally dropped — those are covered by Tango's unit tests, not here.
"""

import json
import sys

import django
from django.conf import settings

settings.configure(
    INSTALLED_APPS=[],
    DATABASES={},
    USE_TZ=True,
    DEFAULT_AUTO_FIELD="django.db.models.AutoField",
)
django.setup()

from django.db import models  # noqa: E402
from django.db.migrations.autodetector import MigrationAutodetector  # noqa: E402
from django.db.migrations.questioner import (  # noqa: E402
    NonInteractiveMigrationQuestioner,
)
from django.db.migrations.state import ModelState, ProjectState  # noqa: E402

APP = "tango"

TYPE_TAG = {
    "AutoField": "int",
    "BigAutoField": "int",
    "IntegerField": "int",
    "FloatField": "float",
    "CharField": "varchar",
    "TextField": "text",
    "BooleanField": "bool",
    "DateTimeField": "datetime",
    "DateField": "date",
}


def field_from_column(col):
    kwargs = {}
    if col.get("nullable"):
        kwargs["null"] = True
    if col.get("primaryKey"):
        kwargs["primary_key"] = True
    t = col["type"]
    if t == "int":
        return models.AutoField(**kwargs) if col.get("autoIncrement") else models.IntegerField(**kwargs)
    if t == "float":
        return models.FloatField(**kwargs)
    if t == "varchar":
        return models.CharField(max_length=col.get("maxLength", 255), **kwargs)
    if t == "text":
        return models.TextField(**kwargs)
    if t == "boolean":
        return models.BooleanField(**kwargs)
    if t == "datetime":
        return models.DateTimeField(**kwargs)
    if t == "date":
        return models.DateField(**kwargs)
    raise ValueError(f"unknown column type: {t}")


def project_state(snapshot):
    state = ProjectState()
    for table_name, table in snapshot["tables"].items():
        fields = [
            (name, field_from_column(col)) for name, col in table["columns"].items()
        ]
        state.add_model(
            ModelState(APP, table_name, fields, options={"db_table": table_name})
        )
    return state


def tag(field):
    return TYPE_TAG.get(type(field).__name__, type(field).__name__)


def normalize(op):
    cls = type(op).__name__
    if cls == "CreateModel":
        columns = sorted(
            (
                {"name": name, "type": tag(field), "nullable": bool(field.null)}
                for name, field in op.fields
            ),
            key=lambda c: c["name"],
        )
        return {"op": "create_table", "table": op.name.lower(), "columns": columns}
    if cls == "DeleteModel":
        return {"op": "drop_table", "table": op.name.lower()}
    if cls == "RenameModel":
        return {
            "op": "rename_table",
            "from": op.old_name.lower(),
            "to": op.new_name.lower(),
        }
    if cls == "AddField":
        return {
            "op": "add_column",
            "table": op.model_name.lower(),
            "name": op.name,
            "type": tag(op.field),
            "nullable": bool(op.field.null),
        }
    if cls == "RemoveField":
        return {
            "op": "drop_column",
            "table": op.model_name.lower(),
            "name": op.name,
        }
    if cls == "AlterField":
        return {
            "op": "alter_column",
            "table": op.model_name.lower(),
            "name": op.name,
            "type": tag(op.field),
            "nullable": bool(op.field.null),
        }
    if cls == "RenameField":
        return {
            "op": "rename_column",
            "table": op.model_name.lower(),
            "from": op.old_name,
            "to": op.new_name,
        }
    return None


def main():
    payload = json.load(sys.stdin)
    from_state = project_state(payload["from"])
    to_state = project_state(payload["to"])

    questioner = NonInteractiveMigrationQuestioner(
        specified_apps=set(), dry_run=True
    )
    # Some questioner branches (e.g. making a column NOT NULL) call self.log(...),
    # which is None on the non-interactive questioner. Provide a no-op.
    questioner.log = lambda *args, **kwargs: None

    autodetector = MigrationAutodetector(from_state, to_state, questioner)
    changes = autodetector._detect_changes()

    result = []
    for migrations in changes.values():
        for migration in migrations:
            for op in migration.operations:
                normalized = normalize(op)
                if normalized is not None:
                    result.append(normalized)

    json.dump(result, sys.stdout)


if __name__ == "__main__":
    main()
