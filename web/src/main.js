import {
  cloneState,
  computeVoiceAnalysis,
  createDefaultMasterBusState,
  formatValue,
  loadPresets,
  restoreVoiceState,
  summarizeFrequencies,
  summarizeWeights,
} from "./model.js";
import {
  AMP_PATTERN_SOURCE_OPTIONS,
  PATTERN_MODE_OPTIONS,
  applyPatternModeValue,
  createAmpPattern,
  describePatternSelection,
  getPatternModeValue,
  normalizeAmpMode,
  normalizeAmpPatternSource,
  normalizeRhythmMode,
  shouldUseClassicWebPattern,
} from "./amp-patterns.js";
import { BesselAudioEngine } from "./audio-engine.js";
import { MultiSlider } from "./ui/multislider.js";
import { EnvelopeEditor } from "./ui/envelope-editor.js";
import {
  createUserPresetSnapshot,
  loadSessionState,
  loadUserPresets,
  persistSessionState,
  persistUserPresets,
} from "./storage.js";

const engine = new BesselAudioEngine();

const elements = {
  presetSelect: document.querySelector("#preset-select"),
  presetNameInput: document.querySelector("#preset-name-input"),
  loadPresetButton: document.querySelector("#load-preset-button"),
  savePresetButton: document.querySelector("#save-preset-button"),
  updatePresetButton: document.querySelector("#update-preset-button"),
  deletePresetButton: document.querySelector("#delete-preset-button"),
  presetStateLine: document.querySelector("#preset-state-line"),
  randomTempoButton: document.querySelector("#random-tempo-button"),
  startButton: document.querySelector("#start-button"),
  triggerButton: document.querySelector("#trigger-button"),
  initStateButton: document.querySelector("#init-state-button"),
  addVoiceButton: document.querySelector("#add-voice-button"),
  tempoInput: document.querySelector("#tempo-input"),
  tempoOutput: document.querySelector("#tempo-output"),
  statusLine: document.querySelector("#status-line"),
  stepGrid: document.querySelector("#step-grid"),
  headerVoiceList: document.querySelector("#header-voice-list"),
  voiceList: document.querySelector("#voice-list"),
  masterBusModeSelect: document.querySelector("#master-bus-mode-select"),
  masterBusModeNote: document.querySelector("#master-bus-mode-note"),
  masterBusControls: document.querySelector("#master-bus-controls"),
  masterBusMeters: document.querySelector("#master-bus-meters"),
  masterBandReadouts: document.querySelector("#master-band-readouts"),
  masterBusStatus: document.querySelector("#master-bus-status"),
  analysisVoiceLabel: document.querySelector("#analysis-voice-label"),
  freqCanvas: document.querySelector("#freq-canvas"),
  weightCanvas: document.querySelector("#weight-canvas"),
  scopeCanvas: document.querySelector("#scope-canvas"),
  freqSummary: document.querySelector("#freq-summary"),
  weightSummary: document.querySelector("#weight-summary"),
  scopeSummary: document.querySelector("#scope-summary"),
};

const tempoDefinition = { key: "tempo", label: "Tempo", min: 48, max: 192, step: 1 };

const MASTER_BUS_TOGGLE_DEFINITIONS = [
  {
    key: "enabled",
    label: "Master Bus",
    description: "Globaler Bypass fuer die komplette Output-Chain.",
  },
  {
    key: "enableLowBand",
    label: "Low Band",
    description: "Messbasiert gesetzte Kompression fuer den Bassbereich.",
  },
  {
    key: "enableMidBand",
    label: "Mid Band",
    description: "Messbasiert gesetzte Kompression fuer Mitten und Body.",
  },
  {
    key: "enableHighBand",
    label: "High Band",
    description: "Messbasiert gesetzte Kompression fuer Hoehen und Transienten.",
  },
  {
    key: "enableLimiter",
    label: "Limiter",
    description: "Safety-Ceiling am Ausgang des Master-Busses.",
  },
];

const MASTER_BUS_MODE_DEFINITIONS = [
  {
    key: "balanced",
    label: "Balanced",
    description: "Neutraler Auto-Setup mit moderater Verdichtung ueber alle drei Baender.",
  },
  {
    key: "aggressive",
    label: "Aggressive",
    description: "Dichter, schneller und mit mehr erlaubter Gain-Reduction.",
  },
  {
    key: "punch",
    label: "Punch",
    description: "Langsamere Attacks und hoehere Thresholds fuer mehr Anschlag.",
  },
  {
    key: "smooth",
    label: "Smooth",
    description: "Weniger Transienten, weicheres Einfangen und ruhigeres Sustain.",
  },
  {
    key: "glue",
    label: "Glue",
    description: "Leichte Verdichtung, damit sich die Layer unauffaellig zusammenschieben.",
  },
  {
    key: "air",
    label: "Air Keep",
    description: "Low und Mid werden gefuehrt, das High-Band bleibt offener.",
  },
];

const MASTER_BUS_METER_DEFINITIONS = [
  { key: "inputPeakDb", label: "In Peak", format: "db" },
  { key: "inputRmsDb", label: "In RMS", format: "db" },
  { key: "lowGainReductionDb", label: "Low GR", format: "gr" },
  { key: "midGainReductionDb", label: "Mid GR", format: "gr" },
  { key: "highGainReductionDb", label: "High GR", format: "gr" },
  { key: "makeupGainDb", label: "Limiter Makeup", format: "signedDb" },
  { key: "limiterGainReductionDb", label: "Limiter GR", format: "gr" },
  { key: "outputPeakDb", label: "Out Peak", format: "db" },
  { key: "outputRmsDb", label: "Out RMS", format: "db" },
];

const MASTER_BAND_DEFINITIONS = [
  { key: "low", label: "Low Band", subtitle: "< 120 Hz" },
  { key: "mid", label: "Mid Band", subtitle: "120 Hz - 3.2 kHz" },
  { key: "high", label: "High Band", subtitle: "> 3.2 kHz" },
];

const MASTER_BAND_METRIC_DEFINITIONS = [
  { key: "thresholdDb", label: "Threshold", format: "db" },
  { key: "detectionDb", label: "Detect", format: "db" },
  { key: "attackMs", label: "Attack", format: "ms" },
  { key: "releaseMs", label: "Release", format: "ms" },
  { key: "crestDb", label: "Crest", format: "db" },
  { key: "gainReductionDb", label: "GR", format: "gr" },
];

const percVoiceScalarDefinitions = [
  { key: "tuning", label: "Tuning", min: 20, max: 12000, step: 1, transform: "log" },
  { key: "size", label: "Size", min: 0.05, max: 1, step: 0.001 },
  { key: "hitPosition", label: "Hit Position", min: 0, max: 1, step: 0.001 },
  { key: "damping", label: "Damping", min: 0, max: 1, step: 0.001 },
  { key: "overtones", label: "Overtones", min: 0, max: 1, step: 0.001 },
  { key: "pitchEnvDurMs", label: "Pitch Env Dur", min: 0, max: 500, step: 1 },
  { key: "pitchEnvRange", label: "Pitch Env Range", min: -24, max: 24, step: 0.1 },
  { key: "pitchEnvCurve", label: "Pitch Env Curve", min: -1, max: 1, step: 0.001 },
  { key: "noiseLevel", label: "Noise Volume", min: 0, max: 1, step: 0.001 },
  { key: "nzEnvDurMs", label: "Noise Dur", min: 0, max: 220, step: 0.1 },
  { key: "masterGain", label: "Master Gain", min: 0, max: 1.4, step: 0.001 },
];

const kickVoiceScalarDefinitions = [
  { key: "kickBodyFreqHz", label: "Body Freq", min: 28, max: 120, step: 0.1 },
  { key: "kickBodyDecayMs", label: "Body Decay", min: 60, max: 2000, step: 1 },
  { key: "kickPitchDropSt", label: "Pitch Drop", min: 0, max: 24, step: 0.1 },
  { key: "kickPitchDropMs", label: "Pitch Drop Dur", min: 0, max: 250, step: 1 },
  { key: "kickClickLevel", label: "Click Level", min: 0, max: 1, step: 0.001 },
  { key: "kickClickDecayMs", label: "Click Decay", min: 1, max: 80, step: 0.1 },
  { key: "kickNoiseLevel", label: "Noise Level", min: 0, max: 1, step: 0.001 },
  { key: "kickNoiseDecayMs", label: "Noise Decay", min: 1, max: 220, step: 0.1 },
  { key: "kickDrive", label: "Drive", min: 0, max: 1, step: 0.001 },
  { key: "kickTone", label: "Tone", min: 0, max: 1, step: 0.001 },
  { key: "masterGain", label: "Master Gain", min: 0, max: 1.4, step: 0.001 },
];

const subBassVoiceScalarDefinitions = [
  { key: "subBassFreqHz", label: "Fundamental", min: 28, max: 90, step: 0.1 },
  { key: "subBassAttackMs", label: "Attack", min: 0, max: 120, step: 0.1 },
  { key: "subBassDecayMs", label: "Decay", min: 80, max: 2400, step: 1 },
  { key: "subBassWaveMix", label: "Wave Mix", min: 0, max: 1, step: 0.001 },
  { key: "subBassSubLevel", label: "Sub Level", min: 0, max: 1, step: 0.001 },
  { key: "subBassDrive", label: "Drive", min: 0, max: 1, step: 0.001 },
  { key: "subBassTone", label: "Tone", min: 0, max: 1, step: 0.001 },
  { key: "masterGain", label: "Master Gain", min: 0, max: 1.4, step: 0.001 },
];

const voiceStepRandomizationDefinitions = {
  perc: [
    { key: "randomizeClickShapePerStep", label: "Click Shape" },
    { key: "randomizeNzEnvDurMsPerStep", label: "Noise Dur" },
  ],
  kick: [
    { key: "randomizeKickClickLevelPerStep", label: "Click Level" },
    { key: "randomizeKickClickDecayMsPerStep", label: "Click Decay" },
  ],
  subbass: [
    { key: "randomizeSubBassDrivePerStep", label: "Drive" },
    { key: "randomizeSubBassDecayMsPerStep", label: "Decay" },
    { key: "randomizeSubBassWaveMixPerStep", label: "Wave Mix" },
  ],
};

let presets = [];
let factoryPresets = [];
let userPresets = [];
let appState = null;
let voiceViews = new Map();
let headerVoiceViews = new Map();
let analyserBuffer = null;
let nextVoiceId = 1;
let masterMeterOutputs = new Map();
let masterBandMetricOutputs = new Map();
let lastMasterMetrics = null;
let masterBusMeasurementTimer = null;
const MASTER_BUS_MEASUREMENT_DEBOUNCE_MS = 260;

