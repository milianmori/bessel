import { curveTransfer, normalizeEnvelopePoints } from "../model.js";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export class EnvelopeEditor {
  constructor({ canvas, points, onChange = null, onSelectionChange = null }) {
    this.canvas = canvas;
    this.points = normalizeEnvelopePoints(points);
    this.onChange = onChange;
    this.onSelectionChange = onSelectionChange;
    this.selectedPointIndex = 1;
    this.draggingPointIndex = null;

    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(this.canvas);

    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);

    this.render();
  }

  get selectedSegmentIndex() {
    return clamp(this.selectedPointIndex, 1, this.points.length - 1);
  }

  setPoints(points) {
    this.points = normalizeEnvelopePoints(points);
    this.selectedPointIndex = clamp(this.selectedPointIndex, 1, this.points.length - 1);
    this.notifySelectionChange();
    this.render();
  }

  addPoint() {
    if (this.points.length >= 6) {
      return;
    }

    const segment = this.selectedSegmentIndex;
    const left = this.points[segment - 1];
    const right = this.points[segment];
    const newPoint = {
      time: (left.time + right.time) * 0.5,
      value: (left.value + right.value) * 0.5,
      curve: 0,
    };

    this.points.splice(segment, 0, newPoint);
    this.selectedPointIndex = segment;
    this.notifySelectionChange();
    this.commit();
  }

  removePoint() {
    if (this.points.length <= 2 || this.selectedPointIndex === 0 || this.selectedPointIndex === this.points.length - 1) {
      return;
    }

    this.points.splice(this.selectedPointIndex, 1);
    this.selectedPointIndex = clamp(this.selectedPointIndex - 1, 1, this.points.length - 1);
    this.notifySelectionChange();
    this.commit();
  }

  setCurve(curve) {
    this.points[this.selectedSegmentIndex].curve = clamp(curve, -1, 1);
    this.commit();
  }

  getSelectedCurve() {
    return this.points[this.selectedSegmentIndex]?.curve ?? 0;
  }

  destroy() {
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
  }

  handlePointerDown = (event) => {
    const pointIndex = this.hitTestPoint(event);

    if (pointIndex !== null) {
      this.draggingPointIndex = pointIndex;
      this.selectedPointIndex = pointIndex;
      this.canvas.setPointerCapture(event.pointerId);
      this.notifySelectionChange();
      this.render();
      return;
    }

    this.selectedPointIndex = this.pickSegment(event);
    this.notifySelectionChange();
    this.render();
  };

  handlePointerMove = (event) => {
    if (this.draggingPointIndex === null) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const normalizedX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const normalizedY = clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1);
    const index = this.draggingPointIndex;
    const point = this.points[index];

    point.value = normalizedY;

    if (index !== 0 && index !== this.points.length - 1) {
      const previous = this.points[index - 1];
      const next = this.points[index + 1];
      point.time = clamp(normalizedX, previous.time + 0.03, next.time - 0.03);
    }

    this.commit();
  };

  handlePointerUp = () => {
    this.draggingPointIndex = null;
  };

  hitTestPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    const pointRadius = 12;

    for (let index = 0; index < this.points.length; index += 1) {
      const point = this.points[index];
      const x = rect.left + point.time * rect.width;
      const y = rect.top + (1 - point.value) * rect.height;
      const distance = Math.hypot(event.clientX - x, event.clientY - y);

      if (distance <= pointRadius) {
        return index;
      }
    }

    return null;
  }

  pickSegment(event) {
    const rect = this.canvas.getBoundingClientRect();
    const normalizedX = clamp((event.clientX - rect.left) / rect.width, 0, 1);

    for (let index = 1; index < this.points.length; index += 1) {
      if (normalizedX <= this.points[index].time) {
        return index;
      }
    }

    return this.points.length - 1;
  }

  commit() {
    this.points = normalizeEnvelopePoints(this.points);
    this.notifySelectionChange();
    this.render();

    if (this.onChange) {
      this.onChange(this.points.map((point) => ({ ...point })));
    }
  }

  notifySelectionChange() {
    if (this.onSelectionChange) {
      this.onSelectionChange(this.selectedSegmentIndex, this.getSelectedCurve());
    }
  }

  render() {
    const context = setupCanvas(this.canvas);
    const { width, height } = this.canvas;

    context.clearRect(0, 0, width, height);
    context.fillStyle = "rgba(8,12,18,0.94)";
    context.fillRect(0, 0, width, height);

    context.strokeStyle = "rgba(255,255,255,0.08)";
    context.lineWidth = 1;

    for (let row = 1; row < 5; row += 1) {
      const y = (height / 5) * row;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }

    for (let column = 1; column < 8; column += 1) {
      const x = (width / 8) * column;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }

    context.beginPath();
    context.lineWidth = 3;
    context.strokeStyle = "#6ab1c7";

    for (let x = 0; x <= width; x += 2) {
      const phase = x / width;
      const value = sampleEnvelope(this.points, phase);
      const y = (1 - value) * height;

      if (x === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }

    context.stroke();

    this.points.forEach((point, index) => {
      const x = point.time * width;
      const y = (1 - point.value) * height;
      context.beginPath();
      context.fillStyle = index === this.selectedPointIndex ? "#f0b075" : "#c57b57";
      context.arc(x, y, index === this.selectedPointIndex ? 9 : 7, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "rgba(0,0,0,0.35)";
      context.lineWidth = 2;
      context.stroke();
    });
  }
}

function sampleEnvelope(points, phase) {
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

  return points.at(-1).value;
}

function setupCanvas(canvas) {
  const context = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(canvas.clientWidth * ratio);
  const height = Math.round(canvas.clientHeight * ratio);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  return context;
}
