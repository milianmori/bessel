autowatch = 1;
outlets = 13;

function bang() {
    emitRandomVoice();
}

function randomize() {
    emitRandomVoice();
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
    outlet(6, createRandomArray(16));
    outlet(5, createRandomArray(64));
    outlet(4, randomInRange(0.0, 1.0, 0.001));
    outlet(3, randomInRange(0.0, 1.0, 0.001));
    outlet(2, randomInRange(0.0, 1.0, 0.001));
    outlet(1, randomInRange(0.05, 1.0, 0.001));
    outlet(0, randomLogValue(20.0, 12000.0));
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
