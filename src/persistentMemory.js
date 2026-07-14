/**
 * Durable, versioned browser persistence for Sin City RP.
 *
 * The store deliberately owns only the keys supplied by its caller. Every
 * storage operation is guarded because localStorage can throw when disabled,
 * full, sandboxed, or blocked by a privacy policy.
 */

export const PERSISTENT_MEMORY_SCHEMA_VERSION = 2;

const DEFAULT_DEBOUNCE_MS = 350;
const MAX_JSON_DEPTH = 96;
const ENVELOPE_KEYS = new Set([
  "schemaVersion",
  "gameVersion",
  "savedAt",
  "revision",
  "data",
  "payload",
  "state",
  "checksum",
]);
const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function isPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Returns true only for values that round-trip through JSON without loss. */
export function isJsonSafe(value, maxDepth = MAX_JSON_DEPTH) {
  const ancestors = new WeakSet();

  function visit(candidate, depth) {
    if (depth > maxDepth) return false;
    if (candidate === null) return true;

    const type = typeof candidate;
    if (type === "string" || type === "boolean") return true;
    if (type === "number") return Number.isFinite(candidate);
    if (type !== "object") return false;
    if (!Array.isArray(candidate) && !isPlainRecord(candidate)) return false;
    if (ancestors.has(candidate)) return false;

    ancestors.add(candidate);
    try {
      if (Array.isArray(candidate)) {
        for (const item of candidate) {
          if (!visit(item, depth + 1)) return false;
        }
      } else {
        for (const key of Object.keys(candidate)) {
          if (!visit(candidate[key], depth + 1)) return false;
        }
      }
      return true;
    } catch {
      return false;
    } finally {
      ancestors.delete(candidate);
    }
  }

  return visit(value, 0);
}

function stableStringify(value) {
  const ancestors = new WeakSet();

  function normalize(candidate) {
    if (candidate === null || typeof candidate !== "object") return candidate;
    if (ancestors.has(candidate)) throw new TypeError("Circular data cannot be persisted");

    ancestors.add(candidate);
    try {
      if (Array.isArray(candidate)) return candidate.map(normalize);
      const normalized = Object.create(null);
      for (const key of Object.keys(candidate).sort()) normalized[key] = normalize(candidate[key]);
      return normalized;
    } finally {
      ancestors.delete(candidate);
    }
  }

  return JSON.stringify(normalize(value));
}

function fnv1a32(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Computes the checksum across every envelope field except checksum itself. */
export function computePersistentMemoryChecksum(envelope) {
  if (!isPlainRecord(envelope)) return null;
  const integrityData = Object.create(null);
  for (const key of Object.keys(envelope)) {
    if (key !== "checksum") integrityData[key] = envelope[key];
  }
  try {
    return `fnv1a32:${fnv1a32(stableStringify(integrityData))}`;
  } catch {
    return null;
  }
}

/**
 * Detailed envelope validation. It never throws and verifies data integrity by
 * default. Older schemas are intentionally handled by the migration path.
 */
export function validatePersistentMemoryEnvelope(
  envelope,
  { verifyChecksum = true, allowFutureSchema = true } = {},
) {
  const errors = [];
  if (!isPlainRecord(envelope)) {
    return { valid: false, integrity: false, futureSchema: false, errors: ["not-an-object"] };
  }

  const schemaVersion = envelope.schemaVersion;
  if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 1) errors.push("invalid-schema-version");
  const futureSchema = Number.isSafeInteger(schemaVersion)
    && schemaVersion > PERSISTENT_MEMORY_SCHEMA_VERSION;
  if (futureSchema && !allowFutureSchema) errors.push("future-schema");
  if (typeof envelope.gameVersion !== "string" || envelope.gameVersion.length === 0) {
    errors.push("invalid-game-version");
  }
  if (!Number.isSafeInteger(envelope.savedAt) || envelope.savedAt < 0) errors.push("invalid-saved-at");
  if (!Number.isSafeInteger(envelope.revision) || envelope.revision < 0) {
    errors.push("invalid-revision");
  }
  if (!own(envelope, "data") || !isJsonSafe(envelope.data)) errors.push("invalid-data");
  if (typeof envelope.checksum !== "string" || envelope.checksum.length === 0) {
    errors.push("missing-checksum");
  }

  let integrity = errors.length === 0 || errors.every((error) => error === "future-schema");
  if (verifyChecksum && typeof envelope.checksum === "string") {
    const expected = computePersistentMemoryChecksum(envelope);
    integrity = Boolean(expected && expected === envelope.checksum);
    if (!integrity) errors.push("checksum-mismatch");
  }

  return {
    valid: errors.length === 0,
    integrity,
    futureSchema,
    schemaVersion: Number.isSafeInteger(schemaVersion) ? schemaVersion : null,
    errors,
  };
}

