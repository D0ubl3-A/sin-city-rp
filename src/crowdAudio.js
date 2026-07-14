/**
 * Location-aware crowd ambience for Sin City RP.
 *
 * The module intentionally does not create or resume an AudioContext until
 * unlock() is called from a real user gesture. Call installGestureUnlock() at
 * boot, then pass the player's position and current world zone to update().
 */

const DEFAULT_BASE_URL = "/assets/audio/ambience/";
const DEFAULT_VOLUME = 0.58;
const DEFAULT_CROSSFADE_SECONDS = 1.35;
const MIN_GAIN_DELTA = 0.004;

export const CROWD_AUDIO_TRACKS = Object.freeze([
  Object.freeze({
    id: "strip-tourists",
    file: "strip-tourist-chatter-v1.mp3",
    zones: Object.freeze(["strip", "south-strip"]),
    center: Object.freeze({ x: 0, z: -15 }),
    innerRadius: 85,
    outerRadius: 500,
    gain: 0.4,
    fallbackSeed: 0x51c17,
    fallbackTone: 620,
  }),
  Object.freeze({
    id: "casino-crowd",
    file: "casino-crowd-cheers-v1.mp3",
    zones: Object.freeze(["aurelia-casino", "casino"]),
    center: Object.freeze({ x: -68, z: -22 }),
    innerRadius: 42,
    outerRadius: 175,
    gain: 0.53,
    fallbackSeed: 0xca510,
    fallbackTone: 760,
  }),
  Object.freeze({
    id: "fremont-party",
    file: "fremont-party-crowd-v1.mp3",
    zones: Object.freeze(["fremont", "downtown-vegas"]),
    center: Object.freeze({ x: 0, z: -330 }),
    innerRadius: 42,
    outerRadius: 220,
    gain: 0.56,
    fallbackSeed: 0xf3e017,
    fallbackTone: 880,
  }),
  Object.freeze({
    id: "airport-terminal",
    file: "airport-terminal-crowd-v1.mp3",
    zones: Object.freeze(["airport"]),
    center: Object.freeze({ x: 220, z: 155 }),
    innerRadius: 72,
    outerRadius: 285,
    gain: 0.38,
    fallbackSeed: 0xa17c0,
    fallbackTone: 520,
  }),
]);

