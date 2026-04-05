const BUTTERWORTH_Q = Math.SQRT1_2;
const MIN_DECIBELS = -120;
const TWO_PI = Math.PI * 2;

const MASTER_MODE_PROFILES = {
  balanced: {
    thresholdShiftDb: [0, 0, 0],
    ratioMul: [1, 1, 1],
    attackMul: [1, 1, 1],
    releaseMul: [1, 1, 1],
    maxReductionMul: [1, 1, 1],
    peakWeightShift: [0, 0, 0],
    outputTrimDb: [0, 0, 0],
  },
  aggressive: {
    thresholdShiftDb: [-3.4, -4.1, -3],
    ratioMul: [1.52, 1.72, 1.46],
    attackMul: [0.58, 0.52, 0.48],
    releaseMul: [0.78, 0.72, 0.76],
    maxReductionMul: [1.72, 1.96, 1.52],
    peakWeightShift: [0.04, 0.06, 0.08],
    outputTrimDb: [0.34, 0.2, 0.08],
  },
  punch: {
    thresholdShiftDb: [1.4, 2.2, 2.8],
    ratioMul: [0.88, 0.8, 0.72],
    attackMul: [1.92, 1.82, 1.5],
    releaseMul: [0.82, 0.76, 0.72],
    maxReductionMul: [0.8, 0.72, 0.62],
    peakWeightShift: [-0.05, -0.09, -0.12],
    outputTrimDb: [0.14, 0.08, 0.04],
  },
  smooth: {
    thresholdShiftDb: [-2.4, -2.9, -1.8],
    ratioMul: [1.28, 1.38, 1.22],
    attackMul: [0.58, 0.52, 0.48],
    releaseMul: [1.32, 1.24, 1.14],
    maxReductionMul: [1.36, 1.5, 1.28],
    peakWeightShift: [0.05, 0.06, 0.05],
    outputTrimDb: [0.26, 0.12, 0.04],
  },
  glue: {
    thresholdShiftDb: [-1.2, -2.1, -0.8],
    ratioMul: [1.12, 1.38, 1.04],
    attackMul: [1.24, 0.82, 0.74],
    releaseMul: [1.12, 1.1, 1.02],
    maxReductionMul: [1.12, 1.36, 1.02],
    peakWeightShift: [0, 0.03, 0.02],
    outputTrimDb: [0.1, 0.08, 0.02],
  },
  air: {
    thresholdShiftDb: [-1.8, -0.4, 3.2],
    ratioMul: [1.22, 1, 0.58],
    attackMul: [0.88, 1, 1.76],
    releaseMul: [1.02, 0.98, 0.76],
    maxReductionMul: [1.22, 0.98, 0.42],
    peakWeightShift: [0.04, 0, -0.18],
    outputTrimDb: [0.26, 0.05, 0.18],
  },
};

const DEFAULT_MASTER_CONFIG = {
  enabled: true,
  enableLowBand: true,
  enableMidBand: true,
  enableHighBand: true,
  enableLimiter: true,
  mode: "balanced",
  tempo: 118,
  lowCrossoverHz: 120,
  highCrossoverHz: 3200,
  measurement: {
    stepCount: 16,
    minDurationMs: 1100,
    maxDurationMs: 2800,
    gatePeakDb: -48,
    gateRmsDb: -56,
  },
  bands: [
    {
      name: "low",
      ratio: 1.85,
      kneeDb: 6,
      driveDb: 1.8,
      attackMinMs: 18,
      attackMaxMs: 56,
      releaseFastMs: 120,
      releaseSlowMs: 280,
      peakWeightBase: 0.18,
      peakWeightRange: 0.14,
      transientFloorDb: 3,
      transientRangeDb: 8,
      detectorPeakAttackMs: 0.8,
      detectorPeakReleaseMs: 95,
      detectorRmsAttackMs: 48,
      detectorRmsReleaseMs: 300,
      gateDb: -58,
      minThresholdDb: -38,
      maxThresholdDb: -10,
      maxReductionDb: 5.5,
      outputTrimDb: 0.4,
    },
    {
      name: "mid",
      ratio: 1.55,
      kneeDb: 5,
      driveDb: 1.4,
      attackMinMs: 8,
      attackMaxMs: 24,
      releaseFastMs: 90,
      releaseSlowMs: 180,
      peakWeightBase: 0.24,
      peakWeightRange: 0.18,
      transientFloorDb: 4,
      transientRangeDb: 9,
      detectorPeakAttackMs: 0.5,
      detectorPeakReleaseMs: 70,
      detectorRmsAttackMs: 28,
      detectorRmsReleaseMs: 220,
      gateDb: -60,
      minThresholdDb: -34,
      maxThresholdDb: -8,
      maxReductionDb: 3.5,
      outputTrimDb: 0,
    },
    {
      name: "high",
      ratio: 1.35,
      kneeDb: 4,
      driveDb: 1.1,
      attackMinMs: 1.4,
      attackMaxMs: 8,
      releaseFastMs: 50,
      releaseSlowMs: 120,
      peakWeightBase: 0.36,
      peakWeightRange: 0.16,
      transientFloorDb: 4,
      transientRangeDb: 10,
      detectorPeakAttackMs: 0.25,
      detectorPeakReleaseMs: 42,
      detectorRmsAttackMs: 16,
      detectorRmsReleaseMs: 140,
      gateDb: -64,
      minThresholdDb: -32,
      maxThresholdDb: -10,
      maxReductionDb: 2.8,
      outputTrimDb: 0.15,
    },
  ],
  limiter: {
    ceilingDb: -1,
    attackMs: 0.35,
    releaseMs: 120,
    peakAttackMs: 0.1,
    peakReleaseMs: 70,
    makeupTargetPeakDb: -2.2,
    makeupTargetRmsDb: -14.5,
    makeupGateDb: -42,
    makeupMaxGainDb: 8,
    makeupUpMs: 420,
    makeupDownMs: 140,
    makeupPeakAttackMs: 2.5,
    makeupPeakReleaseMs: 120,
    makeupRmsAttackMs: 80,
    makeupRmsReleaseMs: 540,
    softClipThresholdRatio: 0.92,
  },
};

class ErsatzBesselMasterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.config = createMasterConfig();
    this.bandStates = this.config.bands.map((bandConfig) => createBandState(bandConfig));
    this.crossoverLeft = createThreeBandCrossover(this.config.lowCrossoverHz, this.config.highCrossoverHz);
    this.crossoverRight = createThreeBandCrossover(this.config.lowCrossoverHz, this.config.highCrossoverHz);
    this.limiterState = createLimiterState();
    this.measurementState = createMeasurementState(this.config);
    this.meterState = createMeterState(this.measurementState);

    this.port.onmessage = (event) => {
      this.handleMessage(event.data ?? {});
    };
  }

  handleMessage(message) {
    if (message.type === "source-change") {
      armMeasurement(this.measurementState, this.bandStates, this.config);
      return;
    }

    if (message.type === "config") {
      this.applyConfig(message.config ?? {});
    }
  }

  applyConfig(config) {
    let shouldRebuildCrossovers = false;
    let shouldArmMeasurement = false;

    if (typeof config.enabled === "boolean") {
      this.config.enabled = config.enabled;
    }

    if (typeof config.enableLowBand === "boolean") {
      this.config.enableLowBand = config.enableLowBand;
    }

    if (typeof config.enableMidBand === "boolean") {
      this.config.enableMidBand = config.enableMidBand;
    }

    if (typeof config.enableHighBand === "boolean") {
      this.config.enableHighBand = config.enableHighBand;
    }

    if (typeof config.enableLimiter === "boolean") {
      this.config.enableLimiter = config.enableLimiter;
    }

    if (typeof config.mode === "string" && MASTER_MODE_PROFILES[config.mode]) {
      if (config.mode !== this.config.mode) {
        shouldArmMeasurement = true;
      }

      this.config.mode = config.mode;
      this.measurementState.mode = config.mode;
    }

    if (typeof config.tempo === "number" && Number.isFinite(config.tempo)) {
      this.config.tempo = clamp(config.tempo, 40, 240);
    }

    if (typeof config.lowCrossoverHz === "number") {
      this.config.lowCrossoverHz = clamp(config.lowCrossoverHz, 40, 600);
      shouldRebuildCrossovers = true;
      shouldArmMeasurement = true;
    }

    if (typeof config.highCrossoverHz === "number") {
      this.config.highCrossoverHz = clamp(config.highCrossoverHz, 1200, 9000);
      shouldRebuildCrossovers = true;
      shouldArmMeasurement = true;
    }

    if (shouldRebuildCrossovers) {
      this.crossoverLeft = createThreeBandCrossover(this.config.lowCrossoverHz, this.config.highCrossoverHz);
      this.crossoverRight = createThreeBandCrossover(this.config.lowCrossoverHz, this.config.highCrossoverHz);
    }

    if (shouldArmMeasurement) {
      armMeasurement(this.measurementState, this.bandStates, this.config);
    }
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    const inputLeft = input[0];
    const inputRight = input[1] ?? input[0];
    const outputLeft = output[0];
    const outputRight = output[1] ?? output[0];

    if (!outputLeft || !outputRight) {
      return true;
    }

    const hasInput = Boolean(inputLeft || inputRight);

    for (let frame = 0; frame < outputLeft.length; frame += 1) {
      const sourceLeft = hasInput ? inputLeft?.[frame] ?? 0 : 0;
      const sourceRight = hasInput ? inputRight?.[frame] ?? sourceLeft : sourceLeft;

      const splitLeft = splitThreeBand(this.crossoverLeft, sourceLeft);
      const splitRight = splitThreeBand(this.crossoverRight, sourceRight);
      const lowGain = processBandGain(
        this.bandStates[0],
        splitLeft.low,
        splitRight.low,
        this.config.enabled && this.config.enableLowBand,
      );
      const midGain = processBandGain(
        this.bandStates[1],
        splitLeft.mid,
        splitRight.mid,
        this.config.enabled && this.config.enableMidBand,
      );
      const highGain = processBandGain(
        this.bandStates[2],
        splitLeft.high,
        splitRight.high,
        this.config.enabled && this.config.enableHighBand,
      );

      updateMeasurementState(this.measurementState, sourceLeft, sourceRight, this.bandStates, this.config);

      const mixedLeft = splitLeft.low * lowGain + splitLeft.mid * midGain + splitLeft.high * highGain;
      const mixedRight = splitRight.low * lowGain + splitRight.mid * midGain + splitRight.high * highGain;
      const limited =
        this.config.enabled && this.config.enableLimiter
          ? processLimiter(this.limiterState, mixedLeft, mixedRight, this.config.limiter)
          : { left: mixedLeft, right: mixedRight, makeupGainDb: 0, limiterGainReductionDb: 0 };
      const outputSampleLeft = this.config.enabled ? limited.left : sourceLeft;
      const outputSampleRight = this.config.enabled ? limited.right : sourceRight;

      outputLeft[frame] = sanitize(outputSampleLeft);
      outputRight[frame] = sanitize(outputSampleRight);

      accumulateMeterState(this.meterState, {
        inputLeft: sourceLeft,
        inputRight: sourceRight,
        outputLeft: outputSampleLeft,
        outputRight: outputSampleRight,
        makeupGainDb: this.config.enabled && this.config.enableLimiter ? limited.makeupGainDb : 0,
        lowGainReductionDb: this.config.enabled && this.config.enableLowBand ? this.bandStates[0].gainReductionDb : 0,
        midGainReductionDb: this.config.enabled && this.config.enableMidBand ? this.bandStates[1].gainReductionDb : 0,
        highGainReductionDb: this.config.enabled && this.config.enableHighBand ? this.bandStates[2].gainReductionDb : 0,
        limiterGainReductionDb: this.config.enabled && this.config.enableLimiter ? limited.limiterGainReductionDb : 0,
        bands: {
          low: createBandMeterSnapshot(this.config.enabled && this.config.enableLowBand, this.bandStates[0]),
          mid: createBandMeterSnapshot(this.config.enabled && this.config.enableMidBand, this.bandStates[1]),
          high: createBandMeterSnapshot(this.config.enabled && this.config.enableHighBand, this.bandStates[2]),
        },
        measurement: createMeasurementSnapshot(this.measurementState, this.config),
      });
    }

    flushMeterState(this.port, this.meterState);
    return true;
  }
}