bootstrap().catch((error) => {
  console.error(error);
  setStatus(`Initialisierung fehlgeschlagen: ${error.message}`);
});

async function bootstrap() {
  buildStepGrid();
  const presetWarnings = [];
  const [factoryPresetResult, userPresetResult] = await Promise.allSettled([
    loadPresets(),
    loadUserPresets(),
  ]);

  if (factoryPresetResult.status === "fulfilled") {
    factoryPresets = factoryPresetResult.value;
  } else {
    console.error(factoryPresetResult.reason);
    presetWarnings.push("Factory-Presets konnten nicht geladen werden.");
  }

  if (userPresetResult.status === "fulfilled") {
    userPresets = userPresetResult.value;
  } else {
    console.error(userPresetResult.reason);
    presetWarnings.push("User-Presets konnten nicht geladen werden.");
  }

  rebuildPresetCatalog();

  const { state, restoredSession } = buildInitialAppState();
  appState = state;
  nextVoiceId = appState.voices.reduce((maxVoiceId, voice) => Math.max(maxVoiceId, voice.voiceId), 0) + 1;

  buildMasterBusModeSelect();
  buildMasterBusControls();
  buildMasterBusMeters();
  buildMasterBandReadouts();
  wireGlobalActions();
  renderVoiceCards();
  renderMasterBusControls();
  renderMasterBusMeters();
  renderMasterBandReadouts();

  engine.onStep = ({ stepIndex, amplitudes, randomizedVoices }) => {
    updateStepGrid(stepIndex, amplitudes);
    applyStepRandomizedVoiceUpdates(randomizedVoices);
  };
  engine.onMasterMeter = (metrics) => {
    lastMasterMetrics = metrics;
    renderMasterBusMeters(metrics);
    renderMasterBandReadouts(metrics);
    renderMasterBusStatus(metrics);
  };

  refreshTransportControls();
  syncAll({ resetTransport: true });
  renderScopeLoop();

  if (restoredSession) {
    setStatus("Letzte Session wiederhergestellt. Alle Voices starten stumm, Audio bleibt bis zum naechsten Start gestoppt.");
  } else if (presetWarnings.length) {
    setStatus(`${presetWarnings.join(" ")} Audio bleibt nutzbar.`);
  }
}

function createVoiceFromState(state, overrides = {}) {
  const voice = cloneState(state);
  voice.voiceId = overrides.voiceId ?? nextVoiceId++;
  voice.presetId = overrides.presetId ?? null;
  voice.presetName = overrides.presetName ?? voice.presetName;
  voice.presetSource = overrides.presetSource ?? voice.presetSource ?? "detached";
  voice.muted = overrides.muted ?? Boolean(voice.muted);
  voice.solo = overrides.solo ?? Boolean(voice.solo);
  return voice;
}

function createVoiceClone(sourceVoice) {
  return createVoiceFromState(sourceVoice, {
    muted: false,
    solo: false,
    presetId: sourceVoice.presetId,
    presetName: sourceVoice.presetName,
    presetSource: sourceVoice.presetSource,
  });
}

function createInitStateVoice() {
  const voice = createVoiceFromState(
    restoreVoiceState({
      voiceType: "perc",
      presetId: null,
      presetName: "Init State",
      presetSource: "detached",
      muted: true,
      solo: false,
    }),
    {
      muted: true,
      solo: false,
      presetId: null,
      presetName: "Init State",
      presetSource: "detached",
    },
  );

  randomizePercVoiceState(voice);
  return voice;
}

function createVoiceFromPreset(preset, overrides = {}) {
  const presetVoice = getPresetVoiceStates(preset)[0] ?? preset;
  return createVoiceFromState(presetVoice, {
    ...overrides,
    muted: true,
    solo: false,
    presetId: preset.id,
    presetName: preset.name,
    presetSource: preset.source ?? "factory",
  });
}

function createVoicesFromPreset(preset) {
  return getPresetVoiceStates(preset).map((presetVoice) =>
    createVoiceFromState(presetVoice, {
      muted: true,
      solo: false,
      presetId: preset.id,
      presetName: preset.name,
      presetSource: preset.source ?? "factory",
    }),
  );
}

function getPresetVoiceStates(preset) {
  if (Array.isArray(preset?.voices) && preset.voices.length) {
    return preset.voices;
  }

  return preset ? [preset] : [];
}

function buildInitialAppState() {
  const restoredSession = loadSessionState();

  if (restoredSession?.voices.length) {
    const restoredVoices = restoredSession.voices.map((voice) =>
      syncVoicePresetMetadata({
        ...voice,
        muted: true,
        solo: false,
      }),
    );
    const activeVoiceExists = restoredVoices.some((voice) => voice.voiceId === restoredSession.activeVoiceId);

    return {
      restoredSession: true,
      state: {
        running: false,
        tempo: restoredSession.tempo,
        activeVoiceId: activeVoiceExists ? restoredSession.activeVoiceId : restoredVoices[0].voiceId,
        voices: restoredVoices,
        masterBus: restoredSession.masterBus ?? createDefaultMasterBusState(),
      },
    };
  }

  const firstVoice = createVoiceFromState(
    restoreVoiceState({
      voiceId: 1,
      presetId: null,
      presetName: "Layer Stack",
      presetSource: "detached",
    }),
    {
      voiceId: 1,
      presetId: null,
      presetName: "Layer Stack",
      presetSource: "detached",
      muted: false,
      solo: false,
    },
  );

  return {
    restoredSession: false,
    state: {
      running: false,
      tempo: 118,
      activeVoiceId: firstVoice.voiceId,
      voices: [firstVoice],
      masterBus: createDefaultMasterBusState(),
    },
  };
}

function rebuildPresetCatalog() {
  presets = [...userPresets, ...factoryPresets];
}

function findPresetById(presetId) {
  return presets.find((preset) => preset.id === presetId) ?? null;
}

function findUserPresetById(presetId) {
  return userPresets.find((preset) => preset.id === presetId) ?? null;
}

function findUserPresetByName(presetName) {
  const normalizedName = normalizePresetNameInput(presetName);

  if (!normalizedName) {
    return null;
  }

  return userPresets.find((preset) => normalizePresetNameInput(preset.name) === normalizedName) ?? null;
}

function syncVoicePresetMetadata(voice) {
  const preset = findPresetById(voice.presetId);

  if (preset) {
    voice.presetId = preset.id;
    voice.presetName = preset.name;
    voice.presetSource = preset.source;
    return voice;
  }

  voice.presetId = null;
  voice.presetName = voice.presetName || "Lokaler Stand";
  voice.presetSource = "detached";
  return voice;
}

function getVoiceById(voiceId) {
  return appState.voices.find((voice) => voice.voiceId === voiceId) ?? null;
}

function getVoiceIndexById(voiceId) {
  return appState.voices.findIndex((voice) => voice.voiceId === voiceId);
}

function getActiveVoice() {
  return getVoiceById(appState.activeVoiceId) ?? appState.voices[0] ?? null;
}

function hasSoloVoices() {
  return appState?.voices.some((voice) => voice.solo) ?? false;
}

function isVoiceAudible(voice) {
  if (!voice) {
    return false;
  }

  if (voice.muted) {
    return false;
  }

  return !hasSoloVoices() || Boolean(voice.solo);
}

function getVoicePlaybackStateLabel(voice) {
  if (voice.muted && voice.solo) {
    return "Muted + Solo";
  }

  if (voice.muted) {
    return "Muted";
  }

  if (hasSoloVoices() && !voice.solo) {
    return "Solo-Bypass";
  }

  if (voice.solo) {
    return "Solo";
  }

  return "Aktiv";
}

function buildMasterBusControls() {
  elements.masterBusControls.textContent = "";

  MASTER_BUS_TOGGLE_DEFINITIONS.forEach((definition) => {
    const label = document.createElement("label");
    label.className = "master-toggle";
    label.dataset.masterBusKey = definition.key;

    const titleRow = document.createElement("div");
    titleRow.className = "master-toggle-title";

    const title = document.createElement("span");
    title.textContent = definition.label;

    const indicator = document.createElement("span");
    indicator.className = "master-toggle-indicator";
    indicator.dataset.masterBusIndicator = definition.key;

    titleRow.append(title, indicator);

    const description = document.createElement("p");
    description.className = "master-toggle-description";
    description.textContent = definition.description;

    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.masterBusKey = definition.key;
    input.setAttribute("aria-label", definition.label);

    label.append(titleRow, description, input);
    elements.masterBusControls.append(label);
  });
}

function buildMasterBusModeSelect() {
  elements.masterBusModeSelect.textContent = "";

  MASTER_BUS_MODE_DEFINITIONS.forEach((definition) => {
    const option = document.createElement("option");
    option.value = definition.key;
    option.textContent = definition.label;
    elements.masterBusModeSelect.append(option);
  });
}

function buildMasterBusMeters() {
  elements.masterBusMeters.textContent = "";
  masterMeterOutputs = new Map();

  MASTER_BUS_METER_DEFINITIONS.forEach((definition) => {
    const card = document.createElement("article");
    card.className = "master-meter-card";

    const label = document.createElement("span");
    label.className = "master-meter-label";
    label.textContent = definition.label;

    const value = document.createElement("output");
    value.className = "master-meter-value";
    value.textContent = "—";

    card.append(label, value);
    elements.masterBusMeters.append(card);
    masterMeterOutputs.set(definition.key, value);
  });
}

function buildMasterBandReadouts() {
  elements.masterBandReadouts.textContent = "";
  masterBandMetricOutputs = new Map();

  MASTER_BAND_DEFINITIONS.forEach((bandDefinition) => {
    const card = document.createElement("article");
    card.className = "master-band-card";

    const head = document.createElement("div");
    head.className = "master-band-head";

    const title = document.createElement("span");
    title.className = "master-band-title";
    title.textContent = bandDefinition.label;

    const subtitle = document.createElement("span");
    subtitle.className = "master-band-subtitle";
    subtitle.textContent = bandDefinition.subtitle;

    head.append(title, subtitle);

    const metrics = document.createElement("div");
    metrics.className = "master-band-metrics";

    const outputs = new Map();

    MASTER_BAND_METRIC_DEFINITIONS.forEach((metricDefinition) => {
      const metric = document.createElement("div");
      metric.className = "master-band-metric";

      const label = document.createElement("span");
      label.className = "master-band-metric-label";
      label.textContent = metricDefinition.label;

      const value = document.createElement("output");
      value.className = "master-band-metric-value";
      value.textContent = "—";

      metric.append(label, value);
      metrics.append(metric);
      outputs.set(metricDefinition.key, value);
    });

    card.append(head, metrics);
    elements.masterBandReadouts.append(card);
    masterBandMetricOutputs.set(bandDefinition.key, outputs);
  });
}

