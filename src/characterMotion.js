const TAU = Math.PI * 2;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const saturate = (value) => clamp(value, 0, 1);
const lerp = (from, to, amount) => from + (to - from) * amount;
const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const damp = (from, to, sharpness, delta) => lerp(from, to, 1 - Math.exp(-Math.max(0, sharpness) * delta));
const smoothstep = (edge0, edge1, value) => {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = saturate((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
const easeOutCubic = (value) => 1 - ((1 - saturate(value)) ** 3);
const easeInOutCubic = (value) => {
  const t = saturate(value);
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
};
const wrapAngle = (value) => {
  let angle = finite(value) % TAU;
  if (angle > Math.PI) angle -= TAU;
  if (angle < -Math.PI) angle += TAU;
  return angle;
};

const freezeProfile = (profile) => Object.freeze({ ...profile });

/**
 * Tuned, data-driven pose profiles. Callers can replace or extend these through
 * `options.weaponProfiles` without changing the controller.
 */
export const DEFAULT_WEAPON_MOTION_PROFILES = Object.freeze({
  unarmed: freezeProfile({
    twoHanded: false,
    recoil: 0,
    recoilRoll: 0,
    drawDuration: 0.24,
    holsterDuration: 0.24,
    reloadDuration: 0,
    aimArmPitch: -0.25,
    aimArmSpread: 0.12,
    mountForward: 0,
  }),
  pistol: freezeProfile({
    twoHanded: true,
    recoil: 0.18,
    recoilRoll: 0.025,
    drawDuration: 0.34,
    holsterDuration: 0.3,
    reloadDuration: 1.32,
    aimArmPitch: -1.18,
    aimArmSpread: 0.08,
    mountForward: -0.08,
  }),
  smg: freezeProfile({
    twoHanded: true,
    recoil: 0.105,
    recoilRoll: 0.018,
    drawDuration: 0.42,
    holsterDuration: 0.38,
    reloadDuration: 1.68,
    aimArmPitch: -1.08,
    aimArmSpread: 0.15,
    mountForward: -0.14,
  }),
  shotgun: freezeProfile({
    twoHanded: true,
    recoil: 0.31,
    recoilRoll: 0.035,
    drawDuration: 0.56,
    holsterDuration: 0.48,
    reloadDuration: 2.1,
    aimArmPitch: -1.03,
    aimArmSpread: 0.19,
    mountForward: -0.22,
  }),
  rifle: freezeProfile({
    twoHanded: true,
    recoil: 0.14,
    recoilRoll: 0.02,
    drawDuration: 0.54,
    holsterDuration: 0.46,
    reloadDuration: 1.86,
    aimArmPitch: -1.04,
    aimArmSpread: 0.2,
    mountForward: -0.2,
  }),
  taser: freezeProfile({
    twoHanded: true,
    recoil: 0.075,
    recoilRoll: 0.014,
    drawDuration: 0.3,
    holsterDuration: 0.28,
    reloadDuration: 1.12,
    aimArmPitch: -1.16,
    aimArmSpread: 0.08,
    mountForward: -0.06,
  }),
});

export const DEFAULT_CHARACTER_MOTION_OPTIONS = Object.freeze({
  maxDelta: 0.1,
  maxSubstep: 1 / 30,
  walkSpeed: 3.25,
  runSpeed: 7.2,
  maxAcceleration: 20,
  hardLandingSpeed: 10,
  locomotionResponse: 12,
  aimResponse: 18,
  leanResponse: 10,
  walkCadence: 1.55,
  runCadence: 2.7,
  idleBreathFrequency: 0.24,
  idleBreathAmount: 0.018,
  walkBobAmount: 0.048,
  runBobAmount: 0.085,
  strideAmount: 0.72,
  runStrideMultiplier: 1.22,
  accelerationLean: 0.11,
  strafeLean: 0.13,
  turnLean: 0.1,
  airborneLean: 0.12,
  landingSquash: 0.1,
  landingDuration: 0.34,
  fireDuration: 0.19,
  hitDuration: 0.48,
  meleeDuration: 0.58,
  meleeComboWindow: 0.32,
  maxAimPitch: 1.25,
  maxAimYaw: 1.15,
  manageWeaponVisibility: true,
  animateRoot: false,
});

const normaliseOptions = (options = {}) => {
  const merged = { ...DEFAULT_CHARACTER_MOTION_OPTIONS, ...options };
  const positive = (key, minimum = 0.0001) => {
    merged[key] = Math.max(minimum, finite(merged[key], DEFAULT_CHARACTER_MOTION_OPTIONS[key]));
  };

  [
    "maxDelta",
    "maxSubstep",
    "walkSpeed",
    "runSpeed",
    "maxAcceleration",
    "hardLandingSpeed",
    "locomotionResponse",
    "aimResponse",
    "leanResponse",
    "walkCadence",
    "runCadence",
    "idleBreathFrequency",
    "landingDuration",
    "fireDuration",
    "hitDuration",
    "meleeDuration",
    "meleeComboWindow",
    "maxAimPitch",
    "maxAimYaw",
  ].forEach((key) => positive(key));

  merged.runSpeed = Math.max(merged.walkSpeed + 0.01, merged.runSpeed);
  merged.maxSubstep = Math.min(merged.maxDelta, merged.maxSubstep);
  return merged;
};

const captureTransform = (node) => {
  if (!node?.position || !node?.rotation || !node?.scale) return null;
  return {
    node,
    position: { x: node.position.x, y: node.position.y, z: node.position.z },
    rotation: { x: node.rotation.x, y: node.rotation.y, z: node.rotation.z },
    scale: { x: node.scale.x, y: node.scale.y, z: node.scale.z },
    visible: node.visible,
  };
};

const restoreTransform = (record, restoreVisibility = false) => {
  if (!record?.node) return;
  const { node, position, rotation, scale } = record;
  node.position.set(position.x, position.y, position.z);
  node.rotation.set(rotation.x, rotation.y, rotation.z);
  node.scale.set(scale.x, scale.y, scale.z);
  if (restoreVisibility) node.visible = record.visible;
};

const setTransform = (record, pose = {}) => {
  if (!record?.node) return;
  const { node, position, rotation, scale } = record;
  node.position.set(
    position.x + finite(pose.x),
    position.y + finite(pose.y),
    position.z + finite(pose.z),
  );
  node.rotation.set(
    rotation.x + finite(pose.pitch),
    rotation.y + finite(pose.yaw),
    rotation.z + finite(pose.roll),
  );
  node.scale.set(
    scale.x * finite(pose.scaleX, 1),
    scale.y * finite(pose.scaleY, 1),
    scale.z * finite(pose.scaleZ, 1),
  );
};

const actionProgress = (action) => (action ? saturate(action.elapsed / Math.max(0.0001, action.duration)) : 0);

const makeAction = (duration, data = {}) => ({
  elapsed: 0,
  duration: Math.max(0.0001, finite(duration, 0.25)),
  data: { ...data },
});

const vectorSpeed = (vector) => {
  if (!vector) return 0;
  return Math.hypot(finite(vector.x), finite(vector.z));
};

const resolveVisual = (root, options) => {
  const requested = options.visual
    ?? root.userData?.generatedVisual
    ?? root.getObjectByName?.("PlayerGeneratedVisual")
    ?? null;
  if (requested === root && !options.animateRoot) return null;
  return requested?.isObject3D ? requested : null;
};

const resolveParts = (root, options) => {
  const source = options.parts ?? root.parts ?? {};
  return {
    pelvis: source.pelvis ?? null,
    torso: source.torso ?? null,
    neck: source.neck ?? null,
    head: source.head ?? null,
    leftArm: source.leftArm ?? null,
    rightArm: source.rightArm ?? null,
    leftLeg: source.leftLeg ?? null,
    rightLeg: source.rightLeg ?? null,
  };
};

const resolveWeaponDescriptor = (weapon) => {
  if (typeof weapon === "string") return { id: weapon };
  if (weapon?.isObject3D) return { id: weapon.userData?.weaponType ?? weapon.name ?? "pistol", object3D: weapon };
  if (weapon && typeof weapon === "object") {
    return {
      ...weapon,
      id: weapon.id ?? weapon.type ?? weapon.weaponType ?? "pistol",
      object3D: weapon.object3D ?? weapon.mount ?? weapon.model ?? null,
    };
  }
  return { id: "unarmed" };
};

/**
 * Deterministic additive animation controller for a Three.js character root.
 * It never changes the character's world position. Instead, it animates the
 * generated visual child, articulated rig parts, and an optional weapon mount.
 */
export class CharacterMotionController {
  constructor(THREE, root, options = {}) {
    if (!THREE || typeof THREE !== "object") throw new TypeError("A THREE namespace is required.");
    if (!root?.isObject3D) throw new TypeError("Character motion requires a Three.js Object3D root.");

    this.THREE = THREE;
    this.root = root;
    this.options = normaliseOptions(options);
    this.parts = resolveParts(root, this.options);
    this.visual = resolveVisual(root, this.options);
    this.partRest = Object.fromEntries(
      Object.entries(this.parts).map(([name, node]) => [name, captureTransform(node)]),
    );
    this.visualRest = captureTransform(this.visual);
    this.weaponRest = null;
    this.weaponMount = null;
    this.weaponProfiles = {
      ...DEFAULT_WEAPON_MOTION_PROFILES,
      ...(options.weaponProfiles ?? {}),
    };

    this.disposed = false;
    this.time = 0;
    this.locomotionClock = 0;
    this.filteredSpeed = 0;
    this.filteredAcceleration = 0;
    this.filteredStrafe = 0;
    this.filteredTurnRate = 0;
    this.lastRawSpeed = 0;
    this.lastYaw = null;
    this.lastVerticalVelocity = 0;
    this.grounded = true;
    this.wasGrounded = true;
    this.aiming = false;
    this.aimTarget = 0;
    this.aimBlend = 0;
    this.aimYaw = 0;
    this.aimPitch = 0;
    this.targetAimYaw = 0;
    this.targetAimPitch = 0;
    this.equipped = false;
    this.weaponBlend = 0;
    this.comboIndex = 0;
    this.comboCooldown = 0;
    this.actions = {
      draw: null,
      holster: null,
      fire: null,
      reload: null,
      melee: null,
      hit: null,
      land: null,
    };
    this._sample = {
      speed: 0,
      acceleration: 0,
      strafe: 0,
      turnRate: 0,
      grounded: true,
      verticalVelocity: 0,
      running: false,
    };
    this._pose = {
      mode: "idle",
      bob: 0,
      breathe: 0,
      stride: 0,
      pitchLean: 0,
      rollLean: 0,
      recoil: 0,
      reload: 0,
      melee: 0,
      hit: 0,
      landing: 0,
      squash: 0,
    };

    this.setWeapon(options.weapon ?? "unarmed", {
      equipped: options.equipped === true,
      weaponMount: options.weaponMount,
      preserveActions: true,
    });

    if (!root.userData) root.userData = {};
    root.userData.characterMotion = this;
  }

  _weaponProfile() {
    return this.weaponProfile ?? this.weaponProfiles.unarmed ?? DEFAULT_WEAPON_MOTION_PROFILES.unarmed;
  }

  _duration(value, fallback) {
    return Math.max(0.0001, finite(value, fallback));
  }

  _startAction(name, duration, data = {}) {
    this.actions[name] = makeAction(duration, data);
    return this;
  }

  _cancelAction(name) {
    this.actions[name] = null;
  }

  _clearActions() {
    Object.keys(this.actions).forEach((name) => {
      this.actions[name] = null;
    });
  }

  _sampleMotion(state, delta) {
    const velocity = state.velocity ?? null;
    const localVelocity = state.localVelocity ?? null;
    const rawSpeed = Math.max(0, finite(state.speed, vectorSpeed(velocity)));

    let rawAcceleration;
    if (Number.isFinite(Number(state.acceleration))) {
      rawAcceleration = Number(state.acceleration);
    } else if (state.acceleration && typeof state.acceleration === "object") {
      rawAcceleration = finite(state.forwardAcceleration, -finite(state.acceleration.z));
    } else {
      rawAcceleration = delta > 0 ? (rawSpeed - this.lastRawSpeed) / delta : 0;
    }

    const rawStrafe = Number.isFinite(Number(state.strafe))
      ? Number(state.strafe)
      : finite(state.strafeSpeed, finite(localVelocity?.x));

    const yaw = Number.isFinite(Number(state.yaw)) ? Number(state.yaw) : null;
    let turnRate = finite(state.turnRate);
    if (!Number.isFinite(Number(state.turnRate)) && yaw !== null && this.lastYaw !== null && delta > 0) {
      turnRate = wrapAngle(yaw - this.lastYaw) / delta;
    }
    if (yaw !== null) this.lastYaw = yaw;

    const grounded = state.grounded ?? state.onGround ?? state.isGrounded ?? true;
    const verticalVelocity = finite(state.verticalVelocity, finite(velocity?.y));

    this._sample.speed = rawSpeed;
    this._sample.acceleration = clamp(rawAcceleration, -this.options.maxAcceleration, this.options.maxAcceleration);
    this._sample.strafe = rawStrafe;
    this._sample.turnRate = turnRate;
    this._sample.grounded = grounded !== false;
    this._sample.verticalVelocity = verticalVelocity;
    this._sample.running = state.running === true
      || state.sprinting === true
      || rawSpeed > this.options.walkSpeed * 1.08;

    if (state.aiming !== undefined) this.aiming = Boolean(state.aiming);
    this.aimTarget = this.aiming ? 1 : 0;
    if (Number.isFinite(Number(state.aimYaw))) {
      this.targetAimYaw = clamp(Number(state.aimYaw), -this.options.maxAimYaw, this.options.maxAimYaw);
    }
    if (Number.isFinite(Number(state.aimPitch))) {
      this.targetAimPitch = clamp(Number(state.aimPitch), -this.options.maxAimPitch, this.options.maxAimPitch);
    }

    if (!this.wasGrounded && this._sample.grounded) {
      const inferredImpact = Math.max(0, -this.lastVerticalVelocity) / this.options.hardLandingSpeed;
      this.triggerLand(finite(state.landingImpact, inferredImpact));
    }

    this.wasGrounded = this._sample.grounded;
    this.grounded = this._sample.grounded;
    this.lastVerticalVelocity = verticalVelocity;
    this.lastRawSpeed = rawSpeed;
  }

  _tickActions(delta) {
    for (const [name, action] of Object.entries(this.actions)) {
      if (!action) continue;
      action.elapsed += delta;
      if (action.elapsed < action.duration) continue;

      if (name === "draw") this.equipped = true;
      if (name === "holster") {
        this.equipped = false;
        if (this.weaponMount && this.options.manageWeaponVisibility) this.weaponMount.visible = false;
      }
      this.actions[name] = null;
    }
    this.comboCooldown = Math.max(0, this.comboCooldown - delta);
  }

  _updatePose(delta) {
    const sample = this._sample;
    const options = this.options;
    this.time += delta;

    this.filteredSpeed = damp(this.filteredSpeed, sample.speed, options.locomotionResponse, delta);
    this.filteredAcceleration = damp(
      this.filteredAcceleration,
      sample.acceleration,
      options.leanResponse,
      delta,
    );
    this.filteredStrafe = damp(this.filteredStrafe, sample.strafe, options.leanResponse, delta);
    this.filteredTurnRate = damp(this.filteredTurnRate, sample.turnRate, options.leanResponse, delta);
    this.aimBlend = damp(this.aimBlend, this.aimTarget, options.aimResponse, delta);
    this.aimYaw = damp(this.aimYaw, this.targetAimYaw, options.aimResponse, delta);
    this.aimPitch = damp(this.aimPitch, this.targetAimPitch, options.aimResponse, delta);

    const movementAmount = smoothstep(0.08, options.walkSpeed * 0.35, this.filteredSpeed);
    const runAmount = smoothstep(options.walkSpeed * 0.82, options.runSpeed, this.filteredSpeed);
    const cadence = lerp(options.walkCadence, options.runCadence, runAmount);
    if (movementAmount > 0.001 && sample.grounded) this.locomotionClock += delta * cadence * TAU;

    const breath = Math.sin(this.time * options.idleBreathFrequency * TAU)
      * options.idleBreathAmount
      * (1 - movementAmount * 0.72);
    const bobAmount = lerp(options.walkBobAmount, options.runBobAmount, runAmount) * movementAmount;
    const bob = ((1 - Math.cos(this.locomotionClock * 2)) * 0.5) * bobAmount;
    const stride = Math.sin(this.locomotionClock)
      * options.strideAmount
      * lerp(1, options.runStrideMultiplier, runAmount)
      * movementAmount;

    const accelerationLean = clamp(
      -this.filteredAcceleration / options.maxAcceleration,
      -1,
      1,
    ) * options.accelerationLean;
    const strafeNormal = clamp(this.filteredStrafe / Math.max(options.walkSpeed, 0.01), -1, 1);
    const turnNormal = clamp(this.filteredTurnRate / Math.PI, -1, 1);
    const rollLean = (-strafeNormal * options.strafeLean) + (-turnNormal * options.turnLean);
    const airborneLean = sample.grounded
      ? 0
      : clamp(-sample.verticalVelocity / options.hardLandingSpeed, -1, 1) * options.airborneLean;

    const draw = this.actions.draw;
    const holster = this.actions.holster;
    let weaponTarget = this.equipped ? 1 : 0;
    if (draw) weaponTarget = easeInOutCubic(actionProgress(draw));
    if (holster) weaponTarget = 1 - easeInOutCubic(actionProgress(holster));
    this.weaponBlend = damp(this.weaponBlend, weaponTarget, options.aimResponse, delta);

    const fireAction = this.actions.fire;
    const fireProgress = actionProgress(fireAction);
    const fireEnvelope = fireAction
      ? (fireProgress < 0.16
        ? smoothstep(0, 0.16, fireProgress)
        : 1 - easeOutCubic((fireProgress - 0.16) / 0.84))
      : 0;
    const recoil = fireEnvelope
      * finite(fireAction?.data.strength, 1)
      * finite(this._weaponProfile().recoil);

    const reloadAction = this.actions.reload;
    const reloadProgress = actionProgress(reloadAction);
    const reload = reloadAction ? Math.sin(reloadProgress * Math.PI) : 0;

    const meleeAction = this.actions.melee;
    const meleeProgress = actionProgress(meleeAction);
    const melee = meleeAction
      ? (meleeProgress < 0.28
        ? -smoothstep(0, 0.28, meleeProgress)
        : Math.sin(((meleeProgress - 0.28) / 0.72) * Math.PI))
      : 0;

    const hitAction = this.actions.hit;
    const hitProgress = actionProgress(hitAction);
    const hit = hitAction
      ? Math.sin(hitProgress * Math.PI * 3.5)
        * ((1 - hitProgress) ** 1.4)
        * finite(hitAction.data.strength, 1)
      : 0;

    const landAction = this.actions.land;
    const landProgress = actionProgress(landAction);
    const landing = landAction
      ? Math.sin(landProgress * Math.PI) * finite(landAction.data.impact, 1)
      : 0;
    const squash = clamp(landing * options.landingSquash, 0, 0.2);

    let mode = "idle";
    if (!sample.grounded) mode = sample.verticalVelocity > 0.15 ? "airborne-rise" : "airborne-fall";
    else if (this.actions.melee) mode = "melee";
    else if (this.actions.reload) mode = "reload";
    else if (this.aimBlend > 0.55) mode = "aim";
    else if (runAmount > 0.5) mode = "run";
    else if (movementAmount > 0.08) mode = "walk";

    Object.assign(this._pose, {
      mode,
      bob,
      breathe: breath,
      stride,
      pitchLean: accelerationLean + airborneLean,
      rollLean,
      recoil,
      reload,
      melee,
      hit,
      landing,
      squash,
      movementAmount,
      runAmount,
      weaponBlend: this.weaponBlend,
    });
  }

  _applyVisualPose() {
    if (!this.visualRest) return;
    const pose = this._pose;
    const hitDirection = finite(this.actions.hit?.data.direction, 1);
    const meleeDirection = finite(this.actions.melee?.data.direction, 1);
    const aimStability = 1 - this.aimBlend * 0.42;

    setTransform(this.visualRest, {
      x: pose.hit * hitDirection * 0.035,
      y: pose.bob + pose.breathe - pose.landing * 0.075,
      pitch: pose.pitchLean * 0.42 + pose.recoil * 0.24,
      yaw: pose.melee * meleeDirection * 0.035,
      roll: (pose.rollLean + pose.hit * hitDirection * 0.095 + pose.recoil * finite(this._weaponProfile().recoilRoll))
        * aimStability,
      scaleX: 1 + pose.squash * 0.42,
      scaleY: 1 - pose.squash,
      scaleZ: 1,
    });

    const spriteController = this.visual.spriteController;
    if (spriteController && typeof spriteController.setAnimation === "function") {
      const animations = spriteController.animations;
      if (animations?.has?.(pose.mode)) spriteController.setAnimation(pose.mode);
      else if (animations?.has?.(pose.runAmount > 0.5 ? "run" : pose.movementAmount > 0.08 ? "walk" : "idle")) {
        spriteController.setAnimation(pose.runAmount > 0.5 ? "run" : pose.movementAmount > 0.08 ? "walk" : "idle");
      }
    }
  }

  _applyRigPose() {
    const pose = this._pose;
    const profile = this._weaponProfile();
    const weaponPose = this.weaponBlend;
    const aimPose = this.aimBlend * weaponPose;
    const locomotionSuppression = 1 - aimPose * 0.72;
    const reloadTwist = Math.sin(actionProgress(this.actions.reload) * TAU) * pose.reload;
    const meleeCombo = this.actions.melee?.data.combo ?? 0;
    const meleeDirection = finite(this.actions.melee?.data.direction, meleeCombo % 2 === 0 ? 1 : -1);
    const hitDirection = finite(this.actions.hit?.data.direction, 1);
    const armStride = pose.stride * 0.72 * locomotionSuppression;
    const legStride = pose.stride;

    setTransform(this.partRest.pelvis, {
      y: pose.bob * 0.48 - pose.landing * 0.07,
      pitch: pose.pitchLean * 0.24,
      roll: pose.rollLean * 0.2,
      scaleX: 1 + pose.squash * 0.3,
      scaleY: 1 - pose.squash * 0.55,
    });

    setTransform(this.partRest.torso, {
      y: pose.breathe * 0.28,
      pitch: pose.pitchLean + this.aimPitch * aimPose * 0.28 + pose.recoil * 0.3,
      yaw: this.aimYaw * aimPose * 0.52
        + pose.melee * meleeDirection * 0.68
        + pose.hit * hitDirection * 0.18
        + reloadTwist * 0.08,
      roll: pose.rollLean * 0.7 + pose.hit * hitDirection * 0.12,
      scaleX: 1 + pose.breathe * 0.15,
      scaleY: 1 + pose.breathe * 0.08,
    });

    setTransform(this.partRest.neck, {
      pitch: this.aimPitch * aimPose * 0.28,
      yaw: this.aimYaw * aimPose * 0.28,
      roll: -pose.rollLean * 0.2,
    });
    setTransform(this.partRest.head, {
      y: pose.breathe * 0.2,
      pitch: this.aimPitch * aimPose * 0.48 - pose.recoil * 0.08,
      yaw: this.aimYaw * aimPose * 0.46,
      roll: -pose.rollLean * 0.28 + pose.hit * hitDirection * 0.04,
    });

    const baseWeaponArmPitch = finite(profile.aimArmPitch, -1.05) * weaponPose;
    const armAimPitch = this.aimPitch * aimPose * 0.52;
    const armSpread = finite(profile.aimArmSpread, 0.1) * weaponPose;
    const leftSupport = profile.twoHanded === false ? 0.38 : 1;
    const meleeWind = pose.melee < 0 ? -pose.melee : 0;
    const meleeStrike = Math.max(0, pose.melee);

    setTransform(this.partRest.rightArm, {
      pitch: armStride + baseWeaponArmPitch + armAimPitch
        + pose.recoil
        + meleeWind * -0.82
        + meleeStrike * 1.42,
      yaw: this.aimYaw * aimPose * 0.35
        + armSpread
        + pose.melee * meleeDirection * 0.95
        + reloadTwist * 0.2,
      roll: -armSpread * 0.65 + pose.recoil * finite(profile.recoilRoll) * 2.5,
    });
    setTransform(this.partRest.leftArm, {
      pitch: -armStride
        + baseWeaponArmPitch * leftSupport
        + armAimPitch * leftSupport
        + pose.recoil * leftSupport * 0.72
        + meleeWind * -0.36
        + meleeStrike * 0.55,
      yaw: this.aimYaw * aimPose * 0.24
        - armSpread
        - pose.melee * meleeDirection * 0.42
        - reloadTwist * 0.28,
      roll: armSpread * 0.75 - pose.reload * 0.18,
    });

    const airborneTuck = this.grounded ? 0 : clamp(Math.abs(this._sample.verticalVelocity) / this.options.hardLandingSpeed, 0.08, 0.55);
    setTransform(this.partRest.leftLeg, {
      pitch: legStride - airborneTuck + pose.landing * 0.3,
      yaw: pose.rollLean * -0.16,
      roll: pose.rollLean * 0.18,
    });
    setTransform(this.partRest.rightLeg, {
      pitch: -legStride - airborneTuck + pose.landing * 0.3,
      yaw: pose.rollLean * -0.16,
      roll: pose.rollLean * 0.18,
    });
  }

  _applyWeaponPose() {
    if (!this.weaponRest) return;
    const pose = this._pose;
    const profile = this._weaponProfile();
    const holstered = 1 - this.weaponBlend;
    const reloadProgress = actionProgress(this.actions.reload);
    const reloadSide = Math.sin(reloadProgress * Math.PI) * pose.reload;

    setTransform(this.weaponRest, {
      x: reloadSide * -0.18,
      y: holstered * -0.58 - pose.reload * 0.16,
      z: holstered * 0.12 + finite(profile.mountForward) + pose.recoil * 0.12,
      pitch: this.aimPitch * this.aimBlend * 0.76
        + holstered * 0.72
        + pose.recoil * 1.18
        + pose.reload * 0.34,
      yaw: this.aimYaw * this.aimBlend * 0.62 + reloadSide * -0.58,
      roll: holstered * -0.45
        + reloadSide * 0.48
        + pose.recoil * finite(profile.recoilRoll),
    });

    if (this.options.manageWeaponVisibility) {
      this.weaponMount.visible = this.equipped || Boolean(this.actions.draw) || Boolean(this.actions.holster);
    }
  }

  _step(delta) {
    this._tickActions(delta);
    this._updatePose(delta);
    this._applyVisualPose();
    this._applyRigPose();
    this._applyWeaponPose();

    if (this.root.userData) {
      this.root.userData.motionState = {
        mode: this._pose.mode,
        speed: this.filteredSpeed,
        grounded: this.grounded,
        aiming: this.aimBlend > 0.5,
        weapon: this.weaponId,
        equipped: this.weaponBlend > 0.5,
      };
    }
  }

  /** Advances the motion simulation and returns a serialisable snapshot. */
  update(deltaSeconds, state = {}) {
    if (this.disposed) return this.snapshot();
    const total = clamp(finite(deltaSeconds), 0, this.options.maxDelta);
    if (total <= 0) return this.snapshot();

    this._sampleMotion(state, total);
    let remaining = total;
    while (remaining > 0.000001) {
      const step = Math.min(remaining, this.options.maxSubstep);
      this._step(step);
      remaining -= step;
    }
    return this.snapshot();
  }

  /** Selects a weapon profile and optional Three.js weapon mount. */
  setWeapon(weapon, options = {}) {
    if (this.disposed) return this;
    const descriptor = resolveWeaponDescriptor(weapon);
    const profileId = String(descriptor.profileId ?? descriptor.id ?? "unarmed");
    const baseProfile = this.weaponProfiles[profileId]
      ?? this.weaponProfiles[descriptor.category]
      ?? this.weaponProfiles.pistol
      ?? DEFAULT_WEAPON_MOTION_PROFILES.pistol;
    this.weaponId = String(descriptor.id ?? profileId);
    this.weaponProfile = {
      ...baseProfile,
      ...(descriptor.profile ?? {}),
      ...(options.profile ?? {}),
    };

    const nextMount = options.weaponMount
      ?? descriptor.object3D
      ?? this.options.weaponMount
      ?? this.root.userData?.weaponMount
      ?? null;
    if (nextMount !== this.weaponMount) {
      if (this.weaponRest) restoreTransform(this.weaponRest, true);
      this.weaponMount = nextMount?.isObject3D ? nextMount : null;
      this.weaponRest = captureTransform(this.weaponMount);
    }

    if (!options.preserveActions) this._clearActions();
    if (options.equipped !== undefined) {
      this.equipped = Boolean(options.equipped);
      this.weaponBlend = this.equipped ? 1 : 0;
    }
    if (this.weaponId === "unarmed") {
      this.equipped = false;
      this.weaponBlend = 0;
    }
    if (this.weaponMount && this.options.manageWeaponVisibility) this.weaponMount.visible = this.equipped;
    return this;
  }

  /** Updates the aim target; angles are local yaw/pitch in radians. */
  setAiming(enabled, yaw = this.targetAimYaw, pitch = this.targetAimPitch) {
    if (this.disposed) return this;
    this.aiming = Boolean(enabled);
    this.aimTarget = this.aiming ? 1 : 0;
    this.targetAimYaw = clamp(finite(yaw), -this.options.maxAimYaw, this.options.maxAimYaw);
    this.targetAimPitch = clamp(finite(pitch), -this.options.maxAimPitch, this.options.maxAimPitch);
    return this;
  }

  triggerDraw(duration) {
    if (this.disposed || this.weaponId === "unarmed") return this;
    this._cancelAction("holster");
    this.equipped = false;
    if (this.weaponMount && this.options.manageWeaponVisibility) this.weaponMount.visible = true;
    return this._startAction(
      "draw",
      this._duration(duration, finite(this._weaponProfile().drawDuration, 0.35)),
    );
  }

  triggerHolster(duration) {
    if (this.disposed || this.weaponId === "unarmed") return this;
    this._cancelAction("draw");
    this.equipped = true;
    return this._startAction(
      "holster",
      this._duration(duration, finite(this._weaponProfile().holsterDuration, 0.3)),
    );
  }

  triggerFire(strength = 1, duration) {
    if (this.disposed) return this;
    this._cancelAction("holster");
    if (this.weaponId !== "unarmed") this.equipped = true;
    return this._startAction(
      "fire",
      this._duration(duration, this.options.fireDuration),
      { strength: clamp(finite(strength, 1), 0.1, 3) },
    );
  }

  triggerReload(duration) {
    if (this.disposed || this.weaponId === "unarmed") return this;
    this._cancelAction("fire");
    this._cancelAction("holster");
    this.equipped = true;
    return this._startAction(
      "reload",
      this._duration(duration, finite(this._weaponProfile().reloadDuration, 1.4)),
    );
  }

  triggerMelee(comboIndex, duration) {
    if (this.disposed) return this;
    const canContinueCombo = this.comboCooldown > 0;
    const resolvedCombo = Number.isFinite(Number(comboIndex))
      ? Math.max(0, Math.floor(Number(comboIndex))) % 3
      : canContinueCombo
        ? (this.comboIndex + 1) % 3
        : 0;
    this.comboIndex = resolvedCombo;
    this.comboCooldown = this.options.meleeComboWindow;
    this._cancelAction("reload");
    return this._startAction(
      "melee",
      this._duration(duration, this.options.meleeDuration * (1 + resolvedCombo * 0.04)),
      { combo: resolvedCombo, direction: resolvedCombo % 2 === 0 ? 1 : -1 },
    );
  }

  triggerHit(direction = 1, strength = 1, duration) {
    if (this.disposed) return this;
    let side = 1;
    if (Number.isFinite(Number(direction))) side = Math.sign(Number(direction)) || 1;
    else if (direction && typeof direction === "object") side = Math.sign(finite(direction.x, finite(direction.z, 1))) || 1;
    return this._startAction(
      "hit",
      this._duration(duration, this.options.hitDuration),
      { direction: side, strength: clamp(finite(strength, 1), 0.1, 3) },
    );
  }

  triggerLand(impact = 1, duration) {
    if (this.disposed) return this;
    const resolvedImpact = clamp(finite(impact, 1), 0.15, 2.2);
    return this._startAction(
      "land",
      this._duration(duration, this.options.landingDuration * lerp(0.82, 1.18, saturate(resolvedImpact))),
      { impact: resolvedImpact },
    );
  }

  snapshot() {
    const actionSnapshot = {};
    Object.entries(this.actions).forEach(([name, action]) => {
      actionSnapshot[name] = action
        ? {
          active: true,
          progress: actionProgress(action),
          remaining: Math.max(0, action.duration - action.elapsed),
          ...action.data,
        }
        : { active: false, progress: 0, remaining: 0 };
    });

    return {
      disposed: this.disposed,
      time: this.time,
      locomotion: {
        mode: this._pose.mode,
        speed: this.filteredSpeed,
        acceleration: this.filteredAcceleration,
        strafe: this.filteredStrafe,
        turnRate: this.filteredTurnRate,
        grounded: this.grounded,
        phase: this.locomotionClock % TAU,
        bob: this._pose.bob,
        leanPitch: this._pose.pitchLean,
        leanRoll: this._pose.rollLean,
      },
      aim: {
        active: this.aiming,
        blend: this.aimBlend,
        yaw: this.aimYaw,
        pitch: this.aimPitch,
      },
      weapon: {
        id: this.weaponId,
        equipped: this.equipped,
        blend: this.weaponBlend,
        mounted: Boolean(this.weaponMount),
      },
      pose: { ...this._pose },
      actions: actionSnapshot,
    };
  }

  /** Restores captured transforms and clears all transient animation state. */
  reset(options = {}) {
    const preserveWeapon = options.preserveWeapon !== false;
    const preserveAim = options.preserveAim === true;
    Object.values(this.partRest).forEach((record) => restoreTransform(record));
    restoreTransform(this.visualRest);
    restoreTransform(this.weaponRest, true);
    this._clearActions();
    this.time = 0;
    this.locomotionClock = 0;
    this.filteredSpeed = 0;
    this.filteredAcceleration = 0;
    this.filteredStrafe = 0;
    this.filteredTurnRate = 0;
    this.lastRawSpeed = 0;
    this.lastYaw = null;
    this.lastVerticalVelocity = 0;
    this.grounded = true;
    this.wasGrounded = true;
    this.comboIndex = 0;
    this.comboCooldown = 0;
    this.aiming = preserveAim ? this.aiming : false;
    this.aimTarget = this.aiming ? 1 : 0;
    this.aimBlend = this.aimTarget;
    if (!preserveAim) {
      this.aimYaw = 0;
      this.aimPitch = 0;
      this.targetAimYaw = 0;
      this.targetAimPitch = 0;
    }
    if (!preserveWeapon) this.setWeapon("unarmed", { equipped: false, preserveActions: true });
    else this.weaponBlend = this.equipped ? 1 : 0;
    Object.assign(this._pose, {
      mode: "idle",
      bob: 0,
      breathe: 0,
      stride: 0,
      pitchLean: 0,
      rollLean: 0,
      recoil: 0,
      reload: 0,
      melee: 0,
      hit: 0,
      landing: 0,
      squash: 0,
      movementAmount: 0,
      runAmount: 0,
      weaponBlend: this.weaponBlend,
    });
    if (this.weaponMount && this.options.manageWeaponVisibility) this.weaponMount.visible = this.equipped;
    return this;
  }

  /** Restores the original pose and detaches all controller references. */
  dispose() {
    if (this.disposed) return;
    this.reset({ preserveWeapon: true, preserveAim: false });
    restoreTransform(this.weaponRest, true);
    if (this.root.userData?.characterMotion === this) delete this.root.userData.characterMotion;
    if (this.root.userData?.motionState) delete this.root.userData.motionState;
    this.disposed = true;
    this.weaponMount = null;
    this.weaponRest = null;
    this.visual = null;
  }
}

export const createCharacterMotionController = (THREE, root, options = {}) =>
  new CharacterMotionController(THREE, root, options);

