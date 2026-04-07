import { computeVoiceAnalysis } from "./model.js";

export class BesselAudioEngine {
  constructor() {
    this.context = null;
    this.node = null;
    this.masterNode = null;
    this.analyser = null;
    this.lastAnalysisByVoice = [];
    this.onStep = null;
    this.onMasterMeter = null;
    this.lastMasterMeter = null;
  }

  async ensureReady() {
    if (this.context) {
      return;
    }

    this.context = new AudioContext({ latencyHint: "interactive" });
    await this.context.audioWorklet.addModule(new URL("./worklets/bessel-processor.js", import.meta.url));
    await this.context.audioWorklet.addModule(new URL("./worklets/master-bus-processor.js", import.meta.url));

    this.node = new AudioWorkletNode(this.context, "ersatz-bessel-engine", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelInterpretation: "speakers",
    });
    this.masterNode = new AudioWorkletNode(this.context, "ersatz-bessel-master", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelInterpretation: "speakers",
    });

    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.16;

    this.node.connect(this.masterNode);
    this.masterNode.connect(this.analyser);
    this.analyser.connect(this.context.destination);

    this.node.port.onmessage = (event) => {
      if (event.data?.type === "step" && this.onStep) {
        this.onStep(event.data);
      }
    };

    this.masterNode.port.onmessage = (event) => {
      if (event.data?.type === "meter") {
        this.lastMasterMeter = event.data.data ?? null;

        if (this.onMasterMeter) {
          this.onMasterMeter(this.lastMasterMeter);
        }
      }
    };
  }

  async start(state) {
    await this.ensureReady();
    await this.context.resume();
    this.sync(state, { resetTransport: true });
  }

  sync(state, options = {}) {
    const sampleRate = this.context?.sampleRate ?? 44100;
    this.lastAnalysisByVoice = state.voices.map((voice) => computeVoiceAnalysis(voice, sampleRate));
    const shouldMeasureMasterBus =
      Boolean(options.resetTransport) ||
      Boolean(options.reacquireMasterBus) ||
      options.measureMasterBus === "immediate" ||
      (Array.isArray(options.resetVoiceIds) && options.resetVoiceIds.length > 0);

    if (this.node) {
      this.node.port.postMessage({
        type: "config",
        config: buildProcessorConfig(state, this.lastAnalysisByVoice, options),
      });
    }

    if (this.masterNode) {
      this.masterNode.port.postMessage({
        type: "config",
        config: buildMasterBusConfig(state),
      });
    }

    if (shouldMeasureMasterBus) {
      this.requestMasterBusMeasurement();
    }

    return this.lastAnalysisByVoice;
  }

  requestMasterBusMeasurement() {
    if (!this.masterNode) {
      return;
    }

    this.masterNode.port.postMessage({
      type: "source-change",
    });
  }

  trigger() {
    if (this.node) {
      this.node.port.postMessage({ type: "manual-trigger" });
    }
  }
}

function buildProcessorConfig(state, analysisByVoice, options) {
  const soloActive = state.voices.some((voice) => Boolean(voice.solo));

  return {
    running: state.running,
    tempo: state.tempo,
    resetTransport: Boolean(options.resetTransport),
    resetVoiceIds: Array.isArray(options.resetVoiceIds) ? [...options.resetVoiceIds] : [],
    voices: state.voices.map((voice, index) => {
      const analysis = analysisByVoice[index];

      const baseConfig = {
        voiceId: voice.voiceId,
        voiceType: voice.voiceType,
        muted: isVoiceEffectivelyMuted(voice, soloActive),
        masterGain: voice.masterGain,
        amps: [...voice.amps],
        randomizeKickClickLevelPerStep: Boolean(voice.randomizeKickClickLevelPerStep),
        randomizeKickClickDecayMsPerStep: Boolean(voice.randomizeKickClickDecayMsPerStep),
        randomizeClickShapePerStep: Boolean(voice.randomizeClickShapePerStep),
        randomizeNzEnvDurMsPerStep: Boolean(voice.randomizeNzEnvDurMsPerStep),
        randomizeSubBassDrivePerStep: Boolean(voice.randomizeSubBassDrivePerStep),
        randomizeSubBassDecayMsPerStep: Boolean(voice.randomizeSubBassDecayMsPerStep),
        randomizeSubBassWaveMixPerStep: Boolean(voice.randomizeSubBassWaveMixPerStep),
      };

      if (voice.voiceType === "kick") {
        return {
          ...baseConfig,
          kickBodyFreqHz: voice.kickBodyFreqHz,
          kickBodyDecayMs: voice.kickBodyDecayMs,
          kickPitchDropSt: voice.kickPitchDropSt,
          kickPitchDropMs: voice.kickPitchDropMs,
          kickClickLevel: voice.kickClickLevel,
          kickClickDecayMs: voice.kickClickDecayMs,
          kickNoiseLevel: voice.kickNoiseLevel,
          kickNoiseDecayMs: voice.kickNoiseDecayMs,
          kickDrive: voice.kickDrive,
          kickTone: voice.kickTone,
          kickLowCutEnabled: voice.kickLowCutEnabled,
          kickLowCutCutoffHz: voice.kickLowCutCutoffHz,
        };
      }

      if (voice.voiceType === "subbass") {
        return {
          ...baseConfig,
          subBassFreqHz: voice.subBassFreqHz,
          subBassAttackMs: voice.subBassAttackMs,
          subBassDecayMs: voice.subBassDecayMs,
          subBassWaveMix: voice.subBassWaveMix,
          subBassSubLevel: voice.subBassSubLevel,
          subBassDrive: voice.subBassDrive,
          subBassTone: voice.subBassTone,
        };
      }

      return {
        ...baseConfig,
        lowEndDecay: voice.lowEndDecay,
        percGlueAmount: voice.percGlueAmount,
        percGlueAttackMs: voice.percGlueAttackMs,
        percGlueReleaseMs: voice.percGlueReleaseMs,
        pitchEnvDurMs: voice.pitchEnvDurMs,
        pitchEnvCurve: voice.pitchEnvCurve,
        pitchEnvRange: voice.pitchEnvRange,
        noiseLevel: voice.noiseLevel,
        nzEnvDurMs: voice.nzEnvDurMs,
        clickShape: [...voice.clickShape],
        noiseEnvelopePoints: voice.noiseEnvelope.points.map((point) => ({ ...point })),
        frequencies: [...(analysis?.frequencies ?? [])],
        qCoefficients: [...(analysis?.qCoefficients ?? [])],
      };
    }),
  };
}

function isVoiceEffectivelyMuted(voice, soloActive) {
  if (voice.muted) {
    return true;
  }

  if (soloActive && !voice.solo) {
    return true;
  }

  return false;
}

function buildMasterBusConfig(state) {
  const masterBus = state?.masterBus ?? {};

  return {
    enabled: Boolean(masterBus.enabled ?? true),
    enableLowBand: Boolean(masterBus.enableLowBand ?? true),
    enableMidBand: Boolean(masterBus.enableMidBand ?? true),
    enableHighBand: Boolean(masterBus.enableHighBand ?? true),
    enableLimiter: Boolean(masterBus.enableLimiter ?? true),
    mode: masterBus.mode ?? "balanced",
    tempo: Number(state?.tempo) || 118,
  };
}