function renderMasterBusControls() {
  const masterBusMode = appState?.masterBus?.mode ?? "balanced";

  MASTER_BUS_TOGGLE_DEFINITIONS.forEach((definition) => {
    const label = elements.masterBusControls.querySelector(`[data-master-bus-key="${definition.key}"]`);
    const input = elements.masterBusControls.querySelector(`input[data-master-bus-key="${definition.key}"]`);
    const indicator = elements.masterBusControls.querySelector(`[data-master-bus-indicator="${definition.key}"]`);
    const enabled = Boolean(appState?.masterBus?.[definition.key]);

    if (!(label instanceof HTMLElement) || !(input instanceof HTMLInputElement) || !(indicator instanceof HTMLElement)) {
      return;
    }

    input.checked = enabled;
    indicator.textContent = enabled ? "On" : "Off";
    label.classList.toggle("is-enabled", enabled);
    label.classList.toggle("is-disabled", !enabled);
  });

  if (elements.masterBusModeSelect instanceof HTMLSelectElement) {
    elements.masterBusModeSelect.value = masterBusMode;
  }

  if (elements.masterBusModeNote instanceof HTMLElement) {
    elements.masterBusModeNote.textContent = getMasterBusModeDescription(masterBusMode);
  }

  renderMasterBusStatus(lastMasterMetrics);
}

function renderMasterBusMeters(metrics = null) {
  MASTER_BUS_METER_DEFINITIONS.forEach((definition) => {
    const output = masterMeterOutputs.get(definition.key);

    if (!(output instanceof HTMLOutputElement || output instanceof HTMLElement)) {
      return;
    }

    output.textContent = formatMasterMeterValue(definition.format, metrics?.[definition.key]);
  });
}

function renderMasterBandReadouts(metrics = null) {
  MASTER_BAND_DEFINITIONS.forEach((bandDefinition) => {
    const outputs = masterBandMetricOutputs.get(bandDefinition.key);
    const bandMetrics = metrics?.bands?.[bandDefinition.key] ?? null;

    if (!(outputs instanceof Map)) {
      return;
    }

    MASTER_BAND_METRIC_DEFINITIONS.forEach((metricDefinition) => {
      const output = outputs.get(metricDefinition.key);

      if (!(output instanceof HTMLOutputElement || output instanceof HTMLElement)) {
        return;
      }

      output.textContent = formatMasterMeterValue(metricDefinition.format, bandMetrics?.[metricDefinition.key]);
    });
  });
}

function formatMasterMeterValue(format, value) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  if (format === "signedDb") {
    return `${value >= 0 ? "+" : ""}${value.toFixed(1)} dB`;
  }

  if (format === "gr") {
    return `${Math.max(0, value).toFixed(1)} dB`;
  }

  if (format === "ms") {
    return `${value.toFixed(1)} ms`;
  }

  return `${value.toFixed(1)} dB`;
}

function getMasterBusToggleLabel(toggleKey) {
  return MASTER_BUS_TOGGLE_DEFINITIONS.find((definition) => definition.key === toggleKey)?.label ?? toggleKey;
}

function getMasterBusModeLabel(modeKey) {
  return MASTER_BUS_MODE_DEFINITIONS.find((definition) => definition.key === modeKey)?.label ?? modeKey;
}

function getMasterBusModeDescription(modeKey) {
  return (
    MASTER_BUS_MODE_DEFINITIONS.find((definition) => definition.key === modeKey)?.description ??
    MASTER_BUS_MODE_DEFINITIONS[0].description
  );
}

function renderMasterBusStatus(metrics = null) {
  if (!appState?.masterBus?.enabled) {
    elements.masterBusStatus.textContent = "Master Bus gebypasst. Das Signal laeuft direkt vom Synth zum Ausgang.";
    return;
  }

  const activeStages = MASTER_BUS_TOGGLE_DEFINITIONS
    .filter((definition) => definition.key !== "enabled" && appState.masterBus[definition.key])
    .map((definition) => definition.label);
  const measurement = metrics?.measurement ?? null;
  const modeLabel = getMasterBusModeLabel(appState.masterBus.mode);
  const stageSummary = activeStages.length
    ? `Aktiv: ${activeStages.join(", ")}.`
    : "Alle internen Stufen sind gebypasst.";

  if (measurement?.phase === "measuring") {
    const remainingSteps = Number.isFinite(measurement.remainingSteps) ? measurement.remainingSteps : null;
    elements.masterBusStatus.textContent = `Modus ${modeLabel} · misst gerade${remainingSteps !== null ? `, noch ca. ${remainingSteps} Steps` : ""}. ${stageSummary}`;
    return;
  }

  if (measurement?.phase === "armed") {
    elements.masterBusStatus.textContent = `Modus ${modeLabel} · wartet auf das naechste Signal fuer eine neue Messung. ${stageSummary}`;
    return;
  }

  if (measurement?.phase === "frozen") {
    const totalSteps = Number.isFinite(measurement.totalSteps) ? measurement.totalSteps : 16;
    elements.masterBusStatus.textContent = `Modus ${modeLabel} · Werte nach ${totalSteps} Steps eingefroren. ${stageSummary}`;
    return;
  }

  elements.masterBusStatus.textContent = `Modus ${modeLabel}. ${stageSummary}`;
}

function clearPendingMasterBusMeasurement() {
  if (masterBusMeasurementTimer !== null) {
    window.clearTimeout(masterBusMeasurementTimer);
    masterBusMeasurementTimer = null;
  }
}

function scheduleMasterBusMeasurement({ immediate = false } = {}) {
  clearPendingMasterBusMeasurement();

  if (immediate) {
    engine.requestMasterBusMeasurement();
    return;
  }

  masterBusMeasurementTimer = window.setTimeout(() => {
    masterBusMeasurementTimer = null;
    engine.requestMasterBusMeasurement();
  }, MASTER_BUS_MEASUREMENT_DEBOUNCE_MS);
}

function wireGlobalActions() {
  elements.masterBusModeSelect.addEventListener("change", () => {
    appState.masterBus.mode = elements.masterBusModeSelect.value;
    renderMasterBusControls();
    syncAll({ measureMasterBus: "immediate" });
    setStatus(`Master-Bus-Modus: ${getMasterBusModeLabel(appState.masterBus.mode)}.`);
  });

  elements.masterBusControls.addEventListener("change", (event) => {
    const input = event.target;

    if (!(input instanceof HTMLInputElement) || input.type !== "checkbox") {
      return;
    }

    const toggleKey = input.dataset.masterBusKey;

    if (!toggleKey || !(toggleKey in appState.masterBus)) {
      return;
    }

    appState.masterBus[toggleKey] = input.checked;
    renderMasterBusControls();
    syncAll({ measureMasterBus: "immediate" });
    setStatus(`Master-Bus: ${getMasterBusToggleLabel(toggleKey)} ${input.checked ? "aktiviert" : "deaktiviert"}.`);
  });

  elements.presetSelect.addEventListener("change", () => {
    refreshLoadPresetButton();
  });

  elements.loadPresetButton.addEventListener("click", () => {
    const presetId = getSelectedPresetId();

    if (presetId === null) {
      setStatus("Kein Preset zum Laden ausgewaehlt.");
      return;
    }

    loadPresetStack(presetId);
  });

  elements.savePresetButton.addEventListener("click", async () => {
    await saveStackAsUserPreset();
  });

  elements.updatePresetButton.addEventListener("click", async () => {
    await updateUserPresetFromStack();
  });

  elements.deletePresetButton.addEventListener("click", async () => {
    await deleteUserPresetFromStack();
  });

  elements.presetNameInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    const currentPreset = getCurrentPresetContext();

    if (currentPreset.presetSource === "user" && findUserPresetById(currentPreset.presetId)) {
      await updateUserPresetFromStack();
      return;
    }

    await saveStackAsUserPreset();
  });

  elements.randomTempoButton.addEventListener("click", () => {
    randomizeTempo();
  });

  elements.startButton.addEventListener("click", async () => {
    appState.running = !appState.running;

    if (appState.running) {
      await engine.start(appState);
      setStatus("Audio laeuft. Gemeinsamer Transport aktiv.");
    } else {
      engine.sync(appState, { resetTransport: false });
      setStatus("Transport gestoppt. Resonanzen klingen weiter aus.");
    }

    refreshTransportControls();
    persistSession();
  });

  elements.triggerButton.addEventListener("click", async () => {
    await engine.ensureReady();
    await engine.context.resume();
    engine.sync(appState);
    engine.trigger();
    setStatus("Einzelschlag fuer alle Voices ausgeloest.");
  });

  elements.initStateButton.addEventListener("click", () => {
    const newVoice = createInitStateVoice();
    appState.voices = [newVoice];
    appState.activeVoiceId = newVoice.voiceId;
    renderVoiceCards();
    syncAll({ measureMasterBus: "immediate" });
    setStatus("Init State geladen. Der Stack enthaelt jetzt genau eine stumme, randomisierte Perc-Voice.");
  });

  elements.addVoiceButton.addEventListener("click", () => {
    const sourceVoice = getActiveVoice() ?? appState.voices[0];
    const newVoice = createVoiceClone(sourceVoice);
    appState.voices.push(newVoice);
    setActiveVoice(newVoice.voiceId, { renderCards: false });
    renderVoiceCards();
    syncAll({ measureMasterBus: "immediate" });
    setStatus(`Voice ${appState.voices.length} hinzugefuegt.`);
  });

  elements.tempoInput.addEventListener("input", () => {
    appState.tempo = fromSliderValue(tempoDefinition, Number(elements.tempoInput.value));
    refreshTransportControls();
    syncAll();
  });
}

function refreshTransportControls() {
  elements.tempoInput.value = String(toSliderValue(tempoDefinition, appState.tempo));
  elements.tempoOutput.textContent = formatValue("tempo", appState.tempo);
  elements.startButton.textContent = appState.running ? "Stop" : "Start";
}

function randomizeTempo() {
  appState.tempo = randomizeScalarValue(tempoDefinition);
  refreshTransportControls();
  syncAll();
  setStatus(`BPM randomisiert: ${Math.round(appState.tempo)}.`);
}

