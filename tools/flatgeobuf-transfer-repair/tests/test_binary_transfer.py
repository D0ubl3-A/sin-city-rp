from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).parents[1]
PACK = ROOT / "scripts" / "pack_binary.py"
UNPACK = ROOT / "scripts" / "unpack_binary.py"
GUARD = ROOT / "scripts" / "guard_binary_input.py"
MAGIC = b"fgb\x03fgb\x01"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, *args],
        check=False,
        capture_output=True,
        text=True,
    )


def test_binary_round_trip() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        temp = Path(temp_dir)
        source = temp / "sample.fgb"
        envelope = temp / "sample.fgb.envelope.json"
        restored = temp / "restored.fgb"
        source.write_bytes(MAGIC + b"\x00\x01\x02" + bytes(range(256)) * 32)

        packed = run(str(PACK), str(source), str(envelope), "--chunk-bytes", "257")
        assert packed.returncode == 0, packed.stdout + packed.stderr
        unpacked = run(str(UNPACK), str(envelope), str(restored))
        assert unpacked.returncode == 0, unpacked.stdout + unpacked.stderr
        assert sha256(source) == sha256(restored)


def test_tampered_chunk_is_rejected() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        temp = Path(temp_dir)
        source = temp / "sample.bin"
        envelope = temp / "sample.envelope.json"
        restored = temp / "restored.bin"
        source.write_bytes(bytes(range(256)) * 8)
        assert run(str(PACK), str(source), str(envelope), "--chunk-bytes", "128").returncode == 0

        payload = json.loads(envelope.read_text(encoding="utf-8"))
        payload["chunks"][0]["base64"] = "AAAA"
        envelope.write_text(json.dumps(payload), encoding="utf-8")
        result = run(str(UNPACK), str(envelope), str(restored))
        assert result.returncode != 0
        assert not restored.exists()


def test_pasted_text_flatgeobuf_is_rejected() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        suspect = Path(temp_dir) / "Pasted text.txt"
        suspect.write_bytes(MAGIC + b" " * 8192)
        result = run(str(GUARD), str(suspect))
        assert result.returncode != 0
        payload = json.loads(result.stdout)
        assert payload["status"] == "REJECT"
        assert "binary_magic_inside_text_extension" in payload["findings"]


def test_binary_flatgeobuf_candidate_reaches_format_validation() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        candidate = Path(temp_dir) / "candidate.fgb"
        candidate.write_bytes(MAGIC + b"\x00" * 64)
        result = run(str(GUARD), str(candidate))
        assert result.returncode == 0
        payload = json.loads(result.stdout)
        assert payload["status"] == "ACCEPT_FOR_FORMAT_VALIDATION"
