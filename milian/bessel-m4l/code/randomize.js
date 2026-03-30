autowatch = 1;
outlets = 13;
var ampMode = 1;
var legacyRhythm = 0;

function bang() {
    emitRandomVoice();
}

function randomize() {
    emitRandomVoice();
}

function amp_mode(modeIndex) {
    ampMode = clampMode(modeIndex);
}

function legacy_rhythm(rhythmIndex) {
    legacyRhythm = clampLegacyRhythm(rhythmIndex);
}

function anything() {
    if (messagename === "randomize") {
        emitRandomVoice();
    }
}

function emitRandomVoice() {
    var thirdPointTime = randomInRange(0.12, 1.0, 0.001);
    var secondPointTime = randomInRange(0.06, thirdPointTime - 0.06, 0.001);
    var noiseEnv = [
        1000.0,
        0.0,
        1.0,
        0.0,
        0.0,
        0,
        0.0,
        secondPointTime * 1000.0,
        randomInRange(0.0, 1.0, 0.001),
        0,
        randomInRange(0.0, 1.0, 0.001),
        thirdPointTime * 1000.0,
        0.0,
        0,
        randomInRange(0.0, 1.0, 0.001),
        "curve"
    ];

    outlet(12, randomInRange(0.2, 1.4, 0.001));
    outlet(11, randomInRange(0.0, 220.0, 0.1));
    outlet(10, randomInRange(0.0, 24.0, 0.1));
    outlet(9, randomInRange(0.0, 500.0, 1.0));
    outlet(8, randomInRange(0.0, 1.0, 0.001));
    outlet(7, noiseEnv);
    outlet(6, createAmpPattern(16, ampMode));
    outlet(5, createRandomArray(64));
    outlet(4, randomInRange(0.0, 1.0, 0.001));
    outlet(3, randomInRange(0.0, 1.0, 0.001));
    outlet(2, randomInRange(0.0, 1.0, 0.001));
    outlet(1, randomInRange(0.05, 1.0, 0.001));
    outlet(0, randomLogValue(20.0, 12000.0));
}

function createAmpPattern(length, modeIndex) {
    if (legacyRhythm > 0) {
        return createLegacyPattern(length, legacyRhythm);
    }

    switch (clampMode(modeIndex)) {
        case 1:
            return createStepPattern(length, 6, false);
        case 2:
            return createStepPattern(length, 3, true);
        case 3:
            return createStepPattern(length, 4, false);
        case 4:
            return createStepPattern(length, 2, false);
        case 5:
            return createAllPattern(length);
        default:
            return createAllPattern(length);
    }
}

function createStepPattern(length, interval, excludeLastStep) {
    var values = createZeroArray(length);
    var step;
    var stepLimit = excludeLastStep ? length - 1 : length;

    for (step = 0; step < stepLimit; step += interval) {
        values[step] = randomVelocityForStep(step, false);
    }

    return values;
}

function createAllPattern(length) {
    var values = [];
    var step;

    for (step = 0; step < length; step++) {
        values.push(randomVelocityForStep(step, true));
    }

    return values;
}

function randomVelocityForStep(stepIndex, allActive) {
    if (stepIndex === 0) {
        return randomVelocity(0.76, 1.0);
    }

    if (allActive) {
        if (stepIndex % 4 === 0) {
            return randomVelocity(0.46, 0.86);
        }

        if (stepIndex % 2 === 0) {
            return randomVelocity(0.24, 0.7);
        }

        return randomVelocity(0.12, 0.54);
    }

    if (stepIndex % 4 === 0) {
        return randomVelocity(0.52, 0.88);
    }

    return randomVelocity(0.32, 0.82);
}

function createLegacyPattern(length, rhythmIndex) {
    switch (clampLegacyRhythm(rhythmIndex)) {
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
            return createStepPattern(length, 6, false);
    }
}

