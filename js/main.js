import { MODES, PX, LOGO_TILES_H, LOGO_TILES_V, LOGO_TILE_COUNT, logoStartIndex } from "./constants.js";
import { state } from "./state.js";
import { CharEditor } from "./editor.js";
import { CharSheet } from "./sheet.js";
import { LogoEditor } from "./logo.js";
import { parseMCM, buildMCM } from "./formats/mcm.js";
import { parseHDBMP, buildHDBMP } from "./formats/hdbmp.js";
import { buildPNGSheet, parsePNGSheet } from "./formats/png.js";
import { buildProjectJSON, parseProjectJSON } from "./formats/project.js";
import { t, setLang, applyStaticI18n } from "./i18n.js";

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);

const editorCanvas = $("#editorCanvas");
const sheetWrap = $("#sheetWrap");
const statusMsg = $("#statusMsg");
const dirtyIndicator = $("#dirtyIndicator");
const charIndexLabel = $("#charIndexLabel");
const charDimLabel = $("#charDimLabel");
const hoverInfo = $("#hoverInfo");
const jumpInput = $("#jumpInput");
const jumpHex = $("#jumpHex");
const projectNameInput = $("#projectName");
const zoomLabel = $("#zoomLabel");
const fileInput = $("#fileInput");

const viewChars = $("#viewChars");
const viewLogo = $("#viewLogo");
const btnLogoTab = $("#btnLogoTab");

const logoRangeLabel = $("#logoRangeLabel");

applyStaticI18n();

// ---------------------------------------------------------------------------
// Свой диалог подтверждения/сообщения вместо window.confirm()/alert().
// Артефакт рендерится внутри песочницы (iframe), где браузер может тихо
// блокировать нативные модальные диалоги (confirm/alert возвращают false
// без единого визуального намёка) — из-за этого, например, кнопка "Очистить
// символ" выглядела так, будто вообще ничего не делает.
// ---------------------------------------------------------------------------
const dialogOverlay = $("#dialogOverlay");
const dialogBox = dialogOverlay.querySelector(".dialog-box");
const dialogMessage = $("#dialogMessage");
const dialogOk = $("#dialogOk");
const dialogCancel = $("#dialogCancel");

function showDialog(message, { alertOnly = false } = {}) {
  return new Promise((resolve) => {
    dialogMessage.textContent = message;
    dialogBox.classList.toggle("alert-only", alertOnly);
    dialogOverlay.hidden = false;
    const cleanup = () => {
      dialogOverlay.hidden = true;
      dialogOk.removeEventListener("click", onOk);
      dialogCancel.removeEventListener("click", onCancel);
      dialogOverlay.removeEventListener("click", onOverlay);
    };
    const onOk = () => {
      cleanup();
      resolve(true);
    };
    const onCancel = () => {
      cleanup();
      resolve(false);
    };
    const onOverlay = (e) => {
      if (e.target === dialogOverlay) onCancel();
    };
    dialogOk.addEventListener("click", onOk);
    dialogCancel.addEventListener("click", onCancel);
    dialogOverlay.addEventListener("click", onOverlay);
  });
}
const showConfirm = (message) => showDialog(message, { alertOnly: false });
const showAlert = (message) => showDialog(message, { alertOnly: true });

const editor = new CharEditor(editorCanvas);
const sheet = new CharSheet(sheetWrap);
const logoEditor = new LogoEditor({
  canvas: $("#logoPreview"),
  thresholdInput: $("#logoThreshold"),
  dropZone: $("#logoDrop"),
  hintEl: $("#logoDropHint"),
  fileInput: $("#logoFileInput"),
  fileBtn: $("#btnLogoFile"),
});

function setStatus(text, isError = false) {
  statusMsg.textContent = text;
  statusMsg.style.color = isError ? "var(--danger)" : "var(--text-2)";
}

function hex2(n) {
  return "0x" + n.toString(16).toUpperCase().padStart(2, "0");
}

