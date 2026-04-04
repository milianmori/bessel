export const AMP_PATTERN_SOURCE_OPTIONS = [
  { value: 0, label: "Rhythm" },
  { value: 2, label: "Web" },
];

export const AMP_MODE_OPTIONS = [
  { value: 1, label: "1:6" },
  { value: 2, label: "1:3" },
  { value: 3, label: "1:4" },
  { value: 4, label: "1:2" },
  { value: 5, label: "All" },
];

export const RHYTHM_MODE_OPTIONS = [
  { value: 0, label: "Off" },
  { value: 1, label: "Sparse" },
  { value: 2, label: "Pulse" },
  { value: 3, label: "Offbeat" },
  { value: 4, label: "Alternating" },
  { value: 5, label: "Bursts" },
  { value: 6, label: "Gallop" },
  { value: 7, label: "3-3-2" },
  { value: 8, label: "Euclid 5" },
  { value: 9, label: "Euclid 7" },
  { value: 10, label: "Dropouts" },
];

export const DEFAULT_AMP_PATTERN_SOURCE = 0;
export const DEFAULT_AMP_MODE = 5;
export const DEFAULT_RHYTHM_MODE = 0;

const ampModeLabels = new Map(AMP_MODE_OPTIONS.map((option) => [option.value, option.label]));
const rhythmModeLabels = new Map(RHYTHM_MODE_OPTIONS.map((option) => [option.value, option.label]));

export const PATTERN_MODE_GROUPS = [
  {
    label: "Amp",
    options: AMP_MODE_OPTIONS.map((option) => ({
      value: `amp:${option.value}`,
      label: option.label,
    })),
  },
  {
    label: "Rhythm",
    options: RHYTHM_MODE_OPTIONS.filter((option) => option.value > 0).map((option) => ({
      value: `rhythm:${option.value}`,
      label: option.label,
    })),
  },
];

export function normalizeAmpPatternSource(value) {
  if (value === "rhythm") {
    return 0;
  }

  if (value === "amp") {
    return 0;
  }

  if (value === "web") {
    return 2;
  }

  if (value === null || value === undefined || value === "") {
    return DEFAULT_AMP_PATTERN_SOURCE;
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return DEFAULT_AMP_PATTERN_SOURCE;
  }

  return Math.round(numeric) === 2 ? 2 : 0;
}