function createMasterConfig() {
  return {
    enabled: DEFAULT_MASTER_CONFIG.enabled,
    enableLowBand: DEFAULT_MASTER_CONFIG.enableLowBand,
    enableMidBand: DEFAULT_MASTER_CONFIG.enableMidBand,
    enableHighBand: DEFAULT_MASTER_CONFIG.enableHighBand,
    enableLimiter: DEFAULT_MASTER_CONFIG.enableLimiter,
    mode: DEFAULT_MASTER_CONFIG.mode,
    tempo: DEFAULT_MASTER_CONFIG.tempo,
    lowCrossoverHz: DEFAULT_MASTER_CONFIG.lowCrossoverHz,
    highCrossoverHz: DEFAULT_MASTER_CONFIG.highCrossoverHz,
    measurement: { ...DEFAULT_MASTER_CONFIG.measurement },
    bands: DEFAULT_MASTER_CONFIG.bands.map((band) => ({ ...band })),
    limiter: { ...DEFAULT_MASTER_CONFIG.limiter },
  };
}

function createBandState(config) {
  return {
    config,
    peakEnv: 0,
    rmsEnv: 0,
    peakDb: null,
    rmsDb: null,
    detectionDb: null,
    crestDb: null,
    gainReductionDb: 0,
    attackMs: null,
    releaseMs: null,
    thresholdDb: null,
    profile: createUnmeasuredBandProfile(),
    measurement: createBandMeasurementState(),
  };
}

