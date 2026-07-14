# Sin City RP

**Sin City RP** is a complete procedural 3D Las Vegas free-roam game that runs in a modern browser. The game includes a neon Strip, downtown district, desert roads, a functioning casino, an airport, and a connected storm-drain wash network below street level.

## Play now

The game is currently available at **http://127.0.0.1:4173** on this computer.

For future sessions, double-click `RUN_GAME.cmd`. It installs missing packages, creates a production build, starts the local server, and opens the game.

## Controls

| Action | Control |
| --- | --- |
| Move / drive / throttle | `W A S D` |
| Sprint / vehicle boost | `Shift` |
| Look | Mouse or arrow keys |
| Interact / enter casino / use tunnel access | `E` |
| Enter or exit vehicle / aircraft | `F` |
| Fire equipped weapon | Left click |
| Select available weapons | `1`–`5` |
| Reload | `R` |
| Car brake / plane pitch up | `Space` |
| Plane pitch down | `C` |
| Mute or restore audio | `M` |
| Pause / close a panel | `Escape` |

## Included systems

- Third-person on-foot free roaming with sprint and collision
- Drivable sedans, sports cars, taxis, muscle cars, SUVs, and police cruisers
- Flyable Desert Skipper aircraft with throttle, lift, stall, landing, fuel, and damage behavior
- Five-level wanted system with heat decay, police pursuit, gunfire, restraint, arrest, medical respawn, and fees
- Civilian and police NPC simulation with patrol, wandering, fleeing, pursuit, persuasion, bribery, trust, and dialogue
- Pistol, SMG, shotgun, taser, melee, ammunition, reloads, hit detection, damage, armor, and weapon crates
- Automatic random-item discovery for cash, chips, health, armor, ammunition, fuel, lockpicks, contraband, weapons, and collectible neon tokens
- Aurelia Casino with deterministic seeded slots and complete blackjack hands
- Surface-to-underground flood-channel access, tunnel junctions, tunnel NPCs, rare caches, and a return route
- Story leads that introduce vehicles, the casino, social actions, tunnels, item recovery, and flight
- Minimap, wanted display, vitals, inventory, vehicle instrumentation, responsive touch UI, procedural sound, save persistence, pause, and restart

Casino play uses fictional in-game cash only. Random results are generated locally from a deterministic seeded generator.

## Development and verification

```powershell
npm install
npm run dev
npm run build
npm test
```

The game exposes two stable QA hooks:

- `window.render_game_to_text()` returns the current simulation as concise JSON.
- `window.advanceTime(ms)` advances the fixed-step simulation deterministically.

The production bundle is emitted to `dist/`.
