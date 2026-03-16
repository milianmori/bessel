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

const engine = new BesselAudioEngine();

const elements = {
  presetSelect: document.querySelector("#preset-select"),
  startButton: document.querySelector("#start-button"),
  triggerButton: document.querySelector("#trigger-button"),
  randomButton: document.querySelector("#random-button"),
  statusLine: document.querySelector("#status-line"),
  stepGrid: document.querySelector("#step-grid"),
  scalarControls: document.querySelector("#scalar-controls"),
  freqCanvas: document.querySelector("#freq-canvas"),
  weightCanvas: document.querySelector("#weight-canvas"),
  scopeCanvas: document.querySelector("#scope-canvas"),
  freqSummary: document.querySelector("#freq-summary"),
  weightSummary: document.querySelector("#weight-summary"),
  scopeSummary: document.querySelector("#scope-summary"),
  clickShapeCanvas: document.querySelector("#click-shape-canvas"),
  ampsCanvas: document.querySelector("#amps-canvas"),
  noiseEnvelopeCanvas: document.querySelector("#noise-envelope-canvas"),
  addPointButton: document.querySelector("#add-point-button"),
  removePointButton: document.querySelector("#remove-point-button"),
  segmentCurve: document.querySelector("#segment-curve"),
  segmentCurveValue: document.querySelector("#segment-curve-value"),
};

