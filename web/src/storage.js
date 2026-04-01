import {
  createPresetFromVoice,
  normalizeStoredUserPreset,
  restoreVoiceState,
  serializePresetState,
  serializeVoiceState,
} from "./model.js";

const USER_PRESETS_KEY = "ersatz-bessel:user-presets:v1";
const SESSION_KEY = "ersatz-bessel:session:v1";

export function loadUserPresets() {
  const payload = readJson(USER_PRESETS_KEY);
  const presets = Array.isArray(payload?.presets) ? payload.presets : [];

  return presets
    .map((preset) => normalizeStoredUserPreset(preset))
    .filter(Boolean)
    .sort(sortUserPresets);
}

export function persistUserPresets(userPresets) {
  writeJson(USER_PRESETS_KEY, {
    version: 1,
    presets: userPresets.map((preset) => serializePresetState(preset)),
  });
}

export function createUserPresetSnapshot(voice, name, existingPreset = null) {
  const timestamp = Date.now();

  return createPresetFromVoice(voice, {
    id: existingPreset?.id ?? timestamp,
    name,
    source: "user",
    createdAt: existingPreset?.createdAt ?? timestamp,
    updatedAt: timestamp,
  });
}

export function loadSessionState() {
  const payload = readJson(SESSION_KEY);
  const voices = Array.isArray(payload?.voices)
    ? payload.voices.map((voice) => restoreVoiceState(voice)).filter(Boolean)
    : [];

  if (!voices.length) {
    return null;
  }

  const activeVoiceId = Number(payload?.activeVoiceId);
  const tempo = Number(payload?.tempo);

  return {
    running: false,
    tempo: Number.isFinite(tempo) ? tempo : 118,
    activeVoiceId,
    voices,
  };
}

export function persistSessionState(state) {
  writeJson(SESSION_KEY, {
    version: 1,
    tempo: state.tempo,
    activeVoiceId: state.activeVoiceId,
    voices: state.voices.map((voice) => serializeVoiceState(voice)),
  });
}

function sortUserPresets(left, right) {
  const leftUpdated = left.updatedAt ?? 0;
  const rightUpdated = right.updatedAt ?? 0;

  if (leftUpdated !== rightUpdated) {
    return rightUpdated - leftUpdated;
  }

  return left.name.localeCompare(right.name, "de", { sensitivity: "base" });
}

function readJson(key) {
  if (!hasStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  if (!hasStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota and privacy-mode issues. The app remains usable without persistence.
  }
}

function hasStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}
