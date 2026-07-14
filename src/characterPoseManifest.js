/**
 * Canonical pose coverage for every character atlas.  Atlases are directional
 * (8 views) and may not ship every authored frame yet; the runtime uses the
 * deterministic fallback tile policy below so a missing pose never freezes a
 * character or returns an invalid UV.
 */
export const CHARACTER_POSES = Object.freeze([
  "idle", "walk", "run", "sprint", "crouch", "sneak", "aim", "shoot",
  "reload", "melee", "hit", "death", "interact", "talk", "celebrate",
  "drive", "enterVehicle", "exitVehicle", "fall", "revive",
]);

const POSE_DEFAULTS = Object.freeze({
  idle: { frames: 2, fps: 2, loop: true }, walk: { frames: 8, fps: 10, loop: true },
  run: { frames: 8, fps: 14, loop: true }, sprint: { frames: 8, fps: 18, loop: true },
  crouch: { frames: 2, fps: 2, loop: true }, sneak: { frames: 8, fps: 8, loop: true },
  aim: { frames: 2, fps: 4, loop: true }, shoot: { frames: 4, fps: 16, loop: false },
  reload: { frames: 8, fps: 10, loop: false }, melee: { frames: 6, fps: 14, loop: false },
  hit: { frames: 3, fps: 10, loop: false }, death: { frames: 8, fps: 10, loop: false },
  interact: { frames: 6, fps: 8, loop: false }, talk: { frames: 4, fps: 5, loop: true },
  celebrate: { frames: 8, fps: 8, loop: true }, drive: { frames: 4, fps: 6, loop: true },
  enterVehicle: { frames: 8, fps: 12, loop: false }, exitVehicle: { frames: 8, fps: 12, loop: false },
  fall: { frames: 6, fps: 12, loop: false }, revive: { frames: 8, fps: 10, loop: false },
});

export const createCharacterPoseManifest = (atlas = {}) => {
  const columns = Math.max(1, Number(atlas.columns) || 4);
  const rows = Math.max(1, Number(atlas.rows) || 2);
  const capacity = columns * rows;
  const poses = {};
  CHARACTER_POSES.forEach((name, index) => {
    const defaults = POSE_DEFAULTS[name];
    // Explicit authored animations can override this through atlas.poses.
    const authored = atlas.poses?.[name] || {};
    const frames = Math.max(1, Math.min(16, Number(authored.frames) || defaults.frames));
    poses[name] = Object.freeze({
      name, frames, fps: Number(authored.fps) || defaults.fps,
      loop: authored.loop ?? defaults.loop,
      startTile: Number.isFinite(Number(authored.startTile))
        ? Math.max(0, Number(authored.startTile)) : (index * 2) % capacity,
      frameStride: Math.max(1, Number(authored.frameStride) || 1),
      available: authored.available !== false,
    });
  });
  return Object.freeze({ version: 1, directions: 8, columns, rows, poses: Object.freeze(poses) });
};

export const getCharacterPose = (manifest, pose = "idle") => {
  const key = CHARACTER_POSES.includes(pose) ? pose : "idle";
  return manifest?.poses?.[key] || createCharacterPoseManifest().poses.idle;
};
