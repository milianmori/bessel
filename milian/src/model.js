const ROOTS = [
  [2.4048, 5.5201, 8.6537, 11.7915],
  [3.8317, 7.0156, 10.1735, 13.3237],
  [5.1356, 8.4172, 11.6198, 14.7959],
  [6.3802, 9.761, 13.0152, 16.2235],
];

const DEFAULT_NOISE_ENV = {
  domainMs: 1000,
  points: [
    { time: 0, value: 0.89, curve: 0 },
    { time: 0.78, value: 0, curve: -0.845 },
  ],
};

export async function loadPresets() {
  const response = await fetch(`${import.meta.env.BASE_URL}data/presets.json`);

  if (!response.ok) {
    throw new Error(`Preset-Datei konnte nicht geladen werden: ${response.status}`);
  }

  const json = await response.json();
  const slots = json.pattrstorage?.slots ?? {};

  return Object.entries(slots)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([slotId, slot]) => normalizePreset(slotId, slot?.data ?? {}));
}

export function cloneState(state) {
  return {
    ...state,
    clickShape: [...state.clickShape],
    amps: [...state.amps],
    noiseEnvelope: {
      domainMs: state.noiseEnvelope.domainMs,
      points: state.noiseEnvelope.points.map((point) => ({ ...point })),
    },
  };
}

export function computeModalData(state, sampleRate = 44100) {
  const sizeRadians = Math.max(state.size * Math.PI * 2, 0.00001);
  const frequencies = [];
  const weights = [];
  const qCoefficients = [];

  ROOTS.forEach((alphas, order) => {
    alphas.forEach((alpha) => {
      const rawWeight = besselj(order, alpha * state.hitPosition);
      const weight = scale(rawWeight, 0, 1, state.overtones, 1, state.damping);
      const frequency = clamp(alpha * state.tuning / sizeRadians, 20, sampleRate / 4);

      frequencies.push(frequency);
      weights.push(weight);
      qCoefficients.push(weightToQ(weight));
    });
  });

  return {
    frequencies,
    weights,
    qCoefficients,
  };
}

export function formatValue(key, value) {
  switch (key) {
    case "tuning":
      return `${value.toFixed(1)} Hz`;
    case "size":
    case "hitPosition":
    case "damping":
    case "overtones":
    case "masterGain":
      return value.toFixed(3);
    case "tempo":
      return `${Math.round(value)} BPM`;
    case "pitchEnvDurMs":
    case "nzEnvDurMs":
      return `${value.toFixed(1)} ms`;
    case "pitchEnvRange":
      return `${value.toFixed(1)} st`;
    case "pitchEnvCurve":
      return value.toFixed(3);
    default:
      return `${value}`;
  }
}

export function curveTransfer(value, curve) {
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

export function evaluateEnvelope(points, phase) {
  if (!points.length) {
    return 0;
  }

  const x = clamp(phase, 0, 1);
  const sorted = [...points].sort((a, b) => a.time - b.time);

  if (x <= sorted[0].time) {
    return sorted[0].value;
  }

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index];
    const end = sorted[index + 1];

    if (x <= end.time) {
      const span = Math.max(end.time - start.time, 0.000001);
      const local = (x - start.time) / span;
      const shaped = curveTransfer(local, end.curve ?? 0);
      return lerp(start.value, end.value, shaped);
    }
  }

  return sorted.at(-1).value;
}

export function summarizeFrequencies(frequencies) {
  if (!frequencies.length) {
    return "Keine Daten";
  }

  const min = Math.min(...frequencies);
  const max = Math.max(...frequencies);
  return `${min.toFixed(1)} Hz → ${max.toFixed(1)} Hz`;
}

export function summarizeWeights(weights) {
  if (!weights.length) {
    return "Keine Daten";
  }

  const min = Math.min(...weights);
  const max = Math.max(...weights);
  return `${min.toFixed(3)} → ${max.toFixed(3)}`;
}