// ---------------------------------------------------------------------------
// Вкладки: редактор символов ↔ стартовый логотип. Общая панель инструментов
// работает с тем редактором, чья вкладка активна сейчас.
// ---------------------------------------------------------------------------
let activeTab = "chars";
function activeEditor() {
  return activeTab === "logo" ? logoEditor : editor;
}
function setTab(tab) {
  activeTab = tab;
  viewChars.hidden = tab !== "chars";
  viewLogo.hidden = tab !== "logo";
  btnLogoTab.classList.toggle("active", tab === "logo");
  btnLogoTab.textContent = tab === "logo" ? t("nav.logoTabBack") : t("nav.logoTab");
  zoomLabel.textContent = activeEditor().cell + "px";
}
btnLogoTab.addEventListener("click", () => setTab(activeTab === "logo" ? "chars" : "logo"));
logoEditor.onTileDoubleClick = () => setTab("chars");
logoEditor.showAlert = showAlert;

// ---------------------------------------------------------------------------
// Инициализация вида под текущее состояние
// ---------------------------------------------------------------------------
const modeToggle = $("#modeToggle");
const modeLabelSD = $("#modeLabelSD");
const modeLabelHD = $("#modeLabelHD");

function refreshChrome() {
  editor.resize();
  logoEditor.resize();
  charDimLabel.textContent = t("dimLabel", { w: state.charW, h: state.charH, count: state.charCount });
  charIndexLabel.textContent = t("charLabel", { n: state.selectedIndex });
  jumpInput.max = state.charCount - 1;
  jumpInput.value = state.selectedIndex;
  jumpHex.textContent = hex2(state.selectedIndex);
  projectNameInput.value = state.projectName;
  zoomLabel.textContent = activeEditor().cell + "px";

  const isHD = state.modeId === "HD";
  modeToggle.setAttribute("aria-checked", String(isHD));
  modeLabelSD.classList.toggle("active", !isHD);
  modeLabelHD.classList.toggle("active", isHD);

  const logoStart = logoStartIndex(state.charCount);
  logoRangeLabel.textContent = t("logoRangeLabel", {
    start: logoStart,
    end: state.charCount - 1,
    cols: LOGO_TILES_H,
    rows: LOGO_TILES_V,
  });
}

state.on("project:loaded", refreshChrome);
state.on("select:changed", () => {
  charIndexLabel.textContent = t("charLabel", { n: state.selectedIndex });
  jumpInput.value = state.selectedIndex;
  jumpHex.textContent = hex2(state.selectedIndex);
});
state.on("char:changed", () => {
  dirtyIndicator.textContent = state.dirty ? t("status.unsaved") : "";
});

sheet.onHover = (idx) => {
  hoverInfo.textContent = idx == null ? t("sidebar.hoverDefault") : t("hoverLabel", { n: idx, hex: hex2(idx) });
};

// ---------------------------------------------------------------------------
// Стоковый шаблон Betaflight — единая точка загрузки для старта, смены
// режима и кнопки "Новый". Так проект никогда не остаётся пустым: люди
// редко приносят свой шрифт с нуля, удобнее сразу иметь с чем работать.
// ---------------------------------------------------------------------------
let cachedSdTemplate = null; // {charW,charH,charCount,characters}

async function fetchSdTemplate() {
  if (cachedSdTemplate) return cachedSdTemplate;
  const res = await fetch("assets/fonts/betaflight-default.mcm");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  cachedSdTemplate = parseMCM(text);
  return cachedSdTemplate;
}

/** Апскейл 2x2 (nearest neighbour) — 12x18 SD-символ точно вписывается в 24x36 HD-клетку. */
function upscale2x(src, w, h) {
  const out = new Uint8Array(w * 2 * h * 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = src[y * w + x];
      const ox = x * 2,
        oy = y * 2;
      out[oy * (w * 2) + ox] = v;
      out[oy * (w * 2) + ox + 1] = v;
      out[(oy + 1) * (w * 2) + ox] = v;
      out[(oy + 1) * (w * 2) + ox + 1] = v;
    }
  }
  return out;
}

/**
 * Значение ОДНОГО символа из дефолтного (стокового) шаблона для данного
 * режима — общая логика для полной загрузки шаблона и для кнопки
 * "восстановить из стока" (возврат одного символа к исходному виду).
 *
 * Важно: блок логотипа в SD-шрифте лежит не с индекса 0, а в ХВОСТЕ
 * набора (logoStartIndex(sd.charCount)..sd.charCount-1). При простом
 * копировании "тот же индекс i" в HD-набор (в 2 раза больше по счёту)
 * логотип попадал бы в диапазон, которого в SD просто нет (>= sd.charCount),
 * и превращался в пустоту. Поэтому для последних 96 символов HD (его
 * собственный блок логотипа) берём соответствующие 96 символов из
 * хвоста SD-набора, а не тот же абсолютный индекс.
 */