function renderVoiceCards() {
  renderHeaderVoiceControls();
  voiceViews.forEach((view) => destroyVoiceView(view));
  voiceViews.clear();
  elements.voiceList.textContent = "";

  appState.voices.forEach((voice, index) => {
    const view = createVoiceCardShell(voice, index);
    elements.voiceList.append(view.root);
    initializeVoiceCard(view, voice.voiceId, index);
    voiceViews.set(voice.voiceId, view);
    refreshVoiceView(view);
  });

  refreshActiveVoiceStyles();
  refreshGlobalPresetControls();
}

function renderHeaderVoiceControls() {
  headerVoiceViews.clear();
  elements.headerVoiceList.textContent = "";

  appState.voices.forEach((voice) => {
    const root = document.createElement("div");
    root.className = "header-voice-chip";
    root.dataset.voiceId = String(voice.voiceId);

    const focusButton = document.createElement("button");
    focusButton.type = "button";
    focusButton.className = "header-voice-focus";

    const toggleGroup = document.createElement("div");
    toggleGroup.className = "header-voice-toggle-group";

    const muteButton = document.createElement("button");
    muteButton.type = "button";
    muteButton.className = "ghost header-voice-toggle header-voice-mute-toggle";
    muteButton.textContent = "M";

    const soloButton = document.createElement("button");
    soloButton.type = "button";
    soloButton.className = "ghost header-voice-toggle header-voice-solo-toggle";
    soloButton.textContent = "S";

    toggleGroup.append(muteButton, soloButton);
    root.append(focusButton, toggleGroup);
    elements.headerVoiceList.append(root);

    const view = { root, focusButton, muteButton, soloButton };
    headerVoiceViews.set(voice.voiceId, view);

    focusButton.addEventListener("click", () => {
      setActiveVoice(voice.voiceId);
    });

    muteButton.addEventListener("click", () => {
      toggleVoiceMute(voice.voiceId);
    });

    soloButton.addEventListener("click", () => {
      toggleVoiceSolo(voice.voiceId);
    });

    refreshHeaderVoiceControl(view);
  });
}

function refreshHeaderVoiceControl(view) {
  const voiceId = Number(view.root.dataset.voiceId);
  const voice = getVoiceById(voiceId);
  const voiceIndex = getVoiceIndexById(voiceId);

  if (!voice || voiceIndex === -1) {
    return;
  }

  const isActive = appState.activeVoiceId === voiceId;
  const soloActive = hasSoloVoices();

  view.focusButton.textContent = `V${voiceIndex + 1} ${getVoiceCompactLabel(voice.voiceType)}`;
  view.focusButton.title = `Voice ${voiceIndex + 1} fokussieren`;
  view.focusButton.classList.toggle("is-active", isActive);
  view.muteButton.classList.toggle("is-on", voice.muted);
  view.soloButton.classList.toggle("is-on", voice.solo);
  view.muteButton.setAttribute("aria-pressed", String(voice.muted));
  view.soloButton.setAttribute("aria-pressed", String(voice.solo));
  view.muteButton.title = voice.muted ? `Voice ${voiceIndex + 1} entmuten` : `Voice ${voiceIndex + 1} muten`;
  view.soloButton.title = voice.solo ? `Solo fuer Voice ${voiceIndex + 1} aus` : `Voice ${voiceIndex + 1} solo`;
  view.root.classList.toggle("is-active", isActive);
  view.root.classList.toggle("is-muted", voice.muted);
  view.root.classList.toggle("is-solo", voice.solo);
  view.root.classList.toggle("is-suppressed", soloActive && !voice.solo);
  view.root.classList.toggle("is-audible", isVoiceAudible(voice));
  view.root.title = `${getVoicePlaybackStateLabel(voice)} · ${getVoiceTypeLabel(voice.voiceType)}`;
}

function refreshHeaderVoiceControls() {
  headerVoiceViews.forEach((view) => {
    refreshHeaderVoiceControl(view);
  });
}

function createVoiceCardShell(voice, index) {
  const root = document.createElement("section");
  root.className = "voice-card";
  root.dataset.voiceId = String(voice.voiceId);
  root.innerHTML = `
    <div class="voice-card-head">
      <div class="voice-card-copy">
        <p class="eyebrow">Layer</p>
        <h2 class="voice-card-title"></h2>
        <p class="voice-state-line"></p>
      </div>
      <div class="button-row voice-actions">
        <button type="button" class="ghost voice-focus-button">Fokus</button>
        <button type="button" class="ghost voice-mute-button"></button>
        <button type="button" class="ghost voice-solo-button"></button>
        <button type="button" class="ghost voice-random-button">Random</button>
        ${appState.voices.length > 1 ? '<button type="button" class="ghost danger voice-remove-button">Entfernen</button>' : ""}
      </div>
    </div>

    <div class="voice-card-grid">
      <section class="voice-subpanel">
        <div class="panel-head voice-subhead">
          <div>
            <p class="eyebrow">Makro</p>
            <h3 class="voice-macro-title">Voice Settings</h3>
          </div>
          <label class="control compact">
            <span>Voice Type</span>
            <select class="voice-type-select">
              <option value="perc">Perc</option>
              <option value="kick">Kick</option>
              <option value="subbass">Sub-Bass</option>
            </select>
          </label>
        </div>
        <div class="controls-grid voice-scalar-controls"></div>
        <div class="voice-step-random-section">
          <div class="voice-step-random-head">
            <div>
              <p class="eyebrow">Per Step</p>
              <h3>Randomize</h3>
            </div>
            <p class="panel-note">Zieht pro Sequencer-Step neue Werte fuer die aktivierten Parameter.</p>
          </div>
          <div class="voice-step-random-controls"></div>
        </div>
      </section>

      <section class="voice-subpanel voice-click-panel">
        <div class="panel-head voice-subhead">
          <div>
            <p class="eyebrow">Click Buffer</p>
            <h3>Click Shape</h3>
          </div>
          <p class="panel-note">64 Samples pro Voice.</p>
        </div>
        <canvas class="editor-canvas compact-editor-canvas voice-click-canvas" width="960" height="220"></canvas>
      </section>

      <section class="voice-subpanel voice-envelope-panel">
        <div class="panel-head voice-subhead">
          <div>
            <p class="eyebrow">Noise Envelope</p>
            <h3>nz_env Function</h3>
          </div>
          <div class="button-row">
            <button type="button" class="ghost voice-add-point-button">Punkt +</button>
            <button type="button" class="ghost voice-remove-point-button">Punkt -</button>
          </div>
        </div>
        <canvas class="editor-canvas tall-editor-canvas voice-envelope-canvas" width="960" height="280"></canvas>
        <div class="controls-grid compact-grid">
          <label class="control">
            <span>Segment Curve</span>
            <input class="voice-segment-curve" type="range" min="-1" max="1" step="0.001" value="0" />
            <output class="voice-segment-curve-value">0.000</output>
          </label>
        </div>
      </section>

      <section class="voice-subpanel">
        <div class="panel-head voice-subhead">
          <div>
            <p class="eyebrow">Step Pattern</p>
            <h3>Pattern</h3>
          </div>
          <div class="button-row">
            <button type="button" class="ghost voice-pattern-refresh-button">Neu</button>
          </div>
        </div>
        <div class="controls-grid voice-pattern-controls">
          <label class="control">
            <span>Source</span>
            <select class="voice-pattern-source-select"></select>
          </label>
          <label class="control">
            <span>Mode</span>
            <select class="voice-pattern-mode-select"></select>
          </label>
        </div>
        <p class="panel-note">16 Trigger-Staerken. Rhythm liefert Vorlagen, danach bleibt der Slider frei editierbar.</p>
        <canvas class="editor-canvas compact-editor-canvas voice-amps-canvas" width="960" height="220"></canvas>
      </section>
    </div>
  `;

  return {
    root,
    title: root.querySelector(".voice-card-title"),
    focusButton: root.querySelector(".voice-focus-button"),
    randomButton: root.querySelector(".voice-random-button"),
    muteButton: root.querySelector(".voice-mute-button"),
    soloButton: root.querySelector(".voice-solo-button"),
    removeButton: root.querySelector(".voice-remove-button"),
    typeSelect: root.querySelector(".voice-type-select"),
    stateLine: root.querySelector(".voice-state-line"),
    macroTitle: root.querySelector(".voice-macro-title"),
    scalarControls: root.querySelector(".voice-scalar-controls"),
    stepRandomControls: root.querySelector(".voice-step-random-controls"),
    clickPanel: root.querySelector(".voice-click-panel"),
    envelopePanel: root.querySelector(".voice-envelope-panel"),
    clickCanvas: root.querySelector(".voice-click-canvas"),
    envelopeCanvas: root.querySelector(".voice-envelope-canvas"),
    ampsCanvas: root.querySelector(".voice-amps-canvas"),
    patternRefreshButton: root.querySelector(".voice-pattern-refresh-button"),
    patternSourceSelect: root.querySelector(".voice-pattern-source-select"),
    patternModeSelect: root.querySelector(".voice-pattern-mode-select"),
    addPointButton: root.querySelector(".voice-add-point-button"),
    removePointButton: root.querySelector(".voice-remove-point-button"),
    segmentCurve: root.querySelector(".voice-segment-curve"),
    segmentCurveValue: root.querySelector(".voice-segment-curve-value"),
    controlInputs: new Map(),
    controlOutputs: new Map(),
    stepRandomInputs: new Map(),
    currentScalarType: null,
    currentStepRandomType: null,
    clickSlider: null,
    ampsSlider: null,
    envelopeEditor: null,
  };
}