function createUnmeasuredBandProfile() {
  return {
    ready: false,
    thresholdDb: null,
    attackMs: null,
    releaseMs: null,
    ratio: null,
    kneeDb: null,
    maxReductionDb: null,
    outputTrimDb: 0,
    peakWeight: null,
  };
}

function createLimiterState() {
  return {
    peakEnv: 0,
    gain: 1,
    makeupPeakEnv: 0,
    makeupRmsEnv: 0,
    makeupGainDb: 0,
  };
}

function createBandMeasurementState() {
  return {
    sampleCount: 0,
    sumPeakDb: 0,
    sumRmsDb: 0,
    sumDetectDb: 0,
    sumCrestDb: 0,
    maxPeakDb: MIN_DECIBELS,
    maxDetectDb: MIN_DECIBELS,
  };
}

function createMeasurementState(config) {
  return {
    phase: "armed",
    mode: config.mode,
    totalFrames: 0,
    remainingFrames: 0,
    totalSteps: config.measurement.stepCount,
  };
}

function createMeterState(measurementState) {
  return {
    reportIntervalFrames: 2048,
    sampleCount: 0,
    inputPeak: 0,
    inputEnergy: 0,
    outputPeak: 0,
    outputEnergy: 0,
    makeupGainDb: 0,
    lowGainReductionDb: 0,
    midGainReductionDb: 0,
    highGainReductionDb: 0,
    limiterGainReductionDb: 0,
    bands: createBandMeterSnapshotMap(),
    measurement: createMeasurementSnapshot(measurementState, DEFAULT_MASTER_CONFIG),
  };
}

function processBandGain(state, left, right, compressionEnabled) {
  const { config } = state;
  const amplitude = Math.max(Math.abs(left), Math.abs(right));
  const stereoRms = Math.sqrt((left * left + right * right) * 0.5);

  state.peakEnv = smoothEnvelope(
    state.peakEnv,
    amplitude,
    config.detectorPeakAttackMs,
    config.detectorPeakReleaseMs,
  );
  state.rmsEnv = smoothEnvelope(
    state.rmsEnv,
    stereoRms,
    config.detectorRmsAttackMs,
    config.detectorRmsReleaseMs,
  );

  state.peakDb = linToDb(state.peakEnv);
  state.rmsDb = linToDb(state.rmsEnv);
  state.crestDb = Math.max(0, state.peakDb - state.rmsDb);

  const peakWeight = Number.isFinite(state.profile.peakWeight)
    ? state.profile.peakWeight
    : clamp(config.peakWeightBase + config.peakWeightRange * 0.5, 0.05, 0.95);
  state.detectionDb = state.rmsDb + (state.peakDb - state.rmsDb) * peakWeight;

  if (!compressionEnabled || !state.profile.ready) {
    state.gainReductionDb = smoothScalar(state.gainReductionDb, 0, config.releaseSlowMs);
    state.thresholdDb = state.profile.ready ? state.profile.thresholdDb : null;
    state.attackMs = state.profile.ready ? state.profile.attackMs : null;
    state.releaseMs = state.profile.ready ? state.profile.releaseMs : null;
    return 1;
  }

  const signalActive = state.rmsDb > config.gateDb || state.peakDb > config.gateDb;
  const targetReductionDb = signalActive
    ? clamp(
        computeGainReductionDb(
          state.detectionDb,
          state.profile.thresholdDb,
          state.profile.ratio,
          state.profile.kneeDb,
        ),
        0,
        state.profile.maxReductionDb,
      )
    : 0;

  state.gainReductionDb = smoothScalar(
    state.gainReductionDb,
    targetReductionDb,
    targetReductionDb > state.gainReductionDb ? state.profile.attackMs : state.profile.releaseMs,
  );
  state.thresholdDb = state.profile.thresholdDb;
  state.attackMs = state.profile.attackMs;
  state.releaseMs = state.profile.releaseMs;

  return dbToLin(state.profile.outputTrimDb - state.gainReductionDb);
}