function defaultCharFor(sd, modeId, index) {
  if (modeId === "SD") {
    return index < sd.charCount ? sd.characters[index].slice() : new Uint8Array(sd.charW * sd.charH).fill(PX.TRANSPARENT);
  }
  const hd = MODES.HD;
  const sdLogoStart = logoStartIndex(sd.charCount);
  const hdLogoStart = logoStartIndex(hd.defaultCount);
  let srcIdx = null;
  if (index < sdLogoStart) {
    srcIdx = index; // обычные символы шрифта — индексы совпадают в обоих форматах
  } else if (index >= hdLogoStart) {
    srcIdx = sdLogoStart + (index - hdLogoStart); // блок логотипа — по смещению внутри блока (0..95)
  }
  return srcIdx !== null && srcIdx < sd.charCount
    ? upscale2x(sd.characters[srcIdx], sd.charW, sd.charH)
    : new Uint8Array(hd.charW * hd.charH).fill(PX.TRANSPARENT);
}

async function loadDefaultTemplate(modeId) {
  const sd = await fetchSdTemplate();
  if (modeId === "SD") {
    state.loadProject({
      modeId: "SD",
      charCount: sd.charCount,
      charW: sd.charW,
      charH: sd.charH,
      characters: sd.characters.map((c) => c.slice()),
      projectName: "Betaflight Default",
    });
    return;
  }
  const hd = MODES.HD;
  const characters = new Array(hd.defaultCount);
  for (let i = 0; i < hd.defaultCount; i++) characters[i] = defaultCharFor(sd, "HD", i);
  state.loadProject({
    modeId: "HD",
    charCount: hd.defaultCount,
    charW: hd.charW,
    charH: hd.charH,
    characters,
    projectName: "Betaflight Default (HD ×2)",
  });
}

refreshChrome();

(async function initialLoad() {
  try {
    await loadDefaultTemplate("SD");
    setStatus(t("status.stockLoaded"));
  } catch (err) {
    console.warn("Не удалось загрузить стоковый шрифт:", err);
    setStatus(t("status.stockMissing"));
  }
})();

// ---------------------------------------------------------------------------
// Переключение режима SD/HD (iOS-тумблер) — теперь всегда подгружает
// дефолтный шаблон под новый режим, а не пустой проект.
// ---------------------------------------------------------------------------
async function switchMode(modeId) {
  if (modeId === state.modeId) return;
  if (state.dirty && !(await showConfirm(t("confirm.modeSwitch")))) return;
  try {
    await loadDefaultTemplate(modeId);
    setStatus(t("status.modeSwitched", { mode: MODES[modeId].label }));
  } catch (err) {
    console.error(err);
    setStatus(t("error.import", { msg: err.message }), true);
  }
}
modeToggle.addEventListener("click", () => switchMode(state.modeId === "SD" ? "HD" : "SD"));
modeLabelSD.addEventListener("click", () => switchMode("SD"));
modeLabelHD.addEventListener("click", () => switchMode("HD"));

// ---------------------------------------------------------------------------
// Языковой переключатель (флаги RU / EN)
// ---------------------------------------------------------------------------
const langCurrentFlag = $("#langCurrentFlag");
const langAltOpt = $("#langAltOpt");
const langAltFlag = $("#langAltFlag");
const FLAG_CLASS = { ru: "flag-ru", en: "flag-gb" };
const OTHER_LANG = { ru: "en", en: "ru" };

// В выпадающем списке всегда ровно один вариант — противоположный текущему,
// поэтому кнопка в меню одна: её язык и флаг просто переставляются заново.
function applyLang(lang) {
  setLang(lang);
  langCurrentFlag.classList.remove("flag-ru", "flag-gb");
  langCurrentFlag.classList.add(FLAG_CLASS[lang]);
  const other = OTHER_LANG[lang];
  langAltOpt.dataset.lang = other;
  langAltOpt.setAttribute("aria-label", other === "ru" ? "Русский" : "English");
  langAltFlag.classList.remove("flag-ru", "flag-gb");
  langAltFlag.classList.add(FLAG_CLASS[other]);
  btnLogoTab.textContent = activeTab === "logo" ? t("nav.logoTabBack") : t("nav.logoTab");
  refreshChrome();
}
langAltOpt.addEventListener("click", () => applyLang(langAltOpt.dataset.lang));