function initializeVoiceCard(view, voiceId, index) {
  populateSelectWithOptions(view.patternSourceSelect, AMP_PATTERN_SOURCE_OPTIONS);
  populatePatternModeSelect(view.patternModeSelect);
  rebuildVoiceScalarControls(view, voiceId, getVoiceById(voiceId)?.voiceType ?? "perc");
  rebuildVoiceStepRandomControls(view, voiceId, getVoiceById(voiceId)?.voiceType ?? "perc");

  view.clickSlider = new MultiSlider({
    canvas: view.clickCanvas,
    values: getVoiceById(voiceId).clickShape,
    fill: "#c57b57",
    onChange: (values) => {
      const voice = getVoiceById(voiceId);
      if (!voice) {
        return;
      }

      setActiveVoice(voiceId, { syncAnalysis: false });
      voice.clickShape = values;
      syncAll();
    },
  });

  view.ampsSlider = new MultiSlider({
    canvas: view.ampsCanvas,
    values: getVoiceById(voiceId).amps,
    fill: "#6ab1c7",
    onChange: (values) => {
      const voice = getVoiceById(voiceId);
      if (!voice) {
        return;
      }

      setActiveVoice(voiceId, { syncAnalysis: false });
      voice.amps = values;
      syncAll();
    },
  });

  view.envelopeEditor = new EnvelopeEditor({
    canvas: view.envelopeCanvas,
    points: getVoiceById(voiceId).noiseEnvelope.points,
    onChange: (points) => {
      const voice = getVoiceById(voiceId);
      if (!voice) {
        return;
      }

      setActiveVoice(voiceId, { syncAnalysis: false });
      voice.noiseEnvelope.points = points;
      updateVoiceCurveControl(view);
      syncAll();
    },
    onSelectionChange: () => {
      updateVoiceCurveControl(view);
    },
  });

  view.root.addEventListener("click", () => {
    setActiveVoice(voiceId);
  });

  view.focusButton.addEventListener("click", (event) => {
    event.stopPropagation();
    setActiveVoice(voiceId);
  });

  view.randomButton.addEventListener("click", (event) => {
    event.stopPropagation();
    randomizeVoice(voiceId);
  });

  view.muteButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleVoiceMute(voiceId);
  });

  view.soloButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleVoiceSolo(voiceId);
  });

  view.typeSelect.addEventListener("change", (event) => {
    event.stopPropagation();
    switchVoiceType(voiceId, view.typeSelect.value);
  });

  view.patternRefreshButton.addEventListener("click", (event) => {
    event.stopPropagation();
    regenerateVoicePattern(voiceId);
  });

  view.patternSourceSelect.addEventListener("change", (event) => {
    event.stopPropagation();
    updateVoicePatternSelection(voiceId, {
      ampPatternSource: Number(view.patternSourceSelect.value),
    });
  });

  view.patternModeSelect.addEventListener("change", (event) => {
    event.stopPropagation();
    updateVoicePatternSelection(voiceId, {
      patternMode: view.patternModeSelect.value,
    });
  });

  if (view.removeButton) {
    view.removeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      removeVoice(voiceId);
    });
  }

  view.addPointButton.addEventListener("click", (event) => {
    event.stopPropagation();
    setActiveVoice(voiceId, { syncAnalysis: false });
    view.envelopeEditor.addPoint();
    const voice = getVoiceById(voiceId);
    voice.noiseEnvelope.points = view.envelopeEditor.points.map((point) => ({ ...point }));
    updateVoiceCurveControl(view);
    syncAll();
  });

  view.removePointButton.addEventListener("click", (event) => {
    event.stopPropagation();
    setActiveVoice(voiceId, { syncAnalysis: false });
    view.envelopeEditor.removePoint();
    const voice = getVoiceById(voiceId);
    voice.noiseEnvelope.points = view.envelopeEditor.points.map((point) => ({ ...point }));
    updateVoiceCurveControl(view);
    syncAll();
  });

  view.segmentCurve.addEventListener("input", (event) => {
    event.stopPropagation();
    setActiveVoice(voiceId, { syncAnalysis: false });
    const value = Number(view.segmentCurve.value);
    view.envelopeEditor.setCurve(value);
    const voice = getVoiceById(voiceId);
    voice.noiseEnvelope.points = view.envelopeEditor.points.map((point) => ({ ...point }));
    updateVoiceCurveControl(view);
    syncAll();
  });

  updateVoiceCurveControl(view);
}

function destroyVoiceView(view) {
  view.clickSlider?.destroy();
  view.ampsSlider?.destroy();
  view.envelopeEditor?.destroy();
}

function appendPresetOptions(select, presetList) {
  presetList.forEach((preset) => {
    const option = document.createElement("option");
    option.value = String(preset.id);
    option.textContent = preset.name;
    select.append(option);
  });
}

function normalizePresetNameInput(value) {
  return String(value ?? "")
    .trim()
    .slice(0, 48)
    .toLocaleLowerCase("de");
}

function getCurrentPresetContext() {
  if (!appState?.voices.length) {
    return {
      presetId: null,
      presetName: "Layer Stack",
      presetSource: "detached",
    };
  }

  const firstVoice = appState.voices[0];
  const sharedMetadata = appState.voices.every(
    (voice) =>
      voice.presetId === firstVoice.presetId &&
      voice.presetName === firstVoice.presetName &&
      voice.presetSource === firstVoice.presetSource,
  );

  if (!sharedMetadata) {
    return {
      presetId: null,
      presetName: "Layer Stack",
      presetSource: "detached",
    };
  }

  return {
    presetId: firstVoice.presetId,
    presetName: firstVoice.presetName || "Layer Stack",
    presetSource: firstVoice.presetSource,
  };
}

function populateGlobalPresetSelect(currentPreset) {
  const previousSelectionValue = elements.presetSelect.value;
  elements.presetSelect.textContent = "";

  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = presets.length ? "Preset waehlen" : "Keine Presets verfuegbar";
  placeholderOption.disabled = !presets.length;
  elements.presetSelect.append(placeholderOption);

  appendPresetOptions(elements.presetSelect, presets);

  const selectedValue = currentPreset.presetId !== null ? String(currentPreset.presetId) : previousSelectionValue;
  const selectedPresetId = Number(selectedValue);

  elements.presetSelect.value =
    Number.isFinite(selectedPresetId) && findPresetById(selectedPresetId) ? selectedValue : "";
}

function refreshGlobalPresetControls() {
  const currentPreset = getCurrentPresetContext();
  const storedUserPreset = currentPreset.presetSource === "user" ? findUserPresetById(currentPreset.presetId) : null;

  populateGlobalPresetSelect(currentPreset);
  elements.presetNameInput.value = currentPreset.presetName;
  refreshLoadPresetButton();
  elements.updatePresetButton.disabled = !storedUserPreset;
  elements.deletePresetButton.disabled = !storedUserPreset;
  elements.presetStateLine.textContent = describePresetState(currentPreset);
}

function getSelectedPresetId() {
  const presetId = Number(elements.presetSelect.value);
  return Number.isFinite(presetId) && findPresetById(presetId) ? presetId : null;
}

function refreshLoadPresetButton() {
  elements.loadPresetButton.disabled = getSelectedPresetId() === null;
}

function populateSelectWithOptions(select, options) {
  select.textContent = "";

  options.forEach((option) => {
    const element = document.createElement("option");
    element.value = String(option.value);
    element.textContent = option.label;
    select.append(element);
  });
}

function populatePatternModeSelect(select) {
  select.textContent = "";

  PATTERN_MODE_OPTIONS.forEach((option) => {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    select.append(element);
  });
}

function getRandomPatternModeValue(currentValue = "") {
  const allValues = PATTERN_MODE_OPTIONS.map((option) => option.value);
  const alternatives = allValues.filter((value) => value !== currentValue);
  const pool = alternatives.length ? alternatives : allValues;

  if (!pool.length) {
    return currentValue;
  }

  return pool[Math.floor(Math.random() * pool.length)];
}

function randomizeVoicePatternMode(voice) {
  if (shouldUseClassicWebPattern(voice.ampPatternSource)) {
    return;
  }

  const currentPatternMode = getPatternModeValue(voice);
  const nextPatternMode = getRandomPatternModeValue(currentPatternMode);
  const normalizedPatternMode = applyPatternModeValue(nextPatternMode, voice);

  voice.ampMode = normalizedPatternMode.ampMode;
  voice.rhythmMode = normalizedPatternMode.rhythmMode;
}

function getVoiceScalarDefinitions(voiceType) {
  if (voiceType === "kick") {
    return kickVoiceScalarDefinitions;
  }

  if (voiceType === "subbass") {
    return subBassVoiceScalarDefinitions;
  }

  return percVoiceScalarDefinitions;
}

function getVoiceStepRandomizationDefinitions(voiceType) {
  return voiceStepRandomizationDefinitions[voiceType] ?? voiceStepRandomizationDefinitions.perc;
}

function getVoiceTypeLabel(voiceType) {
  if (voiceType === "kick") {
    return "Kick";
  }

  if (voiceType === "subbass") {
    return "Sub-Bass";
  }

  return "Perc";
}

function getVoiceLayerLabel(voiceType) {
  return `${getVoiceTypeLabel(voiceType)} Layer`;
}

function getVoiceCompactLabel(voiceType) {
  if (voiceType === "subbass") {
    return "Sub";
  }

  return getVoiceTypeLabel(voiceType);
}

function getVoiceMacroLabel(voiceType) {
  if (voiceType === "perc") {
    return "Voice Settings";
  }

  return `${getVoiceTypeLabel(voiceType)} Settings`;
}

function getVoiceRandomButtonLabel(voiceType) {
  if (voiceType === "kick") {
    return "Random Kick";
  }

  if (voiceType === "subbass") {
    return "Random Sub";
  }

  return "Random";
}

function normalizeVoiceType(voiceType) {
  if (voiceType === "kick") {
    return "kick";
  }

  if (voiceType === "subbass" || voiceType === "sub-bass") {
    return "subbass";
  }

  return "perc";
}

function estimateSubBassToneHz(voice) {
  return clamp(80 + voice.subBassTone ** 1.5 * 3200, 40, 22050);
}

function rebuildVoiceScalarControls(view, voiceId, voiceType) {
  view.currentScalarType = voiceType;
  view.controlInputs.clear();
  view.controlOutputs.clear();
  view.scalarControls.textContent = "";

  getVoiceScalarDefinitions(voiceType).forEach((definition) => {
    const control = document.createElement("label");
    control.className = "control";

    const title = document.createElement("span");
    title.textContent = definition.label;

    const valueRow = document.createElement("div");
    valueRow.className = "value-row";

    const output = document.createElement("output");
    view.controlOutputs.set(definition.key, output);

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(definition.transform === "log" ? 0 : definition.min);
    input.max = String(definition.transform === "log" ? 1 : definition.max);
    input.step = String(definition.transform === "log" ? 0.0001 : definition.step);

    input.addEventListener("input", () => {
      const voice = getVoiceById(voiceId);

      if (!voice) {
        return;
      }

      setActiveVoice(voiceId, { syncAnalysis: false });
      voice[definition.key] = fromSliderValue(definition, Number(input.value));
      output.textContent = formatValue(definition.key, voice[definition.key]);
      syncAll();
    });

    view.controlInputs.set(definition.key, input);
    valueRow.append(output);
    control.append(title, valueRow, input);
    view.scalarControls.append(control);
  });
}

