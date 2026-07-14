const SOUND_PRESETS = Object.freeze({
  ui: { wave: "sine", start: 520, end: 760, duration: 0.06, gain: 0.035 },
  pickup: { wave: "triangle", start: 420, end: 980, duration: 0.16, gain: 0.06 },
  success: { wave: "sine", start: 520, end: 1040, duration: 0.28, gain: 0.075 },
  fail: { wave: "sawtooth", start: 180, end: 90, duration: 0.2, gain: 0.05 },
  cash: { wave: "square", start: 880, end: 1320, duration: 0.12, gain: 0.035 },
  shot: { wave: "square", start: 145, end: 42, duration: 0.085, gain: 0.12 },
  shotgun: { wave: "square", start: 96, end: 30, duration: 0.18, gain: 0.18 },
  reloadStart: { wave: "triangle", start: 210, end: 130, duration: 0.13, gain: 0.04 },
  reloadEnd: { wave: "triangle", start: 260, end: 620, duration: 0.11, gain: 0.045 },
  weaponSelect: { wave: "square", start: 360, end: 240, duration: 0.075, gain: 0.028 },
  empty: { wave: "square", start: 220, end: 145, duration: 0.07, gain: 0.03 },
  lock: { wave: "sine", start: 760, end: 1180, duration: 0.12, gain: 0.04 },
  hit: { wave: "triangle", start: 560, end: 720, duration: 0.055, gain: 0.055 },
  footstep: { wave: "noise", start: 115, end: 54, duration: 0.08, gain: 0.04 },
  siren: { wave: "sine", start: 650, end: 930, duration: 0.32, gain: 0.055 },
  engine: { wave: "sawtooth", start: 55, end: 92, duration: 0.14, gain: 0.025 },
  engineStart: { wave: "sawtooth", start: 38, end: 118, duration: 0.34, gain: 0.06 },
  tire: { wave: "sawtooth", start: 260, end: 90, duration: 0.22, gain: 0.045 },
  crash: { wave: "noise", start: 900, end: 120, duration: 0.34, gain: 0.16 },
  door: { wave: "noise", start: 520, end: 180, duration: 0.12, gain: 0.055 },
  cuff: { wave: "square", start: 430, end: 250, duration: 0.09, gain: 0.04 },
  casino: { wave: "triangle", start: 330, end: 660, duration: 0.22, gain: 0.055 },
});

const REALISTIC_SFX = new Set([
  "shot", "shotgun", "reloadStart", "reloadEnd", "weaponSelect", "empty", "hit",
  "footstep", "siren", "engine", "engineStart", "tire", "crash", "door", "cuff",
]);

const RECORDED_SFX = Object.freeze({
  shot: "/assets/audio/sfx/gunshot-pistol.wav",
  shotgun: "/assets/audio/sfx/gunshot-shotgun.wav",
  siren: "/assets/audio/sfx/police-whoop-whoop.wav",
  footstep: "/assets/audio/sfx/footstep-concrete.wav",
  engineStart: "/assets/audio/sfx/engine-start.wav",
  tire: "/assets/audio/sfx/tire-squeal.wav",
  crash: "/assets/audio/sfx/vehicle-crash.wav",
  door: "/assets/audio/sfx/car-door.wav",
  cuff: "/assets/audio/sfx/handcuffs.wav",
  reloadStart: "/assets/audio/sfx/weapon-reload-start.wav",
  reloadEnd: "/assets/audio/sfx/weapon-reload-end.wav",
  weaponSelect: "/assets/audio/sfx/weapon-holster.wav",
  empty: "/assets/audio/sfx/weapon-empty-click.wav",
  hit: "/assets/audio/sfx/body-hit.wav",
});

export class AudioBus {
  constructor() {
    this.context = null;
    this.master = null;
    this.enabled = true;
    this.lastPlayed = new Map();
    this.recordedBuffers = new Map();
    this.recordedLoading = new Map();
    this.recordedMissing = new Set();
  }

