#!/usr/bin/env python3
"""Convert UTF-16-LE text files to UTF-8 (Windows Write tool workaround)."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {".git", ".venv", "__pycache__", ".terraform", ".snapshots", "node_modules"}
TEXT_SUFFIXES = {
    ".py", ".js", ".css", ".html", ".json", ".md", ".yml", ".yaml",
    ".tf", ".tfvars", ".ps1", ".txt", ".gitignore", ".gitattributes",
}
EXTRA_NAMES = {"Dockerfile", ".dockerignore"}


def is_utf16_le(raw: bytes) -> bool:
    if len(raw) < 2:
        return False
    if raw[:2] == b"\xff\xfe":
        return True
    return raw[1] == 0 and raw[0] < 128


def should_process(path: Path) -> bool:
    if path.name in EXTRA_NAMES:
        return True
    return path.suffix.lower() in TEXT_SUFFIXES


def convert_file(path: Path) -> bool:
    raw = path.read_bytes()
    if not is_utf16_le(raw):
        return False
    if raw[:2] == b"\xff\xfe":
        text = raw[2:].decode("utf-16-le")
    else:
        text = raw.decode("utf-16-le")
    path.write_text(text.replace("\r\n", "\n"), encoding="utf-8", newline="\n")
    return True


def main() -> int:
    converted: list[str] = []
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if not should_process(path):
            continue
        try:
            if convert_file(path):
                converted.append(str(path.relative_to(ROOT)))
        except Exception as exc:
            print(f"ERROR {path}: {exc}", file=sys.stderr)
            return 1
    if converted:
        print("Converted to UTF-8:")
        for name in converted:
            print(f"  {name}")
    else:
        print("All text files already UTF-8.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
