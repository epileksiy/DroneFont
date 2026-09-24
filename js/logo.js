import { PX, LOGO_TILES_H, LOGO_TILES_V, LOGO_TILE_COUNT, logoStartIndex } from "./constants.js";
import { state } from "./state.js";
import { t } from "./i18n.js";

// ---------------------------------------------------------------------------
// Редактор стартового логотипа: тот же набор инструментов, что и у обычного
// символа (кисть/заливка/пипетка/зеркало/инверсия/сдвиг/зум/undo-redo),
// только применённый сразу ко всей композиции 24x4 тайла. Рисование идёт
// прямо по итоговой картинке — каждый экранный пиксель прозрачно мапится в
// конкретный символ шрифта и конкретный локальный пиксель внутри него, так
// что итог сразу лежит в state.characters и виден в основном редакторе.
// Дополнительно можно перетащить готовую картинку — она автоматически
// кропается по центру (cover-fit) и раскладывается по тем же символам.
// Раскладка (24 колонки x 4 строки, старт с символа 160 для 256-символьного
// набора) подтверждена по LogoManager.js из betaflight-configurator.
// ---------------------------------------------------------------------------

const CHECKER_A = "#24242a";
const CHECKER_B = "#2b2b32";
const GRID_LINE = "rgba(255,255,255,0.06)";
const TILE_LINE = "rgba(255,255,255,0.14)";

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("не удалось прочитать файл как изображение"));
    };
    img.src = url;
  });
}

