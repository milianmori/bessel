import {
  cloneState,
  formatValue,
  loadPresets,
  summarizeFrequencies,
  summarizeWeights,
} from "./model.js";
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
  startButton: document.querySelector("#start-button"),
  triggerButton: document.querySelector("#trigger-button"),
  addVoiceButton: document.querySelector("#add-voice-button"),
  tempoInput: document.querySelector("#tempo-input"),
  tempoOutput: document.querySelector("#tempo-output"),
  statusLine: document.querySelector("#status-line"),
  stepGrid: document.querySelector("#step-grid"),
  voiceList: document.querySelector("#voice-list"),
  analysisVoiceLabel: document.querySelector("#analysis-voice-label"),
  freqCanvas: document.querySelector("#freq-canvas"),
  weightCanvas: document.querySelector("#weight-canvas"),
  scopeCanvas: document.querySelector("#scope-canvas"),
  freqSummary: document.querySelector("#freq-summary"),
  weightSummary: document.querySelector("#weight-summary"),
  scopeSummary: document.querySelector("#scope-summary"),
};

const tempoDefinition = { key: "tempo", label: "Tempo", min: 48, max: 192, step: 1 };

const voiceScalarDefinitions = [
  { key: "tuning", label: "Tuning", min: 20, max: 12000, step: 1, transform: "log" },
  { key: "size", label: "Size", min: 0.05, max: 1, step: 0.001 },
  { key: "hitPosition", label: "Hit Position", min: 0, max: 1, step: 0.001 },
  { key: "damping", label: "Damping", min: 0, max: 1, step: 0.001 },
  { key: "overtones", label: "Overtones", min: 0, max: 1, step: 0.001 },
  { key: "pitchEnvDurMs", label: "Pitch Env Dur", min: 0, max: 500, step: 1 },
  { key: "pitchEnvRange", label: "Pitch Env Range", min: -24, max: 24, step: 0.1 },
  { key: "pitchEnvCurve", label: "Pitch Env Curve", min: -1, max: 1, step: 0.001 },
  { key: "nzEnvDurMs", label: "Noise Dur", min: 0, max: 220, step: 0.1 },
  { key: "masterGain", label: "Master Gain", min: 0.2, max: 1.4, step: 0.001 },
];

let presets = [];
let factoryPresets = [];
let userPresets = [];
let appState = null;
let voiceViews = new Map();
let analyserBuffer = null;
let nextVoiceId = 1;

bootstrap().catch((error) => {
  console.error(error);
  setStatus(`Initialisierung fehlgeschlagen: ${error.message}`);
});

async function bootstrap() {
  buildStepGrid();
  factoryPresets = await loadPresets();
  userPresets = loadUserPresets();
  rebuildPresetCatalog();

  const { state, restoredSession } = buildInitialAppState();
  appState = state;
  nextVoiceId = appState.voices.reduce((maxVoiceId, voice) => Math.max(maxVoiceId, voice.voiceId), 0) + 1;

  wireGlobalActions();
  renderVoiceCards();

  engine.onStep = ({ stepIndex, amplitudes }) => {
    updateStepGrid(stepIndex, amplitudes);
  };

  refreshTransportControls();
  syncAll({ resetTransport: true });
  renderScopeLoop();

  if (restoredSession) {
    setStatus("Letzte Session wiederhergestellt. Audio bleibt bis zum naechsten Start gestoppt.");
  }
}

function createVoiceFromPreset(preset, overrides = {}) {
  const voice = cloneState(preset);
  voice.voiceId = overrides.voiceId ?? nextVoiceId++;
  voice.presetId = preset.id;
  voice.presetName = preset.name;
  voice.presetSource = preset.source ?? "factory";
  voice.muted = overrides.muted ?? false;
  return voice;
}

function createVoiceClone(sourceVoice) {
  const voice = cloneState(sourceVoice);
  voice.voiceId = nextVoiceId++;
  voice.muted = false;
  return voice;
}

