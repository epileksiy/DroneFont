import { PX } from "./constants.js";
import { state } from "./state.js";

const CHECKER_A = "#2a2a30";
const CHECKER_B = "#33333a";
const GRID_LINE = "rgba(255,255,255,0.06)";

/**
 * Редактор одного символа: canvas с увеличенными "пикселями",
 * рисование, ластик, заливка, пипетка, зеркалирование, сдвиг.
 */
export class CharEditor {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.cell = 24; // размер одного логического пикселя на экране, px
    this.tool = "pen"; // pen | fill | eyedrop
    this.color = PX.BLACK;
    this.brushSize = 1; // толщина кисти в логических пикселях (квадрат N×N вокруг курсора)
    this.isPainting = false;
    this.showGrid = true;
    this.outline = { enabled: false, color: PX.BLACK, width: 1 }; // окантовка вокруг мазка кистью

    canvas.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    canvas.addEventListener("pointermove", (e) => this._onPointerMove(e));
    window.addEventListener("pointerup", () => {
      this._onPointerUp();
      this.finishStroke();
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    state.on("select:changed", () => this.render());
    state.on("char:changed", ({ index }) => {
      if (index === -1 || index === state.selectedIndex) this.render();
    });
  }

  resize() {
    const { charW, charH } = state;
    this.canvas.width = charW * this.cell;
    this.canvas.height = charH * this.cell;
    this.render();
  }

  setZoom(cell) {
    this.cell = cell;
    this.resize();
  }

  // Обёртки для единого интерфейса с LogoEditor — общая панель инструментов
  // вызывает эти методы не зная, какой из двух редакторов сейчас активен.
  undo() {
    return state.undo(state.selectedIndex);
  }
  redo() {
    return state.redo(state.selectedIndex);
  }
  clear() {
    state.clearChar(state.selectedIndex);
    return true;
  }

  _cellFromEvent(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = Math.floor(((e.clientX - rect.left) * scaleX) / this.cell);
    const y = Math.floor(((e.clientY - rect.top) * scaleY) / this.cell);
    return { x, y };
  }

  _onPointerDown(e) {
    this.isPainting = true;
    this._paintAt(e, e.button === 2);
  }
  _onPointerMove(e) {
    if (!this.isPainting) return;
    this._paintAt(e, e.buttons === 2);
  }
  _onPointerUp() {
    this.isPainting = false;
  }

  _paintAt(e, rightClick) {
    const { charW, charH } = state;
    const { x, y } = this._cellFromEvent(e);
    if (x < 0 || y < 0 || x >= charW || y >= charH) return;
    const idx = state.selectedIndex;
    const data = state.getChar(idx);

    if (this.tool === "eyedrop") {
      this.color = data[y * charW + x];
      this.canvas.dispatchEvent(new CustomEvent("colorpicked", { detail: this.color }));
      this.isPainting = false;
      return;
    }

    const useColor = rightClick ? PX.TRANSPARENT : this.color;

    if (this.tool === "fill") {
      const next = this._bucketFill(data, charW, charH, x, y, useColor);
      state.setChar(idx, next);
      this.isPainting = false;
      return;
    }

    // pen — мутируем массив прямо во время мазка, снимок "до" берём один раз
    // на pointerdown, а в undo-историю кладём его целиком на pointerup
    // (иначе каждый задетый пиксель мазка стал бы отдельным шагом undo).
    if (!this._strokeSnapshot) this._strokeSnapshot = data.slice();
    const cells = this._brushCells(x, y, charW, charH);
    for (const [nx, ny] of cells) data[ny * charW + nx] = useColor;
    if (useColor !== PX.TRANSPARENT && this.outline?.enabled) {
      for (const [nx, ny] of cells) this._stampOutline(data, charW, charH, nx, ny);
    }
    this.render();
  }

  /** Клетки квадратной кисти размером brushSize вокруг (cx,cy), обрезанные по границам символа. */
  _brushCells(cx, cy, w, h) {
    const size = Math.max(1, this.brushSize | 0 || 1);
    const half = Math.floor((size - 1) / 2);
    const cells = [];
    for (let oy = 0; oy < size; oy++) {
      for (let ox = 0; ox < size; ox++) {
        const nx = cx - half + ox,
          ny = cy - half + oy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) cells.push([nx, ny]);
      }
    }
    return cells;
  }

