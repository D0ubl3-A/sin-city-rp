#!/usr/bin/env python3
"""Generate versioned Sin City RP crowd ambience with ElevenLabs Sound Effects.

This utility uses only the Python standard library. It reads the API key from
ELEVEN_LABS_API_KEY or ELEVENLABS_API_KEY, never writes or prints the key,
validates every MP3 before installing it, and records reproducible metadata in
a JSON manifest.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


API_ENDPOINT = "https://api.elevenlabs.io/v1/sound-generation"
DEFAULT_MODEL_ID = "eleven_text_to_sound_v2"
DEFAULT_OUTPUT_FORMAT = "mp3_44100_128"
DEFAULT_DURATION_SECONDS = 30.0
DEFAULT_PROMPT_INFLUENCE = 0.36
MANIFEST_FILENAME = "crowd-audio-manifest-v1.json"
MINIMUM_MP3_BYTES = 512
SCRIPT_VERSION = "1.0.0"


def resolve_api_key() -> str:
    return (
        os.environ.get("ELEVEN_LABS_API_KEY", "").strip()
        or os.environ.get("ELEVENLABS_API_KEY", "").strip()
    )


@dataclass(frozen=True)
class TrackSpec:
    track_id: str
    filename: str
    prompt: str


TRACKS: tuple[TrackSpec, ...] = (
    TrackSpec(
        track_id="strip-tourists",
        filename="strip-tourist-chatter-v1.mp3",
        prompt=(
            "Seamless environmental ambience loop on a crowded Las Vegas Strip sidewalk at night. "
            "A dense mix of adult tourists strolling in groups, layered indistinct conversation, "
            "occasional laughter and delighted reactions, shoes on pavement, subtle distant road traffic, "
            "and a faint city ventilation hum. Wide natural stereo space, lively but not chaotic, no clear "
            "foreground speaker, no intelligible sentences, no music, no sirens, no narration."
        ),
    ),
    TrackSpec(
        track_id="casino-crowd",
        filename="casino-crowd-cheers-v1.mp3",
        prompt=(
            "Seamless ambience loop inside a busy upscale Las Vegas casino. Layered adult crowd murmur, "
            "small waves of cheers and laughter after wins, poker chips clicking, cards shuffling, restrained "
            "electronic slot-machine chimes in the middle distance, and a spacious carpeted interior acoustic. "
            "No intelligible dialogue, no announcer, no prominent melody, no narration."
        ),
    ),
    TrackSpec(
        track_id="fremont-party",
        filename="fremont-party-crowd-v1.mp3",
        prompt=(
            "Seamless nighttime open-air Fremont Street party crowd ambience. Many adult visitors moving and "
            "socializing beneath a neon canopy, energetic laughter, scattered whoops and applause reacting to "
            "street performers, footsteps, and lively downtown reflections between buildings. Festive layered "
            "stereo field, no intelligible foreground words, no copyrighted melody, no narration, no sirens."
        ),
    ),
    TrackSpec(
        track_id="airport-terminal",
        filename="airport-terminal-crowd-v1.mp3",
        prompt=(
            "Seamless ambience loop in a modern Las Vegas airport terminal. A steady layered crowd of adult "
            "travelers, indistinct conversation, rolling suitcase wheels, soft footsteps, occasional distant "
            "laughter, ventilation, and a very distant public-address cadence that is completely unintelligible. "
            "Clean spacious terminal reverb, no clear words, no music, no foreground announcement."
        ),
    ),
)


class GenerationError(RuntimeError):
    """Raised for a safe, user-facing generation failure."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def default_output_dir() -> Path:
    project_root = Path(__file__).resolve().parents[1]
    return project_root / "public" / "assets" / "audio" / "ambience"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def looks_like_mp3(data: bytes) -> bool:
    if len(data) < MINIMUM_MP3_BYTES:
        return False
    if data.startswith(b"ID3"):
        return True
    scan_limit = min(len(data) - 1, 8192)
    return any(
        data[index] == 0xFF and (data[index + 1] & 0xE0) == 0xE0
        for index in range(scan_limit)
    )


def inspect_existing_mp3(path: Path) -> dict[str, Any] | None:
    try:
        data = path.read_bytes()
    except OSError:
        return None
    if not looks_like_mp3(data):
        return None
    return {
        "bytes": len(data),
        "sha256": sha256_bytes(data),
    }


def atomic_write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=str(path.parent),
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise


def atomic_write_json(path: Path, value: dict[str, Any]) -> None:
    encoded = (json.dumps(value, indent=2, sort_keys=True, ensure_ascii=True) + "\n").encode("utf-8")
    atomic_write_bytes(path, encoded)


