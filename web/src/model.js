const ROOTS = [
  [2.4048, 5.5201, 8.6537, 11.7915],
  [3.8317, 7.0156, 10.1735, 13.3237],
  [5.1356, 8.4172, 11.6198, 14.7959],
  [6.3802, 9.761, 13.0152, 16.2235],
];
const MAX_MODAL_FREQUENCY_FACTOR = 8;

const DEFAULT_NOISE_ENV = {
  domainMs: 1000,
  points: [
    { time: 0, value: 0.89, curve: 0 },
    { time: 0.78, value: 0, curve: -0.845 },
  ],
};

const DEFAULT_PRESET_VALUES = {
  tuning: 440,
  size: 0.5,
  hitPosition: 0.5,
  damping: 0.5,
  overtones: 0.52,
  pitchEnvCurve: 0,
  pitchEnvDurMs: 50,
  pitchEnvRange: 0,
  nzEnvDurMs: 50,
  tempo: 118,
  masterGain: 0.72,
};

export async function loadPresets() {
  const response = await fetch(`${import.meta.env.BASE_URL}data/presets.json`);

  if (!response.ok) {
    throw new Error(`Preset-Datei konnte nicht geladen werden: ${response.status}`);
  }

  const json = await response.json();
  const slots = json.pattrstorage?.slots ?? {};

  return Object.entries(slots)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([slotId, slot]) =>
      normalizePresetDefinition({
        id: Number(slotId),
        name: `Preset ${slotId}`,
        source: "factory",
        data: slot?.data ?? {},
      }),
    );
}

export function cloneState(state) {
  return {
    ...state,
    clickShape: [...state.clickShape],
    amps: [...state.amps],
    noiseEnvelope: {
      domainMs: state.noiseEnvelope.domainMs,
      points: state.noiseEnvelope.points.map((point) => ({ ...point })),
    },
  };
}

export function createPresetFromVoice(voice, metadata = {}) {
  const timestamp = Date.now();

  return normalizePresetDefinition({
    id: metadata.id ?? timestamp,
    name: metadata.name ?? voice.presetName ?? `User Preset ${timestamp}`,
    source: metadata.source ?? "user",
    createdAt: metadata.createdAt ?? timestamp,
    updatedAt: metadata.updatedAt ?? timestamp,
    data: voice,
  });
}

export function normalizeStoredUserPreset(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  return normalizePresetDefinition({
    id: raw.id ?? Date.now(),
    name: raw.name ?? "User Preset",
    source: "user",
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? raw.createdAt ?? null,
    data: raw,
  });
}

export function restoreVoiceState(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const normalizedState = normalizeVoicePayload(raw);
  const voiceId = Number(raw.voiceId);

  return {
    ...normalizedState,
    voiceId: Number.isFinite(voiceId) && voiceId > 0 ? voiceId : 1,
    presetId: normalizePresetId(raw.presetId),
    presetName: sanitizeName(raw.presetName, "Session Voice"),
    presetSource: normalizePresetSource(raw.presetSource),
    muted: Boolean(raw.muted),
  };
}

export function serializePresetState(preset) {
  const normalized = normalizePresetDefinition({
    id: preset.id,
    name: preset.name,
    source: "user",
    createdAt: preset.createdAt ?? null,
    updatedAt: preset.updatedAt ?? null,
    data: preset,
  });

  return {
    id: normalized.id,
    name: normalized.name,
    source: normalized.source,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    ...serializeVoicePayload(normalized),
  };
}

export function serializeVoiceState(voice) {
  const restoredVoice = restoreVoiceState(voice);

  return {
    voiceId: restoredVoice?.voiceId ?? 1,
    presetId: restoredVoice?.presetId ?? null,
    presetName: restoredVoice?.presetName ?? "Session Voice",
    presetSource: restoredVoice?.presetSource ?? "factory",
    muted: Boolean(restoredVoice?.muted),
    ...serializeVoicePayload(restoredVoice ?? {}),
  };
}

export function computeModalData(state, sampleRate = 44100) {
  const sizeRadians = Math.max(state.size * Math.PI * 2, 0.00001);
  const frequencies = [];
  const weights = [];
  const qCoefficients = [];

  ROOTS.forEach((alphas, order) => {
    alphas.forEach((alpha) => {
      const rawWeight = besselj(order, alpha * state.hitPosition);
      const weight = scale(rawWeight, 0, 1, state.overtones, 1, state.damping);
      const frequency = clamp(alpha * state.tuning / sizeRadians, 20, sampleRate / MAX_MODAL_FREQUENCY_FACTOR);

      frequencies.push(frequency);
      weights.push(weight);
      qCoefficients.push(weightToQ(weight));
    });
  });

  return {
    frequencies,
    weights,
    qCoefficients,
  };
}

