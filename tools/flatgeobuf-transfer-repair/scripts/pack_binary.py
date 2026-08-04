#!/usr/bin/env python3
"""Package a binary file in a chunked, hash-verified JSON envelope."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
from pathlib import Path

FORMAT = "illcoai-binary-envelope-v1"
DEFAULT_CHUNK_BYTES = 4 * 1024 * 1024


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def pack(input_path: Path, output_path: Path, chunk_bytes: int) -> dict:
    if chunk_bytes <= 0:
        raise ValueError("chunk_bytes must be positive")
    if not input_path.is_file():
        raise FileNotFoundError(input_path)

    raw = input_path.read_bytes()
    chunks = []
    for start in range(0, len(raw), chunk_bytes):
        part = raw[start : start + chunk_bytes]
        chunks.append(
            {
                "index": len(chunks),
                "bytes": len(part),
                "sha256": sha256(part),
                "base64": base64.b64encode(part).decode("ascii"),
            }
        )

    payload = {
        "format": FORMAT,
        "filename": input_path.name,
        "bytes": len(raw),
        "sha256": sha256(raw),
        "chunk_bytes": chunk_bytes,
        "chunks": chunks,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    return {
        "status": "PACKED",
        "input": str(input_path),
        "output": str(output_path),
        "bytes": len(raw),
        "chunks": len(chunks),
        "sha256": payload["sha256"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--chunk-bytes", type=int, default=DEFAULT_CHUNK_BYTES)
    args = parser.parse_args()

    try:
        result = pack(args.input, args.output, args.chunk_bytes)
    except Exception as exc:
        print(json.dumps({"status": "ERROR", "error": f"{type(exc).__name__}: {exc}"}, indent=2))
        return 2

    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