export class LogoEditor {
  constructor({ canvas, thresholdInput, dropZone, hintEl, fileInput, fileBtn }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.thresholdInput = thresholdInput;
    this.dropZone = dropZone;
    this.hintEl = hintEl;
    this.fileInput = fileInput;

    this.cell = 4;
    this.tool = "pen";
    this.color = PX.BLACK;
    this.brushSize = 1; // толщина кисти в логических пикселях (квадрат N×N вокруг курсора)
    this.isPainting = false;
    this.showGrid = true;
    this.outline = { enabled: false, color: PX.BLACK, width: 1 }; // окантовка вокруг мазка кистью
    this.sourceImg = null;
    this.onTileDoubleClick = null; // хук из main.js — переключить на вкладку символов

    this._strokeTouched = null; // Map<tileIdx, Uint8Array before>
    this._batchUndo = [];
    this._batchRedo = [];

    canvas.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    canvas.addEventListener("pointermove", (e) => this._onPointerMove(e));
    window.addEventListener("pointerup", () => {
      this.isPainting = false;
      this._finishStroke();
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("dblclick", (e) => this._onDoubleClick(e));

    thresholdInput.addEventListener("input", () => {
      if (this.sourceImg) this._applyImage();
    });
    fileInput.addEventListener("change", () => {
      const file = fileInput.files[0];
      if (file) this._loadFile(file);
      fileInput.value = "";
    });
    fileBtn.addEventListener("click", () => fileInput.click());

    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("drag");
    });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag"));
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("drag");
      const file = e.dataTransfer.files?.[0];
      if (file) this._loadFile(file);
    });

    state.on("project:loaded", () => this.resize());
    state.on("char:changed", ({ index }) => {
      const start = logoStartIndex(state.charCount);
      if (index === -1 || (index >= start && index < start + LOGO_TILE_COUNT)) this.render();
    });
  }

  // -------------------------------------------------------------------------
  // Геометрия: totalW x totalH — вся композиция логотипа в пикселях
  // -------------------------------------------------------------------------
  get totalW() {
    return LOGO_TILES_H * state.charW;
  }
  get totalH() {
    return LOGO_TILES_V * state.charH;
  }

  resize() {
    // Подбираем масштаб так, чтобы композиция была ~1100px по ширине —
    // комфортно для SD (12px символы) и для HD (24px символы) одинаково.
    this.cell = Math.max(1, Math.min(8, Math.round(1100 / this.totalW)));
    this._applyCanvasSize();
    this.render();
  }

  setZoom(cell) {
    this.cell = cell;
    this._applyCanvasSize();
    this.render();
  }

  _applyCanvasSize() {
    this.canvas.width = this.totalW * this.cell;
    this.canvas.height = this.totalH * this.cell;
  }

  // -------------------------------------------------------------------------
  // Доступ к пикселям сквозь границы тайлов
  // -------------------------------------------------------------------------
  _tileAt(x, y) {
    const charW = state.charW,
      charH = state.charH;
    const tx = Math.floor(x / charW),
      ty = Math.floor(y / charH);
    if (tx < 0 || tx >= LOGO_TILES_H || ty < 0 || ty >= LOGO_TILES_V) return null;
    const idx = logoStartIndex(state.charCount) + ty * LOGO_TILES_H + tx;
    return { idx, lx: x - tx * charW, ly: y - ty * charH };
  }

  _get(x, y) {
    const t2 = this._tileAt(x, y);
    if (!t2) return PX.TRANSPARENT;
    const arr = state.characters[t2.idx];
    if (!arr) return PX.TRANSPARENT;
    return arr[t2.ly * state.charW + t2.lx];
  }

  /** Пишет пиксель прямо в живой массив состояния (без немедленного undo — тот копится на весь мазок/операцию). */
  _setLive(x, y, value, touchedMap) {
    const t2 = this._tileAt(x, y);
    if (!t2) return;
    const arr = state.characters[t2.idx];
    if (!arr) return;
    if (touchedMap && !touchedMap.has(t2.idx)) touchedMap.set(t2.idx, arr.slice());
    arr[t2.ly * state.charW + t2.lx] = value;
  }

  // -------------------------------------------------------------------------
  // Батч-undo/redo — одна кисть/операция = один шаг, даже если задела
  // несколько символов сразу.
  // -------------------------------------------------------------------------
  _pushBatch(indices) {
    if (!indices.length) return;
    this._batchUndo.push(indices);
    if (this._batchUndo.length > 30) this._batchUndo.shift();
    this._batchRedo.length = 0;
  }

  undo() {
    if (!this._batchUndo.length) return false;
    const batch = this._batchUndo.pop();
    for (const idx of batch) state.undo(idx);
    this._batchRedo.push(batch);
    return true;
  }

  redo() {
    if (!this._batchRedo.length) return false;
    const batch = this._batchRedo.pop();
    for (const idx of batch) state.redo(idx);
    this._batchUndo.push(batch);
    return true;
  }

  // -------------------------------------------------------------------------
  // Ввод указателя
  // -------------------------------------------------------------------------
  _coordsFromEvent(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = Math.floor(((e.clientX - rect.left) * scaleX) / this.cell);
    const y = Math.floor(((e.clientY - rect.top) * scaleY) / this.cell);
    return { x, y };
  }

  _onPointerDown(e) {
    const { x, y } = this._coordsFromEvent(e);
    if (x < 0 || y < 0 || x >= this.totalW || y >= this.totalH) return;

    if (this.tool === "eyedrop") {
      this.color = this._get(x, y);
      this.canvas.dispatchEvent(new CustomEvent("colorpicked", { detail: this.color }));
      return;
    }

    if (this.tool === "fill") {
      this._bucketFill(x, y, e.button === 2 ? PX.TRANSPARENT : this.color);
      return;
    }

    this.isPainting = true;
    this._strokeTouched = new Map();
    const isErase = e.button === 2;
    const color = isErase ? PX.TRANSPARENT : this.color;
    const cells = this._brushCells(x, y);
    for (const [nx, ny] of cells) this._setLive(nx, ny, color, this._strokeTouched);
    if (!isErase && this.outline?.enabled) {
      for (const [nx, ny] of cells) this._stampOutline(nx, ny, this._strokeTouched);
    }
    this.render();
  }

  _onPointerMove(e) {
    if (!this.isPainting || this.tool !== "pen") return;
    const { x, y } = this._coordsFromEvent(e);
    if (x < 0 || y < 0 || x >= this.totalW || y >= this.totalH) return;
    const isErase = e.buttons === 2;
    const color = isErase ? PX.TRANSPARENT : this.color;
    const cells = this._brushCells(x, y);
    for (const [nx, ny] of cells) this._setLive(nx, ny, color, this._strokeTouched);
    if (!isErase && this.outline?.enabled) {
      for (const [nx, ny] of cells) this._stampOutline(nx, ny, this._strokeTouched);
    }
    this.render();
  }

  /** Клетки квадратной кисти размером brushSize вокруг (cx,cy) в координатах всей композиции. */
  _brushCells(cx, cy) {
    const size = Math.max(1, this.brushSize | 0 || 1);
    const half = Math.floor((size - 1) / 2);
    const cells = [];
    for (let oy = 0; oy < size; oy++) {
      for (let ox = 0; ox < size; ox++) {
        const nx = cx - half + ox,
          ny = cy - half + oy;
        if (nx >= 0 && ny >= 0 && nx < this.totalW && ny < this.totalH) cells.push([nx, ny]);
      }
    }
    return cells;
  }

  /** Закрашивает прозрачные клетки вокруг (cx,cy) (в глобальных координатах композиции) цветом окантовки. */
  _stampOutline(cx, cy, touchedMap) {
    const { color, width } = this.outline;
    for (let oy = -width; oy <= width; oy++) {
      for (let ox = -width; ox <= width; ox++) {
        if (ox === 0 && oy === 0) continue;
        const nx = cx + ox,
          ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= this.totalW || ny >= this.totalH) continue;
        if (this._get(nx, ny) === PX.TRANSPARENT) this._setLive(nx, ny, color, touchedMap);
      }
    }
  }

  _finishStroke() {
    if (!this._strokeTouched || this._strokeTouched.size === 0) {
      this._strokeTouched = null;
      return;
    }
    for (const [idx, before] of this._strokeTouched) state.commitStroke(idx, before);
    this._pushBatch([...this._strokeTouched.keys()]);
    this._strokeTouched = null;
  }

  _bucketFill(sx, sy, color) {
    const target = this._get(sx, sy);
    if (target === color) return;
    const w = this.totalW,
      h = this.totalH;
    const seen = new Uint8Array(w * h);
    const touched = new Map();
    const stack = [[sx, sy]];
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const si = y * w + x;
      if (seen[si]) continue;
      seen[si] = 1;
      if (this._get(x, y) !== target) continue;
      this._setLive(x, y, color, touched);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    for (const [idx, before] of touched) state.commitStroke(idx, before);
    this._pushBatch([...touched.keys()]);
    this.render();
  }

  _onDoubleClick(e) {
    const { x, y } = this._coordsFromEvent(e);
    const t2 = this._tileAt(x, y);
    if (!t2) return;
    state.select(t2.idx);
    this.onTileDoubleClick?.(t2.idx);
  }

  // -------------------------------------------------------------------------
  // Операции над всей композицией (используют обычный state.setChar —
  // каждая правит свои тайлы через стандартный per-char undo, а батч сверху
  // группирует их в один логический шаг для наших undo()/redo()).
  // -------------------------------------------------------------------------
  _readFullGrid() {
    const w = this.totalW,
      h = this.totalH;
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = this._get(x, y);
    return out;
  }

  _writeFullGrid(grid) {
    const charW = state.charW,
      charH = state.charH;
    const start = logoStartIndex(state.charCount);
    const touched = [];
    for (let i = 0; i < LOGO_TILE_COUNT; i++) {
      const tx = i % LOGO_TILES_H,
        ty = Math.floor(i / LOGO_TILES_H);
      const next = new Uint8Array(charW * charH);
      for (let y = 0; y < charH; y++) {
        for (let x = 0; x < charW; x++) {
          next[y * charW + x] = grid[(ty * charH + y) * this.totalW + (tx * charW + x)];
        }
      }
      state.setChar(start + i, next);
      touched.push(start + i);
    }
    this._pushBatch(touched);
  }

  mirrorHorizontal() {
    const w = this.totalW,
      h = this.totalH;
    const src = this._readFullGrid();
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = src[y * w + (w - 1 - x)];
    this._writeFullGrid(out);
  }

  mirrorVertical() {
    const w = this.totalW,
      h = this.totalH;
    const src = this._readFullGrid();
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = src[(h - 1 - y) * w + x];
    this._writeFullGrid(out);
  }

  invert() {
    const src = this._readFullGrid();
    const out = src.map((v) => (v === PX.BLACK ? PX.WHITE : v === PX.WHITE ? PX.BLACK : PX.TRANSPARENT));
    this._writeFullGrid(out);
  }

  shift(dx, dy) {
    const w = this.totalW,
      h = this.totalH;
    const src = this._readFullGrid();
    const out = new Uint8Array(w * h).fill(PX.TRANSPARENT);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = x + dx,
          ny = y + dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) out[ny * w + nx] = src[y * w + x];
      }
    }
    this._writeFullGrid(out);
  }

  clear() {
    this._writeFullGrid(new Uint8Array(this.totalW * this.totalH).fill(PX.TRANSPARENT));
    this.sourceImg = null;
    return true;
  }

  // -------------------------------------------------------------------------
  // Импорт картинки (cover-fit кроп по центру → авто-разбивка на символы)
  // -------------------------------------------------------------------------
  async _loadFile(file) {
    try {
      this.sourceImg = await loadImageFromFile(file);
      this._applyImage();
    } catch (err) {
      console.error(err);
      // window.alert() бывает тихо заблокирован в песочнице артефакта (iframe) —
      // вместо него используем свой диалог, переданный из main.js.
      if (this.showAlert) this.showAlert(t("error.importAlert", { msg: err.message }));
    }
  }

  _applyImage() {
    const targetW = this.totalW,
      targetH = this.totalH;
    const src = this.sourceImg;

    const srcRatio = src.width / src.height;
    const dstRatio = targetW / targetH;
    let sx, sy, sw, sh;
    if (srcRatio > dstRatio) {
      sh = src.height;
      sw = sh * dstRatio;
      sx = (src.width - sw) / 2;
      sy = 0;
    } else {
      sw = src.width;
      sh = sw / dstRatio;
      sx = 0;
      sy = (src.height - sh) / 2;
    }

    const tmp = document.createElement("canvas");
    tmp.width = targetW;
    tmp.height = targetH;
    const tctx = tmp.getContext("2d", { willReadFrequently: true });
    tctx.drawImage(src, sx, sy, sw, sh, 0, 0, targetW, targetH);
    const { data } = tctx.getImageData(0, 0, targetW, targetH);

    const threshold = Number(this.thresholdInput.value);
    const grid = new Uint8Array(targetW * targetH);
    for (let y = 0; y < targetH; y++) {
      for (let x = 0; x < targetW; x++) {
        const si = (y * targetW + x) * 4;
        const a = data[si + 3];
        if (a < 128) {
          grid[y * targetW + x] = PX.TRANSPARENT;
        } else {
          const lum = (data[si] + data[si + 1] + data[si + 2]) / 3;
          grid[y * targetW + x] = lum > threshold ? PX.WHITE : PX.BLACK;
        }
      }
    }
    this._writeFullGrid(grid);
  }

  // -------------------------------------------------------------------------
  // Рендер
  // -------------------------------------------------------------------------
  render() {
    const { ctx, canvas, cell } = this;
    const charW = state.charW,
      charH = state.charH;
    const start = logoStartIndex(state.charCount);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let any = false;
    for (let ty = 0; ty < LOGO_TILES_V; ty++) {
      for (let tx = 0; tx < LOGO_TILES_H; tx++) {
        const idx = start + ty * LOGO_TILES_H + tx;
        const data = state.characters[idx];
        if (!data) continue;
        for (let y = 0; y < charH; y++) {
          for (let x = 0; x < charW; x++) {
            const v = data[y * charW + x];
            if (v === PX.TRANSPARENT) {
              ctx.fillStyle = (x + y + tx + ty) % 2 === 0 ? CHECKER_A : CHECKER_B;
            } else {
              any = true;
              ctx.fillStyle = v === PX.BLACK ? "#0a0a0c" : "#f5f5f0";
            }
            ctx.fillRect((tx * charW + x) * cell, (ty * charH + y) * cell, cell, cell);
          }
        }
      }
    }

    if (this.showGrid && cell >= 8) {
      ctx.strokeStyle = GRID_LINE;
      ctx.lineWidth = 1;
      for (let x = 0; x <= this.totalW; x++) {
        if (x % charW === 0) continue; // тайловые линии рисуем отдельно, толще
        ctx.beginPath();
        ctx.moveTo(x * cell + 0.5, 0);
        ctx.lineTo(x * cell + 0.5, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y <= this.totalH; y++) {
        if (y % charH === 0) continue;
        ctx.beginPath();
        ctx.moveTo(0, y * cell + 0.5);
        ctx.lineTo(canvas.width, y * cell + 0.5);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = TILE_LINE;
    ctx.lineWidth = 1;
    for (let tx = 0; tx <= LOGO_TILES_H; tx++) {
      ctx.beginPath();
      ctx.moveTo(tx * charW * cell + 0.5, 0);
      ctx.lineTo(tx * charW * cell + 0.5, canvas.height);
      ctx.stroke();
    }
    for (let ty = 0; ty <= LOGO_TILES_V; ty++) {
      ctx.beginPath();
      ctx.moveTo(0, ty * charH * cell + 0.5);
      ctx.lineTo(canvas.width, ty * charH * cell + 0.5);
      ctx.stroke();
    }

    this.hintEl.classList.toggle("hidden", any);
  }
}