function clamp(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.min(maximum, Math.max(minimum, number));
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function sanitizeZone(zone) {
  return String(zone ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

function describeError(error) {
  if (!error) return "Unknown audio error";
  const name = typeof error.name === "string" ? error.name : "Error";
  const message = typeof error.message === "string" ? error.message : String(error);
  return `${name}: ${message}`.slice(0, 220);
}

function normalizeBaseUrl(value) {
  const base = String(value || DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL;
  return base.endsWith("/") ? base : `${base}/`;
}

function normalizeTrack(track, index) {
  const center = track?.center ?? {};
  const innerRadius = Math.max(0, Number(track?.innerRadius) || 0);
  const outerRadius = Math.max(innerRadius + 1, Number(track?.outerRadius) || innerRadius + 1);
  const id = String(track?.id || `crowd-track-${index}`);
  return {
    id,
    file: String(track?.file || ""),
    zones: Array.isArray(track?.zones) ? track.zones.map(sanitizeZone).filter(Boolean) : [],
    center: {
      x: Number.isFinite(Number(center.x)) ? Number(center.x) : 0,
      z: Number.isFinite(Number(center.z)) ? Number(center.z) : 0,
    },
    innerRadius,
    outerRadius,
    gain: clamp(track?.gain ?? 0.5, 0, 1.5),
    fallbackSeed: (Number(track?.fallbackSeed) || (0x9e3779b9 ^ index)) >>> 0,
    fallbackTone: clamp(track?.fallbackTone ?? 650, 180, 1600),
  };
}

function makeRandom(seed) {
  let state = seed >>> 0 || 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function createProceduralMurmur(context, seed, seconds = 8) {
  const sampleRate = context.sampleRate;
  const frameCount = Math.max(1, Math.floor(sampleRate * seconds));
  const buffer = context.createBuffer(2, frameCount, sampleRate);

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const random = makeRandom((seed + channel * 0x85ebca6b) >>> 0);
    const data = buffer.getChannelData(channel);
    let low = 0;
    let body = 0;
    let breath = 0;
    let syllablePhase = random() * Math.PI * 2;
    let syllableRate = 1.6 + random() * 1.8;

    for (let index = 0; index < frameCount; index += 1) {
      if (index % Math.max(1, Math.floor(sampleRate * 0.47)) === 0) {
        syllableRate = 1.3 + random() * 2.7;
      }
      const white = random() * 2 - 1;
      low += (white - low) * 0.0035;
      body += (white - body) * 0.048;
      breath += (white - breath) * 0.14;
      syllablePhase += (Math.PI * 2 * syllableRate) / sampleRate;
      const syllables = 0.48 + Math.max(0, Math.sin(syllablePhase)) * 0.42;
      const slowWave = 0.82 + 0.18 * Math.sin(index / sampleRate * 0.71 + channel);
      const murmur = (body * 0.72 + low * 0.52 + breath * 0.08) * syllables * slowWave;
      data[index] = clamp(murmur * 0.34, -0.68, 0.68);
    }
  }

  return buffer;
}

function contextConstructor() {
  return globalThis.AudioContext || globalThis.webkitAudioContext || null;
}

export class CrowdAudioSystem {
  constructor(options = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.crossfadeSeconds = clamp(
      options.crossfadeSeconds ?? DEFAULT_CROSSFADE_SECONDS,
      0.05,
      8,
    );
    this.volume = clamp(options.volume ?? DEFAULT_VOLUME, 0, 1);
    this.muted = Boolean(options.muted);
    this.zoneResolver = typeof options.zoneResolver === "function" ? options.zoneResolver : null;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis) ?? null;
    this.audioContextFactory = options.audioContextFactory ?? (() => {
      const AudioContextClass = contextConstructor();
      if (!AudioContextClass) throw new Error("Web Audio API is unavailable in this browser");
      return new AudioContextClass({ latencyHint: "interactive" });
    });

    const definitions = Array.isArray(options.tracks) && options.tracks.length
      ? options.tracks
      : CROWD_AUDIO_TRACKS;
    this.tracks = definitions.map((definition, index) => ({
      config: normalizeTrack(definition, index),
      status: "idle",
      source: null,
      gainNode: null,
      filters: [],
      buffer: null,
      fallback: false,
      error: null,
      targetGain: 0,
      proximity: 0,
    }));

    this.context = null;
    this.masterGain = null;
    this.listener = { x: 0, y: 0, z: 0, zone: "" };
    this.status = "awaiting-gesture";
    this.unlocked = false;
    this.disposed = false;
    this.lastError = null;
    this._unlockPromise = null;
    this._loadController = null;
    this._gestureBindings = [];
  }

  installGestureUnlock(target = globalThis.window) {
    if (this.disposed || !target?.addEventListener) return () => {};
    this.removeGestureUnlock();

    const handler = (event) => {
      if (event?.isTrusted === false) return;
      this.unlock()
        .then(() => this.removeGestureUnlock())
        .catch((error) => {
          this.lastError = describeError(error);
          this.status = "awaiting-gesture";
        });
    };
    const bindings = [
      ["pointerdown", { passive: true }],
      ["touchend", { passive: true }],
      ["keydown", false],
    ];
    for (const [eventName, listenerOptions] of bindings) {
      target.addEventListener(eventName, handler, listenerOptions);
      this._gestureBindings.push({ target, eventName, handler, listenerOptions });
    }
    return () => this.removeGestureUnlock();
  }

  removeGestureUnlock() {
    for (const binding of this._gestureBindings) {
      binding.target.removeEventListener(
        binding.eventName,
        binding.handler,
        binding.listenerOptions,
      );
    }
    this._gestureBindings.length = 0;
  }

  async unlock() {
    if (this.disposed) throw new Error("CrowdAudioSystem has been disposed");
    if (this.unlocked && this.context?.state === "running") return this.snapshot();
    if (this._unlockPromise) return this._unlockPromise;

    this._unlockPromise = this._unlockInternal();
    try {
      return await this._unlockPromise;
    } finally {
      this._unlockPromise = null;
    }
  }

  async _unlockInternal() {
    this.status = "unlocking";
    if (!this.context) {
      this.context = this.audioContextFactory();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.setValueAtTime(0, this.context.currentTime);
      this.masterGain.connect(this.context.destination);
    }

    if (this.context.state !== "running") await this.context.resume();
    if (this.context.state !== "running") {
      throw new Error("Audio is still suspended; interact with the game to enable ambience");
    }

    this.unlocked = true;
    this.status = "loading";
    this._scheduleMasterGain(true);
    this._loadController?.abort();
    this._loadController = new AbortController();

    await Promise.allSettled(
      this.tracks.map((track, index) => this._loadTrack(track, index, this._loadController.signal)),
    );
    if (this.disposed) return this.snapshot();

    this.status = this.tracks.some((track) => track.status === "ready")
      ? "ready"
      : "fallback";
    this._applyMix(true);
    return this.snapshot();
  }

  async _loadTrack(track, index, signal) {
    track.status = "loading";
    track.error = null;
    let buffer = null;

    try {
      if (!this.fetchImpl) throw new Error("Fetch API is unavailable");
      if (!track.config.file) throw new Error(`No audio file configured for ${track.config.id}`);
      const response = await this.fetchImpl(`${this.baseUrl}${track.config.file}`, {
        cache: "force-cache",
        signal,
      });
      if (!response.ok) {
        throw new Error(`Audio asset request failed with HTTP ${response.status}`);
      }
      const encoded = await response.arrayBuffer();
      if (encoded.byteLength < 128) throw new Error("Audio asset was empty or truncated");
      buffer = await this.context.decodeAudioData(encoded.slice(0));
      if (!buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0.05) {
        throw new Error("Decoded audio asset has no playable duration");
      }
      track.fallback = false;
      track.status = "ready";
    } catch (error) {
      if (signal.aborted || this.disposed) return;
      track.error = describeError(error);
      track.fallback = true;
      track.status = "fallback";
      buffer = createProceduralMurmur(
        this.context,
        track.config.fallbackSeed ^ (index * 0x9e3779b9),
      );
    }

    if (!signal.aborted && !this.disposed && buffer) this._startTrack(track, buffer);
  }

  _startTrack(track, buffer) {
    const context = this.context;
    const source = context.createBufferSource();
    const gainNode = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    gainNode.gain.setValueAtTime(0, context.currentTime);

    let tail = source;
    const filters = [];
    if (track.fallback) {
      const highpass = context.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.setValueAtTime(105, context.currentTime);
      highpass.Q.setValueAtTime(0.5, context.currentTime);
      const lowpass = context.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.setValueAtTime(track.config.fallbackTone * 2.4, context.currentTime);
      lowpass.Q.setValueAtTime(0.72, context.currentTime);
      const presence = context.createBiquadFilter();
      presence.type = "peaking";
      presence.frequency.setValueAtTime(track.config.fallbackTone, context.currentTime);
      presence.Q.setValueAtTime(0.62, context.currentTime);
      presence.gain.setValueAtTime(3.2, context.currentTime);
      tail.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(presence);
      tail = presence;
      filters.push(highpass, lowpass, presence);
    }
    tail.connect(gainNode);
    gainNode.connect(this.masterGain);

    track.source = source;
    track.gainNode = gainNode;
    track.filters = filters;
    track.buffer = buffer;
    source.start(context.currentTime + 0.01);
  }

  update(position, zoneOverride) {
    if (this.disposed) return this.snapshot();
    const source = position?.position ?? position ?? {};
    const next = {
      x: Number.isFinite(Number(source.x)) ? Number(source.x) : this.listener.x,
      y: Number.isFinite(Number(source.y)) ? Number(source.y) : this.listener.y,
      z: Number.isFinite(Number(source.z)) ? Number(source.z) : this.listener.z,
      zone: sanitizeZone(zoneOverride ?? position?.zone ?? source.zone),
    };
    if (!next.zone && this.zoneResolver) {
      try {
        next.zone = sanitizeZone(this.zoneResolver(next));
      } catch (error) {
        this.lastError = describeError(error);
      }
    }
    this.listener = next;
    this._applyMix(false);
    return this.snapshot();
  }

  updateListener(position, zoneOverride) {
    return this.update(position, zoneOverride);
  }

  _weightForTrack(track) {
    const config = track.config;
    const distance = Math.hypot(
      this.listener.x - config.center.x,
      this.listener.z - config.center.z,
    );
    const proximity = 1 - smoothstep(config.innerRadius, config.outerRadius, distance);
    const zoneMatch = Boolean(this.listener.zone && config.zones.includes(this.listener.zone));
    track.proximity = proximity;
    return Math.max(zoneMatch ? 1 : 0, proximity * 0.76);
  }

  _applyMix(immediate) {
    const weighted = this.tracks.map((track) => ({ track, weight: this._weightForTrack(track) }));
    const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    const normalization = Math.max(1, totalWeight * 0.82);

    for (const { track, weight } of weighted) {
      const target = (track.config.gain * weight) / normalization;
      this._scheduleTrackGain(track, target, immediate);
    }
  }

  _scheduleTrackGain(track, target, immediate) {
    const nextTarget = clamp(target, 0, 1.5);
    if (!track.gainNode || !this.context) {
      track.targetGain = nextTarget;
      return;
    }
    if (!immediate && Math.abs(nextTarget - track.targetGain) < MIN_GAIN_DELTA) return;
    track.targetGain = nextTarget;
    const parameter = track.gainNode.gain;
    const now = this.context.currentTime;
    parameter.cancelScheduledValues(now);
    if (immediate) {
      parameter.setValueAtTime(nextTarget, now);
      return;
    }
    parameter.setTargetAtTime(nextTarget, now, Math.max(0.015, this.crossfadeSeconds / 4.6));
  }

  setVolume(value) {
    this.volume = clamp(value, 0, 1);
    this._scheduleMasterGain(false);
    return this.volume;
  }

  setMuted(value) {
    this.muted = Boolean(value);
    this._scheduleMasterGain(false);
    return this.muted;
  }

  toggleMuted() {
    return this.setMuted(!this.muted);
  }

  _scheduleMasterGain(immediate) {
    if (!this.masterGain || !this.context) return;
    const target = this.muted ? 0 : this.volume;
    const now = this.context.currentTime;
    const parameter = this.masterGain.gain;
    parameter.cancelScheduledValues(now);
    if (immediate) {
      parameter.setValueAtTime(target, now);
    } else {
      parameter.setTargetAtTime(target, now, 0.065);
    }
  }

  snapshot() {
    return {
      status: this.status,
      unlocked: this.unlocked,
      contextState: this.context?.state ?? "not-created",
      muted: this.muted,
      volume: this.volume,
      listener: { ...this.listener },
      lastError: this.lastError,
      fallbackTrackCount: this.tracks.filter((track) => track.fallback).length,
      tracks: this.tracks.map((track) => ({
        id: track.config.id,
        file: track.config.file,
        status: track.status,
        fallback: track.fallback,
        error: track.error,
        targetGain: Number(track.targetGain.toFixed(4)),
        proximity: Number(track.proximity.toFixed(4)),
        duration: track.buffer ? Number(track.buffer.duration.toFixed(2)) : 0,
      })),
    };
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.status = "disposed";
    this.removeGestureUnlock();
    this._loadController?.abort();

    for (const track of this.tracks) {
      try {
        track.source?.stop();
      } catch {
        // A source may already have stopped; disposal must remain idempotent.
      }
      try {
        track.source?.disconnect();
        track.gainNode?.disconnect();
        track.filters.forEach((filter) => filter.disconnect());
      } catch {
        // Ignore nodes that were disconnected by a context shutdown.
      }
      track.source = null;
      track.gainNode = null;
      track.filters = [];
      track.buffer = null;
    }

    try {
      this.masterGain?.disconnect();
      if (this.context && this.context.state !== "closed") await this.context.close();
    } catch (error) {
      this.lastError = describeError(error);
    }
    this.masterGain = null;
    this.context = null;
    this.unlocked = false;
  }
}

export function createCrowdAudioSystem(options) {
  return new CrowdAudioSystem(options);
}

export default createCrowdAudioSystem;
