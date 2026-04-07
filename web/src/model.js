import {
  normalizeAmpMode,
  normalizeAmpPatternSource,
  normalizeRhythmMode,
} from "./amp-patterns.js";

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

export const FIXED_MASTER_GAIN = 1;
const DEFAULT_VOICE_TYPE = "perc";

const DEFAULT_MASTER_BUS_STATE = {
  enabled: true,
  enableLowBand: true,
  enableMidBand: true,
  enableHighBand: true,
  enableLimiter: true,
  mode: "balanced",
};

const DEFAULT_PRESET_VALUES = {
  tuning: 440,
  size: 0.5,
  hitPosition: 0.5,
  damping: 0.5,
  overtones: 0.52,
  lowEndDecay: 1,
  percGlueAmount: 0.28,
  percGlueAttackMs: 10,
  percGlueReleaseMs: 180,
  pitchEnvCurve: 0,
  pitchEnvDurMs: 50,
  pitchEnvRange: 0,
  noiseLevel: 1,
  nzEnvDurMs: 50,
  tempo: 118,
  masterGain: FIXED_MASTER_GAIN,
};

const DEFAULT_KICK_VALUES = {
  kickBodyFreqHz: 52,
  kickBodyDecayMs: 360,
  kickPitchDropSt: 11,
  kickPitchDropMs: 48,
  kickClickLevel: 0.16,
  kickClickDecayMs: 12,
  kickNoiseLevel: 0.04,
  kickNoiseDecayMs: 36,
  kickDrive: 0.14,
  kickTone: 0.58,
};

const DEFAULT_SUB_BASS_VALUES = {
  subBassFreqHz: 43,
  subBassAttackMs: 6,
  subBassDecayMs: 520,
  subBassWaveMix: 0.2,
  subBassSubLevel: 0.66,
  subBassDrive: 0.12,
  subBassTone: 0.34,
};