def safe_api_error_body(data: bytes) -> str:
    if not data:
        return "No error body was returned"
    decoded = data.decode("utf-8", errors="replace")[:1200]
    try:
        parsed = json.loads(decoded)
    except json.JSONDecodeError:
        return decoded.replace("\n", " ")[:500]
    if isinstance(parsed, dict):
        detail = parsed.get("detail") or parsed.get("message") or parsed.get("error")
        if isinstance(detail, dict):
            detail = detail.get("message") or detail.get("detail") or detail
        if detail:
            return str(detail).replace("\n", " ")[:500]
    return str(parsed).replace("\n", " ")[:500]


def retry_delay(error: urllib.error.HTTPError, attempt: int) -> float:
    header = error.headers.get("Retry-After") if error.headers else None
    try:
        if header is not None:
            return min(30.0, max(0.5, float(header)))
    except ValueError:
        pass
    return min(12.0, 1.5 * (2**attempt))


def generate_track(
    spec: TrackSpec,
    *,
    api_key: str,
    duration_seconds: float,
    prompt_influence: float,
    model_id: str,
    output_format: str,
    timeout_seconds: float,
    retries: int,
) -> tuple[bytes, dict[str, str]]:
    query = urllib.parse.urlencode({"output_format": output_format})
    url = f"{API_ENDPOINT}?{query}"
    payload = json.dumps(
        {
            "text": spec.prompt,
            "duration_seconds": duration_seconds,
            "prompt_influence": prompt_influence,
            "model_id": model_id,
            "loop": True,
        }
    ).encode("utf-8")

    for attempt in range(retries + 1):
        request = urllib.request.Request(
            url,
            data=payload,
            method="POST",
            headers={
                "xi-api-key": api_key,
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
                "User-Agent": f"sin-city-rp-crowd-audio/{SCRIPT_VERSION}",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                audio = response.read()
                metadata = {
                    "request_id": response.headers.get("request-id", ""),
                    "character_cost": response.headers.get("character-cost", ""),
                    "content_type": response.headers.get("Content-Type", ""),
                }
            if not looks_like_mp3(audio):
                raise GenerationError(
                    f"ElevenLabs returned invalid or empty MP3 data for {spec.filename} "
                    f"({len(audio)} bytes)"
                )
            return audio, metadata
        except urllib.error.HTTPError as error:
            body = safe_api_error_body(error.read())
            retryable = error.code == 429 or 500 <= error.code <= 599
            if retryable and attempt < retries:
                delay = retry_delay(error, attempt)
                print(
                    f"ElevenLabs HTTP {error.code} for {spec.filename}; retrying in {delay:.1f}s",
                    file=sys.stderr,
                )
                time.sleep(delay)
                continue
            raise GenerationError(
                f"ElevenLabs rejected {spec.filename} with HTTP {error.code}: {body}"
            ) from None
        except urllib.error.URLError as error:
            if attempt < retries:
                delay = min(12.0, 1.5 * (2**attempt))
                print(
                    f"Network error for {spec.filename}; retrying in {delay:.1f}s",
                    file=sys.stderr,
                )
                time.sleep(delay)
                continue
            reason = getattr(error, "reason", error)
            raise GenerationError(f"Network failure generating {spec.filename}: {reason}") from None
        except TimeoutError:
            if attempt < retries:
                delay = min(12.0, 1.5 * (2**attempt))
                print(
                    f"Timeout for {spec.filename}; retrying in {delay:.1f}s",
                    file=sys.stderr,
                )
                time.sleep(delay)
                continue
            raise GenerationError(f"Timed out generating {spec.filename}") from None

    raise GenerationError(f"Generation attempts exhausted for {spec.filename}")


def base_manifest(args: argparse.Namespace, output_dir: Path) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "generator": "generate_elevenlabs_crowd_audio.py",
        "generator_version": SCRIPT_VERSION,
        "updated_at": utc_now(),
        "provider": "ElevenLabs",
        "endpoint": API_ENDPOINT,
        "model_id": args.model_id,
        "output_format": args.output_format,
        "duration_seconds": args.duration,
        "prompt_influence": args.prompt_influence,
        "loop": True,
        "output_directory": str(output_dir.resolve()),
        "tracks": [],
    }


def track_manifest_entry(
    spec: TrackSpec,
    *,
    status: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "id": spec.track_id,
        "filename": spec.filename,
        "status": status,
        "prompt": spec.prompt,
    }
    if details:
        entry.update({key: value for key, value in details.items() if value not in (None, "")})
    return entry


def write_manifest(manifest_path: Path, manifest: dict[str, Any]) -> None:
    manifest["updated_at"] = utc_now()
    atomic_write_json(manifest_path, manifest)


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate four seamless Sin City RP crowd ambience MP3s with ElevenLabs.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=default_output_dir(),
        help="Destination directory (default: public/assets/audio/ambience).",
    )
    parser.add_argument(
        "--duration",
        type=float,
        default=DEFAULT_DURATION_SECONDS,
        help="Duration of each seamless loop in seconds, from 0.5 to 30 (default: 30).",
    )
    parser.add_argument(
        "--prompt-influence",
        type=float,
        default=DEFAULT_PROMPT_INFLUENCE,
        help="Prompt adherence from 0 to 1 (default: 0.36).",
    )
    parser.add_argument(
        "--model-id",
        default=DEFAULT_MODEL_ID,
        help=f"ElevenLabs sound model (default: {DEFAULT_MODEL_ID}).",
    )
    parser.add_argument(
        "--output-format",
        default=DEFAULT_OUTPUT_FORMAT,
        help=f"ElevenLabs MP3 output format (default: {DEFAULT_OUTPUT_FORMAT}).",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=180.0,
        help="Per-request timeout in seconds (default: 180).",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=2,
        help="Retries for rate limits, server errors, and network failures (default: 2).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate and atomically replace valid existing MP3 files.",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)

    if not 0.5 <= args.duration <= 30:
        parser.error("--duration must be between 0.5 and 30 seconds")
    if not 0 <= args.prompt_influence <= 1:
        parser.error("--prompt-influence must be between 0 and 1")
    if args.timeout <= 0:
        parser.error("--timeout must be greater than zero")
    if args.retries < 0 or args.retries > 8:
        parser.error("--retries must be between 0 and 8")
    if not str(args.output_format).startswith("mp3_"):
        parser.error("--output-format must be an ElevenLabs MP3 format such as mp3_44100_128")
    return args


