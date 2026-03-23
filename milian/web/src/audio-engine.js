import { computeModalData } from "./model.js";

export class BesselAudioEngine {
  constructor() {
    this.context = null;
    this.node = null;
    this.analyser = null;
    this.lastModalDataByVoice = [];
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
    this.lastModalDataByVoice = state.voices.map((voice) => computeModalData(voice, sampleRate));

    if (this.node) {
      this.node.port.postMessage({
        type: "config",
        config: buildProcessorConfig(state, this.lastModalDataByVoice, options),
      });
    }

    return this.lastModalDataByVoice;
  }

  trigger() {
    if (this.node) {
      this.node.port.postMessage({ type: "manual-trigger" });
    }
  }
}

function buildProcessorConfig(state, modalDataByVoice, options) {
  return {
    running: state.running,
    tempo: state.tempo,
    resetTransport: Boolean(options.resetTransport),
    resetVoiceIds: Array.isArray(options.resetVoiceIds) ? [...options.resetVoiceIds] : [],
    voices: state.voices.map((voice, index) => {
      const modalData = modalDataByVoice[index];

      return {
        voiceId: voice.voiceId,
        muted: Boolean(voice.muted),
        masterGain: voice.masterGain,
        pitchEnvDurMs: voice.pitchEnvDurMs,
        pitchEnvCurve: voice.pitchEnvCurve,
        pitchEnvRange: voice.pitchEnvRange,
        nzEnvDurMs: voice.nzEnvDurMs,
        clickShape: [...voice.clickShape],
        amps: [...voice.amps],
        noiseEnvelopePoints: voice.noiseEnvelope.points.map((point) => ({ ...point })),
        frequencies: [...modalData.frequencies],
        qCoefficients: [...modalData.qCoefficients],
      };
    }),
  };
}