const DEFAULT_STEP_RANDOMIZATION_VALUES = {
  randomizeKickClickLevelPerStep: false,
  randomizeKickClickDecayMsPerStep: false,
  randomizeClickShapePerStep: false,
  randomizeNzEnvDurMsPerStep: false,
  randomizeSubBassDrivePerStep: false,
  randomizeSubBassDecayMsPerStep: false,
  randomizeSubBassWaveMixPerStep: false,
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
        data: {
          voices: [slot?.data ?? {}],
          tempo: slot?.data?.tempo ?? slot?.data?.bpm ?? null,
        },
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

export function createDefaultMasterBusState() {
  return {
    ...DEFAULT_MASTER_BUS_STATE,
  };
}

export function normalizeMasterBusState(raw = {}) {
  return {
    enabled: readBoolean(raw.enabled, DEFAULT_MASTER_BUS_STATE.enabled),
    enableLowBand: readBoolean(raw.enableLowBand, DEFAULT_MASTER_BUS_STATE.enableLowBand),
    enableMidBand: readBoolean(raw.enableMidBand, DEFAULT_MASTER_BUS_STATE.enableMidBand),
    enableHighBand: readBoolean(raw.enableHighBand, DEFAULT_MASTER_BUS_STATE.enableHighBand),
    enableLimiter: readBoolean(raw.enableLimiter, DEFAULT_MASTER_BUS_STATE.enableLimiter),
    mode: normalizeMasterBusMode(raw.mode),
  };
}

export function serializeMasterBusState(state) {
  return {
    ...normalizeMasterBusState(state),
  };
}

export function normalizeMasterBusMode(value) {
  return ["balanced", "aggressive", "punch", "smooth", "glue", "air"].includes(value)
    ? value
    : DEFAULT_MASTER_BUS_STATE.mode;
}

export function createPresetFromVoice(voice, metadata = {}) {
  return createPresetFromVoices([voice], metadata);
}

export function createPresetFromVoices(voices, metadata = {}) {
  const timestamp = Date.now();

  return normalizePresetDefinition({
    id: metadata.id ?? timestamp,
    name: metadata.name ?? voices[0]?.presetName ?? `Preset ${timestamp}`,
    source: metadata.source ?? "user",
    createdAt: metadata.createdAt ?? timestamp,
    updatedAt: metadata.updatedAt ?? timestamp,
    data: {
      voices,
      tempo: metadata.tempo ?? null,
      masterBusMode: metadata.masterBusMode ?? null,
      stepRandomizationChance: metadata.stepRandomizationChance ?? null,
    },
  });
}

export function normalizeStoredUserPreset(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  return normalizePresetDefinition({
    id: raw.id ?? Date.now(),
    name: raw.name ?? "Preset",
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
    solo: Boolean(raw.solo),
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

  const serializedPreset = {
    id: normalized.id,
    name: normalized.name,
    source: normalized.source,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    voices: normalized.voices.map((voice) => serializeVoicePayload(voice)),
  };

  if (normalized.tempo !== null) {
    serializedPreset.tempo = normalized.tempo;
  }

  if (normalized.masterBusMode) {
    serializedPreset.masterBusMode = normalized.masterBusMode;
  }

  if (normalized.stepRandomizationChance !== null) {
    serializedPreset.stepRandomizationChance = normalized.stepRandomizationChance;
  }

  return serializedPreset;
}

export function serializeVoiceState(voice) {
  const restoredVoice = restoreVoiceState(voice);

  return {
    voiceId: restoredVoice?.voiceId ?? 1,
    presetId: restoredVoice?.presetId ?? null,
    presetName: restoredVoice?.presetName ?? "Session Voice",
    presetSource: restoredVoice?.presetSource ?? "factory",
    muted: Boolean(restoredVoice?.muted),
    solo: Boolean(restoredVoice?.solo),
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

export function computeVoiceAnalysis(state, sampleRate = 44100) {
  const voiceType = normalizeVoiceType(state.voiceType);

  if (voiceType === "kick") {
    const peakFrequency = clamp(
      state.kickBodyFreqHz * 2 ** (state.kickPitchDropSt / 12),
      20,
      sampleRate / 2,
    );

    return {
      type: "kick",
      frequencies: [state.kickBodyFreqHz, peakFrequency],
      weights: [state.kickClickLevel, state.kickNoiseLevel, state.kickDrive, state.kickTone],
    };
  }

  if (voiceType === "subbass") {
    return {
      type: "subbass",
      frequencies: [
        state.subBassFreqHz,
        clamp(state.subBassFreqHz * 2, 20, sampleRate / 2),
        computeSubBassToneCutoff(state.subBassTone, sampleRate),
      ],
      weights: [state.subBassSubLevel, state.subBassWaveMix, state.subBassDrive, state.subBassTone],
    };
  }

  return {
    type: "perc",
    ...computeModalData(state, sampleRate),
  };
}

export function formatValue(key, value) {
  switch (key) {
    case "tuning":
    case "kickBodyFreqHz":
    case "subBassFreqHz":
      return `${value.toFixed(1)} Hz`;
    case "size":
    case "hitPosition":
    case "damping":
    case "overtones":
    case "lowEndDecay":
    case "percGlueAmount":
    case "noiseLevel":
    case "kickClickLevel":
    case "kickNoiseLevel":
    case "kickDrive":
    case "kickTone":
    case "subBassWaveMix":
    case "subBassSubLevel":
    case "subBassDrive":
    case "subBassTone":
    case "masterGain":
      return value.toFixed(3);
    case "tempo":
      return `${Math.round(value)} BPM`;
    case "pitchEnvDurMs":
    case "nzEnvDurMs":
    case "percGlueAttackMs":
    case "percGlueReleaseMs":
    case "kickBodyDecayMs":
    case "kickPitchDropMs":
    case "kickClickDecayMs":
    case "kickNoiseDecayMs":
    case "subBassAttackMs":
    case "subBassDecayMs":
      return `${value.toFixed(1)} ms`;
    case "pitchEnvRange":
    case "kickPitchDropSt":
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
  const voices = normalizePresetVoices(data);
  const primaryVoice = voices[0] ?? normalizeVoicePayload(data);
  const tempo = normalizePresetTempo(data?.tempo ?? data?.bpm);
  const masterBusMode = normalizePresetMasterBusMode(data?.masterBusMode ?? data?.masterBus?.mode);
  const stepRandomizationChance = normalizePresetStepRandomizationChance(
    data?.stepRandomizationChance ?? data?.step_randomization_chance,
  );

  return {
    id: normalizePresetId(id) ?? Date.now(),
    name: sanitizeName(name, `Preset ${id}`),
    source: normalizePresetSource(source),
    createdAt: normalizeTimestamp(createdAt),
    updatedAt: normalizeTimestamp(updatedAt),
    voices,
    ...primaryVoice,
    tempo,
    masterBusMode,
    stepRandomizationChance,
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

function normalizePresetVoices(raw = {}) {
  const rawVoices =
    raw && typeof raw === "object" && Array.isArray(raw.voices) && raw.voices.length ? raw.voices : [raw];

  return rawVoices.map((voice) => normalizeVoicePayload(voice));
}

function normalizeVoicePayload(raw = {}) {
  return {
    voiceType: normalizeVoiceType(raw.voiceType ?? raw.voice_type),
    ampPatternSource: normalizeAmpPatternSource(raw.ampPatternSource ?? raw.amp_pattern_source),
    ampMode: normalizeAmpMode(raw.ampMode ?? raw.amp_mode),
    rhythmMode: normalizeRhythmMode(raw.rhythmMode ?? raw.legacyRhythm ?? raw.legacy_rhythm ?? raw.rhythm),
    tuning: readScalar(raw.tuning, DEFAULT_PRESET_VALUES.tuning),
    size: clamp(readScalar(raw.size, DEFAULT_PRESET_VALUES.size), 0.05, 1),
    hitPosition: clamp(readScalar(raw.hitPosition ?? raw.hit_pos, DEFAULT_PRESET_VALUES.hitPosition), 0, 1),
    damping: clamp(readScalar(raw.damping, DEFAULT_PRESET_VALUES.damping), 0, 1),
    overtones: clamp(readScalar(raw.overtones, DEFAULT_PRESET_VALUES.overtones), 0, 1),
    lowEndDecay: clamp(
      readScalar(
        raw.lowEndDecay ?? raw.low_end_decay ?? raw.lowEndDecayScale ?? raw.low_end_decay_scale,
        DEFAULT_PRESET_VALUES.lowEndDecay,
      ),
      0.25,
      2,
    ),
    percGlueAmount: clamp(
      readScalar(
        raw.percGlueAmount ?? raw.perc_glue_amount ?? raw.glueAmount ?? raw.glue_amount,
        DEFAULT_PRESET_VALUES.percGlueAmount,
      ),
      0,
      1,
    ),
    percGlueAttackMs: clamp(
      readScalar(
        raw.percGlueAttackMs ?? raw.perc_glue_attack_ms ?? raw.glueAttackMs ?? raw.glue_attack_ms,
        DEFAULT_PRESET_VALUES.percGlueAttackMs,
      ),
      0.5,
      80,
    ),
    percGlueReleaseMs: clamp(
      readScalar(
        raw.percGlueReleaseMs ?? raw.perc_glue_release_ms ?? raw.glueReleaseMs ?? raw.glue_release_ms,
        DEFAULT_PRESET_VALUES.percGlueReleaseMs,
      ),
      20,
      800,
    ),
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
      -2,
      24,
    ),
    noiseLevel: clamp(
      readScalar(raw.noiseLevel ?? raw.noise_level, DEFAULT_PRESET_VALUES.noiseLevel),
      0,
      1,
    ),
    nzEnvDurMs: clamp(
      readScalar(raw.nzEnvDurMs ?? raw.nz_env_dur, DEFAULT_PRESET_VALUES.nzEnvDurMs),
      0,
      220,
    ),
    kickBodyFreqHz: clamp(readScalar(raw.kickBodyFreqHz, DEFAULT_KICK_VALUES.kickBodyFreqHz), 28, 120),
    kickBodyDecayMs: clamp(readScalar(raw.kickBodyDecayMs, DEFAULT_KICK_VALUES.kickBodyDecayMs), 60, 2000),
    kickPitchDropSt: clamp(readScalar(raw.kickPitchDropSt, DEFAULT_KICK_VALUES.kickPitchDropSt), 0, 24),
    kickPitchDropMs: clamp(readScalar(raw.kickPitchDropMs, DEFAULT_KICK_VALUES.kickPitchDropMs), 0, 250),
    kickClickLevel: clamp(readScalar(raw.kickClickLevel, DEFAULT_KICK_VALUES.kickClickLevel), 0, 1),
    kickClickDecayMs: clamp(
      readScalar(raw.kickClickDecayMs, DEFAULT_KICK_VALUES.kickClickDecayMs),
      1,
      80,
    ),
    kickNoiseLevel: clamp(readScalar(raw.kickNoiseLevel, DEFAULT_KICK_VALUES.kickNoiseLevel), 0, 1),
    kickNoiseDecayMs: clamp(
      readScalar(raw.kickNoiseDecayMs, DEFAULT_KICK_VALUES.kickNoiseDecayMs),
      1,
      220,
    ),
    kickDrive: clamp(readScalar(raw.kickDrive, DEFAULT_KICK_VALUES.kickDrive), 0, 1),
    kickTone: clamp(readScalar(raw.kickTone, DEFAULT_KICK_VALUES.kickTone), 0, 1),
    subBassFreqHz: clamp(
      readScalar(raw.subBassFreqHz ?? raw.sub_bass_freq_hz, DEFAULT_SUB_BASS_VALUES.subBassFreqHz),
      28,
      90,
    ),
    subBassAttackMs: clamp(
      readScalar(raw.subBassAttackMs ?? raw.sub_bass_attack_ms, DEFAULT_SUB_BASS_VALUES.subBassAttackMs),
      0,
      120,
    ),
    subBassDecayMs: clamp(
      readScalar(raw.subBassDecayMs ?? raw.sub_bass_decay_ms, DEFAULT_SUB_BASS_VALUES.subBassDecayMs),
      80,
      2400,
    ),
    subBassWaveMix: clamp(
      readScalar(raw.subBassWaveMix ?? raw.sub_bass_wave_mix, DEFAULT_SUB_BASS_VALUES.subBassWaveMix),
      0,
      1,
    ),
    subBassSubLevel: clamp(
      readScalar(raw.subBassSubLevel ?? raw.sub_bass_sub_level, DEFAULT_SUB_BASS_VALUES.subBassSubLevel),
      0,
      1,
    ),
    subBassDrive: clamp(
      readScalar(raw.subBassDrive ?? raw.sub_bass_drive, DEFAULT_SUB_BASS_VALUES.subBassDrive),
      0,
      1,
    ),
    subBassTone: clamp(
      readScalar(raw.subBassTone ?? raw.sub_bass_tone, DEFAULT_SUB_BASS_VALUES.subBassTone),
      0,
      1,
    ),
    randomizeKickClickLevelPerStep: readBoolean(
      raw.randomizeKickClickLevelPerStep ?? raw.randomize_kick_click_level_per_step,
      DEFAULT_STEP_RANDOMIZATION_VALUES.randomizeKickClickLevelPerStep,
    ),
    randomizeKickClickDecayMsPerStep: readBoolean(
      raw.randomizeKickClickDecayMsPerStep ?? raw.randomize_kick_click_decay_ms_per_step,
      DEFAULT_STEP_RANDOMIZATION_VALUES.randomizeKickClickDecayMsPerStep,
    ),
    randomizeClickShapePerStep: readBoolean(
      raw.randomizeClickShapePerStep ?? raw.randomize_click_shape_per_step,
      DEFAULT_STEP_RANDOMIZATION_VALUES.randomizeClickShapePerStep,
    ),
    randomizeNzEnvDurMsPerStep: readBoolean(
      raw.randomizeNzEnvDurMsPerStep ?? raw.randomize_nz_env_dur_ms_per_step,
      DEFAULT_STEP_RANDOMIZATION_VALUES.randomizeNzEnvDurMsPerStep,
    ),
    randomizeSubBassDrivePerStep: readBoolean(
      raw.randomizeSubBassDrivePerStep ?? raw.randomize_sub_bass_drive_per_step,
      DEFAULT_STEP_RANDOMIZATION_VALUES.randomizeSubBassDrivePerStep,
    ),
    randomizeSubBassDecayMsPerStep: readBoolean(
      raw.randomizeSubBassDecayMsPerStep ?? raw.randomize_sub_bass_decay_ms_per_step,
      DEFAULT_STEP_RANDOMIZATION_VALUES.randomizeSubBassDecayMsPerStep,
    ),
    randomizeSubBassWaveMixPerStep: readBoolean(
      raw.randomizeSubBassWaveMixPerStep ?? raw.randomize_sub_bass_wave_mix_per_step,
      DEFAULT_STEP_RANDOMIZATION_VALUES.randomizeSubBassWaveMixPerStep,
    ),
    tempo: DEFAULT_PRESET_VALUES.tempo,
    masterGain: clamp(readScalar(raw.masterGain, DEFAULT_PRESET_VALUES.masterGain), 0, 1.4),
    running: false,
  };
}

function serializeVoicePayload(raw = {}) {
  const normalizedState = normalizeVoicePayload(raw);

  return {
    voiceType: normalizedState.voiceType,
    ampPatternSource: normalizedState.ampPatternSource,
    ampMode: normalizedState.ampMode,
    rhythmMode: normalizedState.rhythmMode,
    tuning: normalizedState.tuning,
    size: normalizedState.size,
    hitPosition: normalizedState.hitPosition,
    damping: normalizedState.damping,
    overtones: normalizedState.overtones,
    lowEndDecay: normalizedState.lowEndDecay,
    percGlueAmount: normalizedState.percGlueAmount,
    percGlueAttackMs: normalizedState.percGlueAttackMs,
    percGlueReleaseMs: normalizedState.percGlueReleaseMs,
    clickShape: [...normalizedState.clickShape],
    amps: [...normalizedState.amps],
    noiseEnvelope: {
      domainMs: normalizedState.noiseEnvelope.domainMs,
      points: normalizedState.noiseEnvelope.points.map((point) => ({ ...point })),
    },
    pitchEnvCurve: normalizedState.pitchEnvCurve,
    pitchEnvDurMs: normalizedState.pitchEnvDurMs,
    pitchEnvRange: normalizedState.pitchEnvRange,
    noiseLevel: normalizedState.noiseLevel,
    nzEnvDurMs: normalizedState.nzEnvDurMs,
    kickBodyFreqHz: normalizedState.kickBodyFreqHz,
    kickBodyDecayMs: normalizedState.kickBodyDecayMs,
    kickPitchDropSt: normalizedState.kickPitchDropSt,
    kickPitchDropMs: normalizedState.kickPitchDropMs,
    kickClickLevel: normalizedState.kickClickLevel,
    kickClickDecayMs: normalizedState.kickClickDecayMs,
    kickNoiseLevel: normalizedState.kickNoiseLevel,
    kickNoiseDecayMs: normalizedState.kickNoiseDecayMs,
    kickDrive: normalizedState.kickDrive,
    kickTone: normalizedState.kickTone,
    subBassFreqHz: normalizedState.subBassFreqHz,
    subBassAttackMs: normalizedState.subBassAttackMs,
    subBassDecayMs: normalizedState.subBassDecayMs,
    subBassWaveMix: normalizedState.subBassWaveMix,
    subBassSubLevel: normalizedState.subBassSubLevel,
    subBassDrive: normalizedState.subBassDrive,
    subBassTone: normalizedState.subBassTone,
    randomizeKickClickLevelPerStep: normalizedState.randomizeKickClickLevelPerStep,
    randomizeKickClickDecayMsPerStep: normalizedState.randomizeKickClickDecayMsPerStep,
    randomizeClickShapePerStep: normalizedState.randomizeClickShapePerStep,
    randomizeNzEnvDurMsPerStep: normalizedState.randomizeNzEnvDurMsPerStep,
    randomizeSubBassDrivePerStep: normalizedState.randomizeSubBassDrivePerStep,
    randomizeSubBassDecayMsPerStep: normalizedState.randomizeSubBassDecayMsPerStep,
    randomizeSubBassWaveMixPerStep: normalizedState.randomizeSubBassWaveMixPerStep,
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

function readBoolean(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === 1 || value === "1" || value === "true") {
    return true;
  }

  if (value === 0 || value === "0" || value === "false") {
    return false;
  }

  return fallback;
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

function normalizeVoiceType(value) {
  if (value === "kick") {
    return "kick";
  }

  if (value === "subbass" || value === "sub-bass") {
    return "subbass";
  }

  return DEFAULT_VOICE_TYPE;
}

function computeSubBassToneCutoff(tone, sampleRate) {
  return clamp(80 + tone ** 1.5 * 3200, 40, sampleRate / 2);
}

function normalizeTimestamp(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function normalizePresetTempo(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function normalizePresetMasterBusMode(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return normalizeMasterBusMode(value);
}

function normalizePresetStepRandomizationChance(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? clamp(numeric, 0, 100) : null;
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