  /** Закрашивает прозрачные клетки вокруг (cx,cy) цветом окантовки, не трогая уже непрозрачные. */
  _stampOutline(data, w, h, cx, cy) {
    const { color, width } = this.outline;
    for (let oy = -width; oy <= width; oy++) {
      for (let ox = -width; ox <= width; ox++) {
        if (ox === 0 && oy === 0) continue;
        const nx = cx + ox,
          ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const i = ny * w + nx;
        if (data[i] === PX.TRANSPARENT) data[i] = color;
      }
    }
  }

  finishStroke() {
    if (this._strokeSnapshot) {
      state.commitStroke(state.selectedIndex, this._strokeSnapshot);
      this._strokeSnapshot = null;
    }
  }

  _bucketFill(data, w, h, sx, sy, color) {
    const next = data.slice();
    const target = next[sy * w + sx];
    if (target === color) return next;
    const stack = [[sx, sy]];
    const seen = new Uint8Array(w * h);
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const i = y * w + x;
      if (seen[i] || next[i] !== target) continue;
      seen[i] = 1;
      next[i] = color;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    return next;
  }

  mirrorHorizontal() {
    const { charW, charH } = state;
    const data = state.getChar(state.selectedIndex);
    const next = new Uint8Array(data.length);
    for (let y = 0; y < charH; y++)
      for (let x = 0; x < charW; x++) next[y * charW + x] = data[y * charW + (charW - 1 - x)];
    state.setChar(state.selectedIndex, next);
  }

  mirrorVertical() {
    const { charW, charH } = state;
    const data = state.getChar(state.selectedIndex);
    const next = new Uint8Array(data.length);
    for (let y = 0; y < charH; y++)
      for (let x = 0; x < charW; x++) next[y * charW + x] = data[(charH - 1 - y) * charW + x];
    state.setChar(state.selectedIndex, next);
  }

  shift(dx, dy) {
    const { charW, charH } = state;
    const data = state.getChar(state.selectedIndex);
    const next = new Uint8Array(data.length).fill(PX.TRANSPARENT);
    for (let y = 0; y < charH; y++) {
      for (let x = 0; x < charW; x++) {
        const nx = x + dx,
          ny = y + dy;
        if (nx >= 0 && nx < charW && ny >= 0 && ny < charH) {
          next[ny * charW + nx] = data[y * charW + x];
        }
      }
    }
    state.setChar(state.selectedIndex, next);
  }

  invert() {
    const data = state.getChar(state.selectedIndex);
    const next = data.map((v) => (v === PX.BLACK ? PX.WHITE : v === PX.WHITE ? PX.BLACK : PX.TRANSPARENT));
    state.setChar(state.selectedIndex, next);
  }

  render() {
    const { ctx, canvas, cell } = this;
    const { charW, charH } = state;
    const data = state.getChar(state.selectedIndex);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < charH; y++) {
      for (let x = 0; x < charW; x++) {
        const v = data[y * charW + x];
        if (v === PX.TRANSPARENT) {
          ctx.fillStyle = (x + y) % 2 === 0 ? CHECKER_A : CHECKER_B;
        } else if (v === PX.BLACK) {
          ctx.fillStyle = "#0a0a0c";
        } else {
          ctx.fillStyle = "#f5f5f0";
        }
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }

    if (this.showGrid && cell >= 8) {
      ctx.strokeStyle = GRID_LINE;
      ctx.lineWidth = 1;
      for (let x = 0; x <= charW; x++) {
        ctx.beginPath();
        ctx.moveTo(x * cell + 0.5, 0);
        ctx.lineTo(x * cell + 0.5, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y <= charH; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * cell + 0.5);
        ctx.lineTo(canvas.width, y * cell + 0.5);
        ctx.stroke();
      }
    }
  }
}