// ---------------------------------------------------------------------------
// Новый проект — тоже восстанавливает стоковый шаблон текущего режима,
// а не оставляет пустой холст.
// ---------------------------------------------------------------------------
$("#btnNew").addEventListener("click", async () => {
  if (state.dirty && !(await showConfirm(t("confirm.newProject")))) return;
  try {
    await loadDefaultTemplate(state.modeId);
    setStatus(t("status.newProject"));
  } catch (err) {
    console.error(err);
    setStatus(t("error.import", { msg: err.message }), true);
  }
});

// ---------------------------------------------------------------------------
// Общая панель инструментов — работает с активным редактором (символ или
// логотип целиком), не зная какой из них сейчас на экране.
// ---------------------------------------------------------------------------
document.querySelectorAll("#toolGroup .tool-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#toolGroup .tool-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    editor.tool = btn.dataset.tool;
    logoEditor.tool = btn.dataset.tool;
  });
});

document.querySelectorAll(".swatch").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".swatch").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const color = Number(btn.dataset.color);
    editor.color = color;
    logoEditor.color = color;
  });
});

// ---------------------------------------------------------------------------
// Толщина кисти — квадратный мазок N×N логических пикселей вокруг курсора,
// общий для редактора символа и редактора логотипа. Кнопки +/- в тон
// регулировке зума.
// ---------------------------------------------------------------------------
const brushSizeLabel = $("#brushSizeLabel");
const BRUSH_MIN = 1;
const BRUSH_MAX = 8;
let brushSize = 1;
function applyBrushSize(size) {
  brushSize = Math.max(BRUSH_MIN, Math.min(BRUSH_MAX, size));
  editor.brushSize = brushSize;
  logoEditor.brushSize = brushSize;
  brushSizeLabel.textContent = brushSize + "px";
}
$("#btnBrushIn").addEventListener("click", () => applyBrushSize(brushSize + 1));
$("#btnBrushOut").addEventListener("click", () => applyBrushSize(brushSize - 1));
applyBrushSize(brushSize);

function syncColorSwatch(color) {
  document.querySelectorAll(".swatch").forEach((b) => b.classList.toggle("active", Number(b.dataset.color) === color));
}
editorCanvas.addEventListener("colorpicked", (e) => syncColorSwatch(e.detail));
$("#logoPreview").addEventListener("colorpicked", (e) => syncColorSwatch(e.detail));

// ---------------------------------------------------------------------------
// Окантовка при рисовании кистью — если включена, при каждом нарисованном
// пикселе кисти вокруг него на заданную толщину закрашиваются прозрачные
// клетки заданным цветом окантовки (не трогая уже непрозрачные пиксели).
// ---------------------------------------------------------------------------
const outlineGroup = $("#outlineGroup");
const btnOutlineToggle = $("#btnOutlineToggle");
const outlineColorSelect = $("#outlineColorSelect");
const outlineWidthInput = $("#outlineWidthInput");

function syncOutlineConfig() {
  const cfg = {
    enabled: btnOutlineToggle.classList.contains("active"),
    color: Number(outlineColorSelect.value),
    width: Math.max(1, Math.min(4, Number(outlineWidthInput.value) || 1)),
  };
  editor.outline = cfg;
  logoEditor.outline = cfg;
  outlineGroup.classList.toggle("disabled", !cfg.enabled);
}
btnOutlineToggle.addEventListener("click", () => {
  btnOutlineToggle.classList.toggle("active");
  syncOutlineConfig();
});
outlineColorSelect.addEventListener("change", syncOutlineConfig);
outlineWidthInput.addEventListener("input", syncOutlineConfig);
syncOutlineConfig();

$("#btnUndo").addEventListener("click", () => {
  if (!activeEditor().undo()) setStatus(t("status.noUndo"));
});
$("#btnRedo").addEventListener("click", () => {
  if (!activeEditor().redo()) setStatus(t("status.noRedo"));
});

$("#btnMirrorH").addEventListener("click", () => activeEditor().mirrorHorizontal());
$("#btnMirrorV").addEventListener("click", () => activeEditor().mirrorVertical());
$("#btnInvert").addEventListener("click", () => activeEditor().invert());
$("#btnClear").addEventListener("click", async () => {
  const msg = activeTab === "logo" ? t("logo.confirmClear") : t("confirm.clearChar", { n: state.selectedIndex });
  if (await showConfirm(msg)) activeEditor().clear();
});