function rebuildVoiceStepRandomControls(view, voiceId, voiceType) {
  view.currentStepRandomType = voiceType;
  view.stepRandomInputs.clear();
  view.stepRandomControls.textContent = "";

  getVoiceStepRandomizationDefinitions(voiceType).forEach((definition) => {
    const toggle = document.createElement("label");
    toggle.className = "voice-step-random-toggle";

    const title = document.createElement("span");
    title.className = "voice-step-random-label";
    title.textContent = definition.label;

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(getVoiceById(voiceId)?.[definition.key]);
    input.setAttribute("aria-label", `${definition.label} pro Step randomisieren`);

    toggle.append(title, input);
    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    input.addEventListener("change", () => {
      const voice = getVoiceById(voiceId);
      const voiceIndex = getVoiceIndexById(voiceId);

      if (!voice || voiceIndex === -1) {
        return;
      }

      setActiveVoice(voiceId, { syncAnalysis: false });
      voice[definition.key] = input.checked;
      syncAll();
      setStatus(
        `Voice ${voiceIndex + 1}: ${definition.label} pro Step ${input.checked ? "random" : "stabil"}.`,
      );
    });

    view.stepRandomInputs.set(definition.key, input);
    view.stepRandomControls.append(toggle);
  });
}

function refreshVoiceView(view) {
  const voiceId = Number(view.root.dataset.voiceId);
  const voice = getVoiceById(voiceId);
  const voiceIndex = getVoiceIndexById(voiceId);

  if (!voice) {
    return;
  }

  if (view.currentScalarType !== voice.voiceType) {
    rebuildVoiceScalarControls(view, voiceId, voice.voiceType);
  }

  if (view.currentStepRandomType !== voice.voiceType) {
    rebuildVoiceStepRandomControls(view, voiceId, voice.voiceType);
  }

  view.typeSelect.value = voice.voiceType;
  view.title.textContent = `Voice ${voiceIndex + 1}: ${getVoiceLayerLabel(voice.voiceType)}`;
  view.macroTitle.textContent = getVoiceMacroLabel(voice.voiceType);
  view.stateLine.textContent = describeVoiceState(voice);
  view.randomButton.textContent = getVoiceRandomButtonLabel(voice.voiceType);
  view.muteButton.textContent = "Mute";
  view.soloButton.textContent = "Solo";
  view.muteButton.setAttribute("aria-pressed", String(voice.muted));
  view.soloButton.setAttribute("aria-pressed", String(voice.solo));
  view.muteButton.classList.toggle("is-on", voice.muted);
  view.soloButton.classList.toggle("is-on", voice.solo);
  view.muteButton.title = voice.muted ? `Voice ${voiceIndex + 1} entmuten` : `Voice ${voiceIndex + 1} muten`;
  view.soloButton.title = voice.solo ? `Solo fuer Voice ${voiceIndex + 1} aus` : `Voice ${voiceIndex + 1} solo`;
  view.root.classList.toggle("is-muted", voice.muted);
  view.root.classList.toggle("is-solo", voice.solo);
  view.root.classList.toggle("is-suppressed", hasSoloVoices() && !voice.solo);
  refreshVoicePatternControls(view, voice);

  getVoiceScalarDefinitions(voice.voiceType).forEach((definition) => {
    const input = view.controlInputs.get(definition.key);
    const output = view.controlOutputs.get(definition.key);

    if (!input || !output) {
      return;
    }

    input.value = String(toSliderValue(definition, voice[definition.key]));
    output.textContent = formatValue(definition.key, voice[definition.key]);
  });

  getVoiceStepRandomizationDefinitions(voice.voiceType).forEach((definition) => {
    const input = view.stepRandomInputs.get(definition.key);

    if (!input) {
      return;
    }

    input.checked = Boolean(voice[definition.key]);
  });

  view.clickPanel.hidden = voice.voiceType !== "perc";
  view.envelopePanel.hidden = voice.voiceType !== "perc";
  view.clickSlider?.setValues(voice.clickShape);
  view.ampsSlider?.setValues(voice.amps);
  view.envelopeEditor?.setPoints(voice.noiseEnvelope.points);
  updateVoiceCurveControl(view);
}

function refreshVoicePatternControls(view, voice) {
  view.patternSourceSelect.value = String(voice.ampPatternSource);
  view.patternModeSelect.value = getPatternModeValue(voice);

  const classicWebSourceActive = shouldUseClassicWebPattern(voice.ampPatternSource);
  view.patternModeSelect.disabled = classicWebSourceActive;
}

function updateVoiceCurveControl(view) {
  const curve = view.envelopeEditor?.getSelectedCurve() ?? 0;
  view.segmentCurve.value = String(curve);
  view.segmentCurveValue.textContent = curve.toFixed(3);
}

function refreshActiveVoiceStyles() {
  voiceViews.forEach((view, voiceId) => {
    const isActive = appState.activeVoiceId === voiceId;
    view.root.classList.toggle("is-active", isActive);
    view.focusButton.textContent = isActive ? "Im Fokus" : "Fokus";
  });

  refreshHeaderVoiceControls();
}

function setActiveVoice(voiceId, options = {}) {
  const { renderCards = false, syncAnalysis = true } = options;

  if (!getVoiceById(voiceId)) {
    return;
  }

  const activeChanged = appState.activeVoiceId !== voiceId;
  appState.activeVoiceId = voiceId;
  refreshActiveVoiceStyles();

  if (renderCards) {
    renderVoiceCards();
  }

  if (syncAnalysis) {
    renderActiveVoiceAnalysis(engine.lastAnalysisByVoice);
  }

  if (activeChanged) {
    persistSession();
  }
}

function removeVoice(voiceId) {
  if (appState.voices.length <= 1) {
    return;
  }

  const removeIndex = getVoiceIndexById(voiceId);

  if (removeIndex === -1) {
    return;
  }

  appState.voices.splice(removeIndex, 1);

  if (!getVoiceById(appState.activeVoiceId)) {
    appState.activeVoiceId = appState.voices[Math.max(0, removeIndex - 1)].voiceId;
  }

  renderVoiceCards();
  syncAll({ measureMasterBus: "immediate" });
  setStatus(`Voice entfernt. ${appState.voices.length} Voices aktiv.`);
}

function loadPresetStack(presetId) {
  const preset = findPresetById(presetId);
  const currentActiveIndex = Math.max(getVoiceIndexById(appState.activeVoiceId), 0);

  if (!preset) {
    return;
  }

  const presetTempo = Number(preset.tempo);
  const hasPresetTempo = Number.isFinite(presetTempo) && presetTempo > 0;

  appState.voices = createVoicesFromPreset(preset);
  appState.activeVoiceId = appState.voices[Math.min(currentActiveIndex, appState.voices.length - 1)].voiceId;

  if (hasPresetTempo) {
    appState.tempo = presetTempo;
    refreshTransportControls();
  }

  if (preset.masterBusMode) {
    appState.masterBus.mode = preset.masterBusMode;
    renderMasterBusControls();
  }

  renderVoiceCards();
  syncAll({ measureMasterBus: "immediate" });
  setStatus(
    `Preset "${preset.name}" geladen. ${appState.voices.length} Voices aktiv.${hasPresetTempo ? ` ${Math.round(appState.tempo)} BPM.` : ""}${preset.masterBusMode ? ` Modus ${getMasterBusModeLabel(preset.masterBusMode)}.` : ""}`,
  );
}

function switchVoiceType(voiceId, nextVoiceType) {
  const voice = getVoiceById(voiceId);
  const voiceIndex = getVoiceIndexById(voiceId);
  const view = voiceViews.get(voiceId);
  const normalizedNextVoiceType = normalizeVoiceType(nextVoiceType);

  if (!voice || voiceIndex === -1 || !view) {
    return;
  }

  if (voice.voiceType === normalizedNextVoiceType) {
    return;
  }

  voice.voiceType = normalizedNextVoiceType;
  refreshVoiceView(view);
  setActiveVoice(voiceId, { syncAnalysis: false });
  syncAll({ resetVoiceIds: [voiceId], measureMasterBus: "immediate" });
  setStatus(`Voice ${voiceIndex + 1} auf ${getVoiceTypeLabel(voice.voiceType)} umgestellt.`);
}

function buildAmpPatternForVoice(voice) {
  return createAmpPattern(voice.amps.length, {
    ampPatternSource: voice.ampPatternSource,
    ampMode: voice.ampMode,
    rhythmMode: voice.rhythmMode,
    voiceType: voice.voiceType,
  });
}

function updateVoicePatternSelection(voiceId, nextSettings = {}) {
  const voice = getVoiceById(voiceId);
  const voiceIndex = getVoiceIndexById(voiceId);
  const view = voiceViews.get(voiceId);

  if (!voice || voiceIndex === -1 || !view) {
    return;
  }

  if (Object.hasOwn(nextSettings, "ampPatternSource")) {
    voice.ampPatternSource = normalizeAmpPatternSource(nextSettings.ampPatternSource);
  }

  if (Object.hasOwn(nextSettings, "ampMode")) {
    voice.ampMode = normalizeAmpMode(nextSettings.ampMode);
  }

  if (Object.hasOwn(nextSettings, "rhythmMode")) {
    voice.rhythmMode = normalizeRhythmMode(nextSettings.rhythmMode);
  }

  if (Object.hasOwn(nextSettings, "patternMode")) {
    const normalizedPatternMode = applyPatternModeValue(nextSettings.patternMode, voice);
    voice.ampMode = normalizedPatternMode.ampMode;
    voice.rhythmMode = normalizedPatternMode.rhythmMode;
  }

  voice.amps = buildAmpPatternForVoice(voice);
  refreshVoiceView(view);
  setActiveVoice(voiceId, { syncAnalysis: false });
  syncAll();
  setStatus(`Voice ${voiceIndex + 1} Pattern: ${describePatternSelection(voice)}.`);
}

function regenerateVoicePattern(voiceId) {
  const voice = getVoiceById(voiceId);
  const voiceIndex = getVoiceIndexById(voiceId);
  const view = voiceViews.get(voiceId);

  if (!voice || voiceIndex === -1 || !view) {
    return;
  }

  if (!shouldUseClassicWebPattern(voice.ampPatternSource)) {
    const nextPatternMode = getRandomPatternModeValue(getPatternModeValue(voice));
    const normalizedPatternMode = applyPatternModeValue(nextPatternMode, voice);
    voice.ampMode = normalizedPatternMode.ampMode;
    voice.rhythmMode = normalizedPatternMode.rhythmMode;
  }

  voice.amps = buildAmpPatternForVoice(voice);
  refreshVoiceView(view);
  setActiveVoice(voiceId, { syncAnalysis: false });
  syncAll();
  setStatus(`Voice ${voiceIndex + 1} Step-Pattern neu gezogen: ${describePatternSelection(voice)}.`);
}

