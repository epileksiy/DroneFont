import { PX } from "./constants.js";
import { state } from "./state.js";

/**
 * Обзорный лист всех символов шрифта — миниатюры в сетке,
 * клик выбирает символ для редактирования.
 */
export class CharSheet {
  constructor(container) {
    this.container = container;
    this.cols = 16;
    this.thumb = 22; // размер миниатюры в px (плюс паддинг)
    this.pad = 3;

    this.base = document.createElement("canvas");
    this.base.className = "sheet-layer sheet-base";
    this.overlay = document.createElement("canvas");
    this.overlay.className = "sheet-layer sheet-overlay";
    container.style.position = "relative";
    container.appendChild(this.base);
    container.appendChild(this.overlay);

    this.overlay.addEventListener("click", (e) => this._onClick(e));
    this.overlay.addEventListener("mousemove", (e) => this._onHover(e));
    this.overlay.addEventListener("mouseleave", () => this._setHoverLabel(null));

    state.on("project:loaded", () => this.fullRender());
    state.on("char:changed", ({ index }) => {
      if (index === -1) this.fullRender();
      else this._renderOne(index);
    });
    state.on("select:changed", () => this.renderOverlay());
  }

  _tileSize() {
    return this.thumb + this.pad;
  }

  fullRender() {
    const { charCount, charW, charH } = state;
    const cols = this.cols;
    const rows = Math.ceil(charCount / cols);
    const tile = this._tileSize();
    const w = cols * tile;
    const h = rows * tile;
    this.base.width = w;
    this.base.height = h;
    this.overlay.width = w;
    this.overlay.height = h;
    this.base.style.width = this.overlay.style.width = w + "px";
    this.base.style.height = this.overlay.style.height = h + "px";

    const ctx = this.base.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < charCount; i++) this._drawThumb(ctx, i, charW, charH);
    this.renderOverlay();
  }

  _renderOne(index) {
    const ctx = this.base.getContext("2d");
    this._drawThumb(ctx, index, state.charW, state.charH);
  }

  _drawThumb(ctx, index, charW, charH) {
    const tile = this._tileSize();
    const col = index % this.cols;
    const row = Math.floor(index / this.cols);
    const ox = col * tile + this.pad / 2;
    const oy = row * tile + this.pad / 2;

    ctx.fillStyle = "#1c1c20";
    ctx.fillRect(col * tile, row * tile, tile, tile);

    const data = state.getChar(index);
    const scale = this.thumb / Math.max(charW, charH);
    const dx = scale * charW;
    const dy = scale * charH;
    const offX = ox + (this.thumb - dx) / 2;
    const offY = oy + (this.thumb - dy) / 2;

    for (let y = 0; y < charH; y++) {
      for (let x = 0; x < charW; x++) {
        const v = data[y * charW + x];
        if (v === PX.TRANSPARENT) continue;
        ctx.fillStyle = v === PX.BLACK ? "#0a0a0c" : "#f5f5f0";
        ctx.fillRect(offX + x * scale, offY + y * scale, Math.ceil(scale), Math.ceil(scale));
      }
    }
  }

  renderOverlay() {
    const ctx = this.overlay.getContext("2d");
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    const tile = this._tileSize();
    const col = state.selectedIndex % this.cols;
    const row = Math.floor(state.selectedIndex / this.cols);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#ff8a34";
    ctx.lineWidth = 2;
    ctx.strokeRect(col * tile + 1, row * tile + 1, tile - 2, tile - 2);
  }

  _indexFromEvent(e) {
    const rect = this.overlay.getBoundingClientRect();
    const tile = this._tileSize();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const col = Math.floor(x / tile);
    const row = Math.floor(y / tile);
    return row * this.cols + col;
  }

  _onClick(e) {
    const idx = this._indexFromEvent(e);
    if (idx >= 0 && idx < state.charCount) state.select(idx);
  }

  _onHover(e) {
    const idx = this._indexFromEvent(e);
    if (idx >= 0 && idx < state.charCount) this._setHoverLabel(idx);
    else this._setHoverLabel(null);
  }

  _setHoverLabel(idx) {
    if (this.onHover) this.onHover(idx);
  }
}
