class ErsatzBesselProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.running = false;
    this.tempo = 118;
    this.masterGain = 0.72;
    this.pitchEnvDurMs = 50;
    this.pitchEnvCurve = 0;
    this.pitchEnvRange = 0;
    this.nzEnvDurMs = 50;
    this.clickShape = new Float32Array(64).fill(0.4);
    this.amps = new Float32Array(16).fill(0.65);
    this.frequencies = new Float32Array(16).fill(220);
    this.qCoefficients = new Float32Array(16).fill(0.03);
    this.noiseEnvelopePoints = [
      { time: 0, value: 0.89, curve: 0 },
      { time: 0.78, value: 0, curve: -0.845 },
    ];

    this.modeStates = Array.from({ length: 16 }, () => ({ d1: 0, d2: 0 }));
    this.stepIndex = -1;
    this.stepCounter = 0;
    this.panLeft = 1;
    this.panRight = 0;

    this.clickIndex = this.clickShape.length;
    this.clickAmp = 0;
    this.noiseRemaining = 0;
    this.noiseTotal = 1;
    this.noiseAmp = 0;
    this.pitchRemaining = 0;
    this.pitchTotal = 1;

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

    if (typeof config.masterGain === "number") {
      this.masterGain = clamp(config.masterGain, 0, 2);
    }

    if (typeof config.pitchEnvDurMs === "number") {
      this.pitchEnvDurMs = Math.max(0, config.pitchEnvDurMs);
    }

    if (typeof config.pitchEnvCurve === "number") {
      this.pitchEnvCurve = clamp(config.pitchEnvCurve, -1, 1);
    }

    if (typeof config.pitchEnvRange === "number") {
      this.pitchEnvRange = clamp(config.pitchEnvRange, -48, 48);
    }

    if (typeof config.nzEnvDurMs === "number") {
      this.nzEnvDurMs = Math.max(0, config.nzEnvDurMs);
    }

    if (Array.isArray(config.clickShape)) {
      this.clickShape = Float32Array.from(config.clickShape);
    }

    if (Array.isArray(config.amps)) {
      this.amps = Float32Array.from(config.amps);
    }

    if (Array.isArray(config.frequencies)) {
      this.frequencies = Float32Array.from(config.frequencies);
    }

    if (Array.isArray(config.qCoefficients)) {
      this.qCoefficients = Float32Array.from(config.qCoefficients);
    }

    if (Array.isArray(config.noiseEnvelopePoints)) {
      this.noiseEnvelopePoints = config.noiseEnvelopePoints.map((point) => ({
        time: clamp(point.time ?? 0, 0, 1),
        value: clamp(point.value ?? 0, 0, 1),
        curve: clamp(point.curve ?? 0, -1, 1),
      }));
    }

    if (config.resetTransport) {
      this.stepCounter = 0;
      this.stepIndex = -1;
      this.clickIndex = this.clickShape.length;
      this.noiseRemaining = 0;
      this.pitchRemaining = 0;
    }
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const left = output[0];
    const right = output[1];

    for (let frame = 0; frame < left.length; frame += 1) {
      if (this.running) {
        this.advanceTransport();
      }

      const excitation = this.renderExcitation();
      const transpose = this.renderPitchEnvelope();

      let center = 0;
      let sideLeft = 0;
      let sideRight = 0;

      for (let modeIndex = 0; modeIndex < this.modeStates.length; modeIndex += 1) {
        const modeState = this.modeStates[modeIndex];
        const baseFrequency = this.frequencies[modeIndex] || 20;
        const transposedFrequency = clamp(baseFrequency * 2 ** (transpose / 12), 20, sampleRate / 4);
        const f = 2 * Math.sin(Math.PI * transposedFrequency / sampleRate);
        const q = this.qCoefficients[modeIndex] || 0.03;

        const high = sanitize(excitation - modeState.d2 - q * modeState.d1);
        const band = sanitize(high * f + modeState.d1);
        const low = sanitize(band * f + modeState.d2);

        modeState.d1 = band;
        modeState.d2 = low;

        if (modeIndex < 4) {
          center += band;
        } else {
          sideLeft += band * this.panLeft;
          sideRight += band * this.panRight;
        }
      }

      const mixedCenter = center / Math.sqrt(4);
      const mixedLeft = sideLeft / Math.sqrt(12);
      const mixedRight = sideRight / Math.sqrt(12);

      left[frame] = Math.tanh((mixedCenter + mixedLeft) * this.masterGain);
      right[frame] = Math.tanh((mixedCenter + mixedRight) * this.masterGain);
    }

    return true;
  }

  advanceTransport() {
    const samplesPerStep = sampleRate * 60 / this.tempo / 4;
    this.stepCounter += 1;

    if (this.stepCounter >= samplesPerStep) {
      this.stepCounter -= samplesPerStep;
      this.triggerStep();
    }
  }

  triggerStep() {
    this.stepIndex = (this.stepIndex + 1) % this.amps.length;

    if (this.stepIndex % 4 === 0) {
      const angle = Math.random() * Math.PI * 2;
      this.panLeft = Math.cos(angle);
      this.panRight = Math.sin(angle);
    }

    const amp = this.amps[this.stepIndex] ?? 0;
    this.clickAmp = amp;
    this.clickIndex = 0;
    this.noiseAmp = amp;
    this.noiseTotal = Math.max(1, (this.nzEnvDurMs / 1000) * sampleRate);
    this.noiseRemaining = this.nzEnvDurMs > 0 ? this.noiseTotal : 0;
    this.pitchTotal = Math.max(1, (this.pitchEnvDurMs / 1000) * sampleRate);
    this.pitchRemaining = this.pitchEnvDurMs > 0 ? this.pitchTotal : 0;

    this.port.postMessage({
      type: "step",
      stepIndex: this.stepIndex,
      amplitude: amp,
      panLeft: this.panLeft,
      panRight: this.panRight,
    });
  }

  renderExcitation() {
    let sample = 0;

    if (this.clickIndex < this.clickShape.length) {
      sample += (this.clickShape[this.clickIndex] || 0) * this.clickAmp;
      this.clickIndex += 1;
    }

    if (this.noiseRemaining > 0 && this.noiseAmp > 0) {
      const phase = 1 - this.noiseRemaining / this.noiseTotal;
      const envelope = evaluateEnvelope(this.noiseEnvelopePoints, phase);
      sample += (Math.random() * 2 - 1) * envelope * this.noiseAmp;
      this.noiseRemaining -= 1;
    }

    return sample;
  }

  renderPitchEnvelope() {
    if (this.pitchRemaining <= 0 || this.pitchEnvRange === 0) {
      return 0;
    }

    const phase = 1 - this.pitchRemaining / this.pitchTotal;
    const ramp = 1 - phase;
    const shaped = curveTransfer(ramp, this.pitchEnvCurve);
    this.pitchRemaining -= 1;
    return shaped * this.pitchEnvRange;
  }
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