function processLimiter(state, left, right, config) {
  const ceiling = dbToLin(config.ceilingDb);
  const inputAmplitude = Math.max(Math.abs(left), Math.abs(right));
  const stereoRms = Math.sqrt((left * left + right * right) * 0.5);

  state.makeupPeakEnv = smoothEnvelope(
    state.makeupPeakEnv,
    inputAmplitude,
    config.makeupPeakAttackMs,
    config.makeupPeakReleaseMs,
  );
  state.makeupRmsEnv = smoothEnvelope(
    state.makeupRmsEnv,
    stereoRms,
    config.makeupRmsAttackMs,
    config.makeupRmsReleaseMs,
  );

  const makeupPeakDb = linToDb(state.makeupPeakEnv);
  const makeupRmsDb = linToDb(state.makeupRmsEnv);
  const makeupSignalActive = makeupPeakDb > config.makeupGateDb || makeupRmsDb > config.makeupGateDb;
  let desiredMakeupDb = 0;

  if (makeupSignalActive) {
    const peakHeadroomDb = config.makeupTargetPeakDb - makeupPeakDb;
    const rmsHeadroomDb = config.makeupTargetRmsDb - makeupRmsDb;
    desiredMakeupDb = clamp(Math.min(peakHeadroomDb, rmsHeadroomDb), 0, config.makeupMaxGainDb);
  }

  const makeupSmoothingMs = desiredMakeupDb > state.makeupGainDb ? config.makeupUpMs : config.makeupDownMs;
  state.makeupGainDb = smoothScalar(state.makeupGainDb, desiredMakeupDb, makeupSmoothingMs);

  const makeupGain = dbToLin(state.makeupGainDb);
  const drivenLeft = left * makeupGain;
  const drivenRight = right * makeupGain;
  const amplitude = Math.max(Math.abs(drivenLeft), Math.abs(drivenRight));

  state.peakEnv = smoothEnvelope(state.peakEnv, amplitude, config.peakAttackMs, config.peakReleaseMs);

  const targetGain = state.peakEnv > ceiling ? clamp(ceiling / Math.max(state.peakEnv, 1e-9), 0, 1) : 1;
  const smoothingMs = targetGain < state.gain ? config.attackMs : config.releaseMs;
  state.gain = smoothScalar(state.gain, targetGain, smoothingMs);

  return {
    left: softClip(drivenLeft * state.gain, ceiling, config.softClipThresholdRatio),
    right: softClip(drivenRight * state.gain, ceiling, config.softClipThresholdRatio),
    makeupGainDb: state.makeupGainDb,
    limiterGainReductionDb: Math.max(0, -linToDb(state.gain)),
  };
}

function armMeasurement(measurementState, bandStates, config) {
  measurementState.phase = "armed";
  measurementState.mode = config.mode;
  measurementState.totalFrames = 0;
  measurementState.remainingFrames = 0;
  measurementState.totalSteps = config.measurement.stepCount;

  bandStates.forEach((bandState) => {
    bandState.measurement = createBandMeasurementState();
  });
}

function updateMeasurementState(measurementState, left, right, bandStates, config) {
  const amplitude = Math.max(Math.abs(left), Math.abs(right));
  const stereoRms = Math.sqrt((left * left + right * right) * 0.5);
  const peakDb = linToDb(amplitude);
  const rmsDb = linToDb(stereoRms);

  if (measurementState.phase === "armed") {
    if (peakDb > config.measurement.gatePeakDb || rmsDb > config.measurement.gateRmsDb) {
      measurementState.phase = "measuring";
      measurementState.totalFrames = computeMeasurementFrameCount(config);
      measurementState.remainingFrames = measurementState.totalFrames;
      measurementState.totalSteps = config.measurement.stepCount;

      bandStates.forEach((bandState) => {
        bandState.measurement = createBandMeasurementState();
      });
    } else {
      return;
    }
  }

  if (measurementState.phase !== "measuring") {
    return;
  }

  bandStates.forEach((bandState) => {
    const bandMeasurement = bandState.measurement;
    const bandConfig = bandState.config;

    if (!Number.isFinite(bandState.peakDb) || !Number.isFinite(bandState.rmsDb) || !Number.isFinite(bandState.detectionDb)) {
      return;
    }

    if (bandState.peakDb <= bandConfig.gateDb && bandState.rmsDb <= bandConfig.gateDb) {
      return;
    }

    bandMeasurement.sampleCount += 1;
    bandMeasurement.sumPeakDb += bandState.peakDb;
    bandMeasurement.sumRmsDb += bandState.rmsDb;
    bandMeasurement.sumDetectDb += bandState.detectionDb;
    bandMeasurement.sumCrestDb += bandState.crestDb;
    bandMeasurement.maxPeakDb = Math.max(bandMeasurement.maxPeakDb, bandState.peakDb);
    bandMeasurement.maxDetectDb = Math.max(bandMeasurement.maxDetectDb, bandState.detectionDb);
  });

  measurementState.remainingFrames -= 1;

  if (measurementState.remainingFrames > 0) {
    return;
  }

  bandStates.forEach((bandState, index) => {
    bandState.profile = deriveFrozenBandProfile(
      bandState.config,
      bandState.measurement,
      measurementState.mode,
      index,
      bandState.profile,
    );
    bandState.thresholdDb = bandState.profile.thresholdDb;
    bandState.attackMs = bandState.profile.attackMs;
    bandState.releaseMs = bandState.profile.releaseMs;
    bandState.measurement = createBandMeasurementState();
  });

  measurementState.phase = "frozen";
  measurementState.remainingFrames = 0;
}