// ---------------------------------------------------------------------------
// Восстановить из стокового шрифта — вместо удаления возвращает исходное
// содержимое: один символ на вкладке символов, весь блок логотипа (96
// тайлов, один шаг undo) на вкладке лого.
// ---------------------------------------------------------------------------
$("#btnRestoreStock").addEventListener("click", async () => {
  try {
    const sd = await fetchSdTemplate();
    if (activeTab === "logo") {
      const start = logoStartIndex(state.charCount);
      const touched = [];
      for (let i = 0; i < LOGO_TILE_COUNT; i++) {
        const idx = start + i;
        state.setChar(idx, defaultCharFor(sd, state.modeId, idx));
        touched.push(idx);
      }
      logoEditor._pushBatch(touched);
      setStatus(t("status.restoredStock"));
    } else {
      state.setChar(state.selectedIndex, defaultCharFor(sd, state.modeId, state.selectedIndex));
      setStatus(t("status.restoredStock"));
    }
  } catch (err) {
    console.error(err);
    setStatus(t("error.import", { msg: err.message }), true);
  }
});

$("#btnZoomIn").addEventListener("click", () => {
  const ed = activeEditor();
  const max = activeTab === "logo" ? 16 : 48;
  const step = activeTab === "logo" ? 1 : 4;
  ed.setZoom(Math.min(max, ed.cell + step));
  zoomLabel.textContent = ed.cell + "px";
});
$("#btnZoomOut").addEventListener("click", () => {
  const ed = activeEditor();
  const step = activeTab === "logo" ? 1 : 4;
  const min = activeTab === "logo" ? 1 : 8;
  ed.setZoom(Math.max(min, ed.cell - step));
  zoomLabel.textContent = ed.cell + "px";
});

// ---------------------------------------------------------------------------
// Навигация по символам
// ---------------------------------------------------------------------------
jumpInput.addEventListener("input", () => {
  const v = Number(jumpInput.value);
  if (Number.isFinite(v)) state.select(v);
});

projectNameInput.addEventListener("input", () => {
  state.projectName = projectNameInput.value;
  state.dirty = true;
});

// ---------------------------------------------------------------------------
// Горячие клавиши
// ---------------------------------------------------------------------------
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key.toLowerCase() === "z" && !e.shiftKey) {
    e.preventDefault();
    activeEditor().undo();
  } else if (ctrl && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
    e.preventDefault();
    activeEditor().redo();
  } else if (activeTab === "chars" && e.key === "ArrowRight") {
    state.select(Math.min(state.charCount - 1, state.selectedIndex + 1));
  } else if (activeTab === "chars" && e.key === "ArrowLeft") {
    state.select(Math.max(0, state.selectedIndex - 1));
  }
});

// ---------------------------------------------------------------------------
// Ползунок ширины панели с иконками (sidebar) — тянет вправо/влево,
// подвигая рабочую область рисования (workspace растёт/сжимается через
// flex: 1). Ширина сохраняется между сессиями в localStorage.
// ---------------------------------------------------------------------------
(function setupSidebarResizer() {
  const sidebar = $(".sidebar");
  const resizer = $("#sidebarResizer");
  const SIDEBAR_MIN = 220;
  const SIDEBAR_MAX = 640;
  const STORAGE_KEY = "osdFontEditor.sidebarWidth";

  function applyWidth(px) {
    const clamped = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, px));
    document.documentElement.style.setProperty("--sidebar-w", clamped + "px");
    return clamped;
  }

  const saved = Number(localStorage.getItem(STORAGE_KEY));
  if (Number.isFinite(saved) && saved > 0) applyWidth(saved);

  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener("pointerdown", (e) => {
    dragging = true;
    startX = e.clientX;
    startWidth = sidebar.getBoundingClientRect().width;
    resizer.classList.add("dragging");
    document.body.classList.add("sidebar-resizing");
    resizer.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  resizer.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    applyWidth(startWidth + (e.clientX - startX));
  });

  function stopDrag() {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove("dragging");
    document.body.classList.remove("sidebar-resizing");
    localStorage.setItem(STORAGE_KEY, sidebar.getBoundingClientRect().width.toFixed(0));
  }
  resizer.addEventListener("pointerup", stopDrag);
  resizer.addEventListener("pointercancel", stopDrag);
})();