export function normalizeEnvelopePoints(points) {
  const sorted = [...points]
    .map((point) => ({
      time: clamp(point.time, 0, 1),
      value: clamp(point.value, 0, 1),
      curve: clamp(point.curve ?? 0, -1, 1),
    }))
    .sort((a, b) => a.time - b.time);

  if (!sorted.length) {
    return DEFAULT_NOISE_ENV.points.map((point) => ({ ...point }));
  }

  sorted[0].time = 0;
  sorted.at(-1).time = Math.max(sorted.at(-1).time, sorted[0].time + 0.05);
  sorted.at(-1).time = clamp(sorted.at(-1).time, 0, 1);

  return sorted;
}

function normalizePreset(slotId, data) {
  return {
    id: Number(slotId),
    name: `Preset ${slotId}`,
    tuning: data.tuning?.[0] ?? 440,
    size: data.size?.[0] ?? 0.5,
    hitPosition: data.hit_pos?.[0] ?? 0.5,
    damping: data.damping?.[0] ?? 0.5,
    overtones: data.overtones?.[0] ?? 0.52,
    clickShape: ensureLength(data.click_shape, 64, 0.5),
    amps: ensureLength(data.amps, 16, 0.6),
    noiseEnvelope: parseNoiseEnvelope(data.noiz_env),
    pitchEnvCurve: data.pitch_env_curve?.[0] ?? 0,
    pitchEnvDurMs: data.pitch_env_dur?.[0] ?? 50,
    pitchEnvRange: data.pitch_env_range?.[0] ?? 0,
    nzEnvDurMs: data.nz_env_dur?.[0] ?? 50,
    tempo: 118,
    masterGain: 0.72,
    running: false,
  };
}

function parseNoiseEnvelope(raw = []) {
  if (!Array.isArray(raw) || raw.length < 8) {
    return {
      domainMs: DEFAULT_NOISE_ENV.domainMs,
      points: DEFAULT_NOISE_ENV.points.map((point) => ({ ...point })),
    };
  }

  const domainMs = Number(raw[0]) || 1000;
  const points = [];

  for (let index = 3; index < raw.length - 1; index += 4) {
    points.push({
      time: clamp((Number(raw[index]) || 0) / domainMs, 0, 1),
      value: clamp(Number(raw[index + 1]) || 0, 0, 1),
      curve: clamp(Number(raw[index + 3]) || 0, -1, 1),
    });
  }

  return {
    domainMs,
    points: normalizeEnvelopePoints(points),
  };
}

function ensureLength(values, length, fallback) {
  const output = Array.from({ length }, (_, index) => clamp(values?.[index] ?? fallback, 0, 1));
  return output;
}

function weightToQ(weight) {
  const scaled = Math.max(weight * 100, 0.0001);
  return clamp(1 / scaled, 0.0001, 2);
}

function besselj(order, x) {
  if (order === 0) {
    let sum = 0;
    let term = 1;
    let k = 0;

    do {
      term = ((-1) ** k * (x / 2) ** (2 * k)) / (factorial(k) * factorial(k));
      sum += term;
      k += 1;
    } while (Math.abs(term) > 1e-8 && k < 20);

    return sum;
  }

  if (order === 1) {
    let sum = 0;
    let term = 1;
    let k = 0;

    do {
      term = ((-1) ** k * (x / 2) ** (2 * k + 1)) / (factorial(k) * factorial(k + 1));
      sum += term;
      k += 1;
    } while (Math.abs(term) > 1e-8 && k < 20);

    return sum;
  }

  if (x === 0) {
    return 0;
  }

  return ((2 * (order - 1)) / x) * besselj(order - 1, x) - besselj(order - 2, x);
}

function factorial(number) {
  if (number <= 1) {
    return 1;
  }

  return number * factorial(number - 1);
}

function scale(value, inLow, inHigh, outLow, outHigh, exponent) {
  const normalized = (value - inLow) / (inHigh - inLow);

  if (normalized === 0) {
    return outLow;
  }

  if (normalized > 0) {
    return outLow + (outHigh - outLow) * normalized ** exponent;
  }

  return outLow + (outHigh - outLow) * -(Math.abs(normalized) ** exponent);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}
