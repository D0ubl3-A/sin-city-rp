import { test, expect } from "@playwright/test";
import { CHARACTER_POSES, createCharacterPoseManifest, getCharacterPose } from "../src/characterPoseManifest.js";
import { resolveCharacterPose, getVisualRegistrySnapshot } from "../src/visualAssetRegistry.js";

test.describe("character pose coverage", () => {
  test("manifest covers every gameplay pose with deterministic metadata", () => {
    const manifest = createCharacterPoseManifest({ columns: 4, rows: 2 });
    expect(Object.keys(manifest.poses)).toEqual(CHARACTER_POSES);
    for (const pose of CHARACTER_POSES) {
      expect(manifest.poses[pose].frames).toBeGreaterThan(0);
      expect(manifest.poses[pose].startTile).toBeLessThan(8);
    }
    expect(getCharacterPose(manifest, "not-a-pose").name).toBe("idle");
  });

  test("all registered character profiles expose pose manifests", () => {
    const snapshot = getVisualRegistrySnapshot();
    const characters = Object.values(snapshot.assets).filter((entry) => entry.category === "character");
    expect(characters.length).toBeGreaterThanOrEqual(15);
    for (const entry of characters) expect(Object.keys(entry.poses?.poses || {})).toEqual(CHARACTER_POSES);
    expect(resolveCharacterPose("pigEnforcer", "shoot").pose.name).toBe("shoot");
  });
});