function createSparsePattern(length) {
    var values = createZeroArray(length);
    var hitCount = randomInt(3, 5);
    var usedSteps = { 0: true };
    values[0] = randomVelocity(0.8, 1.0);

    while (countActiveSteps(values) < hitCount) {
        var step = randomInt(0, length - 1);

        if (usedSteps[step]) {
            continue;
        }

        usedSteps[step] = true;
        values[step] = randomVelocity(0.38, 0.82);
    }

    if (Math.random() < 0.45) {
        values[(length / 2) | 0] = randomVelocity(0.3, 0.62);
    }

    return values;
}

function createPulsePattern(length) {
    var values = createZeroArray(length);
    var anchors = [ 0, 4, 8, 12 ];
    var anchorCount = anchors.length;
    var index;

    for (index = 0; index < anchorCount; index++) {
        if (index !== 0 && Math.random() < 0.2) {
            continue;
        }

        values[anchors[index]] = randomVelocity(index % 2 === 0 ? 0.62 : 0.5, 0.95);

        if (Math.random() < 0.35) {
            values[(anchors[index] + 2) % length] = randomVelocity(0.16, 0.42);
        }
    }

    return rotatePattern(values, randomChoice([ 0, 0, 0, 2 ]));
}

function createOffbeatPattern(length) {
    var values = createZeroArray(length);
    var steps = [ 2, 6, 10, 14 ];
    var index;

    for (index = 0; index < steps.length; index++) {
        values[steps[index]] = randomVelocity(0.48, 0.88);

        if (Math.random() < 0.3) {
            values[(steps[index] + 2) % length] = randomVelocity(0.15, 0.38);
        }
    }

    if (Math.random() < 0.45) {
        values[0] = randomVelocity(0.22, 0.48);
    }

    return rotatePattern(values, randomChoice([ 0, 1, 3 ]));
}