/** Orders envelopes by revision, then monotonic save time. */
export function comparePersistentMemoryEnvelopes(left, right) {
  const leftRevision = Number.isSafeInteger(left?.revision) ? left.revision : -1;
  const rightRevision = Number.isSafeInteger(right?.revision) ? right.revision : -1;
  if (leftRevision !== rightRevision) return leftRevision > rightRevision ? 1 : -1;

  const leftSavedAt = Number.isSafeInteger(left?.savedAt) ? left.savedAt : -1;
  const rightSavedAt = Number.isSafeInteger(right?.savedAt) ? right.savedAt : -1;
  if (leftSavedAt !== rightSavedAt) return leftSavedAt > rightSavedAt ? 1 : -1;
  return 0;
}

function serializeError(error, operation, key, code = "storage-error") {
  return {
    code,
    operation,
    key: typeof key === "string" ? key : null,
    name: error?.name || "Error",
    message: error?.message || String(error || code),
  };
}

function resolveDefaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/** A non-throwing adapter around Storage-compatible objects. */
export function createSafeStorageAdapter(storage = undefined) {
  let target;
  let initializationError = null;
  try {
    target = storage === undefined ? resolveDefaultStorage() : storage;
  } catch (error) {
    target = null;
    initializationError = error;
  }

  const available = Boolean(
    target
      && typeof target.getItem === "function"
      && typeof target.setItem === "function"
      && typeof target.removeItem === "function",
  );

  function unavailable(operation, key) {
    const error = initializationError || new Error("Persistent browser storage is unavailable");
    return { ok: false, error: serializeError(error, operation, key, "storage-unavailable") };
  }

  return Object.freeze({
    raw: target,
    available,
    read(key) {
      if (!available) return { ...unavailable("read", key), value: null };
      try {
        return { ok: true, value: target.getItem(key), error: null };
      } catch (error) {
        return { ok: false, value: null, error: serializeError(error, "read", key) };
      }
    },
    write(key, value) {
      if (!available) return unavailable("write", key);
      try {
        target.setItem(key, value);
        return { ok: true, error: null };
      } catch (error) {
        return { ok: false, error: serializeError(error, "write", key) };
      }
    },
    remove(key) {
      if (!available) return unavailable("remove", key);
      try {
        target.removeItem(key);
        return { ok: true, error: null };
      } catch (error) {
        return { ok: false, error: serializeError(error, "remove", key) };
      }
    },
  });
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(base, overlay) {
  if (!isPlainRecord(base) || !isPlainRecord(overlay)) return cloneJson(overlay);

  const merged = Object.create(null);
  for (const key of Object.keys(base)) {
    if (!UNSAFE_KEYS.has(key)) merged[key] = cloneJson(base[key]);
  }
  for (const key of Object.keys(overlay)) {
    if (UNSAFE_KEYS.has(key)) continue;
    const left = merged[key];
    const right = overlay[key];
    merged[key] = isPlainRecord(left) && isPlainRecord(right)
      ? deepMerge(left, right)
      : cloneJson(right);
  }
  return merged;
}

function normalizeTimestamp(value, fallback) {
  if (Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.trunc(parsed);
  }
  return fallback;
}

function normalizeRevision(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function normalizeLegacyKeys(entries, primaryKey) {
  const seen = new Set([primaryKey]);
  const normalized = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const candidate = typeof entry === "string" ? { key: entry } : entry;
    if (!candidate || typeof candidate.key !== "string" || candidate.key.length === 0) continue;
    if (seen.has(candidate.key)) continue;
    seen.add(candidate.key);
    normalized.push({
      key: candidate.key,
      migrate: typeof candidate.migrate === "function" ? candidate.migrate : null,
    });
  }
  return normalized;
}

function looksLikeEnvelope(value) {
  return isPlainRecord(value)
    && own(value, "schemaVersion")
    && (own(value, "data") || own(value, "payload") || own(value, "state"))
    && (own(value, "checksum") || own(value, "gameVersion") || own(value, "revision"));
}

function envelopeExtras(envelope) {
  const extras = Object.create(null);
  if (!isPlainRecord(envelope)) return extras;
  for (const key of Object.keys(envelope)) {
    if (!ENVELOPE_KEYS.has(key) && !UNSAFE_KEYS.has(key)) extras[key] = cloneJson(envelope[key]);
  }
  return extras;
}

function compactEnvelope(envelope) {
  return JSON.stringify(envelope);
}

function makeEnvelope({ data, gameVersion, savedAt, revision, extras = null }) {
  const envelope = Object.assign(Object.create(null), extras || null, {
    schemaVersion: PERSISTENT_MEMORY_SCHEMA_VERSION,
    gameVersion,
    savedAt,
    revision,
    data,
  });
  envelope.checksum = computePersistentMemoryChecksum(envelope);
  return envelope;
}

function parseStrictEnvelope(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!looksLikeEnvelope(parsed)) return { ok: false, reason: "not-an-envelope" };
    const validation = validatePersistentMemoryEnvelope(parsed);
    if (!validation.valid) return { ok: false, reason: validation.errors.join(","), validation };
    return { ok: true, envelope: parsed, validation };
  } catch (error) {
    return { ok: false, reason: "invalid-json", error };
  }
}

