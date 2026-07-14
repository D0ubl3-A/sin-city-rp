Sin City RP real SFX drop folder

The browser audio engine now tries these licensed/self-recorded files first and falls back to procedural audio only when a file is missing:

- `gunshot-pistol.wav`
- `gunshot-shotgun.wav`
- `police-whoop-whoop.wav`
- `footstep-concrete.wav`
- `engine-start.wav`
- `tire-squeal.wav`
- `vehicle-crash.wav`
- `car-door.wav`
- `handcuffs.wav`
- `weapon-reload-start.wav`
- `weapon-reload-end.wav`
- `weapon-holster.wav`
- `weapon-empty-click.wav`
- `body-hit.wav`

Use WAV, MP3, or OGG by updating `RECORDED_SFX` in `src/audio.js` to match the file extension. Do not use ripped game audio or copyrighted emergency recordings unless the project has a license to redistribute them.