export function formatValue(key, value) {
  switch (key) {
    case "tuning":
      return `${value.toFixed(1)} Hz`;
    case "size":
    case "hitPosition":
    case "damping":
    case "overtones":
    case "masterGain":
      return value.toFixed(3);
    case "tempo":
      return `${Math.round(value)} BPM`;
    case "pitchEnvDurMs":
    case "nzEnvDurMs":
      return `${value.toFixed(1)} ms`;
    case "pitchEnvRange":
      return `${value.toFixed(1)} st`;
    case "pitchEnvCurve":
      return value.toFixed(3);
    default:
      return `${value}`;
  }
}

export function curveTransfer(value, curve) {
  const x = clamp(value, 0, 1);
  const shapedCurve = clamp(curve, -0.999, 0.999);

  if (Math.abs(shapedCurve) < 0.0001) {
    return x;
  }

  const amount = shapedCurve * 6;
  const denominator = Math.exp(amount) - 1;

  if (Math.abs(denominator) < 0.000001) {
    return x;
  }

  return clamp((Math.exp(amount * x) - 1) / denominator, 0, 1);
}

export function evaluateEnvelope(points, phase) {
  if (!points.length) {
    return 0;
  }

  const x = clamp(phase, 0, 1);
  const sorted = [...points].sort((a, b) => a.time - b.time);

  if (x <= sorted[0].time) {
    return sorted[0].value;
  }

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index];
    const end = sorted[index + 1];

    if (x <= end.time) {
      const span = Math.max(end.time - start.time, 0.000001);
      const local = (x - start.time) / span;
      const shaped = curveTransfer(local, end.curve ?? 0);
      return lerp(start.value, end.value, shaped);
    }
  }

  return sorted.at(-1).value;
}

export function summarizeFrequencies(frequencies) {
  if (!frequencies.length) {
    return "Keine Daten";
  }

  const min = Math.min(...frequencies);
  const max = Math.max(...frequencies);
  return `${min.toFixed(1)} Hz → ${max.toFixed(1)} Hz`;
}

export function summarizeWeights(weights) {
  if (!weights.length) {
    return "Keine Daten";
  }

  const min = Math.min(...weights);
  const max = Math.max(...weights);
  return `${min.toFixed(3)} → ${max.toFixed(3)}`;
}

export function normalizeEnvelopePoints(points) {
  const sorted = [...points]
    .map((point) => ({
      time: clamp(point.time, 0, 1),
      value: clamp(point.value, 0, 1),
      curve: clamp(point.curve ?? 0, -1, 1),
    }))
    .sort((a, b) => a.time - b.time);

  if (!sorted.length) {
    return DEFAULT_NOISE_ENV.points.map((point) => ({ ...point }));
  }

  sorted[0].time = 0;
  sorted.at(-1).time = Math.max(sorted.at(-1).time, sorted[0].time + 0.05);
  sorted.at(-1).time = clamp(sorted.at(-1).time, 0, 1);

  return sorted;
}

function normalizePresetDefinition({ id, name, source = "factory", createdAt = null, updatedAt = null, data = {} }) {
  return {
    id: normalizePresetId(id) ?? Date.now(),
    name: sanitizeName(name, `Preset ${id}`),
    source: normalizePresetSource(source),
    createdAt: normalizeTimestamp(createdAt),
    updatedAt: normalizeTimestamp(updatedAt),
    ...normalizeVoicePayload(data),
  };
}

function parseNoiseEnvelope(raw = []) {
  if (raw && typeof raw === "object" && !Array.isArray(raw) && Array.isArray(raw.points)) {
    return {
      domainMs: Math.max(readScalar(raw.domainMs, DEFAULT_NOISE_ENV.domainMs), 1),
      points: normalizeEnvelopePoints(raw.points),
    };
  }

  if (!Array.isArray(raw) || raw.length < 8) {
    return {
      domainMs: DEFAULT_NOISE_ENV.domainMs,
      points: DEFAULT_NOISE_ENV.points.map((point) => ({ ...point })),
    };
  }

  const domainMs = Number(raw[0]) || 1000;
  const points = [];

  for (let index = 3; index < raw.length - 1; index += 4) {
    points.push({
      time: clamp((Number(raw[index]) || 0) / domainMs, 0, 1),
      value: clamp(Number(raw[index + 1]) || 0, 0, 1),
      curve: clamp(Number(raw[index + 3]) || 0, -1, 1),
    });
  }

  return {
    domainMs,
    points: normalizeEnvelopePoints(points),
  };
}

function ensureLength(values, length, fallback) {
  const source = Array.isArray(values) ? values : [];
  const output = Array.from({ length }, (_, index) => clamp(source[index] ?? fallback, 0, 1));
  return output;
}