function randomizePercVoiceState(voice) {
  getVoiceScalarDefinitions("perc")
    .filter((definition) => definition.key !== "masterGain")
    .forEach((definition) => {
      voice[definition.key] = randomizeScalarValue(definition);
    });

  voice.clickShape = Array.from({ length: voice.clickShape.length }, () => Math.random());
  randomizeVoicePatternMode(voice);
  voice.amps = buildAmpPatternForVoice(voice);
  voice.noiseEnvelope.points = createRandomNoiseEnvelopePoints();
}

function randomizeKickVoiceState(voice) {
  voice.kickBodyFreqHz = randomInRange(38, 72, 0.1);
  voice.kickBodyDecayMs = randomInRange(160, 620, 1);
  voice.kickPitchDropSt = randomInRange(6, 16, 0.1);
  voice.kickPitchDropMs = randomInRange(22, 80, 1);
  voice.kickClickLevel = randomInRange(0.05, 0.34, 0.001);
  voice.kickClickDecayMs = randomInRange(4, 22, 0.1);
  voice.kickNoiseLevel = randomInRange(0, 0.18, 0.001);
  voice.kickNoiseDecayMs = randomInRange(10, 70, 0.1);
  voice.kickDrive = randomInRange(0.04, 0.32, 0.001);
  voice.kickTone = randomInRange(0.35, 0.92, 0.001);
  randomizeVoicePatternMode(voice);
  voice.amps = buildAmpPatternForVoice(voice);
}

function randomizeSubBassPattern(voice) {
  if (Math.random() < 0.38) {
    voice.ampPatternSource = 2;
    voice.rhythmMode = 0;
    voice.ampMode = 4;
    return;
  }

  const patternPool = ["amp:1", "amp:3", "amp:4", "rhythm:1", "rhythm:2", "rhythm:3", "rhythm:7", "rhythm:8"];
  const nextPatternMode = patternPool[Math.floor(Math.random() * patternPool.length)];
  const normalizedPatternMode = applyPatternModeValue(nextPatternMode, voice);

  voice.ampPatternSource = 0;
  voice.ampMode = normalizedPatternMode.ampMode;
  voice.rhythmMode = normalizedPatternMode.rhythmMode;
}

function randomizeSubBassVoiceState(voice) {
  voice.subBassFreqHz = randomInRange(32, 68, 0.1);
  voice.subBassAttackMs = randomInRange(0, 24, 0.1);
  voice.subBassDecayMs = randomInRange(180, 980, 1);
  voice.subBassWaveMix = randomInRange(0.04, 0.5, 0.001);
  voice.subBassSubLevel = randomInRange(0.38, 0.94, 0.001);
  voice.subBassDrive = randomInRange(0.02, 0.26, 0.001);
  voice.subBassTone = randomInRange(0.12, 0.62, 0.001);
  randomizeSubBassPattern(voice);
  voice.amps = buildAmpPatternForVoice(voice);
}

function randomizeVoice(voiceId) {
  const voice = getVoiceById(voiceId);
  const voiceIndex = getVoiceIndexById(voiceId);
  const view = voiceViews.get(voiceId);

  if (!voice || voiceIndex === -1 || !view) {
    return;
  }

  if (voice.voiceType === "kick") {
    randomizeKickVoiceState(voice);
  } else if (voice.voiceType === "subbass") {
    randomizeSubBassVoiceState(voice);
  } else {
    randomizePercVoiceState(voice);
  }

  refreshVoiceView(view);
  setActiveVoice(voiceId, { syncAnalysis: false });
  syncAll({ resetVoiceIds: [voiceId], measureMasterBus: "immediate" });
  setStatus(`${getVoiceTypeLabel(voice.voiceType)} ${voiceIndex + 1} randomisiert. Pattern: ${describePatternSelection(voice)}.`);
}

async function saveStackAsUserPreset() {
  if (!appState.voices.length) {
    return;
  }

  const currentPreset = getCurrentPresetContext();
  const presetName = normalizePresetName(
    elements.presetNameInput.value,
    currentPreset.presetName,
  );
  const presetToOverwrite = findUserPresetByName(presetName);
  const preset = createUserPresetSnapshot(
    appState.voices,
    presetName,
    presetToOverwrite,
    appState.tempo,
    appState.masterBus.mode,
  );
  const nextUserPresets = [preset, ...userPresets.filter((entry) => entry.id !== preset.id)];
  const persistence = await commitUserPresetChanges(nextUserPresets);

  if (!persistence) {
    return;
  }

  attachAllVoicesToPreset(preset);
  refreshAllVoiceViews();
  syncAll({ measureMasterBus: "skip" });
  setStatus(describePresetSaveStatus(preset.name, persistence));
}

async function updateUserPresetFromStack() {
  const currentPreset = getCurrentPresetContext();
  const existingPreset = findUserPresetById(currentPreset.presetId);

  if (!existingPreset) {
    return;
  }

  const presetName = normalizePresetName(elements.presetNameInput.value, existingPreset.name);
  const presetToOverwrite = findUserPresetByName(presetName) ?? existingPreset;
  const presetIdsToRemove = new Set([presetToOverwrite.id, existingPreset.id]);
  const updatedPreset = createUserPresetSnapshot(
    appState.voices,
    presetName,
    presetToOverwrite,
    appState.tempo,
    appState.masterBus.mode,
  );
  const nextUserPresets = [updatedPreset, ...userPresets.filter((entry) => !presetIdsToRemove.has(entry.id))];
  const persistence = await commitUserPresetChanges(nextUserPresets);

  if (!persistence) {
    return;
  }

  attachAllVoicesToPreset(updatedPreset);
  refreshAllVoiceViews();
  syncAll({ measureMasterBus: "skip" });
  setStatus(describePresetUpdateStatus(updatedPreset.name, persistence));
}

async function deleteUserPresetFromStack() {
  const currentPreset = getCurrentPresetContext();
  const preset = findUserPresetById(currentPreset.presetId);

  if (!preset) {
    return;
  }

  const nextUserPresets = userPresets.filter((entry) => entry.id !== preset.id);
  const persistence = await commitUserPresetChanges(nextUserPresets);

  if (!persistence) {
    return;
  }

  detachAllVoicesFromPreset();
  refreshAllVoiceViews();
  syncAll({ measureMasterBus: "skip" });
  setStatus(describePresetDeleteStatus(preset.name, persistence));
}

async function commitUserPresetChanges(nextUserPresets) {
  const committedUserPresets = dedupePresetListByName(nextUserPresets);
  const persistence = await persistUserPresets(committedUserPresets);

  if (!persistence?.ok) {
    if (persistence?.error) {
      console.error(persistence.error);
    }

    setStatus(describePresetPersistError(persistence));
    return null;
  }

  userPresets = committedUserPresets;
  rebuildPresetCatalog();
  return persistence;
}

function describePresetPersistError(persistence) {
  if (persistence?.reason === "cancelled") {
    return "Preset-Aenderung abgebrochen. Keine Markdown-Datei ausgewaehlt.";
  }

  return `Preset-Datei konnte nicht geschrieben werden: ${persistence?.error?.message ?? "Unbekannter Fehler"}.`;
}

function describePresetSaveStatus(presetName, persistence) {
  if (persistence.mode === "file") {
    return `Preset "${presetName}" gespeichert. Markdown-Datei "${persistence.fileName}" aktualisiert.`;
  }

  return `Preset "${presetName}" gespeichert. Markdown-Datei wurde heruntergeladen.`;
}

function describePresetUpdateStatus(presetName, persistence) {
  if (persistence.mode === "file") {
    return `Preset "${presetName}" aktualisiert. Markdown-Datei "${persistence.fileName}" aktualisiert.`;
  }

  return `Preset "${presetName}" aktualisiert. Markdown-Datei wurde heruntergeladen.`;
}

function describePresetDeleteStatus(presetName, persistence) {
  if (persistence.mode === "file") {
    return `Preset "${presetName}" geloescht. Der aktuelle Layer-Stack bleibt lokal, Markdown-Datei "${persistence.fileName}" wurde aktualisiert.`;
  }

  return `Preset "${presetName}" geloescht. Der aktuelle Layer-Stack bleibt lokal, Markdown-Datei wurde heruntergeladen.`;
}

function attachAllVoicesToPreset(preset) {
  appState.voices.forEach((voice) => {
    voice.presetId = preset.id;
    voice.presetName = preset.name;
    voice.presetSource = preset.source;
  });
}

function detachAllVoicesFromPreset() {
  appState.voices.forEach((voice) => {
    voice.presetId = null;
    voice.presetSource = "detached";
  });
}

function refreshAllVoiceViews() {
  voiceViews.forEach((view) => {
    refreshVoiceView(view);
  });

  refreshHeaderVoiceControls();
  refreshGlobalPresetControls();
}

function normalizePresetName(value, fallback) {
  const trimmed = String(value ?? "")
    .trim()
    .slice(0, 48);

  return trimmed || fallback || `Preset ${userPresets.length + 1}`;
}

function dedupePresetListByName(presetList) {
  const seenNames = new Set();

  return [...presetList]
    .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
    .filter((preset) => {
      const normalizedName = normalizePresetNameInput(preset?.name);

      if (!normalizedName || seenNames.has(normalizedName)) {
        return false;
      }

      seenNames.add(normalizedName);
      return true;
    });
}

function describePresetState(currentPreset) {
  const voiceCount = appState?.voices.length ?? 0;
  const voiceLabel = `${voiceCount} Voice${voiceCount === 1 ? "" : "s"}`;

  if (currentPreset.presetSource === "user") {
    return `${voiceLabel} · User-Preset "${currentPreset.presetName}" aktiv.`;
  }

  if (currentPreset.presetSource === "detached") {
    return `${voiceLabel} · Lokaler Layer-Stack.`;
  }

  return `${voiceLabel} · Factory-Preset "${currentPreset.presetName}" aktiv.`;
}

function describeVoiceState(voice) {
  const stateLabel = getVoicePlaybackStateLabel(voice);
  const sourceLabel =
    voice.presetSource === "detached"
      ? "lokal"
      : `${voice.presetSource === "user" ? "user" : "factory"}:${voice.presetName}`;

  return `${stateLabel} · ${getVoiceTypeLabel(voice.voiceType)} · ${sourceLabel} · ${describePatternSelection(voice)}`;
}