def run(args: argparse.Namespace) -> int:
    output_dir = args.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = output_dir / MANIFEST_FILENAME
    manifest = base_manifest(args, output_dir)
    pending: list[TrackSpec] = []

    for spec in TRACKS:
        destination = output_dir / spec.filename
        existing = inspect_existing_mp3(destination)
        if existing and not args.force:
            print(f"SKIP {spec.filename} (valid existing asset)")
            manifest["tracks"].append(
                track_manifest_entry(spec, status="existing", details=existing)
            )
        else:
            pending.append(spec)

    api_key = resolve_api_key()
    if pending and not api_key:
        pending_names = {spec.filename for spec in pending}
        for spec in TRACKS:
            if spec.filename in pending_names:
                manifest["tracks"].append(
                    track_manifest_entry(
                        spec,
                        status="blocked",
                        details={"error": "ELEVEN_LABS_API_KEY or ELEVENLABS_API_KEY is not set"},
                    )
                )
        write_manifest(manifest_path, manifest)
        print(
            "ERROR: ELEVEN_LABS_API_KEY or ELEVENLABS_API_KEY is not set. Set it in the process environment, then rerun; "
            "the key is never read from or written to a project file.",
            file=sys.stderr,
        )
        return 2

    completed_by_id = {
        entry["id"]: entry
        for entry in manifest["tracks"]
        if entry["status"] == "existing"
    }
    try:
        for spec in pending:
            print(f"GENERATE {spec.filename} ({args.duration:g}s seamless loop)")
            audio, response_metadata = generate_track(
                spec,
                api_key=api_key,
                duration_seconds=args.duration,
                prompt_influence=args.prompt_influence,
                model_id=args.model_id,
                output_format=args.output_format,
                timeout_seconds=args.timeout,
                retries=args.retries,
            )
            destination = output_dir / spec.filename
            atomic_write_bytes(destination, audio)
            verified = inspect_existing_mp3(destination)
            if not verified:
                raise GenerationError(f"Post-write MP3 verification failed for {spec.filename}")
            details: dict[str, Any] = {
                **verified,
                "generated_at": utc_now(),
                **response_metadata,
            }
            completed_by_id[spec.track_id] = track_manifest_entry(
                spec,
                status="generated",
                details=details,
            )
            manifest["tracks"] = [
                completed_by_id[item.track_id]
                for item in TRACKS
                if item.track_id in completed_by_id
            ]
            write_manifest(manifest_path, manifest)
            print(f"WROTE {destination.name} ({verified['bytes']} bytes)")
    except (GenerationError, OSError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        manifest["tracks"] = [
            completed_by_id[item.track_id]
            for item in TRACKS
            if item.track_id in completed_by_id
        ]
        manifest["failure"] = str(error)[:500]
        write_manifest(manifest_path, manifest)
        return 1

    manifest["tracks"] = [completed_by_id[spec.track_id] for spec in TRACKS]
    manifest.pop("failure", None)
    write_manifest(manifest_path, manifest)
    print(f"DONE: {len(TRACKS)} ambience tracks ready; manifest: {manifest_path}")
    return 0


def main(argv: Iterable[str] | None = None) -> int:
    return run(parse_args(argv))


if __name__ == "__main__":
    raise SystemExit(main())