function migrationPayload(envelope) {
  if (own(envelope, "data")) return envelope.data;
  if (own(envelope, "payload")) return envelope.payload;
  return envelope.state;
}

/**
 * Creates a synchronous localStorage-backed store with debounced scheduling.
 * Nothing is written during construction.
 */
export function createPersistentMemoryStore({
  key,
  legacyKeys = [],
  gameVersion = "unknown",
  debounceMs = DEFAULT_DEBOUNCE_MS,
  storage = undefined,
  eventTarget = typeof globalThis.addEventListener === "function" ? globalThis : null,
  migrate = null,
  persistMigrations = true,
  mergeOnSave = true,
  subscribeToStorageEvents = true,
  flushOnPageHide = true,
  onExternalUpdate = null,
  now = () => Date.now(),
  setTimer = (...args) => globalThis.setTimeout(...args),
  clearTimer = (timer) => globalThis.clearTimeout(timer),
} = {}) {
  if (typeof key !== "string" || key.length === 0) {
    throw new TypeError("createPersistentMemoryStore requires a non-empty storage key");
  }
  if (typeof gameVersion !== "string" || gameVersion.length === 0) {
    throw new TypeError("gameVersion must be a non-empty string");
  }

  const delay = Math.max(0, Number.isFinite(debounceMs) ? Math.trunc(debounceMs) : DEFAULT_DEBOUNCE_MS);
  const safeStorage = createSafeStorageAdapter(storage);
  const normalizedLegacyKeys = normalizeLegacyKeys(legacyKeys, key);
  const listeners = new Set();

  let currentEnvelope = null;
  let currentData = null;
  let currentExtras = Object.create(null);
  let writeLockedByFutureSchema = false;
  let pendingData = null;
  let pendingOptions = null;
  let pendingTimer = null;
  let dueAt = null;
  let destroyed = false;

  const diagnostics = {
    status: "idle",
    key,
    storageAvailable: safeStorage.available,
    lastSavedAt: null,
    lastLoadedAt: null,
    revision: 0,
    error: null,
    recovered: false,
    migrated: false,
    sourceKey: null,
    pending: false,
    dueAt: null,
    futureSchema: false,
    externalUpdates: 0,
    conflictAvoided: 0,
  };

  function clock() {
    try {
      const value = Math.trunc(Number(now()));
      return Number.isSafeInteger(value) && value >= 0 ? value : Date.now();
    } catch {
      return Date.now();
    }
  }

  function snapshotDiagnostics() {
    return Object.freeze({
      ...diagnostics,
      error: diagnostics.error ? Object.freeze({ ...diagnostics.error }) : null,
    });
  }

  function emit(type, detail = null) {
    const event = Object.freeze({ type, detail, diagnostics: snapshotDiagnostics() });
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch {
        // Subscriber failures must never interrupt persistence.
      }
    }
  }

  function recordError(error, operation, targetKey = key, code = "persistence-error") {
    diagnostics.status = "error";
    diagnostics.error = error?.code
      ? { ...error }
      : serializeError(error, operation, targetKey, code);
    emit("error", diagnostics.error);
    return diagnostics.error;
  }

  function clearPending() {
    if (pendingTimer !== null) {
      try {
        clearTimer(pendingTimer);
      } catch {
        // A custom timer implementation may already have discarded the handle.
      }
    }
    pendingTimer = null;
    pendingData = null;
    pendingOptions = null;
    dueAt = null;
    diagnostics.pending = false;
    diagnostics.dueAt = null;
  }

  function runMigration(payload, context, candidateMigration) {
    let next = payload;
    const hooks = [candidateMigration, migrate].filter((hook, index, all) => (
      typeof hook === "function" && all.indexOf(hook) === index
    ));
    for (const hook of hooks) {
      const result = hook(cloneJson(next), Object.freeze({ ...context }));
      if (result !== undefined) next = result;
      if (!isJsonSafe(next)) throw new TypeError("Migration returned data that is not JSON-safe");
    }
    return cloneJson(next);
  }

  function parseCandidate(raw, sourceKey, candidateMigration) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return { ok: false, error: serializeError(error, "parse", sourceKey, "malformed-json") };
    }

    if (!isJsonSafe(parsed)) {
      return {
        ok: false,
        error: serializeError(new TypeError("Save contains unsupported values"), "validate", sourceKey, "invalid-save"),
      };
    }

    if (looksLikeEnvelope(parsed)) {
      const schemaVersion = Number(parsed.schemaVersion);
      if (Number.isSafeInteger(schemaVersion) && schemaVersion >= PERSISTENT_MEMORY_SCHEMA_VERSION) {
        const validation = validatePersistentMemoryEnvelope(parsed);
        if (!validation.valid) {
          return {
            ok: false,
            error: serializeError(
              new Error(`Save integrity check failed: ${validation.errors.join(", ")}`),
              "validate",
              sourceKey,
              "integrity-failure",
            ),
          };
        }
        return {
          ok: true,
          envelope: parsed,
          data: cloneJson(parsed.data),
          extras: envelopeExtras(parsed),
          migrated: false,
          futureSchema: validation.futureSchema,
        };
      }

      try {
        const migratedData = runMigration(migrationPayload(parsed), {
          sourceKey,
          raw: false,
          fromSchemaVersion: Number.isSafeInteger(schemaVersion) ? schemaVersion : 0,
          toSchemaVersion: PERSISTENT_MEMORY_SCHEMA_VERSION,
          fromGameVersion: typeof parsed.gameVersion === "string" ? parsed.gameVersion : null,
          toGameVersion: gameVersion,
        }, candidateMigration);
        const migratedEnvelope = makeEnvelope({
          data: migratedData,
          gameVersion,
          savedAt: normalizeTimestamp(parsed.savedAt, clock()),
          revision: normalizeRevision(parsed.revision),
          extras: envelopeExtras(parsed),
        });
        return {
          ok: true,
          envelope: migratedEnvelope,
          data: migratedData,
          extras: envelopeExtras(parsed),
          migrated: true,
          futureSchema: false,
        };
      } catch (error) {
        return { ok: false, error: serializeError(error, "migrate", sourceKey, "migration-failure") };
      }
    }

    try {
      const migratedData = runMigration(parsed, {
        sourceKey,
        raw: true,
        fromSchemaVersion: 0,
        toSchemaVersion: PERSISTENT_MEMORY_SCHEMA_VERSION,
        fromGameVersion: null,
        toGameVersion: gameVersion,
      }, candidateMigration);
      const migratedEnvelope = makeEnvelope({
        data: migratedData,
        gameVersion,
        savedAt: clock(),
        revision: 0,
      });
      return {
        ok: true,
        envelope: migratedEnvelope,
        data: migratedData,
        extras: Object.create(null),
        migrated: true,
        futureSchema: false,
      };
    } catch (error) {
      return { ok: false, error: serializeError(error, "migrate", sourceKey, "migration-failure") };
    }
  }

  function inspectPrimaryForConflict() {
    const read = safeStorage.read(key);
    if (!read.ok || read.value === null) return { read, envelope: null };
    const parsed = parseStrictEnvelope(read.value);
    return { read, envelope: parsed.ok ? parsed.envelope : null, parsed };
  }

  function writePayload(payload, options = {}) {
    if (destroyed) {
      const error = recordError(new Error("Store has been destroyed"), "write", key, "store-destroyed");
      return { ok: false, error };
    }
    if (!isJsonSafe(payload)) {
      const error = recordError(
        new TypeError("Persistent data must contain only finite JSON values"),
        "validate",
        key,
        "invalid-data",
      );
      return { ok: false, error };
    }
    if (writeLockedByFutureSchema && !options.allowFutureOverwrite && !options.force) {
      const error = recordError(
        new Error("A save from a newer schema is loaded; refusing to overwrite it"),
        "write",
        key,
        "future-schema-write-blocked",
      );
      return { ok: false, error };
    }

    diagnostics.status = "saving";
    const incoming = cloneJson(payload);
    const conflict = inspectPrimaryForConflict();
    if (!conflict.read.ok) {
      const error = recordError(conflict.read.error, "read", key);
      return { ok: false, error };
    }
    if (conflict.read.value !== null && conflict.parsed && !conflict.parsed.ok && !options.force) {
      const error = recordError(
        conflict.parsed.error || new Error("Stored save is malformed"),
        "write",
        key,
        "corrupt-primary-write-blocked",
      );
      return { ok: false, error };
    }

    let baseEnvelope = currentEnvelope;
    if (
      conflict.envelope
      && (!baseEnvelope || comparePersistentMemoryEnvelopes(conflict.envelope, baseEnvelope) > 0)
    ) {
      baseEnvelope = conflict.envelope;
      diagnostics.conflictAvoided += 1;
    }

    if (
      baseEnvelope?.schemaVersion > PERSISTENT_MEMORY_SCHEMA_VERSION
      && !options.allowFutureOverwrite
      && !options.force
    ) {
      writeLockedByFutureSchema = true;
      diagnostics.futureSchema = true;
      const error = recordError(
        new Error("Stored data uses a newer persistence schema"),
        "write",
        key,
        "future-schema-write-blocked",
      );
      return { ok: false, error };
    }

    const shouldMerge = options.merge ?? mergeOnSave;
    const data = shouldMerge && baseEnvelope
      ? deepMerge(baseEnvelope.data, incoming)
      : incoming;
    const extras = baseEnvelope ? envelopeExtras(baseEnvelope) : currentExtras;
    const baseRevision = Math.max(
      normalizeRevision(currentEnvelope?.revision),
      normalizeRevision(baseEnvelope?.revision),
    );
    const revision = baseRevision >= Number.MAX_SAFE_INTEGER
      ? Number.MAX_SAFE_INTEGER
      : baseRevision + 1;
    const savedAt = Math.max(clock(), normalizeTimestamp(baseEnvelope?.savedAt, 0) + 1);
    const nextEnvelope = makeEnvelope({
      data,
      gameVersion: options.gameVersion || gameVersion,
      savedAt,
      revision,
      extras,
    });

    if (!nextEnvelope.checksum) {
      const error = recordError(new Error("Could not checksum persistent data"), "checksum", key);
      return { ok: false, error };
    }

    let serialized;
    try {
      serialized = compactEnvelope(nextEnvelope);
    } catch (error) {
      const normalizedError = recordError(error, "serialize", key, "serialization-failure");
      return { ok: false, error: normalizedError };
    }

    const write = safeStorage.write(key, serialized);
    if (!write.ok) {
      const error = recordError(write.error, "write", key);
      return { ok: false, error };
    }

    currentEnvelope = nextEnvelope;
    currentData = cloneJson(data);
    currentExtras = envelopeExtras(nextEnvelope);
    writeLockedByFutureSchema = false;
    diagnostics.status = "saved";
    diagnostics.lastSavedAt = savedAt;
    diagnostics.revision = revision;
    diagnostics.error = null;
    diagnostics.sourceKey = key;
    diagnostics.futureSchema = false;
    emit("saved", { revision, savedAt });
    return {
      ok: true,
      data: cloneJson(data),
      envelope: cloneJson(nextEnvelope),
      revision,
      savedAt,
      error: null,
    };
  }

  function load(fallback = null, options = {}) {
    if (destroyed) {
      const error = recordError(new Error("Store has been destroyed"), "load", key, "store-destroyed");
      return { ok: false, found: false, data: fallback, error };
    }

    diagnostics.status = "loading";
    diagnostics.lastLoadedAt = clock();
    diagnostics.recovered = false;
    diagnostics.migrated = false;
    diagnostics.error = null;
    diagnostics.sourceKey = null;

    const candidates = [{ key, migrate: null }, ...normalizedLegacyKeys];
    let selected = null;
    let primaryState = "missing";
    let lastError = null;
    let encounteredInvalidCandidate = false;

    for (const candidate of candidates) {
      const read = safeStorage.read(candidate.key);
      if (!read.ok) {
        lastError = read.error;
        encounteredInvalidCandidate = true;
        if (candidate.key === key) primaryState = "unavailable";
        continue;
      }
      if (read.value === null) {
        if (candidate.key === key) primaryState = "missing";
        continue;
      }
      if (candidate.key === key) primaryState = "present";

      const parsed = parseCandidate(read.value, candidate.key, candidate.migrate);
      if (!parsed.ok) {
        lastError = parsed.error;
        encounteredInvalidCandidate = true;
        if (candidate.key === key) primaryState = "malformed";
        continue;
      }
      selected = { ...parsed, sourceKey: candidate.key };
      if (candidate.key === key) primaryState = "valid";
      break;
    }

    if (!selected) {
      currentEnvelope = null;
      currentData = isJsonSafe(fallback) ? cloneJson(fallback) : null;
      currentExtras = Object.create(null);
      writeLockedByFutureSchema = false;
      diagnostics.revision = 0;
      diagnostics.lastSavedAt = null;
      diagnostics.futureSchema = false;
      if (lastError) {
        diagnostics.status = "error";
        diagnostics.error = { ...lastError };
        emit("error", diagnostics.error);
      } else {
        diagnostics.status = "missing";
        emit("missing");
      }
      return {
        ok: !lastError,
        found: false,
        data: isJsonSafe(fallback) ? cloneJson(fallback) : null,
        envelope: null,
        sourceKey: null,
        migrated: false,
        recovered: false,
        futureSchema: false,
        error: lastError ? { ...lastError } : null,
      };
    }

    currentEnvelope = cloneJson(selected.envelope);
    currentData = cloneJson(selected.data);
    currentExtras = cloneJson(selected.extras);
    writeLockedByFutureSchema = selected.futureSchema;
    diagnostics.lastSavedAt = selected.envelope.savedAt;
    diagnostics.revision = selected.envelope.revision;
    diagnostics.sourceKey = selected.sourceKey;
    diagnostics.migrated = Boolean(selected.migrated || selected.sourceKey !== key);
    diagnostics.recovered = Boolean(encounteredInvalidCandidate || selected.sourceKey !== key);
    diagnostics.futureSchema = selected.futureSchema;
    diagnostics.error = lastError ? { ...lastError } : null;

    const shouldPersistMigration = options.persistMigrations ?? persistMigrations;
    const maySafelyPersist = selected.migrated
      && shouldPersistMigration
      && (selected.sourceKey === key || primaryState === "missing");
    let persistenceResult = null;
    if (maySafelyPersist) {
      persistenceResult = writePayload(selected.data, { merge: false, force: true });
    }

    diagnostics.migrated = Boolean(selected.migrated || selected.sourceKey !== key);
    diagnostics.recovered = Boolean(encounteredInvalidCandidate || selected.sourceKey !== key);
    if (!persistenceResult || persistenceResult.ok) {
      diagnostics.status = selected.futureSchema
        ? "future-schema"
        : diagnostics.recovered
          ? "recovered"
          : diagnostics.migrated
            ? "migrated"
            : "ready";
    }
    emit("loaded", {
      sourceKey: selected.sourceKey,
      migrated: diagnostics.migrated,
      recovered: diagnostics.recovered,
    });

    return {
      ok: true,
      found: true,
      data: cloneJson(currentData),
      envelope: cloneJson(currentEnvelope),
      sourceKey: selected.sourceKey,
      migrated: diagnostics.migrated,
      recovered: diagnostics.recovered,
      futureSchema: selected.futureSchema,
      error: diagnostics.error ? { ...diagnostics.error } : null,
      persistenceResult,
    };
  }

  function schedule(data, options = {}) {
    if (destroyed) {
      const error = recordError(new Error("Store has been destroyed"), "schedule", key, "store-destroyed");
      return { ok: false, scheduled: false, error };
    }
    if (!isJsonSafe(data)) {
      const error = recordError(
        new TypeError("Scheduled persistent data must be JSON-safe"),
        "validate",
        key,
        "invalid-data",
      );
      return { ok: false, scheduled: false, error };
    }

    if (pendingTimer !== null) {
      try {
        clearTimer(pendingTimer);
      } catch {
        // The replacement timer remains authoritative.
      }
    }
    pendingData = cloneJson(data);
    pendingOptions = { ...options };
    dueAt = clock() + delay;
    diagnostics.status = "scheduled";
    diagnostics.pending = true;
    diagnostics.dueAt = dueAt;

    if (delay === 0) return flush();
    try {
      pendingTimer = setTimer(() => {
        pendingTimer = null;
        flush();
      }, delay);
    } catch (error) {
      pendingTimer = null;
      const normalizedError = recordError(error, "schedule", key, "timer-failure");
      return { ok: false, scheduled: false, error: normalizedError };
    }
    emit("scheduled", { dueAt });
    return { ok: true, scheduled: true, dueAt, error: null };
  }

  function flush(data = undefined, options = undefined) {
    const hasExplicitData = arguments.length >= 1 && data !== undefined;
    if (hasExplicitData) {
      if (!isJsonSafe(data)) {
        const error = recordError(new TypeError("Persistent data must be JSON-safe"), "validate", key, "invalid-data");
        return { ok: false, error };
      }
      if (pendingTimer !== null) {
        try {
          clearTimer(pendingTimer);
        } catch {
          // Continue with the synchronous write.
        }
      }
      pendingTimer = null;
      pendingData = cloneJson(data);
      pendingOptions = { ...(options || {}) };
    }

    if (pendingData === null) {
      if (currentData === null) return { ok: true, saved: false, reason: "nothing-to-flush" };
      pendingData = cloneJson(currentData);
      pendingOptions = { ...(options || {}) };
    }

    const payload = pendingData;
    const saveOptions = pendingOptions || {};
    pendingData = null;
    pendingOptions = null;
    pendingTimer = null;
    dueAt = null;
    diagnostics.pending = false;
    diagnostics.dueAt = null;
    return writePayload(payload, saveOptions);
  }

  function save(data, options = {}) {
    return flush(data, options);
  }

  function cancel() {
    const hadPending = pendingData !== null || pendingTimer !== null;
    clearPending();
    if (hadPending) {
      diagnostics.status = currentEnvelope ? "ready" : "idle";
      emit("cancelled");
    }
    return hadPending;
  }

  function reset(keys = [key]) {
    const requestedKeys = Array.isArray(keys) ? keys : [keys];
    const scopedKeys = [...new Set(requestedKeys.filter((entry) => (
      typeof entry === "string" && entry.length > 0
    )))];
    cancel();

    const removed = [];
    const errors = [];
    for (const storageKey of scopedKeys) {
      const result = safeStorage.remove(storageKey);
      if (result.ok) removed.push(storageKey);
      else errors.push(result.error);
    }

    if (removed.includes(key)) {
      currentEnvelope = null;
      currentData = null;
      currentExtras = Object.create(null);
      writeLockedByFutureSchema = false;
      diagnostics.lastSavedAt = null;
      diagnostics.revision = 0;
      diagnostics.sourceKey = null;
      diagnostics.futureSchema = false;
    }
    diagnostics.error = errors.length ? errors[errors.length - 1] : null;
    diagnostics.status = errors.length ? "error" : "reset";
    emit("reset", { removed: [...removed], errors: errors.map((error) => ({ ...error })) });
    return { ok: errors.length === 0, removed, errors };
  }

  function acceptExternalEnvelope(envelope) {
    if (currentEnvelope && comparePersistentMemoryEnvelopes(envelope, currentEnvelope) <= 0) return false;

    if (pendingData !== null) {
      pendingData = (pendingOptions?.merge ?? mergeOnSave)
        ? deepMerge(envelope.data, pendingData)
        : pendingData;
      diagnostics.conflictAvoided += 1;
    }
    currentEnvelope = cloneJson(envelope);
    currentData = cloneJson(envelope.data);
    currentExtras = envelopeExtras(envelope);
    writeLockedByFutureSchema = envelope.schemaVersion > PERSISTENT_MEMORY_SCHEMA_VERSION;
    diagnostics.status = "external-update";
    diagnostics.lastLoadedAt = clock();
    diagnostics.lastSavedAt = envelope.savedAt;
    diagnostics.revision = envelope.revision;
    diagnostics.sourceKey = key;
    diagnostics.futureSchema = writeLockedByFutureSchema;
    diagnostics.externalUpdates += 1;
    diagnostics.error = null;

    const detail = {
      data: cloneJson(envelope.data),
      envelope: cloneJson(envelope),
    };
    if (typeof onExternalUpdate === "function") {
      try {
        onExternalUpdate(detail);
      } catch {
        // External observers do not own persistence control flow.
      }
    }
    emit("external-update", detail);
    return true;
  }

  function handleStorageEvent(event) {
    if (!event || event.key !== key || typeof event.newValue !== "string") return;
    if (event.storageArea && safeStorage.raw && event.storageArea !== safeStorage.raw) return;
    const parsed = parseStrictEnvelope(event.newValue);
    if (parsed.ok) acceptExternalEnvelope(parsed.envelope);
  }

  function handlePageHide() {
    if (pendingData !== null) flush();
  }

  function handleVisibilityChange() {
    if (eventTarget?.document?.visibilityState === "hidden" && pendingData !== null) flush();
  }

  if (subscribeToStorageEvents && eventTarget && typeof eventTarget.addEventListener === "function") {
    try {
      eventTarget.addEventListener("storage", handleStorageEvent);
    } catch {
      // Storage-event syncing is an optional enhancement.
    }
  }
  if (flushOnPageHide && eventTarget && typeof eventTarget.addEventListener === "function") {
    try {
      eventTarget.addEventListener("pagehide", handlePageHide);
      eventTarget.addEventListener("visibilitychange", handleVisibilityChange);
    } catch {
      // The debounced timer still provides persistence.
    }
  }

  return Object.freeze({
    key,
    schemaVersion: PERSISTENT_MEMORY_SCHEMA_VERSION,
    load,
    save,
    schedule,
    flush,
    cancel,
    reset,
    getSnapshot() {
      return currentData === null ? null : cloneJson(currentData);
    },
    getEnvelope() {
      return currentEnvelope === null ? null : cloneJson(currentEnvelope);
    },
    getDiagnostics: snapshotDiagnostics,
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("subscribe requires a function");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy({ flush: shouldFlush = true } = {}) {
      if (destroyed) return;
      if (shouldFlush && pendingData !== null) flush();
      else clearPending();
      destroyed = true;
      if (eventTarget && typeof eventTarget.removeEventListener === "function") {
        try {
          eventTarget.removeEventListener("storage", handleStorageEvent);
          eventTarget.removeEventListener("pagehide", handlePageHide);
          eventTarget.removeEventListener("visibilitychange", handleVisibilityChange);
        } catch {
          // Destruction remains complete even for non-DOM event targets.
        }
      }
      listeners.clear();
      diagnostics.status = "destroyed";
    },
  });
}