export function normalizeAmpMode(value) {
  if (value === null || value === undefined || value === "") {
    return DEFAULT_AMP_MODE;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? clamp(Math.round(numeric), 1, 5) : DEFAULT_AMP_MODE;
}

export function normalizeRhythmMode(value) {
  if (value === null || value === undefined || value === "") {
    return DEFAULT_RHYTHM_MODE;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? clamp(Math.round(numeric), 0, 10) : DEFAULT_RHYTHM_MODE;
}

export function shouldUseRhythmPattern(ampPatternSource, rhythmMode) {
  return normalizeAmpPatternSource(ampPatternSource) === 0 && normalizeRhythmMode(rhythmMode) > 0;
}

export function shouldUseClassicWebPattern(ampPatternSource) {
  return normalizeAmpPatternSource(ampPatternSource) === 2;
}

export function getPatternModeValue({
  ampMode = DEFAULT_AMP_MODE,
  rhythmMode = DEFAULT_RHYTHM_MODE,
} = {}) {
  const normalizedRhythmMode = normalizeRhythmMode(rhythmMode);

  if (normalizedRhythmMode > 0) {
    return `rhythm:${normalizedRhythmMode}`;
  }

  return `amp:${normalizeAmpMode(ampMode)}`;
}

export function applyPatternModeValue(
  value,
  {
    ampMode = DEFAULT_AMP_MODE,
    rhythmMode = DEFAULT_RHYTHM_MODE,
  } = {},
) {
  const modeValue = String(value ?? "");

  if (modeValue.startsWith("rhythm:")) {
    return {
      ampMode: normalizeAmpMode(ampMode),
      rhythmMode: normalizeRhythmMode(modeValue.slice("rhythm:".length)),
    };
  }

  if (modeValue.startsWith("amp:")) {
    return {
      ampMode: normalizeAmpMode(modeValue.slice("amp:".length)),
      rhythmMode: DEFAULT_RHYTHM_MODE,
    };
  }

  return {
    ampMode: normalizeAmpMode(ampMode),
    rhythmMode: normalizeRhythmMode(rhythmMode),
  };
}

export function getAmpModeLabel(value) {
  return ampModeLabels.get(normalizeAmpMode(value)) ?? ampModeLabels.get(DEFAULT_AMP_MODE);
}

export function getRhythmModeLabel(value) {
  return rhythmModeLabels.get(normalizeRhythmMode(value)) ?? rhythmModeLabels.get(DEFAULT_RHYTHM_MODE);
}

export function describePatternSelection({
  ampPatternSource = DEFAULT_AMP_PATTERN_SOURCE,
  ampMode = DEFAULT_AMP_MODE,
  rhythmMode = DEFAULT_RHYTHM_MODE,
} = {}) {
  const normalizedSource = normalizeAmpPatternSource(ampPatternSource);
  const normalizedAmpMode = normalizeAmpMode(ampMode);
  const normalizedRhythmMode = normalizeRhythmMode(rhythmMode);

  if (normalizedSource === 2) {
    return "Web Classic";
  }

  if (normalizedRhythmMode > 0) {
    return `Rhythm ${getRhythmModeLabel(normalizedRhythmMode)}`;
  }

  return `Amp ${getAmpModeLabel(normalizedAmpMode)}`;
}

export function createAmpPattern(
  length,
  {
    ampPatternSource = DEFAULT_AMP_PATTERN_SOURCE,
    ampMode = DEFAULT_AMP_MODE,
    rhythmMode = DEFAULT_RHYTHM_MODE,
    voiceType = "perc",
  } = {},
) {
  const normalizedLength = Math.max(1, Math.round(Number(length) || 16));
  const normalizedSource = normalizeAmpPatternSource(ampPatternSource);
  const normalizedAmpMode = normalizeAmpMode(ampMode);
  const normalizedRhythmMode = normalizeRhythmMode(rhythmMode);

  if (shouldUseClassicWebPattern(normalizedSource)) {
    return createClassicWebPattern(normalizedLength, voiceType);
  }

  if (shouldUseRhythmPattern(normalizedSource, normalizedRhythmMode)) {
    return createRhythmPattern(normalizedLength, normalizedRhythmMode);
  }

  return createAmpModePattern(normalizedLength, normalizedAmpMode);
}

function createAmpModePattern(length, ampMode) {
  switch (normalizeAmpMode(ampMode)) {
    case 1:
      return createStepPattern(length, 6, false);
    case 2:
      return createStepPattern(length, 3, true);
    case 3:
      return createStepPattern(length, 4, false);
    case 4:
      return createStepPattern(length, 2, false);
    case 5:
    default:
      return createAllPattern(length);
  }
}

function createRhythmPattern(length, rhythmMode) {
  switch (normalizeRhythmMode(rhythmMode)) {
    case 1:
      return finalizeAmpPattern(createSparsePattern(length));
    case 2:
      return finalizeAmpPattern(createPulsePattern(length));
    case 3:
      return finalizeAmpPattern(createOffbeatPattern(length));
    case 4:
      return finalizeAmpPattern(createAlternatingPattern(length));
    case 5:
      return finalizeAmpPattern(createBurstPattern(length));
    case 6:
      return finalizeAmpPattern(createGallopPattern(length));
    case 7:
      return finalizeAmpPattern(createThreeThreeTwoPattern(length));
    case 8:
      return finalizeAmpPattern(createEuclideanAccentPattern(length, 5));
    case 9:
      return finalizeAmpPattern(createEuclideanAccentPattern(length, 7));
    case 10:
      return finalizeAmpPattern(createDropoutPattern(length));
    default:
      return createAmpModePattern(length, DEFAULT_AMP_MODE);
  }
}

function createStepPattern(length, interval, excludeLastStep) {
  const values = createZeroArray(length);
  const stepLimit = excludeLastStep ? length - 1 : length;

  for (let step = 0; step < stepLimit; step += interval) {
    values[step] = randomVelocityForStep(step, false);
  }

  return values;
}

function createAllPattern(length) {
  return Array.from({ length }, (_, step) => randomVelocityForStep(step, true));
}

function createClassicWebPattern(length, voiceType) {
  if (voiceType === "kick") {
    return createClassicWebKickPattern(length);
  }

  return Array.from({ length }, () => Math.random());
}

function createClassicWebKickPattern(length) {
  return Array.from({ length }, (_, index) => {
    const lane = index % 4;

    if (lane === 0) {
      return randomInRange(0.72, 1, 0.001);
    }

    if (lane === 2) {
      return Math.random() < 0.45 ? randomInRange(0.12, 0.42, 0.001) : 0;
    }

    return Math.random() < 0.18 ? randomInRange(0.08, 0.24, 0.001) : 0;
  });
}

function randomVelocityForStep(stepIndex, allActive) {
  if (stepIndex === 0) {
    return randomVelocity(allActive ? 0.52 : 0.76, allActive ? 0.82 : 1.0);
  }

  if (allActive) {
    if (stepIndex % 4 === 0) {
      return randomVelocity(0.2, 0.46);
    }

    if (stepIndex % 2 === 0) {
      return randomVelocity(0.1, 0.28);
    }

    return randomVelocity(0.03, 0.16);
  }

  if (stepIndex % 4 === 0) {
    return randomVelocity(0.52, 0.88);
  }

  return randomVelocity(0.32, 0.82);
}

function createSparsePattern(length) {
  const values = createZeroArray(length);
  const hitCount = randomInt(3, 5);
  const usedSteps = new Set([0]);
  values[0] = randomVelocity(0.8, 1.0);

  while (countActiveSteps(values) < hitCount) {
    const step = randomInt(0, length - 1);

    if (usedSteps.has(step)) {
      continue;
    }

    usedSteps.add(step);
    values[step] = randomVelocity(0.38, 0.82);
  }

  if (Math.random() < 0.45) {
    values[(length / 2) | 0] = randomVelocity(0.3, 0.62);
  }

  return values;
}

function createPulsePattern(length) {
  const values = createZeroArray(length);
  const anchors = [0, 4, 8, 12];

  anchors.forEach((anchor, index) => {
    if (index !== 0 && Math.random() < 0.2) {
      return;
    }

    values[anchor % length] = randomVelocity(index % 2 === 0 ? 0.62 : 0.5, 0.95);

    if (Math.random() < 0.35) {
      values[(anchor + 2) % length] = randomVelocity(0.16, 0.42);
    }
  });

  return rotatePattern(values, randomChoice([0, 0, 0, 2]));
}

function createOffbeatPattern(length) {
  const values = createZeroArray(length);
  const steps = [2, 6, 10, 14];

  steps.forEach((step) => {
    values[step % length] = randomVelocity(0.48, 0.88);

    if (Math.random() < 0.3) {
      values[(step + 2) % length] = randomVelocity(0.15, 0.38);
    }
  });

  if (Math.random() < 0.45) {
    values[0] = randomVelocity(0.22, 0.48);
  }

  return rotatePattern(values, randomChoice([0, 1, 3]));
}

function createAlternatingPattern(length) {
  const values = createZeroArray(length);
  const phase = randomInt(0, 1);

  for (let index = phase; index < length; index += 2) {
    if (Math.random() < 0.18) {
      continue;
    }

    values[index] = randomVelocity(index % 4 === phase ? 0.55 : 0.28, 0.82);
  }

  if (Math.random() < 0.55) {
    values[(phase + 7) % length] = randomVelocity(0.18, 0.42);
  }

  return values;
}

function createBurstPattern(length) {
  const values = createZeroArray(length);
  const burstCount = randomInt(2, 3);

  for (let burstIndex = 0; burstIndex < burstCount; burstIndex += 1) {
    const start = randomInt(0, length - 1);
    const burstLength = randomInt(2, 4);

    for (let stepOffset = 0; stepOffset < burstLength; stepOffset += 1) {
      const step = (start + stepOffset) % length;
      const min = stepOffset === 0 ? 0.58 : 0.22;
      const max = stepOffset === 0 ? 0.96 : 0.68;
      values[step] = Math.max(values[step], randomVelocity(min, max));
    }
  }

  return values;
}

function createGallopPattern(length) {
  const values = createZeroArray(length);
  const motifA = [0.95, 0.48, 0.0, 0.22];
  const motifB = [0.9, 0.32, 0.18, 0.0];
  const motif = Math.random() < 0.5 ? motifA : motifB;

  for (let index = 0; index < length; index += 1) {
    const value = motif[index % motif.length];

    if (value > 0) {
      values[index] = randomVelocity(Math.max(0.05, value - 0.1), Math.min(1.0, value + 0.1));
    }
  }

  return rotatePattern(values, randomChoice([0, 0, 1, 2]));
}

function createThreeThreeTwoPattern(length) {
  const values = createZeroArray(length);
  const motif = [0.96, 0.0, 0.0, 0.74, 0.0, 0.0, 0.82, 0.0];

  for (let index = 0; index < length; index += 1) {
    const value = motif[index % motif.length];

    if (value > 0) {
      values[index] = randomVelocity(Math.max(0.05, value - 0.08), Math.min(1.0, value + 0.08));
    }
  }

  if (Math.random() < 0.4) {
    values[randomChoice([7 % length, 15 % length])] = randomVelocity(0.16, 0.34);
  }

  return rotatePattern(values, randomChoice([0, 0, 2]));
}

function createEuclideanAccentPattern(length, pulses) {
  const values = createZeroArray(length);
  const rotation = randomInt(0, length - 1);

  for (let step = 0; step < length; step += 1) {
    const previousBucket = Math.floor((step * pulses) / length);
    const currentBucket = Math.floor(((step + 1) * pulses) / length);

    if (currentBucket !== previousBucket) {
      const rotatedStep = (step + rotation) % length;
      const beatAccent = rotatedStep % 4 === 0;
      values[rotatedStep] = randomVelocity(beatAccent ? 0.62 : 0.34, beatAccent ? 0.96 : 0.78);
    }
  }

  return values;
}

function createDropoutPattern(length) {
  const values = createZeroArray(length);

  for (let index = 0; index < length; index += 1) {
    if (index % 2 === 0 || Math.random() < 0.4) {
      values[index] = randomVelocity(index % 4 === 0 ? 0.5 : 0.18, index % 4 === 0 ? 0.9 : 0.6);
    }
  }

  for (let index = 0; index < randomInt(3, 6); index += 1) {
    values[randomInt(0, length - 1)] = 0.0;
  }

  values[0] = randomVelocity(0.72, 1.0);
  return values;
}

function finalizeAmpPattern(values) {
  const normalized = [];
  let activeCount = 0;

  values.forEach((rawValue) => {
    let value = clamp(rawValue || 0.0, 0.0, 1.0);

    if (value < 0.12) {
      value = 0.0;
    }

    if (value > 0.0) {
      activeCount += 1;
    }

    normalized.push(roundToStep(value, 0.001));
  });

  if (activeCount === 0) {
    normalized[0] = randomVelocity(0.75, 1.0);
    activeCount = 1;
  }

  if (activeCount === normalized.length) {
    normalized[randomInt(1, normalized.length - 1)] = 0.0;
  }

  if (activeCount < 3) {
    addRandomHits(normalized, 3 - activeCount, 0.24, 0.7);
  }

  if (countZeroSteps(normalized) < 4) {
    addRandomRests(normalized, 4 - countZeroSteps(normalized));
  }

  normalized[0] = Math.max(normalized[0], randomVelocity(0.58, 0.92));
  return normalized;
}

function randomVelocity(min, max) {
  return roundToStep(randomInRange(min, max), 0.001);
}

function roundToStep(value, step) {
  return randomInRange(value, value, step);
}

function randomInt(min, max) {
  return Math.floor(randomInRange(min, max + 1));
}

function randomChoice(values) {
  return values[randomInt(0, values.length - 1)];
}

function rotatePattern(values, amount) {
  return values.map((_, index) => values[(index - amount + values.length) % values.length]);
}

function createZeroArray(length) {
  return Array.from({ length }, () => 0.0);
}

function countActiveSteps(values) {
  return values.reduce((count, value) => count + (value > 0.0 ? 1 : 0), 0);
}

function countZeroSteps(values) {
  return values.length - countActiveSteps(values);
}

function addRandomHits(values, count, min, max) {
  let remaining = count;

  while (remaining > 0) {
    const index = randomInt(0, values.length - 1);

    if (values[index] > 0.0) {
      continue;
    }

    values[index] = randomVelocity(min, max);
    remaining -= 1;
  }
}

function addRandomRests(values, count) {
  let remaining = count;

  while (remaining > 0) {
    const index = randomInt(1, values.length - 1);

    if (values[index] === 0.0) {
      continue;
    }

    values[index] = 0.0;
    remaining -= 1;
  }
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
  const decimals = String(value).split(".")[1];
  return decimals ? decimals.length : 0;
}