const scalarDefinitions = [
  { key: "tempo", label: "Tempo", min: 48, max: 192, step: 1 },
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
let state = null;
let clickSlider = null;
let ampsSlider = null;
let envelopeEditor = null;
let controlOutputs = new Map();
let controlInputs = new Map();
let analyserBuffer = null;

bootstrap().catch((error) => {
  console.error(error);
  setStatus(`Initialisierung fehlgeschlagen: ${error.message}`);
});

async function bootstrap() {
  buildStepGrid();
  presets = await loadPresets();
  state = cloneState(presets[0]);

  populatePresetSelect();
  buildScalarControls();
  buildEditors();
  wireActions();

  engine.onStep = ({ stepIndex, amplitude }) => {
    updateStepGrid(stepIndex, amplitude);
  };

  syncAll({ resetTransport: true });
  renderScopeLoop();
}

function populatePresetSelect() {
  presets.forEach((preset) => {
    const option = document.createElement("option");
    option.value = String(preset.id);
    option.textContent = preset.name;
    elements.presetSelect.append(option);
  });

  elements.presetSelect.value = String(state.id);
}

function buildScalarControls() {
  scalarDefinitions.forEach((definition) => {
    const control = document.createElement("label");
    control.className = "control";

    const title = document.createElement("span");
    title.textContent = definition.label;

    const valueRow = document.createElement("div");
    valueRow.className = "value-row";

    const output = document.createElement("output");
    controlOutputs.set(definition.key, output);

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(definition.transform === "log" ? 0 : definition.min);
    input.max = String(definition.transform === "log" ? 1 : definition.max);
    input.step = String(definition.transform === "log" ? 0.0001 : definition.step);
    input.value = String(toSliderValue(definition, state[definition.key]));

    input.addEventListener("input", () => {
      state[definition.key] = fromSliderValue(definition, Number(input.value));
      output.textContent = formatValue(definition.key, state[definition.key]);
      syncAll();
    });

    controlInputs.set(definition.key, input);
    valueRow.append(output);
    control.append(title, valueRow, input);
    elements.scalarControls.append(control);
  });

  refreshScalarControls();
}

function buildEditors() {
  clickSlider = new MultiSlider({
    canvas: elements.clickShapeCanvas,
    values: state.clickShape,
    fill: "#c57b57",
    onChange: (values) => {
      state.clickShape = values;
      syncAll();
    },
  });

  ampsSlider = new MultiSlider({
    canvas: elements.ampsCanvas,
    values: state.amps,
    fill: "#6ab1c7",
    onChange: (values) => {
      state.amps = values;
      syncAll();
    },
  });

  envelopeEditor = new EnvelopeEditor({
    canvas: elements.noiseEnvelopeCanvas,
    points: state.noiseEnvelope.points,
    onChange: (points) => {
      state.noiseEnvelope.points = points;
      updateCurveControl();
      syncAll();
    },
    onSelectionChange: () => {
      updateCurveControl();
    },
  });

  updateCurveControl();
}

function wireActions() {
  elements.presetSelect.addEventListener("change", () => {
    const preset = presets.find((entry) => entry.id === Number(elements.presetSelect.value));

    if (!preset) {
      return;
    }

    state = cloneState(preset);
    refreshEditors();
    refreshScalarControls();
    syncAll({ resetTransport: true });
    setStatus(`${preset.name} geladen.`);
  });

  elements.startButton.addEventListener("click", async () => {
    state.running = !state.running;

    if (state.running) {
      await engine.start(state);
      setStatus("Audio läuft. Transport aktiv.");
      elements.startButton.textContent = "Audio stoppen";
    } else {
      engine.sync(state, { resetTransport: false });
      setStatus("Transport gestoppt. Resonanzen klingen weiter aus.");
      elements.startButton.textContent = "Audio starten";
    }
  });

  elements.triggerButton.addEventListener("click", async () => {
    await engine.ensureReady();
    await engine.context.resume();
    engine.sync(state);
    engine.trigger();
    setStatus("Einzelschlag ausgelöst.");
  });

  elements.randomButton.addEventListener("click", () => {
    randomizeVisibleParameters();
  });

  elements.addPointButton.addEventListener("click", () => {
    envelopeEditor.addPoint();
    state.noiseEnvelope.points = envelopeEditor.points.map((point) => ({ ...point }));
    updateCurveControl();
    syncAll();
  });

  elements.removePointButton.addEventListener("click", () => {
    envelopeEditor.removePoint();
    state.noiseEnvelope.points = envelopeEditor.points.map((point) => ({ ...point }));
    updateCurveControl();
    syncAll();
  });

  elements.segmentCurve.addEventListener("input", () => {
    const value = Number(elements.segmentCurve.value);
    envelopeEditor.setCurve(value);
    state.noiseEnvelope.points = envelopeEditor.points.map((point) => ({ ...point }));
    updateCurveControl();
    syncAll();
  });
}

function refreshEditors() {
  clickSlider.setValues(state.clickShape);
  ampsSlider.setValues(state.amps);
  envelopeEditor.setPoints(state.noiseEnvelope.points);
  updateCurveControl();
  elements.presetSelect.value = String(state.id);
  elements.startButton.textContent = state.running ? "Audio stoppen" : "Audio starten";
}

function refreshScalarControls() {
  scalarDefinitions.forEach((definition) => {
    const input = controlInputs.get(definition.key);
    input.value = String(toSliderValue(definition, state[definition.key]));
    controlOutputs.get(definition.key).textContent = formatValue(definition.key, state[definition.key]);
  });
}

function syncAll(options = {}) {
  const modalData = engine.sync(state, options);
  drawBars(elements.freqCanvas, modalData.frequencies, { color: "#f0b075", baseline: 0 });
  drawBars(elements.weightCanvas, modalData.weights, { color: "#6ab1c7", baseline: 0, maxValue: 1 });
  elements.freqSummary.textContent = summarizeFrequencies(modalData.frequencies);
  elements.weightSummary.textContent = summarizeWeights(modalData.weights);
  analyserBuffer = engine.analyser ? new Float32Array(engine.analyser.fftSize) : analyserBuffer;
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

function updateStepGrid(activeIndex, amplitude) {
  [...elements.stepGrid.children].forEach((cell, index) => {
    cell.classList.toggle("is-active", index === activeIndex);
    cell.classList.toggle("is-muted", amplitude <= 0.001 && index === activeIndex);
  });
}

function updateCurveControl() {
  const curve = envelopeEditor.getSelectedCurve();
  elements.segmentCurve.value = String(curve);
  elements.segmentCurveValue.textContent = curve.toFixed(3);
}

function setStatus(message) {
  elements.statusLine.textContent = message;
}

function randomizeVisibleParameters() {
  scalarDefinitions.forEach((definition) => {
    state[definition.key] = randomizeScalarValue(definition);
  });

  state.clickShape = Array.from({ length: state.clickShape.length }, () => Math.random());
  state.amps = Array.from({ length: state.amps.length }, () => Math.random());
  state.noiseEnvelope.points = createRandomNoiseEnvelopePoints();

  refreshScalarControls();
  refreshEditors();
  syncAll();
  setStatus("Sichtbare Parameter randomisiert.");
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
