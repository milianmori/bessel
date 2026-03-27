autowatch = 1;
inlets = 2;
outlets = 1;

var ampMode = 1;
var PATTERN_LENGTH = 16;

function bang() {
    if (inlet !== 0) {
        return;
    }

    outlet(0, createAmpPattern(PATTERN_LENGTH, ampMode));
}

function msg_int(value) {
    if (inlet === 1) {
        ampMode = clampMode(value);
        return;
    }

    outlet(0, createAmpPattern(PATTERN_LENGTH, clampMode(value)));
}

function amp_mode(value) {
    ampMode = clampMode(value);
}

function createAmpPattern(length, modeIndex) {
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
        default:
            return createAllPattern(length);
    }
}

function createStepPattern(length, interval, excludeLastStep) {
    var values = createZeroArray(length);
    var stepLimit = excludeLastStep ? length - 1 : length;
    var step;

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

function clampMode(modeIndex) {
    return clamp(Math.round(modeIndex || 1), 1, 5);
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

function createZeroArray(length) {
    var values = [];
    var index;

    for (index = 0; index < length; index++) {
        values.push(0.0);
    }

    return values;
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
