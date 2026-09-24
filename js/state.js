import { MODES, PX } from "./constants.js";

/**
 * Простая шина событий, чтобы разные части UI могли реагировать
 * на изменения состояния без жёсткой связки друг с другом.
 */
class Emitter {
  constructor() {
    this._handlers = new Map();
  }
  on(event, fn) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(fn);
    return () => this._handlers.get(event)?.delete(fn);
  }
  emit(event, payload) {
    this._handlers.get(event)?.forEach((fn) => fn(payload));
  }
}

function makeEmptyChar(w, h) {
  return new Uint8Array(w * h).fill(PX.TRANSPARENT);
}

/**
 * Центральное хранилище состояния приложения:
 * - режим (SD/HD), размеры символа, количество символов
 * - сами символы (массив Uint8Array)
 * - текущий выбранный символ
 * - undo/redo стек на активный символ
 */
export class AppState extends Emitter {
  constructor() {
    super();
    this.modeId = "SD";
    this.charCount = MODES.SD.defaultCount;
    this.charW = MODES.SD.charW;
    this.charH = MODES.SD.charH;
    this.projectName = "Мой OSD-шрифт";
    this.characters = this._buildEmptyCharacters();
    this.selectedIndex = 0;
    this.dirty = false;

    this._undoStacks = new Map(); // idx -> {undo:[], redo:[]}
  }

  get mode() {
    return MODES[this.modeId];
  }

  _buildEmptyCharacters() {
    const arr = new Array(this.charCount);
    for (let i = 0; i < this.charCount; i++) arr[i] = makeEmptyChar(this.charW, this.charH);
    return arr;
  }

  /** Полная замена проекта (импорт файла или новый проект). */
  loadProject({ modeId, charCount, charW, charH, characters, projectName }) {
    this.modeId = modeId;
    this.charCount = charCount;
    this.charW = charW;
    this.charH = charH;
    this.characters = characters;
    if (projectName) this.projectName = projectName;
    this.selectedIndex = 0;
    this.dirty = false;
    this._undoStacks.clear();
    this.emit("project:loaded");
    this.emit("char:changed", { index: -1 }); // -1 = все символы
  }

  /** Смена режима (SD/HD) с пересозданием пустого набора символов. */
  setMode(modeId, charCount) {
    const m = MODES[modeId];
    this.charCount = charCount ?? m.defaultCount;
    this.charW = m.charW;
    this.charH = m.charH;
    this.loadProject({
      modeId,
      charCount: this.charCount,
      charW: this.charW,
      charH: this.charH,
      characters: this._buildEmptyCharacters(),
    });
  }

  select(index) {
    if (index < 0 || index >= this.charCount) return;
    this.selectedIndex = index;
    this.emit("select:changed", { index });
  }

  getChar(index) {
    return this.characters[index];
  }

  /** Записать новую сетку пикселей для символа, с записью в undo. */
  setChar(index, newData, { pushUndo = true } = {}) {
    const old = this.characters[index];
    if (pushUndo) this._pushUndo(index, old);
    this.characters[index] = newData;
    this.dirty = true;
    this.emit("char:changed", { index });
  }

  /**
   * Зафиксировать в undo-истории состояние "до" правки, когда сама правка
   * уже была применена напрямую к массиву (например, при рисовании мышью
   * кадр за кадром — чтобы не плодить undo-шаги на каждый пиксель мазка).
   */
  commitStroke(index, beforeSnapshot) {
    this._pushUndo(index, beforeSnapshot);
    this.dirty = true;
    this.emit("char:changed", { index });
  }

  _pushUndo(index, snapshot) {
    if (!this._undoStacks.has(index)) this._undoStacks.set(index, { undo: [], redo: [] });
    const st = this._undoStacks.get(index);
    st.undo.push(snapshot.slice());
    if (st.undo.length > 50) st.undo.shift();
    st.redo.length = 0;
  }

  undo(index) {
    const st = this._undoStacks.get(index);
    if (!st || st.undo.length === 0) return false;
    const prev = st.undo.pop();
    st.redo.push(this.characters[index].slice());
    this.characters[index] = prev;
    this.dirty = true;
    this.emit("char:changed", { index });
    return true;
  }

  redo(index) {
    const st = this._undoStacks.get(index);
    if (!st || st.redo.length === 0) return false;
    const next = st.redo.pop();
    st.undo.push(this.characters[index].slice());
    this.characters[index] = next;
    this.dirty = true;
    this.emit("char:changed", { index });
    return true;
  }

  clearChar(index) {
    this.setChar(index, makeEmptyChar(this.charW, this.charH));
  }
}

export const state = new AppState();
