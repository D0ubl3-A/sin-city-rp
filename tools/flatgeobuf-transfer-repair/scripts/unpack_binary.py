#!/usr/bin/env python3
"""Restore and verify a binary file from an iLLCo AI binary envelope."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
from pathlib import Path

FORMAT = "illcoai-binary-envelope-v1"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def unpack(input_path: Path, output_path: Path) -> dict:
    payload = json.loads(input_path.read_text(encoding="utf-8"))
    if payload.get("format") != FORMAT:
        raise ValueError(f"unsupported envelope format: {payload.get('format')!r}")

    chunks = payload.get("chunks")
    if not isinstance(chunks, list):
        raise ValueError("chunks must be a list")

    parts: list[bytes] = []
    for expected_index, chunk in enumerate(chunks):
        if chunk.get("index") != expected_index:
            raise ValueError(f"chunk order mismatch at index {expected_index}")
        raw = base64.b64decode(chunk["base64"], validate=True)
        if len(raw) != chunk.get("bytes", len(raw)):
            raise ValueError(f"chunk length mismatch at index {expected_index}")
        actual_hash = sha256(raw)
        if actual_hash != chunk.get("sha256"):
            raise ValueError(f"chunk SHA-256 mismatch at index {expected_index}")
        parts.append(raw)

    restored = b"".join(parts)
    if len(restored) != payload.get("bytes"):
        raise ValueError("whole-file length mismatch")
    if sha256(restored) != payload.get("sha256"):
        raise ValueError("whole-file SHA-256 mismatch")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(restored)
    return {
        "status": "UNPACKED",
        "input": str(input_path),
        "output": str(output_path),
        "bytes": len(restored),
        "chunks": len(chunks),
        "sha256": payload["sha256"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    try:
        result = unpack(args.input, args.output)
    except Exception as exc:
        print(json.dumps({"status": "ERROR", "error": f"{type(exc).__name__}: {exc}"}, indent=2))
        return 2

    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
