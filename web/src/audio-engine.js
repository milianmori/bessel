import { computeVoiceAnalysis } from "./model.js";

export class BesselAudioEngine {
  constructor() {
    this.context = null;
    this.node = null;
    this.analyser = null;
    this.lastAnalysisByVoice = [];
    this.onStep = null;
  }

  async ensureReady() {
    if (this.context) {
      return;
    }

    this.context = new AudioContext({ latencyHint: "interactive" });
    await this.context.audioWorklet.addModule(new URL("./worklets/bessel-processor.js", import.meta.url));

    this.node = new AudioWorkletNode(this.context, "ersatz-bessel-engine", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelInterpretation: "speakers",
    });

    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.16;

    this.node.connect(this.analyser);
    this.analyser.connect(this.context.destination);

    this.node.port.onmessage = (event) => {
      if (event.data?.type === "step" && this.onStep) {
        this.onStep(event.data);
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

    if (this.node) {
      this.node.port.postMessage({
        type: "config",
        config: buildProcessorConfig(state, this.lastAnalysisByVoice, options),
      });
    }

    return this.lastAnalysisByVoice;
  }

  trigger() {
    if (this.node) {
      this.node.port.postMessage({ type: "manual-trigger" });
    }
  }
}

function buildProcessorConfig(state, analysisByVoice, options) {
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
        muted: Boolean(voice.muted),
        masterGain: voice.masterGain,
        amps: [...voice.amps],
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
        pitchEnvDurMs: voice.pitchEnvDurMs,
        pitchEnvCurve: voice.pitchEnvCurve,
        pitchEnvRange: voice.pitchEnvRange,
        nzEnvDurMs: voice.nzEnvDurMs,
        clickShape: [...voice.clickShape],
        noiseEnvelopePoints: voice.noiseEnvelope.points.map((point) => ({ ...point })),
        frequencies: [...(analysis?.frequencies ?? [])],
        qCoefficients: [...(analysis?.qCoefficients ?? [])],
      };
    }),
  };
}
