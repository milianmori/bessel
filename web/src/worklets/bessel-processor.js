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
      this.syncVoices(config.voices, config.resetVoiceIds);
    }

    if (config.resetTransport) {
      this.stepCounter = 0;
      this.stepIndex = -1;
      this.voices.forEach((voice) => resetVoiceState(voice, false));
    }
  }

  syncVoices(voiceConfigs, resetVoiceIds = []) {
    const existingById = new Map(this.voices.map((voice) => [voice.voiceId, voice]));
    const resetVoiceIdSet = new Set(
      Array.isArray(resetVoiceIds)
        ? resetVoiceIds.map((voiceId) => Number(voiceId)).filter((voiceId) => Number.isFinite(voiceId))
        : [],
    );

    this.voices = voiceConfigs.map((config) => {
      const voice = existingById.get(config.voiceId) ?? createVoiceRuntime(config);
      const wasMuted = voice.muted;

      applyVoiceConfig(voice, config);

      if (!wasMuted && voice.muted) {
        resetVoiceState(voice, true);
      }

      if (resetVoiceIdSet.has(voice.voiceId)) {
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

      left[frame] = sanitize(mixLeft / normalization);
      right[frame] = sanitize(mixRight / normalization);
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
    const randomizedVoices = [];
    const amplitudes = this.voices.map((voice) => {
      const result = triggerVoiceStep(voice, this.stepIndex);

      if (result.randomizedValues) {
        randomizedVoices.push({
          voiceId: voice.voiceId,
          values: result.randomizedValues,
        });
      }

      return result.amplitude;
    });

    this.port.postMessage({
      type: "step",
      stepIndex: this.stepIndex % 16,
      amplitudes,
      randomizedVoices,
    });
  }
}

const MAX_MODAL_FREQUENCY_FACTOR = 8;
const LOW_END_DECAY_MIN_FREQUENCY = 50;
const LOW_END_DECAY_MAX_FREQUENCY = 1600;
const PERC_GLUE_KNEE_DB = 4.5;
const RUNAWAY_STATE_LIMIT = 64;
const TWO_PI = Math.PI * 2;

function createVoiceRuntime(config) {
  const frequencies = Array.isArray(config.frequencies) ? config.frequencies : new Array(16).fill(220);

  return {
    voiceId: config.voiceId,
    voiceType: "perc",
    muted: false,
    masterGain: 0.72,
    pitchEnvDurMs: 50,
    pitchEnvCurve: 0,
    pitchEnvRange: 0,
    noiseLevel: 1,
    nzEnvDurMs: 50,
    lowEndDecay: 1,
    percGlueAmount: 0.28,
    percGlueAttackMs: 10,
    percGlueReleaseMs: 180,
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
    randomizeKickClickLevelPerStep: false,
    randomizeKickClickDecayMsPerStep: false,
    randomizeClickShapePerStep: false,
    randomizeNzEnvDurMsPerStep: false,
    randomizeSubBassDrivePerStep: false,
    randomizeSubBassDecayMsPerStep: false,
    randomizeSubBassWaveMixPerStep: false,
    subBassFreqHz: 43,
    subBassAttackMs: 6,
    subBassDecayMs: 520,
    subBassWaveMix: 0.2,
    subBassSubLevel: 0.66,
    subBassDrive: 0.12,
    subBassTone: 0.34,
    clickShape: new Float32Array(64).fill(0.4),
    amps: new Float32Array(16).fill(0.65),
    frequencies: Float32Array.from(frequencies),
    qCoefficients: new Float32Array(frequencies.length).fill(0.03),
    noiseEnvelopePoints: [
      { time: 0, value: 0.89, curve: 0 },
      { time: 0.78, value: 0, curve: -0.845 },
    ],
    modeStates: createModeStates(frequencies.length),
    percGlueEnvelope: 0,
    panLeft: 1,
    panRight: 0,
    clickIndex: 64,
    clickAmp: 0,
    noiseRemaining: 0,
    noiseTotal: 1,
    noiseAmp: 0,
    pitchRemaining: 0,
    pitchTotal: 1,
    kickAmplitude: 0,
    kickBodyRemaining: 0,
    kickBodyTotal: 1,
    kickPitchRemaining: 0,
    kickPitchTotal: 1,
    kickClickRemaining: 0,
    kickClickTotal: 1,
    kickNoiseRemaining: 0,
    kickNoiseTotal: 1,
    kickPhase: 0,
    kickToneState: 0,
    subBassAmplitude: 0,
    subBassAttackRemaining: 0,
    subBassAttackTotal: 1,
    subBassDecayRemaining: 0,
    subBassDecayTotal: 1,
    subBassPhase: 0,
    subBassToneState: 0,
  };
}

function applyVoiceConfig(voice, config) {
  voice.voiceId = config.voiceId;
  voice.voiceType = normalizeVoiceType(config.voiceType);
  voice.muted = Boolean(config.muted);
  voice.randomizeKickClickLevelPerStep = Boolean(config.randomizeKickClickLevelPerStep);
  voice.randomizeKickClickDecayMsPerStep = Boolean(config.randomizeKickClickDecayMsPerStep);
  voice.randomizeClickShapePerStep = Boolean(config.randomizeClickShapePerStep);
  voice.randomizeNzEnvDurMsPerStep = Boolean(config.randomizeNzEnvDurMsPerStep);
  voice.randomizeSubBassDrivePerStep = Boolean(config.randomizeSubBassDrivePerStep);
  voice.randomizeSubBassDecayMsPerStep = Boolean(config.randomizeSubBassDecayMsPerStep);
  voice.randomizeSubBassWaveMixPerStep = Boolean(config.randomizeSubBassWaveMixPerStep);

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
    voice.pitchEnvRange = clamp(config.pitchEnvRange, -2, 24);
  }

  if (typeof config.noiseLevel === "number") {
    voice.noiseLevel = clamp(config.noiseLevel, 0, 1);
  }

  if (typeof config.nzEnvDurMs === "number") {
    voice.nzEnvDurMs = Math.max(0, config.nzEnvDurMs);
  }

  if (typeof config.lowEndDecay === "number") {
    voice.lowEndDecay = clamp(config.lowEndDecay, 0.25, 2);
  }

  if (typeof config.percGlueAmount === "number") {
    voice.percGlueAmount = clamp(config.percGlueAmount, 0, 1);
  }

  if (typeof config.percGlueAttackMs === "number") {
    voice.percGlueAttackMs = clamp(config.percGlueAttackMs, 0.5, 80);
  }

  if (typeof config.percGlueReleaseMs === "number") {
    voice.percGlueReleaseMs = clamp(config.percGlueReleaseMs, 20, 800);
  }

  if (typeof config.kickBodyFreqHz === "number") {
    voice.kickBodyFreqHz = clamp(config.kickBodyFreqHz, 28, 120);
  }

  if (typeof config.kickBodyDecayMs === "number") {
    voice.kickBodyDecayMs = clamp(config.kickBodyDecayMs, 60, 2000);
  }

  if (typeof config.kickPitchDropSt === "number") {
    voice.kickPitchDropSt = clamp(config.kickPitchDropSt, 0, 24);
  }

  if (typeof config.kickPitchDropMs === "number") {
    voice.kickPitchDropMs = clamp(config.kickPitchDropMs, 0, 250);
  }

  if (typeof config.kickClickLevel === "number") {
    voice.kickClickLevel = clamp(config.kickClickLevel, 0, 1);
  }

  if (typeof config.kickClickDecayMs === "number") {
    voice.kickClickDecayMs = clamp(config.kickClickDecayMs, 1, 80);
  }

  if (typeof config.kickNoiseLevel === "number") {
    voice.kickNoiseLevel = clamp(config.kickNoiseLevel, 0, 1);
  }

  if (typeof config.kickNoiseDecayMs === "number") {
    voice.kickNoiseDecayMs = clamp(config.kickNoiseDecayMs, 1, 220);
  }

  if (typeof config.kickDrive === "number") {
    voice.kickDrive = clamp(config.kickDrive, 0, 1);
  }

  if (typeof config.kickTone === "number") {
    voice.kickTone = clamp(config.kickTone, 0, 1);
  }

  if (typeof config.subBassFreqHz === "number") {
    voice.subBassFreqHz = clamp(config.subBassFreqHz, 28, 90);
  }

  if (typeof config.subBassAttackMs === "number") {
    voice.subBassAttackMs = clamp(config.subBassAttackMs, 0, 120);
  }

  if (typeof config.subBassDecayMs === "number") {
    voice.subBassDecayMs = clamp(config.subBassDecayMs, 80, 2400);
  }

  if (typeof config.subBassWaveMix === "number") {
    voice.subBassWaveMix = clamp(config.subBassWaveMix, 0, 1);
  }

  if (typeof config.subBassSubLevel === "number") {
    voice.subBassSubLevel = clamp(config.subBassSubLevel, 0, 1);
  }

  if (typeof config.subBassDrive === "number") {
    voice.subBassDrive = clamp(config.subBassDrive, 0, 1);
  }

  if (typeof config.subBassTone === "number") {
    voice.subBassTone = clamp(config.subBassTone, 0, 1);
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
  voice.percGlueEnvelope = 0;
  voice.kickAmplitude = 0;
  voice.kickBodyRemaining = 0;
  voice.kickBodyTotal = 1;
  voice.kickPitchRemaining = 0;
  voice.kickPitchTotal = 1;
  voice.kickClickRemaining = 0;
  voice.kickClickTotal = 1;
  voice.kickNoiseRemaining = 0;
  voice.kickNoiseTotal = 1;
  voice.kickPhase = 0;
  voice.kickToneState = 0;
  voice.subBassAmplitude = 0;
  voice.subBassAttackRemaining = 0;
  voice.subBassAttackTotal = 1;
  voice.subBassDecayRemaining = 0;
  voice.subBassDecayTotal = 1;
  voice.subBassPhase = 0;
  voice.subBassToneState = 0;

  if (clearModes) {
    voice.modeStates = voice.modeStates.map(() => ({ d1: 0, d2: 0 }));
  }
}

function triggerVoiceStep(voice, stepIndex) {
  if (!voice.amps.length || voice.muted) {
    resetVoiceState(voice, true);
    return {
      amplitude: 0,
      randomizedValues: null,
    };
  }

  const amp = voice.amps[stepIndex % voice.amps.length] ?? 0;
  const randomizedValues = applyStepRandomization(voice);

  if (voice.voiceType === "kick") {
    voice.kickAmplitude = amp;
    voice.kickPhase = 0;
    voice.kickBodyTotal = Math.max(1, (voice.kickBodyDecayMs / 1000) * sampleRate);
    voice.kickBodyRemaining = amp > 0 ? voice.kickBodyTotal : 0;
    voice.kickPitchTotal = Math.max(1, (voice.kickPitchDropMs / 1000) * sampleRate);
    voice.kickPitchRemaining = voice.kickPitchDropMs > 0 && amp > 0 ? voice.kickPitchTotal : 0;
    voice.kickClickTotal = Math.max(1, (voice.kickClickDecayMs / 1000) * sampleRate);
    voice.kickClickRemaining = voice.kickClickLevel > 0 && amp > 0 ? voice.kickClickTotal : 0;
    voice.kickNoiseTotal = Math.max(1, (voice.kickNoiseDecayMs / 1000) * sampleRate);
    voice.kickNoiseRemaining = voice.kickNoiseLevel > 0 && amp > 0 ? voice.kickNoiseTotal : 0;
    return {
      amplitude: amp,
      randomizedValues,
    };
  }

  if (voice.voiceType === "subbass") {
    if (amp <= 0) {
      return {
        amplitude: 0,
        randomizedValues,
      };
    }

    voice.subBassAmplitude = amp;
    voice.subBassPhase = 0;
    voice.subBassAttackTotal = Math.max(1, (voice.subBassAttackMs / 1000) * sampleRate);
    voice.subBassAttackRemaining = voice.subBassAttackMs > 0 ? voice.subBassAttackTotal : 0;
    voice.subBassDecayTotal = Math.max(1, (voice.subBassDecayMs / 1000) * sampleRate);
    voice.subBassDecayRemaining = voice.subBassDecayTotal;
    return {
      amplitude: amp,
      randomizedValues,
    };
  }

  if (stepIndex % 4 === 0) {
    const angle = Math.random() * Math.PI * 2;
    voice.panLeft = Math.cos(angle);
    voice.panRight = Math.sin(angle);
  }

  voice.clickAmp = amp;
  voice.clickIndex = 0;
  voice.noiseAmp = amp * voice.noiseLevel;
  voice.noiseTotal = Math.max(1, (voice.nzEnvDurMs / 1000) * sampleRate);
  voice.noiseRemaining = voice.nzEnvDurMs > 0 ? voice.noiseTotal : 0;
  voice.pitchTotal = Math.max(1, (voice.pitchEnvDurMs / 1000) * sampleRate);
  voice.pitchRemaining = voice.pitchEnvDurMs > 0 ? voice.pitchTotal : 0;
  return {
    amplitude: amp,
    randomizedValues,
  };
}

function applyStepRandomization(voice) {
  const randomizedValues = {};

  if (voice.voiceType === "kick") {
    if (voice.randomizeKickClickLevelPerStep) {
      voice.kickClickLevel = randomInRange(0.05, 0.34, 0.001);
      randomizedValues.kickClickLevel = voice.kickClickLevel;
    }

    if (voice.randomizeKickClickDecayMsPerStep) {
      voice.kickClickDecayMs = randomInRange(4, 22, 0.1);
      randomizedValues.kickClickDecayMs = voice.kickClickDecayMs;
    }

    return Object.keys(randomizedValues).length ? randomizedValues : null;
  }

  if (voice.voiceType === "subbass") {
    if (voice.randomizeSubBassDrivePerStep) {
      voice.subBassDrive = randomInRange(0.02, 0.26, 0.001);
      randomizedValues.subBassDrive = voice.subBassDrive;
    }

    if (voice.randomizeSubBassDecayMsPerStep) {
      voice.subBassDecayMs = randomInRange(180, 980, 1);
      randomizedValues.subBassDecayMs = voice.subBassDecayMs;
    }

    if (voice.randomizeSubBassWaveMixPerStep) {
      voice.subBassWaveMix = randomInRange(0.04, 0.5, 0.001);
      randomizedValues.subBassWaveMix = voice.subBassWaveMix;
    }

    return Object.keys(randomizedValues).length ? randomizedValues : null;
  }

  if (voice.randomizeClickShapePerStep) {
    voice.clickShape = createRandomClickShape(voice.clickShape.length);
    randomizedValues.clickShape = Array.from(voice.clickShape);
  }

  if (voice.randomizeNzEnvDurMsPerStep) {
    voice.nzEnvDurMs = randomInRange(0, 220, 0.1);
    randomizedValues.nzEnvDurMs = voice.nzEnvDurMs;
  }

  return Object.keys(randomizedValues).length ? randomizedValues : null;
}

function createRandomClickShape(length) {
  return Float32Array.from({ length }, () => Math.random());
}

function renderVoiceFrame(voice) {
  if (voice.muted) {
    return { left: 0, right: 0 };
  }

  if (voice.voiceType === "kick") {
    return renderKickFrame(voice);
  }

  if (voice.voiceType === "subbass") {
    return renderSubBassFrame(voice);
  }

  return renderPercFrame(voice);
}

function renderPercFrame(voice) {
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
    const transposedFrequency = clamp(
      baseFrequency * 2 ** (transpose / 12),
      20,
      sampleRate / MAX_MODAL_FREQUENCY_FACTOR,
    );
    const f = 2 * Math.sin((Math.PI * transposedFrequency) / sampleRate);
    const q = computePercModeDamping(voice.qCoefficients[modeIndex] || 0.03, transposedFrequency, voice.lowEndDecay);

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
  const rawLeft = mixedCenter + mixedLeft;
  const rawRight = mixedCenter + mixedRight;
  const glued = applyPercGlueCompressor(voice, rawLeft, rawRight);

  return {
    left: glued.left * voice.masterGain,
    right: glued.right * voice.masterGain,
  };
}

function renderKickFrame(voice) {
  const hasBody = voice.kickBodyRemaining > 0 && voice.kickAmplitude > 0;
  const hasClick = voice.kickClickRemaining > 0 && voice.kickAmplitude > 0;
  const hasNoise = voice.kickNoiseRemaining > 0 && voice.kickAmplitude > 0;

  if (!hasBody && !hasClick && !hasNoise) {
    return { left: 0, right: 0 };
  }

  const pitchEnvelope = renderKickPitchEnvelope(voice);
  const bodyFrequency = clamp(
    voice.kickBodyFreqHz * 2 ** ((voice.kickPitchDropSt * pitchEnvelope) / 12),
    20,
    sampleRate * 0.45,
  );

  voice.kickPhase += (TWO_PI * bodyFrequency) / sampleRate;

  if (voice.kickPhase >= TWO_PI) {
    voice.kickPhase -= TWO_PI;
  }

  let sample = 0;

  if (hasBody) {
    sample += Math.sin(voice.kickPhase) * renderDecayEnvelope(voice.kickBodyRemaining, voice.kickBodyTotal, 7);
    voice.kickBodyRemaining -= 1;
  }

  if (hasClick) {
    sample +=
      (Math.random() * 2 - 1) *
      voice.kickClickLevel *
      renderDecayEnvelope(voice.kickClickRemaining, voice.kickClickTotal, 22);
    voice.kickClickRemaining -= 1;
  }

  if (hasNoise) {
    sample +=
      (Math.random() * 2 - 1) *
      voice.kickNoiseLevel *
      renderDecayEnvelope(voice.kickNoiseRemaining, voice.kickNoiseTotal, 10);
    voice.kickNoiseRemaining -= 1;
  }

  sample *= voice.kickAmplitude;

  const cutoff = 220 + voice.kickTone * 6000;
  const toneAlpha = 1 - Math.exp((-TWO_PI * cutoff) / sampleRate);
  voice.kickToneState += toneAlpha * (sample - voice.kickToneState);

  const driven = applyDrive(voice.kickToneState, voice.kickDrive);
  const output = driven * voice.masterGain;

  return {
    left: output,
    right: output,
  };
}

function renderSubBassFrame(voice) {
  const hasEnvelope = voice.subBassAmplitude > 0 && (voice.subBassAttackRemaining > 0 || voice.subBassDecayRemaining > 0);

  if (!hasEnvelope && Math.abs(voice.subBassToneState) < 1e-5) {
    return { left: 0, right: 0 };
  }

  let sample = 0;

  if (hasEnvelope) {
    const envelope = renderSubBassEnvelope(voice);
    voice.subBassPhase += (TWO_PI * voice.subBassFreqHz) / sampleRate;

    if (voice.subBassPhase >= TWO_PI) {
      voice.subBassPhase -= TWO_PI;
    }

    const sine = Math.sin(voice.subBassPhase);
    const triangle = (2 / Math.PI) * Math.asin(Math.sin(voice.subBassPhase));
    const voiced = sine * (1 - voice.subBassWaveMix) + triangle * voice.subBassWaveMix;
    const layered = (voiced + sine * voice.subBassSubLevel * 0.85) / (1 + voice.subBassSubLevel * 0.85);
    sample = layered * envelope * voice.subBassAmplitude;
  }

  const cutoff = 80 + voice.subBassTone ** 1.5 * 3200;
  const toneAlpha = 1 - Math.exp((-TWO_PI * cutoff) / sampleRate);
  voice.subBassToneState += toneAlpha * (sample - voice.subBassToneState);

  const driven = applyDrive(voice.subBassToneState, voice.subBassDrive);
  const output = driven * voice.masterGain;

  return {
    left: output,
    right: output,
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

function renderKickPitchEnvelope(voice) {
  if (voice.kickPitchRemaining <= 0 || voice.kickPitchDropSt <= 0) {
    return 0;
  }

  const phase = 1 - voice.kickPitchRemaining / voice.kickPitchTotal;
  const envelope = (1 - phase) ** 2.4;
  voice.kickPitchRemaining -= 1;
  return envelope;
}

function renderSubBassEnvelope(voice) {
  let attack = 1;

  if (voice.subBassAttackRemaining > 0) {
    attack = 1 - voice.subBassAttackRemaining / voice.subBassAttackTotal;
    voice.subBassAttackRemaining -= 1;
  }

  if (voice.subBassDecayRemaining <= 0) {
    return 0;
  }

  const decay = renderDecayEnvelope(voice.subBassDecayRemaining, voice.subBassDecayTotal, 4.2);
  voice.subBassDecayRemaining -= 1;
  return attack * decay;
}

function renderDecayEnvelope(remaining, total, slope) {
  if (remaining <= 0 || total <= 0) {
    return 0;
  }

  const phase = 1 - remaining / total;
  return Math.exp(-phase * slope);
}

function computePercModeDamping(baseQ, frequency, lowEndDecay) {
  const lowEndWeight = computeLowEndWeight(frequency);

  if (lowEndWeight <= 0) {
    return clamp(baseQ, 0.0001, 2);
  }

  const decayScale = clamp(lowEndDecay, 0.25, 2);
  const dampingScale = 1 + lowEndWeight * ((1 / decayScale) - 1);
  return clamp(baseQ * dampingScale, 0.0001, 2);
}

function applyPercGlueCompressor(voice, left, right) {
  if (voice.percGlueAmount <= 0.0001) {
    return { left, right };
  }

  const peak = Math.max(Math.abs(left), Math.abs(right));
  const rms = Math.sqrt((left * left + right * right) * 0.5);
  const detector = lerp(rms, peak, 0.45 + voice.percGlueAmount * 0.4);
  const attackCoeff = computeTimeCoefficient(voice.percGlueAttackMs);
  const releaseCoeff = computeTimeCoefficient(voice.percGlueReleaseMs);
  const envelopeCoeff = detector > voice.percGlueEnvelope ? attackCoeff : releaseCoeff;
  voice.percGlueEnvelope = envelopeCoeff * voice.percGlueEnvelope + (1 - envelopeCoeff) * detector;

  const thresholdDb = lerp(-3, -36, voice.percGlueAmount);
  const ratio = lerp(1, 12, voice.percGlueAmount ** 0.82);
  const envelopeDb = gainToDb(voice.percGlueEnvelope);
  const gainReductionDb = computeSoftKneeGainReductionDb(envelopeDb, thresholdDb, ratio, PERC_GLUE_KNEE_DB);
  const makeupDb = voice.percGlueAmount * 1.8 + gainReductionDb * (0.04 + voice.percGlueAmount * 0.07);
  const appliedGain = dbToGain(makeupDb - gainReductionDb);

  return {
    left: sanitize(left * appliedGain),
    right: sanitize(right * appliedGain),
  };
}

function computeLowEndWeight(frequency) {
  const clampedFrequency = clamp(frequency, LOW_END_DECAY_MIN_FREQUENCY, LOW_END_DECAY_MAX_FREQUENCY);
  const minLog = Math.log2(LOW_END_DECAY_MIN_FREQUENCY);
  const maxLog = Math.log2(LOW_END_DECAY_MAX_FREQUENCY);
  const normalized = 1 - (Math.log2(clampedFrequency) - minLog) / Math.max(maxLog - minLog, 0.000001);
  return clamp(normalized, 0, 1) ** 1.35;
}

function applyDrive(value, drive) {
  if (drive <= 0.0001) {
    return value;
  }

  const gain = 1 + drive * 10;
  return Math.tanh(value * gain) / Math.tanh(gain);
}

function computeTimeCoefficient(timeMs) {
  const safeTimeMs = Math.max(timeMs, 0.001);
  return Math.exp(-1 / ((safeTimeMs / 1000) * sampleRate));
}

function computeSoftKneeGainReductionDb(levelDb, thresholdDb, ratio, kneeDb) {
  if (ratio <= 1.0001) {
    return 0;
  }

  const overshootDb = levelDb - thresholdDb;
  const halfKneeDb = kneeDb * 0.5;
  const slope = 1 - 1 / ratio;

  if (overshootDb <= -halfKneeDb) {
    return 0;
  }

  if (overshootDb >= halfKneeDb) {
    return overshootDb * slope;
  }

  const kneeProgressDb = overshootDb + halfKneeDb;
  return slope * (kneeProgressDb * kneeProgressDb) / Math.max(kneeDb * 2, 0.000001);
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
  if (!Number.isFinite(value) || Math.abs(value) < 1e-12 || Math.abs(value) > RUNAWAY_STATE_LIMIT) {
    return 0;
  }

  return value;
}

function gainToDb(value) {
  return 20 * Math.log10(Math.max(value, 1e-6));
}

function dbToGain(value) {
  return 10 ** (value / 20);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
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

function countDecimals(value) {
  const valueAsString = String(value);
  const decimals = valueAsString.split(".")[1];
  return decimals ? decimals.length : 0;
}

function normalizeVoiceType(value) {
  if (value === "kick") {
    return "kick";
  }

  if (value === "subbass" || value === "sub-bass") {
    return "subbass";
  }

  return "perc";
}

registerProcessor("ersatz-bessel-engine", ErsatzBesselProcessor);