function toggleVoiceMute(voiceId) {
  const voice = getVoiceById(voiceId);
  const voiceIndex = getVoiceIndexById(voiceId);

  if (!voice || voiceIndex === -1) {
    return;
  }

  voice.muted = !voice.muted;
  refreshVoicePresentation(voiceId);
  syncAll();
  setStatus(`Voice ${voiceIndex + 1} ${voice.muted ? "stumm" : "aktiv"}.`);
}

function toggleVoiceSolo(voiceId) {
  const voice = getVoiceById(voiceId);
  const voiceIndex = getVoiceIndexById(voiceId);

  if (!voice || voiceIndex === -1) {
    return;
  }

  voice.solo = !voice.solo;
  refreshAllVoiceViews();
  syncAll();

  const soloCount = appState.voices.filter((entry) => entry.solo).length;
  const soloVoiceLabel = `${soloCount} Solo-Voice${soloCount === 1 ? "" : "s"}`;

  if (voice.solo) {
    setStatus(`Voice ${voiceIndex + 1} solo. ${soloVoiceLabel} aktiv.`);
    return;
  }

  setStatus(
    soloCount
      ? `Voice ${voiceIndex + 1} Solo aus. ${soloVoiceLabel} bleiben aktiv.`
      : `Voice ${voiceIndex + 1} Solo aus. Alle Voices wieder offen.`,
  );
}

function refreshVoicePresentation(voiceId) {
  const view = voiceViews.get(voiceId);
  const headerView = headerVoiceViews.get(voiceId);

  if (view) {
    refreshVoiceView(view);
  }

  if (headerView) {
    refreshHeaderVoiceControl(headerView);
  }
}

function applyStepRandomizedVoiceUpdates(randomizedVoices = []) {
  if (!Array.isArray(randomizedVoices) || !randomizedVoices.length) {
    return;
  }

  const sampleRate = engine.context?.sampleRate ?? 44100;
  let activeVoiceChanged = false;

  randomizedVoices.forEach((update) => {
    const voice = getVoiceById(update?.voiceId);
    const voiceIndex = getVoiceIndexById(update?.voiceId);
    const values = update?.values;

    if (!voice || voiceIndex === -1 || !values || typeof values !== "object") {
      return;
    }

    Object.entries(values).forEach(([key, value]) => {
      voice[key] = Array.isArray(value) ? [...value] : value;
    });

    engine.lastAnalysisByVoice[voiceIndex] = computeVoiceAnalysis(voice, sampleRate);
    refreshVoicePresentation(voice.voiceId);
    activeVoiceChanged ||= appState.activeVoiceId === voice.voiceId;
  });

  if (activeVoiceChanged) {
    renderActiveVoiceAnalysis(engine.lastAnalysisByVoice);
  }
}

function syncAll(options = {}) {
  const analysisByVoice = engine.sync(appState, options);
  renderActiveVoiceAnalysis(analysisByVoice);
  analyserBuffer = engine.analyser ? new Float32Array(engine.analyser.fftSize) : analyserBuffer;
  persistSession();

  const measurementMode = options.measureMasterBus ?? "debounced";
  const hasImmediateMeasurementTrigger =
    measurementMode === "immediate" ||
    Boolean(options.resetTransport) ||
    Boolean(options.reacquireMasterBus) ||
    (Array.isArray(options.resetVoiceIds) && options.resetVoiceIds.length > 0);

  if (hasImmediateMeasurementTrigger || measurementMode === "skip") {
    clearPendingMasterBusMeasurement();
    return;
  }

  scheduleMasterBusMeasurement();
}

function renderActiveVoiceAnalysis(analysisByVoice = []) {
  const activeVoice = getActiveVoice();
  const activeVoiceIndex = activeVoice ? getVoiceIndexById(activeVoice.voiceId) : -1;
  const analysis = activeVoiceIndex >= 0 ? analysisByVoice[activeVoiceIndex] : null;

  if (!activeVoice || !analysis) {
    drawBars(elements.freqCanvas, [0], { color: "#f0b075", baseline: 0 });
    drawBars(elements.weightCanvas, [0], { color: "#6ab1c7", baseline: 0, maxValue: 1 });
    elements.analysisVoiceLabel.textContent = "Keine Voice gewaehlt";
    elements.freqSummary.textContent = "Keine Daten";
    elements.weightSummary.textContent = "Keine Daten";
    return;
  }

  drawBars(elements.freqCanvas, analysis.frequencies, { color: "#f0b075", baseline: 0 });
  drawBars(elements.weightCanvas, analysis.weights, { color: "#6ab1c7", baseline: 0, maxValue: 1 });
  elements.analysisVoiceLabel.textContent = `Voice ${activeVoiceIndex + 1} · ${getVoiceTypeLabel(activeVoice.voiceType)}`;

  if (analysis.type === "kick") {
    elements.freqSummary.textContent = `Body ${activeVoice.kickBodyFreqHz.toFixed(1)} Hz · Peak ${analysis.frequencies[1].toFixed(1)} Hz`;
    elements.weightSummary.textContent =
      `Click ${activeVoice.kickClickLevel.toFixed(2)} · Noise ${activeVoice.kickNoiseLevel.toFixed(2)} · Drive ${activeVoice.kickDrive.toFixed(2)}`;
    return;
  }

  if (analysis.type === "subbass") {
    elements.freqSummary.textContent =
      `Fundamental ${activeVoice.subBassFreqHz.toFixed(1)} Hz · Upper ${analysis.frequencies[1].toFixed(1)} Hz · LP ${estimateSubBassToneHz(activeVoice).toFixed(0)} Hz`;
    elements.weightSummary.textContent =
      `Sub ${activeVoice.subBassSubLevel.toFixed(2)} · Wave ${activeVoice.subBassWaveMix.toFixed(2)} · Drive ${activeVoice.subBassDrive.toFixed(2)} · Tone ${activeVoice.subBassTone.toFixed(2)}`;
    return;
  }

  elements.freqSummary.textContent = summarizeFrequencies(analysis.frequencies);
  elements.weightSummary.textContent = summarizeWeights(analysis.weights);
}

function renderScopeLoop() {
  requestAnimationFrame(renderScopeLoop);

  if (!engine.analyser) {
    drawEmptyScope();
    return;
  }

  analyserBuffer ??= new Float32Array(engine.analyser.fftSize);
  engine.analyser.getFloatTimeDomainData(analyserBuffer);
  drawScope(elements.scopeCanvas, analyserBuffer);

  const rms = Math.sqrt(analyserBuffer.reduce((sum, value) => sum + value * value, 0) / analyserBuffer.length);
  elements.scopeSummary.textContent = `RMS ${rms.toFixed(4)}`;
}

function buildStepGrid() {
  for (let index = 0; index < 16; index += 1) {
    const cell = document.createElement("span");
    cell.className = "is-muted";
    elements.stepGrid.append(cell);
  }
}

function updateStepGrid(activeIndex, amplitudes = []) {
  const peakAmplitude = amplitudes.length ? Math.max(...amplitudes) : 0;

  [...elements.stepGrid.children].forEach((cell, index) => {
    cell.classList.toggle("is-active", index === activeIndex);
    cell.classList.toggle("is-muted", peakAmplitude <= 0.001 && index === activeIndex);
  });
}

function setStatus(message) {
  elements.statusLine.textContent = message;
}

function persistSession() {
  if (!appState) {
    return;
  }

  persistSessionState(appState);
}

function drawBars(canvas, values, { color, baseline = 0, maxValue = null }) {
  const context = setupCanvas(canvas);
  const { width, height } = canvas;
  const max = maxValue ?? Math.max(...values, 1);
  const min = baseline;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(8,12,18,0.94)";
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(255,255,255,0.08)";
  context.lineWidth = 1;

  for (let row = 1; row < 5; row += 1) {
    const y = (height / 5) * row;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  const barWidth = width / values.length;
  context.fillStyle = color;

  values.forEach((value, index) => {
    const normalized = (value - min) / Math.max(0.000001, max - min);
    const barHeight = normalized * (height - 14);
    context.fillRect(
      index * barWidth + barWidth * 0.14,
      height - barHeight - 8,
      Math.max(2, barWidth * 0.72),
      barHeight,
    );
  });
}

function drawScope(canvas, values) {
  const context = setupCanvas(canvas);
  const { width, height } = canvas;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(8,12,18,0.94)";
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(255,255,255,0.08)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, height / 2);
  context.lineTo(width, height / 2);
  context.stroke();

  context.strokeStyle = "#f0b075";
  context.lineWidth = 2;
  context.beginPath();

  for (let index = 0; index < values.length; index += 1) {
    const x = (index / (values.length - 1)) * width;
    const y = height / 2 - values[index] * (height * 0.36);

    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }

  context.stroke();
}

function drawEmptyScope() {
  drawScope(elements.scopeCanvas, new Float32Array(256));
}

function setupCanvas(canvas) {
  const context = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(canvas.clientWidth * ratio);
  const height = Math.round(canvas.clientHeight * ratio);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  return context;
}

function toSliderValue(definition, value) {
  if (definition.transform !== "log") {
    return value;
  }

  const min = Math.log(definition.min);
  const max = Math.log(definition.max);
  return (Math.log(value) - min) / (max - min);
}

function fromSliderValue(definition, value) {
  if (definition.transform !== "log") {
    return value;
  }

  const min = Math.log(definition.min);
  const max = Math.log(definition.max);
  return Math.exp(min + value * (max - min));
}

function randomizeScalarValue(definition) {
  if (definition.transform === "log") {
    return fromSliderValue(definition, Math.random());
  }

  return randomInRange(definition.min, definition.max, definition.step);
}

function createRandomNoiseEnvelopePoints() {
  const thirdPointTime = randomInRange(0.12, 1, 0.001);
  const secondPointTime = randomInRange(0.06, thirdPointTime - 0.06, 0.001);

  return [
    { time: 0, value: 0, curve: 0 },
    {
      time: secondPointTime,
      value: randomInRange(0, 1, 0.001),
      curve: randomInRange(-1, 1, 0.001),
    },
    {
      time: thirdPointTime,
      value: 0,
      curve: randomInRange(-1, 1, 0.001),
    },
  ];
}

function randomInRange(min, max, step = null) {
  const value = min + Math.random() * (max - min);

  if (!step) {
    return value;
  }

  const steps = Math.round((value - min) / step);
  const rounded = min + steps * step;
  const precision = Math.max(0, countDecimals(step));

  return Number(clamp(rounded, min, max).toFixed(precision));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function countDecimals(value) {
  const valueAsString = String(value);
  const decimals = valueAsString.split(".")[1];
  return decimals ? decimals.length : 0;
}