  unlock() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.72;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === "suspended") this.context.resume();
    return true;
  }

  createNoise(duration) {
    const rate = this.context.sampleRate;
    const frameCount = Math.max(1, Math.floor(rate * duration));
    const buffer = this.context.createBuffer(1, frameCount, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frameCount);
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    return source;
  }

  envelope(duration, gain, attack = 0.006, releaseAt = 1) {
    const now = this.context.currentTime;
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration * releaseAt);
    envelope.connect(this.master);
    return envelope;
  }

  filteredNoise({ duration = 0.12, gain = 0.08, type = "bandpass", frequency = 900, q = 0.9, attack = 0.004 }) {
    if (!this.unlock()) return;
    const now = this.context.currentTime;
    const source = this.createNoise(duration);
    const filter = this.context.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(Math.max(20, frequency), now);
    filter.Q.value = q;
    source.connect(filter);
    filter.connect(this.envelope(duration, gain, attack));
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  tone({ wave = "sine", start = 120, end = 80, duration = 0.12, gain = 0.04, attack = 0.006 }) {
    if (!this.unlock()) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(Math.max(20, start), now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), now + duration);
    oscillator.connect(this.envelope(duration, gain, attack));
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.enabled ? 0.72 : 0, this.context.currentTime, 0.02);
    }
    return this.enabled;
  }

  loadRecorded(name) {
    if (!RECORDED_SFX[name] || this.recordedMissing.has(name)) return null;
    if (this.recordedBuffers.has(name)) return Promise.resolve(this.recordedBuffers.get(name));
    if (this.recordedLoading.has(name)) return this.recordedLoading.get(name);
    const request = fetch(RECORDED_SFX[name], { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`Missing recorded SFX: ${RECORDED_SFX[name]}`);
        return response.arrayBuffer();
      })
      .then((data) => this.context.decodeAudioData(data))
      .then((buffer) => {
        this.recordedBuffers.set(name, buffer);
        this.recordedLoading.delete(name);
        return buffer;
      })
      .catch(() => {
        this.recordedMissing.add(name);
        this.recordedLoading.delete(name);
        return null;
      });
    this.recordedLoading.set(name, request);
    return request;
  }

  playRecorded(name, options = {}) {
    if (!RECORDED_SFX[name] || this.recordedMissing.has(name)) return false;
    const buffer = this.recordedBuffers.get(name);
    if (!buffer) {
      this.loadRecorded(name);
      return false;
    }
    const now = this.context.currentTime;
    const throttle = options.throttle ?? (name === "siren" ? 0.38 : 0.02);
    if (now - (this.lastPlayed.get(`recorded:${name}`) || 0) < throttle) return true;
    this.lastPlayed.set(`recorded:${name}`, now);
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = options.rate || 1;
    gain.gain.value = Math.max(0, Math.min(1.25, options.gain ?? 0.82));
    source.connect(gain);
    gain.connect(this.master);
    source.start(now, options.offset || 0);
    return true;
  }

  play(name, options = {}) {
    if (!this.enabled || !this.unlock()) return;
    if (!options.raw && this.playRecorded(name, options)) return;
    if (!options.raw && REALISTIC_SFX.has(name)) {
      this.playRealistic(name, options);
      return;
    }
    const preset = { ...(SOUND_PRESETS[name] || SOUND_PRESETS.ui), ...options };
    const now = this.context.currentTime;
    const throttle = options.throttle ?? (name === "engine" ? 0.09 : 0.015);
    if (now - (this.lastPlayed.get(name) || 0) < throttle) return;
    this.lastPlayed.set(name, now);

    const oscillator = preset.wave === "noise" ? this.createNoise(preset.duration) : this.context.createOscillator();
    const envelope = this.context.createGain();
    if (oscillator.frequency) {
      oscillator.type = preset.wave;
      oscillator.frequency.setValueAtTime(Math.max(20, preset.start), now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, preset.end), now + preset.duration);
    }
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(preset.gain, now + Math.min(0.018, preset.duration * 0.25));
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + preset.duration);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + preset.duration + 0.02);
  }

  playLayered(name, layers = []) {
    this.play(name);
    for (const layer of layers) {
      window.setTimeout(() => this.play(layer.name || name, layer), layer.delayMs || 0);
    }
  }

  playWin() {
    this.play("success");
    window.setTimeout(() => this.play("cash", { start: 760, end: 1520 }), 90);
  }

  playRealistic(name, options = {}) {
    const now = this.context.currentTime;
    const throttle = options.throttle ?? (name === "engine" ? 0.08 : 0.02);
    if (now - (this.lastPlayed.get(name) || 0) < throttle) return;
    this.lastPlayed.set(name, now);

    if (name === "shot" || name === "shotgun") {
      const heavy = name === "shotgun";
      this.filteredNoise({ duration: heavy ? 0.18 : 0.105, gain: heavy ? 0.19 : 0.13, type: "highpass", frequency: 680, q: 0.8 });
      this.tone({ wave: "triangle", start: heavy ? 82 : 115, end: 34, duration: heavy ? 0.2 : 0.11, gain: heavy ? 0.12 : 0.075, attack: 0.002 });
      window.setTimeout(() => this.filteredNoise({ duration: heavy ? 0.26 : 0.15, gain: heavy ? 0.055 : 0.035, type: "lowpass", frequency: heavy ? 1300 : 1800, q: 0.7 }), 18);
      return;
    }

    if (name === "siren") {
      this.tone({ wave: "sine", start: options.start || 620, end: options.end || 980, duration: options.duration || 0.46, gain: options.gain || 0.06, attack: 0.035 });
      window.setTimeout(() => this.tone({ wave: "sine", start: options.end || 980, end: options.start || 620, duration: 0.34, gain: (options.gain || 0.06) * 0.82, attack: 0.02 }), 120);
      return;
    }

    if (name === "engine" || name === "engineStart") {
      const starting = name === "engineStart";
      const start = options.start || (starting ? 42 : 58);
      const end = options.end || (starting ? 118 : 82);
      this.tone({ wave: "sawtooth", start, end, duration: starting ? 0.42 : 0.13, gain: starting ? 0.055 : 0.024, attack: 0.018 });
      this.filteredNoise({ duration: starting ? 0.25 : 0.08, gain: starting ? 0.022 : 0.009, type: "lowpass", frequency: 420, q: 0.5, attack: 0.02 });
      return;
    }

    if (name === "footstep") {
      this.tone({ wave: "triangle", start: options.start || 95, end: options.end || 48, duration: options.duration || 0.075, gain: options.gain || 0.035, attack: 0.002 });
      this.filteredNoise({ duration: 0.055, gain: (options.gain || 0.035) * 0.55, type: "lowpass", frequency: 720, q: 0.8, attack: 0.002 });
      return;
    }

    if (name === "tire") {
      this.filteredNoise({ duration: options.duration || 0.2, gain: options.gain || 0.05, type: "bandpass", frequency: 1800, q: 4.8, attack: 0.01 });
      return;
    }

    if (name === "crash") {
      this.filteredNoise({ duration: options.duration || 0.36, gain: options.gain || 0.15, type: "lowpass", frequency: options.start || 950, q: 0.9, attack: 0.002 });
      this.tone({ wave: "triangle", start: 72, end: 28, duration: 0.28, gain: 0.09, attack: 0.002 });
      return;
    }

    if (name === "door" || name === "cuff") {
      this.filteredNoise({ duration: name === "door" ? 0.11 : 0.07, gain: name === "door" ? 0.045 : 0.035, type: "bandpass", frequency: name === "door" ? 520 : 1300, q: name === "door" ? 1.2 : 3.2, attack: 0.002 });
      window.setTimeout(() => this.tone({ wave: "square", start: name === "door" ? 180 : 480, end: name === "door" ? 95 : 310, duration: 0.055, gain: 0.025, attack: 0.002 }), name === "door" ? 70 : 35);
      return;
    }

    if (name === "reloadStart" || name === "reloadEnd" || name === "weaponSelect" || name === "empty") {
      const freq = name === "empty" ? 1050 : name === "reloadEnd" ? 780 : 520;
      this.filteredNoise({ duration: name === "reloadStart" ? 0.12 : 0.075, gain: name === "empty" ? 0.028 : 0.04, type: "bandpass", frequency: freq, q: 3, attack: 0.002 });
      this.tone({ wave: "square", start: freq * 0.42, end: freq * 0.25, duration: 0.055, gain: 0.018, attack: 0.002 });
      return;
    }

    if (name === "hit") {
      this.tone({ wave: "triangle", start: 720, end: 540, duration: 0.045, gain: 0.045, attack: 0.002 });
      return;
    }

    this.play(name, { ...options, raw: true });
  }

  playGunshot(kind = "pistol") {
    if (kind === "shotgun") {
      this.playRealistic("shotgun", { throttle: 0 });
      return;
    }
    this.playRealistic("shot", { throttle: 0 });
  }
}