function deriveFrozenBandProfile(config, measurement, modeKey, bandIndex, previousProfile) {
  if (measurement.sampleCount <= 0) {
    return previousProfile?.ready
      ? previousProfile
      : createFallbackBandProfile(config, modeKey, bandIndex);
  }

  const profile = MASTER_MODE_PROFILES[modeKey] ?? MASTER_MODE_PROFILES.balanced;
  const averagePeakDb = measurement.sumPeakDb / measurement.sampleCount;
  const averageRmsDb = measurement.sumRmsDb / measurement.sampleCount;
  const averageDetectDb = measurement.sumDetectDb / measurement.sampleCount;
  const averageCrestDb = measurement.sumCrestDb / measurement.sampleCount;
  const crestDb = clamp(averageCrestDb, 0, measurement.maxPeakDb - averageRmsDb + 12);
  const transientness = clamp(
    (crestDb - config.transientFloorDb) / Math.max(config.transientRangeDb, 0.0001),
    0,
    1,
  );
  const peakWeight = clamp(
    config.peakWeightBase + config.peakWeightRange * transientness + profile.peakWeightShift[bandIndex],
    0.05,
    0.95,
  );
  const detectReferenceDb = lerp(averageDetectDb, measurement.maxDetectDb, 0.18);
  const thresholdDb = clamp(
    detectReferenceDb - config.driveDb + profile.thresholdShiftDb[bandIndex],
    config.minThresholdDb,
    config.maxThresholdDb,
  );
  const attackMs = clamp(
    lerp(config.attackMinMs, config.attackMaxMs, transientness) * profile.attackMul[bandIndex],
    config.attackMinMs * 0.6,
    config.attackMaxMs * 2,
  );
  const releaseMs = clamp(
    lerp(config.releaseFastMs, config.releaseSlowMs, 1 - transientness) * profile.releaseMul[bandIndex],
    config.releaseFastMs * 0.6,
    config.releaseSlowMs * 2.2,
  );

  return {
    ready: true,
    thresholdDb,
    attackMs,
    releaseMs,
    ratio: clamp(config.ratio * profile.ratioMul[bandIndex], 1.05, 4),
    kneeDb: config.kneeDb,
    maxReductionDb: clamp(config.maxReductionDb * profile.maxReductionMul[bandIndex], 0.5, config.maxReductionDb * 1.8),
    outputTrimDb: config.outputTrimDb + profile.outputTrimDb[bandIndex],
    peakWeight,
    averagePeakDb,
    averageRmsDb,
  };
}

function createFallbackBandProfile(config, modeKey, bandIndex) {
  const profile = MASTER_MODE_PROFILES[modeKey] ?? MASTER_MODE_PROFILES.balanced;
  const averageDetectDb = -24 + bandIndex * 2;
  const crestDb = config.transientFloorDb + config.transientRangeDb * 0.45;
  const transientness = clamp(
    (crestDb - config.transientFloorDb) / Math.max(config.transientRangeDb, 0.0001),
    0,
    1,
  );

  return {
    ready: true,
    thresholdDb: clamp(
      averageDetectDb - config.driveDb + profile.thresholdShiftDb[bandIndex],
      config.minThresholdDb,
      config.maxThresholdDb,
    ),
    attackMs: clamp(
      lerp(config.attackMinMs, config.attackMaxMs, transientness) * profile.attackMul[bandIndex],
      config.attackMinMs * 0.6,
      config.attackMaxMs * 2,
    ),
    releaseMs: clamp(
      lerp(config.releaseFastMs, config.releaseSlowMs, 1 - transientness) * profile.releaseMul[bandIndex],
      config.releaseFastMs * 0.6,
      config.releaseSlowMs * 2.2,
    ),
    ratio: clamp(config.ratio * profile.ratioMul[bandIndex], 1.05, 4),
    kneeDb: config.kneeDb,
    maxReductionDb: clamp(config.maxReductionDb * profile.maxReductionMul[bandIndex], 0.5, config.maxReductionDb * 1.8),
    outputTrimDb: config.outputTrimDb + profile.outputTrimDb[bandIndex],
    peakWeight: clamp(
      config.peakWeightBase + config.peakWeightRange * transientness + profile.peakWeightShift[bandIndex],
      0.05,
      0.95,
    ),
  };
}

function computeMeasurementFrameCount(config) {
  const tempo = clamp(config.tempo, 40, 240);
  const stepFrames = Math.max(1, Math.round(((60 / tempo) / 4) * sampleRate));
  const rawFrames = stepFrames * config.measurement.stepCount;
  const minFrames = Math.round((config.measurement.minDurationMs / 1000) * sampleRate);
  const maxFrames = Math.round((config.measurement.maxDurationMs / 1000) * sampleRate);
  return clamp(rawFrames, minFrames, maxFrames);
}

