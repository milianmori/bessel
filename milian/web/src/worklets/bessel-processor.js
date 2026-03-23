class ErsatzBesselProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.running = false;
    this.tempo = 118;
    this.stepIndex = -1;
    this.stepCounter = 0;
    this.voices = [];

    this.port.onmessage = (event) => {
      if (event.data?.type === "config") {
        this.applyConfig(event.data.config ?? {});
      }

      if (event.data?.type === "manual-trigger") {
        this.triggerStep();
      }
    };
  }

  applyConfig(config) {
    if (typeof config.running === "boolean") {
      this.running = config.running;
    }

    if (typeof config.tempo === "number") {
      this.tempo = Math.max(10, config.tempo);
    }

    if (Array.isArray(config.voices)) {
      this.syncVoices(config.voices);
    }

    if (config.resetTransport) {
      this.stepCounter = 0;
      this.stepIndex = -1;
      this.voices.forEach((voice) => resetVoiceState(voice, false));
    }
  }

  syncVoices(voiceConfigs) {
    const existingById = new Map(this.voices.map((voice) => [voice.voiceId, voice]));

    this.voices = voiceConfigs.map((config) => {
      const voice = existingById.get(config.voiceId) ?? createVoiceRuntime(config);
      const wasMuted = voice.muted;

      applyVoiceConfig(voice, config);

      if (!wasMuted && voice.muted) {
        resetVoiceState(voice, true);
      }

      return voice;
    });
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const left = output[0];
    const right = output[1];
    const activeVoiceCount = this.voices.reduce((count, voice) => count + (voice.muted ? 0 : 1), 0);
    const normalization = Math.sqrt(Math.max(1, activeVoiceCount));

    for (let frame = 0; frame < left.length; frame += 1) {
      if (this.running) {
        this.advanceTransport();
      }

      let mixLeft = 0;
      let mixRight = 0;

      for (let voiceIndex = 0; voiceIndex < this.voices.length; voiceIndex += 1) {
        const frameMix = renderVoiceFrame(this.voices[voiceIndex]);
        mixLeft += frameMix.left;
        mixRight += frameMix.right;
      }

      left[frame] = Math.tanh(mixLeft / normalization);
      right[frame] = Math.tanh(mixRight / normalization);
    }

    return true;
  }

  advanceTransport() {
    const samplesPerStep = (sampleRate * 60) / this.tempo / 4;
    this.stepCounter += 1;

    if (this.stepCounter >= samplesPerStep) {
      this.stepCounter -= samplesPerStep;
      this.triggerStep();
    }
  }

  triggerStep() {
    const stepCount = this.voices.reduce((max, voice) => Math.max(max, voice.amps.length), 16);
    this.stepIndex = (this.stepIndex + 1) % Math.max(1, stepCount);

    const amplitudes = this.voices.map((voice) => triggerVoiceStep(voice, this.stepIndex));

    this.port.postMessage({
      type: "step",
      stepIndex: this.stepIndex % 16,
      amplitudes,
    });
  }
}

function createVoiceRuntime(config) {
  const frequencies = Array.isArray(config.frequencies) ? config.frequencies : new Array(16).fill(220);

  return {
    voiceId: config.voiceId,
    muted: false,
    masterGain: 0.72,
    pitchEnvDurMs: 50,
    pitchEnvCurve: 0,
    pitchEnvRange: 0,
    nzEnvDurMs: 50,
    clickShape: new Float32Array(64).fill(0.4),
    amps: new Float32Array(16).fill(0.65),
    frequencies: Float32Array.from(frequencies),
    qCoefficients: new Float32Array(frequencies.length).fill(0.03),
    noiseEnvelopePoints: [
      { time: 0, value: 0.89, curve: 0 },
      { time: 0.78, value: 0, curve: -0.845 },
    ],
    modeStates: createModeStates(frequencies.length),
    panLeft: 1,
    panRight: 0,
    clickIndex: 64,
    clickAmp: 0,
    noiseRemaining: 0,
    noiseTotal: 1,
    noiseAmp: 0,
    pitchRemaining: 0,
    pitchTotal: 1,
  };
}

function applyVoiceConfig(voice, config) {
  voice.voiceId = config.voiceId;
  voice.muted = Boolean(config.muted);

  if (typeof config.masterGain === "number") {
    voice.masterGain = clamp(config.masterGain, 0, 2);
  }

  if (typeof config.pitchEnvDurMs === "number") {
    voice.pitchEnvDurMs = Math.max(0, config.pitchEnvDurMs);
  }

  if (typeof config.pitchEnvCurve === "number") {
    voice.pitchEnvCurve = clamp(config.pitchEnvCurve, -1, 1);
  }

  if (typeof config.pitchEnvRange === "number") {
    voice.pitchEnvRange = clamp(config.pitchEnvRange, -48, 48);
  }

  if (typeof config.nzEnvDurMs === "number") {
    voice.nzEnvDurMs = Math.max(0, config.nzEnvDurMs);
  }

  if (Array.isArray(config.clickShape)) {
    voice.clickShape = Float32Array.from(config.clickShape);
    voice.clickIndex = Math.min(voice.clickIndex, voice.clickShape.length);
  }

  if (Array.isArray(config.amps)) {
    voice.amps = Float32Array.from(config.amps);
  }

  if (Array.isArray(config.frequencies)) {
    voice.frequencies = Float32Array.from(config.frequencies);
    voice.modeStates = resizeModeStates(voice.modeStates, voice.frequencies.length);
  }

  if (Array.isArray(config.qCoefficients)) {
    voice.qCoefficients = Float32Array.from(config.qCoefficients);
  }

  if (Array.isArray(config.noiseEnvelopePoints)) {
    voice.noiseEnvelopePoints = config.noiseEnvelopePoints.map((point) => ({
      time: clamp(point.time ?? 0, 0, 1),
      value: clamp(point.value ?? 0, 0, 1),
      curve: clamp(point.curve ?? 0, -1, 1),
    }));
  }
}

