# Sin City RP — build progress

## Original request

Build a polished 3D free-roam Las Vegas roleplaying game called **Sin City RP**. Include AI police and NPCs, casinos and gambling, storm-drain wash tunnels, cars, aircraft, weapons, random loot, bribery, persuasion, and an explorable city. Expand it into a recognizable Greater Las Vegas map with Nellis Air Force Base, Area 51, aliens, and reptilian pig police occupying the valley. Replace prototype-looking characters, vehicles, weapons, and buildings with generated production art.

## Completed systems

- [x] Full-screen Three.js world, fixed-step simulation buffer, deterministic `advanceTime`, and `render_game_to_text`
- [x] Third-person movement, driving, flying, collision, camera, save/restore, pause/restart, keyboard and touch controls
- [x] Guns, ammo, health, armor, heat, wanted levels, police chase/fire/LOS, bribery, persuasion, and executable NPC errands
- [x] Text and browser voice input for NPC conversations with durable conversation and relationship memory
- [x] OpenAI-powered NPC decisions, body actions, fictional-world canon grounding, and safe local fallback dialogue
- [x] Slots, blackjack, casino interaction, discoverable loot, tunnel scavenging, missions, HUD, and minimap
- [x] 2,800 × 2,800 Greater Las Vegas map with the Strip, Fremont, Downtown, Henderson, Red Rock, Nellis, and Area 51
- [x] Nellis runways, hangars, tower and radar; Area 51 runway, bunkers, hangars, UFO, tractor beam, occupation checkpoint, and alien crash site
- [x] Reptilian pig enforcers, reptilian marshal, Nellis guards, extraterrestrial observers, and Area 51 scientists
- [x] Persistent player/NPC/world memory, recovery backups, corruption diagnostics, and safe restart behavior
- [x] Walking resumes correctly after exiting cars, aircraft, arrest, hospital, and restart transitions

## Production visual pass

- [x] Generated photoreal faction/civilian NPC atlas and dense buffered tourist crowd
- [x] Generated player idle, eight-direction walk-cycle, aim/fire, reload, melee, hit, and vehicle-transition art
- [x] Generated directional sedan, taxi, limousine, sports car, police, off-road, motorcycle, dirt-bike, plane, and helicopter art
- [x] Generated weapon atlas connected to the live weapon HUD
- [x] Generated asphalt, sidewalk, tunnel, desert, casino, hotel, Nellis hangar, and Area 51 research materials
- [x] Central realism layer attached to gameplay roots while preserving collision, physics, AI, and procedural fallbacks
- [x] Nevada gradient sky, stars, mountain horizon, city light haze, road reflectors/decals, drain puddles, grates, and service pipes
- [x] Quality-gated rendering and optimized 1024/512 runtime atlases prevent startup resource exhaustion without discarding full-resolution masters
- [x] Mobile HUD and touch controls repositioned for readable, unobstructed play

## Validation

- [x] Production Vite build succeeds
- [x] Desktop/mobile visual capture shows the generated player, NPCs, vehicles, buildings, roads, casino, and storm drains
- [x] Live browser QA confirms no console errors, failed requests, HTTP asset errors, or lost WebGL context
- [x] Dialogue remains open without navigation or player-state reset
- [x] Casino, tunnel, Nellis, Area 51, vehicle enter/exit, post-exit walking, gunfire, and persistent-memory recovery checks pass
- [x] Final complete Playwright regression suite — 13 passed, 0 failed, 0 skipped