function createMeasurementSnapshot(measurementState, config) {
  const stepFrames = Math.max(1, Math.round(((60 / clamp(config.tempo ?? 118, 40, 240)) / 4) * sampleRate));
  const remainingSteps =
    measurementState.phase === "measuring"
      ? Math.max(0, Math.ceil(measurementState.remainingFrames / stepFrames))
      : 0;

  return {
    phase: measurementState.phase,
    mode: measurementState.mode,
    remainingSteps,
    totalSteps: measurementState.totalSteps,
  };
}

function accumulateMeterState(state, sample) {
  state.sampleCount += 1;
  state.inputPeak = Math.max(state.inputPeak, Math.abs(sample.inputLeft), Math.abs(sample.inputRight));
  state.outputPeak = Math.max(state.outputPeak, Math.abs(sample.outputLeft), Math.abs(sample.outputRight));
  state.inputEnergy += (sample.inputLeft * sample.inputLeft + sample.inputRight * sample.inputRight) * 0.5;
  state.outputEnergy += (sample.outputLeft * sample.outputLeft + sample.outputRight * sample.outputRight) * 0.5;
  state.makeupGainDb = sample.makeupGainDb;
  state.lowGainReductionDb = sample.lowGainReductionDb;
  state.midGainReductionDb = sample.midGainReductionDb;
  state.highGainReductionDb = sample.highGainReductionDb;
  state.limiterGainReductionDb = sample.limiterGainReductionDb;
  state.bands.low = sample.bands.low;
  state.bands.mid = sample.bands.mid;
  state.bands.high = sample.bands.high;
  state.measurement = sample.measurement;
}

function flushMeterState(port, state) {
  if (state.sampleCount < state.reportIntervalFrames) {
    return;
  }

  const inputRms = Math.sqrt(state.inputEnergy / Math.max(state.sampleCount, 1));
  const outputRms = Math.sqrt(state.outputEnergy / Math.max(state.sampleCount, 1));

  port.postMessage({
    type: "meter",
    data: {
      inputPeakDb: linToDb(state.inputPeak),
      inputRmsDb: linToDb(inputRms),
      outputPeakDb: linToDb(state.outputPeak),
      outputRmsDb: linToDb(outputRms),
      makeupGainDb: state.makeupGainDb,
      lowGainReductionDb: state.lowGainReductionDb,
      midGainReductionDb: state.midGainReductionDb,
      highGainReductionDb: state.highGainReductionDb,
      limiterGainReductionDb: state.limiterGainReductionDb,
      bands: state.bands,
      measurement: state.measurement,
    },
  });

  const measurement = state.measurement;
  state.sampleCount = 0;
  state.inputPeak = 0;
  state.inputEnergy = 0;
  state.outputPeak = 0;
  state.outputEnergy = 0;
  state.bands = createBandMeterSnapshotMap();
  state.measurement = measurement;
}

function createBandMeterSnapshotMap() {
  return {
    low: createBandMeterSnapshot(false, null),
    mid: createBandMeterSnapshot(false, null),
    high: createBandMeterSnapshot(false, null),
  };
}

function createBandMeterSnapshot(enabled, bandState) {
  if (!enabled || !bandState) {
    return {
      thresholdDb: null,
      detectionDb: null,
      attackMs: null,
      releaseMs: null,
      crestDb: null,
      gainReductionDb: null,
    };
  }

  return {
    thresholdDb: Number.isFinite(bandState.thresholdDb) ? bandState.thresholdDb : null,
    detectionDb: Number.isFinite(bandState.detectionDb) ? bandState.detectionDb : null,
    attackMs: Number.isFinite(bandState.attackMs) ? bandState.attackMs : null,
    releaseMs: Number.isFinite(bandState.releaseMs) ? bandState.releaseMs : null,
    crestDb: Number.isFinite(bandState.crestDb) ? bandState.crestDb : null,
    gainReductionDb: Number.isFinite(bandState.gainReductionDb) ? bandState.gainReductionDb : null,
  };
}

function createThreeBandCrossover(lowCrossoverHz, highCrossoverHz) {
  return {
    lowPassLow: createLinkwitzRileySection("lowpass", lowCrossoverHz),
    lowPassHigh: createLinkwitzRileySection("highpass", lowCrossoverHz),
    lowCompensation: createLinkwitzRileySection("allpass", highCrossoverHz),
    highPassLow: createLinkwitzRileySection("lowpass", highCrossoverHz),
    highPassHigh: createLinkwitzRileySection("highpass", highCrossoverHz),
  };
}

