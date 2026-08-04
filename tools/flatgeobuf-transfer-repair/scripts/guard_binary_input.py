#!/usr/bin/env python3
"""Reject suspicious binary files that appear to have passed through a text channel."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

FLATGEOBUF_MAGIC = b"fgb\x03fgb\x01"
TEXT_EXTENSIONS = {".txt", ".md", ".csv", ".json"}


def inspect(path: Path) -> dict:
    raw = path.read_bytes()
    findings: list[str] = []

    has_fgb_magic = raw.startswith(FLATGEOBUF_MAGIC)
    if has_fgb_magic:
        findings.append("flatgeobuf_magic_present")
    if has_fgb_magic and b"\x00" not in raw[:4096]:
        findings.append("binary_nulls_missing_suspected_text_channel_corruption")
    if has_fgb_magic and path.suffix.lower() in TEXT_EXTENSIONS:
        findings.append("binary_magic_inside_text_extension")

    rejected = any(
        item in findings
        for item in {
            "binary_nulls_missing_suspected_text_channel_corruption",
            "binary_magic_inside_text_extension",
        }
    )
    return {
        "status": "REJECT" if rejected else "ACCEPT_FOR_FORMAT_VALIDATION",
        "path": str(path),
        "bytes": len(raw),
        "findings": findings,
        "note": "Acceptance here does not prove that the file is a valid FlatGeobuf dataset.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    args = parser.parse_args()

    try:
        result = inspect(args.input)
    except Exception as exc:
        print(json.dumps({"status": "ERROR", "error": f"{type(exc).__name__}: {exc}"}, indent=2))
        return 2

    print(json.dumps(result, indent=2))
    return 2 if result["status"] == "REJECT" else 0


if __name__ == "__main__":
    raise SystemExit(main())