function normalizeVoicePayload(raw = {}) {
  return {
    tuning: readScalar(raw.tuning, DEFAULT_PRESET_VALUES.tuning),
    size: clamp(readScalar(raw.size, DEFAULT_PRESET_VALUES.size), 0.05, 1),
    hitPosition: clamp(readScalar(raw.hitPosition ?? raw.hit_pos, DEFAULT_PRESET_VALUES.hitPosition), 0, 1),
    damping: clamp(readScalar(raw.damping, DEFAULT_PRESET_VALUES.damping), 0, 1),
    overtones: clamp(readScalar(raw.overtones, DEFAULT_PRESET_VALUES.overtones), 0, 1),
    clickShape: ensureLength(raw.clickShape ?? raw.click_shape, 64, 0.5),
    amps: ensureLength(raw.amps, 16, 0.6),
    noiseEnvelope: parseNoiseEnvelope(raw.noiseEnvelope ?? raw.noiz_env),
    pitchEnvCurve: clamp(
      readScalar(raw.pitchEnvCurve ?? raw.pitch_env_curve, DEFAULT_PRESET_VALUES.pitchEnvCurve),
      -1,
      1,
    ),
    pitchEnvDurMs: clamp(
      readScalar(raw.pitchEnvDurMs ?? raw.pitch_env_dur, DEFAULT_PRESET_VALUES.pitchEnvDurMs),
      0,
      500,
    ),
    pitchEnvRange: clamp(
      readScalar(raw.pitchEnvRange ?? raw.pitch_env_range, DEFAULT_PRESET_VALUES.pitchEnvRange),
      -24,
      24,
    ),
    nzEnvDurMs: clamp(
      readScalar(raw.nzEnvDurMs ?? raw.nz_env_dur, DEFAULT_PRESET_VALUES.nzEnvDurMs),
      0,
      220,
    ),
    tempo: DEFAULT_PRESET_VALUES.tempo,
    masterGain: clamp(readScalar(raw.masterGain, DEFAULT_PRESET_VALUES.masterGain), 0.2, 1.4),
    running: false,
  };
}

function serializeVoicePayload(raw = {}) {
  const normalizedState = normalizeVoicePayload(raw);

  return {
    tuning: normalizedState.tuning,
    size: normalizedState.size,
    hitPosition: normalizedState.hitPosition,
    damping: normalizedState.damping,
    overtones: normalizedState.overtones,
    clickShape: [...normalizedState.clickShape],
    amps: [...normalizedState.amps],
    noiseEnvelope: {
      domainMs: normalizedState.noiseEnvelope.domainMs,
      points: normalizedState.noiseEnvelope.points.map((point) => ({ ...point })),
    },
    pitchEnvCurve: normalizedState.pitchEnvCurve,
    pitchEnvDurMs: normalizedState.pitchEnvDurMs,
    pitchEnvRange: normalizedState.pitchEnvRange,
    nzEnvDurMs: normalizedState.nzEnvDurMs,
    masterGain: normalizedState.masterGain,
  };
}

function readScalar(value, fallback) {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (candidate === null || candidate === undefined || candidate === "") {
    return fallback;
  }

  const numeric = Number(candidate);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizePresetId(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizePresetSource(source) {
  return source === "user" ? "user" : source === "detached" ? "detached" : "factory";
}

function normalizeTimestamp(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function sanitizeName(value, fallback) {
  const sanitized = typeof value === "string" ? value.trim().slice(0, 48) : "";
  return sanitized || fallback;
}

function weightToQ(weight) {
  const scaled = Math.max(weight * 100, 0.0001);
  return clamp(1 / scaled, 0.0001, 2);
}

function besselj(order, x) {
  if (order === 0) {
    let sum = 0;
    let term = 1;
    let k = 0;

    do {
      term = ((-1) ** k * (x / 2) ** (2 * k)) / (factorial(k) * factorial(k));
      sum += term;
      k += 1;
    } while (Math.abs(term) > 1e-8 && k < 20);

    return sum;
  }

  if (order === 1) {
    let sum = 0;
    let term = 1;
    let k = 0;

    do {
      term = ((-1) ** k * (x / 2) ** (2 * k + 1)) / (factorial(k) * factorial(k + 1));
      sum += term;
      k += 1;
    } while (Math.abs(term) > 1e-8 && k < 20);

    return sum;
  }

  if (x === 0) {
    return 0;
  }

  return ((2 * (order - 1)) / x) * besselj(order - 1, x) - besselj(order - 2, x);
}

function factorial(number) {
  if (number <= 1) {
    return 1;
  }

  return number * factorial(number - 1);
}

function scale(value, inLow, inHigh, outLow, outHigh, exponent) {
  const normalized = (value - inLow) / (inHigh - inLow);

  if (normalized === 0) {
    return outLow;
  }

  if (normalized > 0) {
    return outLow + (outHigh - outLow) * normalized ** exponent;
  }

  return outLow + (outHigh - outLow) * -(Math.abs(normalized) ** exponent);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}
