# JC → Globe Core → Sin City Integration

## Purpose

Sin City consumes JC as the Las Vegas geographic-truth and provenance source while keeping gameplay/runtime systems decoupled from source-data generation.

## Data ownership by layer

1. **JC (`D0ubl3-A/jc-the-holy-og`)**
   - Canonical Las Vegas world contract
   - Building-registry status
   - Real Vegas detail status
   - Strip core registry
   - Terrain manifest
   - Accepted coordinate transform
   - Production gates and status ledgers
   - Sprite Factory bridge outputs

2. **Globe Core**
   - WGS84 / ECEF / ENU normalization
   - Hierarchical tiling
   - 3D Tiles generation
   - Provenance validation
   - Cache promotion gates
   - LOD / streaming metadata

3. **Sin City (`D0ubl3-A/sin-city-rp`)**
   - Player movement
   - Vehicles
   - NPCs
   - Missions
   - Collision/gameplay integration
   - Visual/runtime systems

## Runtime bridge

`src/jcWorldTruthBridge.js` loads the current JC world manifests from the JC repository and exposes them at:

```js
window.__SIN_CITY_WORLD_TRUTH__
```

States:
- `loading`
- `ready`
- `degraded`
- `failed`

The bridge also emits:

```text
sin-city:world-truth-ready
sin-city:world-truth-failed
```

This allows existing gameplay code to adopt real-world data incrementally instead of forcing a large rewrite.

## Cache rule

The production pipeline should use:

```text
request territory
  -> check permanent world cache
  -> if missing, generate from validated truth data
  -> validate geometry + provenance + rights
  -> promote approved tile
  -> Sin City streams approved output
```

Never publish procedural or AI-inferred geometry as authoritative real-world geometry.

## Next integration targets

- Generate a normalized Sin City tile manifest from JC tile/building registries.
- Wire approved Globe Core 3D Tiles/HLOD outputs into the Sin City streaming layer.
- Build collision, nav and traffic derivatives per tile.
- Preserve generated/base geography separately from style/remix layers.
- Add cache/version invalidation keyed to source version + generator version.
