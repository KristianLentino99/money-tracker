#!/usr/bin/env python3
"""Merge Google OAuth credentials from stdin into the server's .env file.

The JSON input is deliberately streamed over SSH instead of being passed in a
command argument or written to the repository. The caller must run this file
as root; the resulting dotenv file is kept mode 0600.
"""

from __future__ import annotations

import json
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import NoReturn


EXPECTED_KEYS = ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET")
KEY_LINE = re.compile(r"^(?:GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET)=")


def fail(message: str) -> NoReturn:
    print(message, file=sys.stderr)
    raise SystemExit(1)


def dotenv_quote(value: str) -> str:
    # Google client IDs and secrets normally contain only safe dotenv
    # characters. Single-quote the value anyway so punctuation such as '#'
    # or spaces cannot become a comment or a second dotenv token.
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


if len(sys.argv) != 2:
    fail(f"usage: {Path(sys.argv[0]).name} /path/to/.env")

env_path = Path(sys.argv[1])
if not env_path.is_file():
    fail(f"dotenv file does not exist: {env_path}")

try:
    payload = json.load(sys.stdin)
except json.JSONDecodeError as error:
    fail(f"secret input is not valid JSON: {error.msg}")

if not isinstance(payload, dict):
    fail("secret JSON must be an object")

values: dict[str, str] = {}
for key in EXPECTED_KEYS:
    value = payload.get(key)
    if not isinstance(value, str) or not value:
        fail(f"secret JSON must contain a non-empty string: {key}")
    if any(character in value for character in "\r\n"):
        fail(f"secret value contains a newline: {key}")
    values[key] = value

original = env_path.read_text(encoding="utf-8")
lines = [line for line in original.splitlines(keepends=True) if not KEY_LINE.match(line)]
updated = "".join(lines)
if updated and not updated.endswith("\n"):
    updated += "\n"
for key in EXPECTED_KEYS:
    updated += f"{key}={dotenv_quote(values[key])}\n"

directory = env_path.parent
with tempfile.NamedTemporaryFile(
    "w", dir=directory, prefix=".env.", delete=False, encoding="utf-8"
) as temporary:
    temporary.write(updated)
    temporary_path = Path(temporary.name)

try:
    os.replace(temporary_path, env_path)
    os.chmod(env_path, 0o600)
finally:
    temporary_path.unlink(missing_ok=True)

print("Google OAuth credentials synchronized")