function createAlternatingPattern(length) {
    var values = createZeroArray(length);
    var phase = randomInt(0, 1);
    var index;

    for (index = phase; index < length; index += 2) {
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
    var values = createZeroArray(length);
    var burstCount = randomInt(2, 3);
    var burstIndex;

    for (burstIndex = 0; burstIndex < burstCount; burstIndex++) {
        var start = randomInt(0, length - 1);
        var burstLength = randomInt(2, 4);
        var stepOffset;

        for (stepOffset = 0; stepOffset < burstLength; stepOffset++) {
            var step = (start + stepOffset) % length;
            var min = stepOffset === 0 ? 0.58 : 0.22;
            var max = stepOffset === 0 ? 0.96 : 0.68;
            values[step] = Math.max(values[step], randomVelocity(min, max));
        }
    }

    return values;
}

function createGallopPattern(length) {
    var values = createZeroArray(length);
    var motifA = [ 0.95, 0.48, 0.0, 0.22 ];
    var motifB = [ 0.9, 0.32, 0.18, 0.0 ];
    var motif = Math.random() < 0.5 ? motifA : motifB;
    var index;

    for (index = 0; index < length; index++) {
        var value = motif[index % motif.length];

        if (value > 0) {
            values[index] = randomVelocity(Math.max(0.05, value - 0.1), Math.min(1.0, value + 0.1));
        }
    }

    return rotatePattern(values, randomChoice([ 0, 0, 1, 2 ]));
}

function createThreeThreeTwoPattern(length) {
    var values = createZeroArray(length);
    var motif = [ 0.96, 0.0, 0.0, 0.74, 0.0, 0.0, 0.82, 0.0 ];
    var index;

    for (index = 0; index < length; index++) {
        var value = motif[index % motif.length];

        if (value > 0) {
            values[index] = randomVelocity(Math.max(0.05, value - 0.08), Math.min(1.0, value + 0.08));
        }
    }

    if (Math.random() < 0.4) {
        values[randomChoice([ 7, 15 ])] = randomVelocity(0.16, 0.34);
    }

    return rotatePattern(values, randomChoice([ 0, 0, 2 ]));
}

function createEuclideanAccentPattern(length, pulses) {
    var values = createZeroArray(length);
    var rotation = randomInt(0, length - 1);
    var step;

    for (step = 0; step < length; step++) {
        var previousBucket = Math.floor(step * pulses / length);
        var currentBucket = Math.floor((step + 1) * pulses / length);

        if (currentBucket !== previousBucket) {
            var rotatedStep = (step + rotation) % length;
            var beatAccent = rotatedStep % 4 === 0;
            values[rotatedStep] = randomVelocity(beatAccent ? 0.62 : 0.34, beatAccent ? 0.96 : 0.78);
        }
    }

    return values;
}

function createDropoutPattern(length) {
    var values = createZeroArray(length);
    var index;

    for (index = 0; index < length; index++) {
        if (index % 2 === 0 || Math.random() < 0.4) {
            values[index] = randomVelocity(index % 4 === 0 ? 0.5 : 0.18, index % 4 === 0 ? 0.9 : 0.6);
        }
    }

    for (index = 0; index < randomInt(3, 6); index++) {
        values[randomInt(0, length - 1)] = 0.0;
    }

    values[0] = randomVelocity(0.72, 1.0);
    return values;
}

function finalizeAmpPattern(values) {
    var normalized = [];
    var activeCount = 0;
    var index;

    for (index = 0; index < values.length; index++) {
        var value = clamp(values[index] || 0.0, 0.0, 1.0);

        if (value < 0.12) {
            value = 0.0;
        }

        if (value > 0.0) {
            activeCount += 1;
        }

        normalized.push(roundToStep(value, 0.001));
    }

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

function createRandomArray(length) {
    var values = [];

    for (var index = 0; index < length; index++) {
        values.push(Math.random());
    }

    return values;
}

function randomLogValue(min, max) {
    var minLog = Math.log(min);
    var maxLog = Math.log(max);
    return Math.exp(minLog + Math.random() * (maxLog - minLog));
}

function clampMode(modeIndex) {
    return clamp(Math.round(modeIndex || 1), 1, 5);
}

function clampLegacyRhythm(rhythmIndex) {
    return clamp(Math.round(rhythmIndex || 0), 0, 10);
}

function randomInRange(min, max, step) {
    var value = min + Math.random() * (max - min);

    if (!step) {
        return value;
    }

    var steps = Math.round((value - min) / step);
    var rounded = min + steps * step;
    var precision = Math.max(0, countDecimals(step));

    return Number(clamp(rounded, min, max).toFixed(precision));
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
    var rotated = [];
    var index;

    for (index = 0; index < values.length; index++) {
        rotated.push(values[(index - amount + values.length) % values.length]);
    }

    return rotated;
}

function createZeroArray(length) {
    var values = [];
    var index;

    for (index = 0; index < length; index++) {
        values.push(0.0);
    }

    return values;
}

function countActiveSteps(values) {
    var count = 0;
    var index;

    for (index = 0; index < values.length; index++) {
        if (values[index] > 0.0) {
            count += 1;
        }
    }

    return count;
}

function countZeroSteps(values) {
    return values.length - countActiveSteps(values);
}

function addRandomHits(values, count, min, max) {
    var remaining = count;

    while (remaining > 0) {
        var index = randomInt(0, values.length - 1);

        if (values[index] > 0.0) {
            continue;
        }

        values[index] = randomVelocity(min, max);
        remaining -= 1;
    }
}

function addRandomRests(values, count) {
    var remaining = count;

    while (remaining > 0) {
        var index = randomInt(1, values.length - 1);

        if (values[index] === 0.0) {
            continue;
        }

        values[index] = 0.0;
        remaining -= 1;
    }
}

function countDecimals(value) {
    var stringValue = String(value);
    var decimalIndex = stringValue.indexOf(".");

    if (decimalIndex === -1) {
        return 0;
    }

    return stringValue.length - decimalIndex - 1;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