function splitThreeBand(crossover, sample) {
  const lowRaw = processBiquadCascade(crossover.lowPassLow, sample);
  const highSeed = processBiquadCascade(crossover.lowPassHigh, sample);
  const low = processBiquadCascade(crossover.lowCompensation, lowRaw);
  const mid = processBiquadCascade(crossover.highPassLow, highSeed);
  const high = processBiquadCascade(crossover.highPassHigh, highSeed);

  return {
    low: sanitize(low),
    mid: sanitize(mid),
    high: sanitize(high),
  };
}

function createLinkwitzRileySection(type, frequencyHz) {
  return [createBiquad(type, frequencyHz, BUTTERWORTH_Q), createBiquad(type, frequencyHz, BUTTERWORTH_Q)];
}

function createBiquad(type, frequencyHz, q) {
  const coeffs = designBiquad(type, frequencyHz, q);

  return {
    ...coeffs,
    x1: 0,
    x2: 0,
    y1: 0,
    y2: 0,
  };
}

function designBiquad(type, frequencyHz, q) {
  const clampedFrequency = clamp(frequencyHz, 20, sampleRate * 0.45);
  const omega = (TWO_PI * clampedFrequency) / sampleRate;
  const sine = Math.sin(omega);
  const cosine = Math.cos(omega);
  const alpha = sine / (2 * Math.max(q, 0.0001));
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  const a0 = 1 + alpha;
  const a1 = -2 * cosine;
  const a2 = 1 - alpha;

  if (type === "lowpass") {
    b0 = (1 - cosine) * 0.5;
    b1 = 1 - cosine;
    b2 = (1 - cosine) * 0.5;
  } else if (type === "highpass") {
    b0 = (1 + cosine) * 0.5;
    b1 = -(1 + cosine);
    b2 = (1 + cosine) * 0.5;
  } else {
    b0 = 1 - alpha;
    b1 = -2 * cosine;
    b2 = 1 + alpha;
  }

  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
  };
}

function processBiquadCascade(filters, value) {
  let output = value;

  for (let index = 0; index < filters.length; index += 1) {
    output = processBiquad(filters[index], output);
  }

  return output;
}

function processBiquad(filter, value) {
  const output =
    filter.b0 * value +
    filter.b1 * filter.x1 +
    filter.b2 * filter.x2 -
    filter.a1 * filter.y1 -
    filter.a2 * filter.y2;

  filter.x2 = filter.x1;
  filter.x1 = value;
  filter.y2 = filter.y1;
  filter.y1 = sanitize(output);

  return filter.y1;
}

function smoothEnvelope(current, target, attackMs, releaseMs) {
  const next = target > current ? attackMs : releaseMs;
  return smoothScalar(current, target, next);
}

function smoothScalar(current, target, timeMs) {
  if (!Number.isFinite(target)) {
    return current;
  }

  if (timeMs <= 0.0001) {
    return target;
  }

  const coefficient = 1 - Math.exp(-1 / Math.max((timeMs / 1000) * sampleRate, 1));
  return current + (target - current) * coefficient;
}

function computeGainReductionDb(levelDb, thresholdDb, ratio, kneeDb) {
  const overshootDb = levelDb - thresholdDb;
  const slope = 1 - 1 / Math.max(ratio, 1.0001);

  if (kneeDb <= 0.0001) {
    return overshootDb > 0 ? overshootDb * slope : 0;
  }

  const halfKnee = kneeDb * 0.5;

  if (overshootDb <= -halfKnee) {
    return 0;
  }

  if (overshootDb >= halfKnee) {
    return overshootDb * slope;
  }

  const kneePosition = overshootDb + halfKnee;
  return ((slope * kneePosition) * kneePosition) / (2 * kneeDb);
}

function softClip(value, ceiling, thresholdRatio) {
  const safeCeiling = Math.max(ceiling, 1e-6);
  const threshold = safeCeiling * clamp(thresholdRatio, 0.5, 0.999);
  const magnitude = Math.abs(value);

  if (magnitude <= threshold) {
    return value;
  }

  const span = Math.max(safeCeiling - threshold, 1e-6);
  const shaped = threshold + span * (1 - Math.exp(-(magnitude - threshold) / span));
  return Math.sign(value) * Math.min(shaped, safeCeiling);
}

function linToDb(value) {
  return 20 * Math.log10(Math.max(value, 10 ** (MIN_DECIBELS / 20)));
}

function dbToLin(value) {
  return 10 ** (value / 20);
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function sanitize(value) {
  if (!Number.isFinite(value) || Math.abs(value) < 1e-12) {
    return 0;
  }

  return clamp(value, -32, 32);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

registerProcessor("ersatz-bessel-master", ErsatzBesselMasterProcessor);
