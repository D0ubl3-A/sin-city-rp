# FlatGeobuf Transfer Repair

This toolset protects Sin City RP geospatial binaries from text-channel corruption.

## Root cause fixed

The damaged 77 MB source was passed through a text channel. High bytes were re-encoded and binary null bytes were changed into ordinary spaces. The high-byte encoding layer can be partly reversed, but the original file cannot be recovered exactly because destroyed null bytes and genuine spaces are indistinguishable.

## Included tools

- `scripts/pack_binary.py` — packages any binary as a chunked Base64 JSON envelope.
- `scripts/unpack_binary.py` — verifies every chunk and the whole-file SHA-256 before restoring the binary.
- `scripts/guard_binary_input.py` — rejects FlatGeobuf-looking data delivered under a text extension or missing expected binary null bytes.
- `reports/forensic_report.json` — records the confirmed failure and validation results.

## Safe workflow

```bash
python tools/flatgeobuf-transfer-repair/scripts/pack_binary.py original.fgb original.fgb.envelope.json
python tools/flatgeobuf-transfer-repair/scripts/unpack_binary.py original.fgb.envelope.json restored.fgb
python tools/flatgeobuf-transfer-repair/scripts/guard_binary_input.py restored.fgb
```

Never paste `.fgb`, `.gpkg`, `.pbf`, `.zip`, `.tif`, or other binary payloads into a text field. Upload the original file, a ZIP, or a verified binary envelope.

## Evidence boundary

The repair pipeline is validated. The corrupted 77 MB copy is quarantined and is not promoted as real-world city data. Exact recovery still requires the untouched original binary or a fresh source download.