function buildInitialAppState() {
  const restoredSession = loadSessionState();

  if (restoredSession?.voices.length) {
    const restoredVoices = restoredSession.voices.map((voice) => syncVoicePresetMetadata(voice));
    const activeVoiceExists = restoredVoices.some((voice) => voice.voiceId === restoredSession.activeVoiceId);

    return {
      restoredSession: true,
      state: {
        running: false,
        tempo: restoredSession.tempo,
        activeVoiceId: activeVoiceExists ? restoredSession.activeVoiceId : restoredVoices[0].voiceId,
        voices: restoredVoices,
      },
    };
  }

  if (!presets.length) {
    throw new Error("Keine Presets verfuegbar.");
  }

  const firstVoice = createVoiceFromPreset(presets[0]);

  return {
    restoredSession: false,
    state: {
      running: false,
      tempo: 118,
      activeVoiceId: firstVoice.voiceId,
      voices: [firstVoice],
    },
  };
}

function rebuildPresetCatalog() {
  presets = [...factoryPresets, ...userPresets];
}

function findPresetById(presetId) {
  return presets.find((preset) => preset.id === presetId) ?? null;
}

function findUserPresetById(presetId) {
  return userPresets.find((preset) => preset.id === presetId) ?? null;
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

function wireGlobalActions() {
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

  elements.addVoiceButton.addEventListener("click", () => {
    const sourceVoice = getActiveVoice() ?? appState.voices[0];
    const newVoice = createVoiceClone(sourceVoice);
    appState.voices.push(newVoice);
    setActiveVoice(newVoice.voiceId, { renderCards: false });
    renderVoiceCards();
    syncAll();
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
  elements.startButton.textContent = appState.running ? "Audio stoppen" : "Audio starten";
}

function renderVoiceCards() {
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
}

function createVoiceCardShell(voice, index) {
  const root = document.createElement("section");
  root.className = "voice-card";
  root.dataset.voiceId = String(voice.voiceId);
  root.innerHTML = `
    <div class="voice-card-head">
      <div>
        <p class="eyebrow">Voice ${index + 1}</p>
        <h2 class="voice-card-title"></h2>
      </div>
      <div class="button-row voice-actions">
        <button type="button" class="ghost voice-focus-button">Analyse</button>
        <button type="button" class="ghost voice-random-button">Random Voice ${index + 1}</button>
        <button type="button" class="ghost voice-mute-button"></button>
        ${appState.voices.length > 1 ? '<button type="button" class="ghost danger voice-remove-button">Entfernen</button>' : ""}
      </div>
    </div>

    <div class="voice-toolbar">
      <label class="control compact">
        <span>Preset</span>
        <select class="voice-preset-select"></select>
      </label>
      <label class="control compact voice-preset-name-control">
        <span>Eigener Name</span>
        <input
          class="voice-preset-name-input"
          type="text"
          maxlength="48"
          placeholder="Neues User Preset"
        />
      </label>
      <div class="button-row voice-preset-buttons">
        <button type="button" class="ghost voice-save-preset-button">Preset sichern</button>
        <button type="button" class="ghost voice-update-preset-button">Preset updaten</button>
        <button type="button" class="ghost danger voice-delete-preset-button">Preset loeschen</button>
      </div>
      <p class="voice-state-line"></p>
    </div>

    <div class="voice-card-grid">
      <section class="voice-subpanel">
        <div class="panel-head voice-subhead">
          <div>
            <p class="eyebrow">Makro</p>
            <h3>Voice Settings</h3>
          </div>
        </div>
        <div class="controls-grid voice-scalar-controls"></div>
      </section>

      <section class="voice-subpanel">
        <div class="panel-head voice-subhead">
          <div>
            <p class="eyebrow">Click Buffer</p>
            <h3>Click Shape</h3>
          </div>
          <p class="panel-note">64-Sample-Multislider pro Voice.</p>
        </div>
        <canvas class="editor-canvas compact-editor-canvas voice-click-canvas" width="960" height="220"></canvas>
      </section>

      <section class="voice-subpanel">
        <div class="panel-head voice-subhead">
          <div>
            <p class="eyebrow">Noise Envelope</p>
            <h3>nz_env Function</h3>
          </div>
          <div class="button-row">
            <button type="button" class="ghost voice-add-point-button">Punkt addieren</button>
            <button type="button" class="ghost voice-remove-point-button">Punkt entfernen</button>
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
            <h3>Amp Multislider</h3>
          </div>
          <p class="panel-note">16 Trigger-Staerken, synchron zur globalen Clock.</p>
        </div>
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
    removeButton: root.querySelector(".voice-remove-button"),
    presetSelect: root.querySelector(".voice-preset-select"),
    presetNameInput: root.querySelector(".voice-preset-name-input"),
    savePresetButton: root.querySelector(".voice-save-preset-button"),
    updatePresetButton: root.querySelector(".voice-update-preset-button"),
    deletePresetButton: root.querySelector(".voice-delete-preset-button"),
    stateLine: root.querySelector(".voice-state-line"),
    scalarControls: root.querySelector(".voice-scalar-controls"),
    clickCanvas: root.querySelector(".voice-click-canvas"),
    envelopeCanvas: root.querySelector(".voice-envelope-canvas"),
    ampsCanvas: root.querySelector(".voice-amps-canvas"),
    addPointButton: root.querySelector(".voice-add-point-button"),
    removePointButton: root.querySelector(".voice-remove-point-button"),
    segmentCurve: root.querySelector(".voice-segment-curve"),
    segmentCurveValue: root.querySelector(".voice-segment-curve-value"),
    controlInputs: new Map(),
    controlOutputs: new Map(),
    clickSlider: null,
    ampsSlider: null,
    envelopeEditor: null,
  };
}

function initializeVoiceCard(view, voiceId, index) {
  populateVoicePresetSelect(view.presetSelect, getVoiceById(voiceId));
  buildVoiceScalarControls(view, voiceId);

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
    const voice = getVoiceById(voiceId);

    if (!voice) {
      return;
    }

    voice.muted = !voice.muted;
    refreshVoiceView(view);
    syncAll();
    setStatus(`Voice ${index + 1} ${voice.muted ? "stumm" : "aktiv"}.`);
  });

  if (view.removeButton) {
    view.removeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      removeVoice(voiceId);
    });
  }

  view.presetSelect.addEventListener("change", (event) => {
    event.stopPropagation();
    if (view.presetSelect.value === "") {
      return;
    }

    const presetId = Number(view.presetSelect.value);

    if (!Number.isFinite(presetId)) {
      return;
    }

    replaceVoiceWithPreset(voiceId, presetId);
  });

  view.savePresetButton.addEventListener("click", (event) => {
    event.stopPropagation();
    saveVoiceAsUserPreset(voiceId);
  });

  view.updatePresetButton.addEventListener("click", (event) => {
    event.stopPropagation();
    updateUserPresetFromVoice(voiceId);
  });

  view.deletePresetButton.addEventListener("click", (event) => {
    event.stopPropagation();
    deleteUserPresetFromVoice(voiceId);
  });

  view.presetNameInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    const voice = getVoiceById(voiceId);

    if (!voice) {
      return;
    }

    if (voice.presetSource === "user" && findUserPresetById(voice.presetId)) {
      updateUserPresetFromVoice(voiceId);
      return;
    }

    saveVoiceAsUserPreset(voiceId);
  });

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

function populateVoicePresetSelect(select, voice = null) {
  select.textContent = "";

  if (voice && !findPresetById(voice.presetId)) {
    const detachedOption = document.createElement("option");
    detachedOption.value = "";
    detachedOption.textContent = `${voice.presetName} (nicht gespeichert)`;
    select.append(detachedOption);
  }

  appendPresetGroup(select, "Factory", factoryPresets);
  appendPresetGroup(select, "User", userPresets);
}

function appendPresetGroup(select, label, presetList) {
  if (!presetList.length) {
    return;
  }

  const group = document.createElement("optgroup");
  group.label = label;

  presetList.forEach((preset) => {
    const option = document.createElement("option");
    option.value = String(preset.id);
    option.textContent = preset.name;
    group.append(option);
  });

  select.append(group);
}

function buildVoiceScalarControls(view, voiceId) {
  voiceScalarDefinitions.forEach((definition) => {
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

function refreshVoiceView(view) {
  const voiceId = Number(view.root.dataset.voiceId);
  const voice = getVoiceById(voiceId);

  if (!voice) {
    return;
  }

  populateVoicePresetSelect(view.presetSelect, voice);
  view.title.textContent = voice.presetName;
  view.presetSelect.value = voice.presetId === null ? "" : String(voice.presetId);
  view.presetNameInput.value = voice.presetName;
  view.stateLine.textContent = describeVoiceState(voice);
  view.muteButton.textContent = voice.muted ? "Unmute" : "Mute";
  view.updatePresetButton.disabled = !(voice.presetSource === "user" && findUserPresetById(voice.presetId));
  view.deletePresetButton.disabled =
    !(voice.presetSource === "user" && findUserPresetById(voice.presetId)) ||
    isUserPresetInUseByOtherVoice(voice.presetId, voice.voiceId);

  voiceScalarDefinitions.forEach((definition) => {
    const input = view.controlInputs.get(definition.key);
    const output = view.controlOutputs.get(definition.key);
    input.value = String(toSliderValue(definition, voice[definition.key]));
    output.textContent = formatValue(definition.key, voice[definition.key]);
  });

  view.clickSlider?.setValues(voice.clickShape);
  view.ampsSlider?.setValues(voice.amps);
  view.envelopeEditor?.setPoints(voice.noiseEnvelope.points);
  updateVoiceCurveControl(view);
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
    view.focusButton.textContent = isActive ? "Analyse aktiv" : "Analyse";
  });
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
    renderActiveVoiceAnalysis(engine.lastModalDataByVoice);
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
  syncAll();
  setStatus(`Voice entfernt. ${appState.voices.length} Voices aktiv.`);
}

function replaceVoiceWithPreset(voiceId, presetId) {
  const voiceIndex = getVoiceIndexById(voiceId);
  const currentVoice = getVoiceById(voiceId);
  const preset = findPresetById(presetId);

  if (voiceIndex === -1 || !currentVoice || !preset) {
    return;
  }

  appState.voices[voiceIndex] = createVoiceFromPreset(preset, {
    voiceId,
    muted: currentVoice.muted,
  });

  const view = voiceViews.get(voiceId);
  refreshVoiceView(view);
  setActiveVoice(voiceId, { syncAnalysis: false });
  syncAll();
  setStatus(`${preset.name} auf Voice ${voiceIndex + 1} geladen.`);
}

function randomizeVoice(voiceId) {
  const voice = getVoiceById(voiceId);
  const voiceIndex = getVoiceIndexById(voiceId);
  const view = voiceViews.get(voiceId);

  if (!voice || voiceIndex === -1 || !view) {
    return;
  }

  voiceScalarDefinitions.forEach((definition) => {
    voice[definition.key] = randomizeScalarValue(definition);
  });

  voice.clickShape = Array.from({ length: voice.clickShape.length }, () => Math.random());
  voice.amps = Array.from({ length: voice.amps.length }, () => Math.random());
  voice.noiseEnvelope.points = createRandomNoiseEnvelopePoints();

  refreshVoiceView(view);
  setActiveVoice(voiceId, { syncAnalysis: false });
  syncAll();
  setStatus(`Voice ${voiceIndex + 1} randomisiert.`);
}

function saveVoiceAsUserPreset(voiceId) {
  const voice = getVoiceById(voiceId);
  const view = voiceViews.get(voiceId);

  if (!voice || !view) {
    return;
  }

  const presetName = normalizePresetName(
    view.presetNameInput.value,
    voice.presetSource === "user" ? `${voice.presetName} Copy` : voice.presetName,
  );
  const preset = createUserPresetSnapshot(voice, presetName);

  userPresets = [preset, ...userPresets.filter((entry) => entry.id !== preset.id)];
  persistUserPresets(userPresets);
  rebuildPresetCatalog();
  attachVoiceToPreset(voice, preset);
  refreshAllVoiceViews();
  syncAll();
  setStatus(`Eigenes Preset "${preset.name}" gespeichert.`);
}

function updateUserPresetFromVoice(voiceId) {
  const voice = getVoiceById(voiceId);
  const view = voiceViews.get(voiceId);
  const existingPreset = findUserPresetById(voice?.presetId);

  if (!voice || !view || !existingPreset) {
    return;
  }

  const presetName = normalizePresetName(view.presetNameInput.value, existingPreset.name);
  const updatedPreset = createUserPresetSnapshot(voice, presetName, existingPreset);

  userPresets = [updatedPreset, ...userPresets.filter((entry) => entry.id !== updatedPreset.id)];
  persistUserPresets(userPresets);
  rebuildPresetCatalog();
  syncVoiceNamesForPreset(updatedPreset.id, updatedPreset.name);
  attachVoiceToPreset(voice, updatedPreset);
  refreshAllVoiceViews();
  syncAll();
  setStatus(`Eigenes Preset "${updatedPreset.name}" aktualisiert.`);
}

function deleteUserPresetFromVoice(voiceId) {
  const voice = getVoiceById(voiceId);
  const preset = findUserPresetById(voice?.presetId);

  if (!voice || !preset) {
    return;
  }

  if (isUserPresetInUseByOtherVoice(preset.id, voiceId)) {
    setStatus(`"${preset.name}" wird noch von einer anderen Voice verwendet.`);
    return;
  }

  userPresets = userPresets.filter((entry) => entry.id !== preset.id);
  persistUserPresets(userPresets);
  rebuildPresetCatalog();
  detachVoiceFromPreset(voice);
  refreshAllVoiceViews();
  syncAll();
  setStatus(`Eigenes Preset "${preset.name}" geloescht. Die aktuelle Voice bleibt als lokaler Stand erhalten.`);
}

function attachVoiceToPreset(voice, preset) {
  voice.presetId = preset.id;
  voice.presetName = preset.name;
  voice.presetSource = preset.source;
}

function detachVoiceFromPreset(voice) {
  voice.presetId = null;
  voice.presetSource = "detached";
}

function syncVoiceNamesForPreset(presetId, presetName) {
  appState.voices.forEach((voice) => {
    if (voice.presetId === presetId) {
      voice.presetName = presetName;
      voice.presetSource = "user";
    }
  });
}

function refreshAllVoiceViews() {
  voiceViews.forEach((view) => {
    refreshVoiceView(view);
  });
}

function isUserPresetInUseByOtherVoice(presetId, excludedVoiceId) {
  return appState.voices.some(
    (voice) => voice.voiceId !== excludedVoiceId && voice.presetSource === "user" && voice.presetId === presetId,
  );
}

function normalizePresetName(value, fallback) {
  const trimmed = String(value ?? "")
    .trim()
    .slice(0, 48);

  return trimmed || fallback || `User Preset ${userPresets.length + 1}`;
}

function describeVoiceState(voice) {
  if (voice.muted) {
    return "Muted. Clock bleibt synchron, Output ist still.";
  }

  if (voice.presetSource === "user") {
    return "Lokales User Preset. Speichern legt eine neue Variante an, Update ueberschreibt das aktive Preset.";
  }

  if (voice.presetSource === "detached") {
    return "Lokaler Session-Stand. Noch nicht als eigenes Preset gespeichert.";
  }

  return "Factory Preset als Ausgangspunkt, gemeinsames BPM.";
}

function syncAll(options = {}) {
  const modalDataByVoice = engine.sync(appState, options);
  renderActiveVoiceAnalysis(modalDataByVoice);
  analyserBuffer = engine.analyser ? new Float32Array(engine.analyser.fftSize) : analyserBuffer;
  persistSession();
}

function renderActiveVoiceAnalysis(modalDataByVoice = []) {
  const activeVoice = getActiveVoice();
  const activeVoiceIndex = activeVoice ? getVoiceIndexById(activeVoice.voiceId) : -1;
  const modalData = activeVoiceIndex >= 0 ? modalDataByVoice[activeVoiceIndex] : null;

  if (!activeVoice || !modalData) {
    drawBars(elements.freqCanvas, [0], { color: "#f0b075", baseline: 0 });
    drawBars(elements.weightCanvas, [0], { color: "#6ab1c7", baseline: 0, maxValue: 1 });
    elements.analysisVoiceLabel.textContent = "Keine Voice gewaehlt";
    elements.freqSummary.textContent = "Keine Daten";
    elements.weightSummary.textContent = "Keine Daten";
    return;
  }

  drawBars(elements.freqCanvas, modalData.frequencies, { color: "#f0b075", baseline: 0 });
  drawBars(elements.weightCanvas, modalData.weights, { color: "#6ab1c7", baseline: 0, maxValue: 1 });
  elements.analysisVoiceLabel.textContent = `Voice ${activeVoiceIndex + 1} · ${activeVoice.presetName}`;
  elements.freqSummary.textContent = summarizeFrequencies(modalData.frequencies);
  elements.weightSummary.textContent = summarizeWeights(modalData.weights);
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
