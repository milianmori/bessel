const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export class MultiSlider {
  constructor({
    canvas,
    values,
    min = 0,
    max = 1,
    editable = true,
    fill = "#c57b57",
    grid = "rgba(255,255,255,0.08)",
    background = "rgba(8,12,18,0.92)",
    onChange = null,
  }) {
    this.canvas = canvas;
    this.values = [...values];
    this.min = min;
    this.max = max;
    this.editable = editable;
    this.fill = fill;
    this.grid = grid;
    this.background = background;
    this.onChange = onChange;
    this.dragging = false;

    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(this.canvas);

    if (this.editable) {
      this.canvas.addEventListener("pointerdown", this.handlePointerDown);
      window.addEventListener("pointermove", this.handlePointerMove);
      window.addEventListener("pointerup", this.handlePointerUp);
    }

    this.render();
  }

  setValues(values) {
    this.values = [...values];
    this.render();
  }

  destroy() {
    this.resizeObserver.disconnect();
    if (this.editable) {
      this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
      window.removeEventListener("pointermove", this.handlePointerMove);
      window.removeEventListener("pointerup", this.handlePointerUp);
    }
  }

  handlePointerDown = (event) => {
    this.dragging = true;
    this.canvas.setPointerCapture(event.pointerId);
    this.updateFromEvent(event);
  };

  handlePointerMove = (event) => {
    if (!this.dragging) {
      return;
    }

    this.updateFromEvent(event);
  };

  handlePointerUp = () => {
    this.dragging = false;
  };

  updateFromEvent(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, rect.width);
    const y = clamp(event.clientY - rect.top, 0, rect.height);
    const index = Math.min(this.values.length - 1, Math.floor((x / rect.width) * this.values.length));
    const normalized = 1 - y / rect.height;
    this.values[index] = clamp(this.min + normalized * (this.max - this.min), this.min, this.max);
    this.render();

    if (this.onChange) {
      this.onChange([...this.values]);
    }
  }

  render() {
    const context = setupCanvas(this.canvas);
    const { width, height } = this.canvas;

    context.clearRect(0, 0, width, height);
    context.fillStyle = this.background;
    context.fillRect(0, 0, width, height);

    context.strokeStyle = this.grid;
    context.lineWidth = 1;

    for (let row = 1; row < 5; row += 1) {
      const y = (height / 5) * row;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }

    const barWidth = width / this.values.length;

    this.values.forEach((value, index) => {
      const normalized = (value - this.min) / (this.max - this.min);
      const x = index * barWidth;
      const barHeight = normalized * height;

      context.fillStyle = this.fill;
      context.fillRect(
        x + barWidth * 0.12,
        height - barHeight,
        Math.max(1, barWidth * 0.76),
        barHeight,
      );
    });
  }
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