function createModeStates(length) {
  return Array.from({ length }, () => ({ d1: 0, d2: 0 }));
}

function resizeModeStates(existingStates, targetLength) {
  const states = existingStates.slice(0, targetLength);

  while (states.length < targetLength) {
    states.push({ d1: 0, d2: 0 });
  }

  return states;
}

function resetVoiceState(voice, clearModes) {
  voice.clickIndex = voice.clickShape.length;
  voice.clickAmp = 0;
  voice.noiseRemaining = 0;
  voice.noiseTotal = 1;
  voice.noiseAmp = 0;
  voice.pitchRemaining = 0;
  voice.pitchTotal = 1;

  if (clearModes) {
    voice.modeStates = voice.modeStates.map(() => ({ d1: 0, d2: 0 }));
  }
}

function triggerVoiceStep(voice, stepIndex) {
  if (!voice.amps.length || voice.muted) {
    resetVoiceState(voice, true);
    return 0;
  }

  if (stepIndex % 4 === 0) {
    const angle = Math.random() * Math.PI * 2;
    voice.panLeft = Math.cos(angle);
    voice.panRight = Math.sin(angle);
  }

  const amp = voice.amps[stepIndex % voice.amps.length] ?? 0;
  voice.clickAmp = amp;
  voice.clickIndex = 0;
  voice.noiseAmp = amp;
  voice.noiseTotal = Math.max(1, (voice.nzEnvDurMs / 1000) * sampleRate);
  voice.noiseRemaining = voice.nzEnvDurMs > 0 ? voice.noiseTotal : 0;
  voice.pitchTotal = Math.max(1, (voice.pitchEnvDurMs / 1000) * sampleRate);
  voice.pitchRemaining = voice.pitchEnvDurMs > 0 ? voice.pitchTotal : 0;
  return amp;
}

function renderVoiceFrame(voice) {
  if (voice.muted) {
    return { left: 0, right: 0 };
  }

  const excitation = renderVoiceExcitation(voice);
  const transpose = renderVoicePitchEnvelope(voice);
  let center = 0;
  let sideLeft = 0;
  let sideRight = 0;
  const centerCount = Math.min(4, voice.modeStates.length);
  const sideCount = Math.max(1, voice.modeStates.length - centerCount);

  for (let modeIndex = 0; modeIndex < voice.modeStates.length; modeIndex += 1) {
    const modeState = voice.modeStates[modeIndex];
    const baseFrequency = voice.frequencies[modeIndex] || 20;
    const transposedFrequency = clamp(baseFrequency * 2 ** (transpose / 12), 20, sampleRate / 4);
    const f = 2 * Math.sin((Math.PI * transposedFrequency) / sampleRate);
    const q = voice.qCoefficients[modeIndex] || 0.03;

    const high = sanitize(excitation - modeState.d2 - q * modeState.d1);
    const band = sanitize(high * f + modeState.d1);
    const low = sanitize(band * f + modeState.d2);

    modeState.d1 = band;
    modeState.d2 = low;

    if (modeIndex < centerCount) {
      center += band;
    } else {
      sideLeft += band * voice.panLeft;
      sideRight += band * voice.panRight;
    }
  }

  const mixedCenter = center / Math.sqrt(Math.max(1, centerCount));
  const mixedLeft = sideLeft / Math.sqrt(sideCount);
  const mixedRight = sideRight / Math.sqrt(sideCount);

  return {
    left: (mixedCenter + mixedLeft) * voice.masterGain,
    right: (mixedCenter + mixedRight) * voice.masterGain,
  };
}

function renderVoiceExcitation(voice) {
  let sample = 0;

  if (voice.clickIndex < voice.clickShape.length) {
    sample += (voice.clickShape[voice.clickIndex] || 0) * voice.clickAmp;
    voice.clickIndex += 1;
  }

  if (voice.noiseRemaining > 0 && voice.noiseAmp > 0) {
    const phase = 1 - voice.noiseRemaining / voice.noiseTotal;
    const envelope = evaluateEnvelope(voice.noiseEnvelopePoints, phase);
    sample += (Math.random() * 2 - 1) * envelope * voice.noiseAmp;
    voice.noiseRemaining -= 1;
  }

  return sample;
}

function renderVoicePitchEnvelope(voice) {
  if (voice.pitchRemaining <= 0 || voice.pitchEnvRange === 0) {
    return 0;
  }

  const phase = 1 - voice.pitchRemaining / voice.pitchTotal;
  const ramp = 1 - phase;
  const shaped = curveTransfer(ramp, voice.pitchEnvCurve);
  voice.pitchRemaining -= 1;
  return shaped * voice.pitchEnvRange;
}

function evaluateEnvelope(points, phase) {
  if (!points.length) {
    return 0;
  }

  const x = clamp(phase, 0, 1);

  if (x <= points[0].time) {
    return points[0].value;
  }

  for (let index = 1; index < points.length; index += 1) {
    const end = points[index];

    if (x <= end.time) {
      const start = points[index - 1];
      const span = Math.max(end.time - start.time, 0.000001);
      const local = (x - start.time) / span;
      const shaped = curveTransfer(local, end.curve);
      return start.value + (end.value - start.value) * shaped;
    }
  }

  return points[points.length - 1].value;
}

function curveTransfer(value, curve) {
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

function sanitize(value) {
  if (!Number.isFinite(value) || Math.abs(value) < 1e-12) {
    return 0;
  }

  return value;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

registerProcessor("ersatz-bessel-engine", ErsatzBesselProcessor);