// ---------------------------------------------------------------------------
// Меню импорт/экспорт/язык
// ---------------------------------------------------------------------------
function setupMenu(toggleId, menuId) {
  const toggle = $(toggleId);
  const menu = $(menuId);
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    document.querySelectorAll(".menu-list").forEach((m) => m !== menu && m.classList.remove("open"));
    menu.classList.toggle("open");
  });
}
setupMenu("#btnImportToggle", "#importMenu");
setupMenu("#btnExportToggle", "#exportMenu");
setupMenu("#langBtn", "#langMenu");
document.addEventListener("click", () => document.querySelectorAll(".menu-list").forEach((m) => m.classList.remove("open")));

// --- Экспорт ---
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

document.querySelectorAll("#exportMenu button").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const kind = btn.dataset.export;
    const base = (state.projectName || "font").trim().replace(/[^\wа-яА-ЯёЁ-]+/g, "_") || "font";
    try {
      if (kind === "mcm") {
        if (state.modeId !== "SD") return setStatus(t("error.sdOnlyExport"), true);
        const text = buildMCM(state.characters);
        downloadBlob(new Blob([text], { type: "text/plain" }), `${base}.mcm`);
      } else if (kind === "bmp") {
        if (state.modeId !== "HD") return setStatus(t("error.hdOnlyExport"), true);
        const bytes = buildHDBMP(state.characters, state.charW, state.charH);
        downloadBlob(new Blob([bytes], { type: "image/bmp" }), `${base}.bmp`);
      } else if (kind === "png") {
        const blob = await buildPNGSheet(state.characters, state.charW, state.charH);
        downloadBlob(blob, `${base}.png`);
      } else if (kind === "json") {
        const text = buildProjectJSON({
          projectName: state.projectName,
          modeId: state.modeId,
          charW: state.charW,
          charH: state.charH,
          characters: state.characters,
        });
        downloadBlob(new Blob([text], { type: "application/json" }), `${base}.osdproj.json`);
      }
      setStatus(t("status.exported", { name: `${base}.${kind === "json" ? "osdproj.json" : kind}` }));
      state.dirty = false;
      dirtyIndicator.textContent = "";
    } catch (err) {
      console.error(err);
      setStatus(t("error.export", { msg: err.message }), true);
    }
  });
});

// --- Импорт ---
let pendingImportKind = null;
document.querySelectorAll("#importMenu button").forEach((btn) => {
  btn.addEventListener("click", () => {
    pendingImportKind = btn.dataset.import;
    fileInput.accept = { mcm: ".mcm", bmp: ".bmp", png: ".png", json: ".json" }[pendingImportKind] || "";
    fileInput.value = "";
    fileInput.click();
  });
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;
  try {
    if (pendingImportKind === "mcm") {
      const text = await file.text();
      const parsed = parseMCM(text);
      state.loadProject({
        modeId: "SD",
        charCount: parsed.charCount,
        charW: parsed.charW,
        charH: parsed.charH,
        characters: parsed.characters,
        projectName: file.name.replace(/\.mcm$/i, ""),
      });
      setStatus(t("status.importedMcm", { count: parsed.charCount }));
    } else if (pendingImportKind === "bmp") {
      const parsed = await parseHDBMP(file);
      state.loadProject({
        modeId: "HD",
        charCount: parsed.charCount,
        charW: parsed.charW,
        charH: parsed.charH,
        characters: parsed.characters,
        projectName: file.name.replace(/\.bmp$/i, ""),
      });
      setStatus(t("status.importedBmp", { count: parsed.charCount, w: parsed.charW, h: parsed.charH }));
    } else if (pendingImportKind === "png") {
      const { charW, charH } = state; // используем текущие размеры символа под активный режим
      const parsed = await parsePNGSheet(file, charW, charH);
      state.loadProject({
        modeId: state.modeId,
        charCount: parsed.charCount,
        charW,
        charH,
        characters: parsed.characters,
        projectName: file.name.replace(/\.png$/i, ""),
      });
      setStatus(t("status.importedPng", { count: parsed.charCount }));
    } else if (pendingImportKind === "json") {
      const text = await file.text();
      const parsed = parseProjectJSON(text);
      state.loadProject(parsed);
      setStatus(t("status.importedJson", { name: parsed.projectName }));
    }
  } catch (err) {
    console.error(err);
    setStatus(t("error.import", { msg: err.message }), true);
    await showAlert(t("error.importAlert", { msg: err.message }));
  }
});
