// ---------------------------------------------------------------------------
// Простая локализация статической разметки (data-i18n атрибуты) плюс
// небольшой набор шаблонов для динамических подписей, которые генерирует
// main.js (счётчики символов, статусы). Полный перевод runtime-сообщений
// (например текстов ошибок импорта) не входит в эту первую версию —
// переведён весь видимый "хром" интерфейса и ключевые динамические подписи.
// ---------------------------------------------------------------------------

const DICT = {
  ru: {
    "nav.new": "Новый",
    "nav.import": "Импорт",
    "nav.export": "Экспорт",
    "nav.logoTab": "Лого",
    "nav.logoTabBack": "К символам",
    "dialog.ok": "ОК",
    "dialog.cancel": "Отмена",
    "import.mcm": ".mcm (SD MAX7456)",
    "import.bmp": ".bmp (HD лист)",
    "import.png": ".png (спрайт-лист)",
    "import.json": ".json (проект)",
    "export.mcm": ".mcm (SD MAX7456)",
    "export.bmp": ".bmp (HD лист)",
    "export.png": ".png (спрайт-лист)",
    "export.json": ".json (проект)",
    "sidebar.jumpLabel": "№",
    "sidebar.hoverDefault": "— наведите на символ —",
    "tool.pen": "Кисть",
    "tool.fill": "Заливка",
    "tool.eyedrop": "Пипетка",
    "tool.brushSizeOut": "Уменьшить толщину кисти",
    "tool.brushSizeIn": "Увеличить толщину кисти",
    "swatch.black": "Чёрный",
    "swatch.white": "Белый",
    "swatch.transparent": "Прозрачный",
    "tool.undo": "Отменить (Ctrl+Z)",
    "tool.redo": "Повторить (Ctrl+Y)",
    "tool.mirrorH": "Зеркало по горизонтали",
    "tool.mirrorV": "Зеркало по вертикали",
    "tool.invert": "Инвертировать чёрный/белый",
    "tool.clear": "Удалить символ целиком",
    "tool.restoreStock": "Восстановить из стокового шрифта",
    "tool.outline": "Окантовка при рисовании",
    "tool.outlineColor": "Цвет окантовки",
    "tool.outlineWidth": "Толщина окантовки, px",
    "tool.zoomOut": "Уменьшить",
    "tool.zoomIn": "Увеличить",
    "logo.title": "Стартовый логотип",
    "logo.threshold": "Порог",
    "logo.thresholdTitle": "Порог яркости чёрный/белый",
    "logo.upload": "Загрузить картинку",
    "logo.clear": "Очистить",
    "logo.hint": "Рисуйте прямо на логотипе тем же набором инструментов, что и для символов — сверху. Или перетащите картинку — она обрежется по центру и разложится по символам автоматически.",
    "logo.tileHint": "Двойной клик по тайлу открывает этот символ отдельно на вкладке символов.",
    "logo.dropTitle": "Рисуйте прямо здесь тем же набором инструментов сверху, или перетащите картинку",
    "logo.confirmClear": "Очистить область стартового логотипа (96 символов)?",
    "status.ready": "Готов к работе. Выберите символ на листе слева или импортируйте шрифт.",
    "status.stockLoaded": "Загружен стоковый шрифт Betaflight (default.mcm). Можно редактировать или начать заново.",
    "status.stockMissing": "Стоковый шрифт не найден — начат пустой проект.",
    "status.unsaved": "не сохранено",
    "charLabel": "Символ #{n}",
    "hoverLabel": "Символ #{n} ({hex})",
    "dimLabel": "{w}×{h} · {count} символов",
    "logoRangeLabel": "символы {start}–{end} · сетка {cols}×{rows}",
    "confirm.modeSwitch": "Переключение формата очистит текущий проект. Продолжить?",
    "confirm.newProject": "Создать новый проект? Несохранённые изменения будут потеряны.",
    "confirm.clearChar": "Очистить символ #{n}?",
    "status.modeSwitched": "Режим переключён на {mode}. Загружен шаблон по умолчанию.",
    "status.newProject": "Загружен шаблон по умолчанию.",
    "status.noUndo": "Нечего отменять для этого символа.",
    "status.noRedo": "Нечего повторять для этого символа.",
    "status.restoredStock": "Восстановлено из стокового шрифта.",
    "error.sdOnlyExport": "Экспорт в .mcm доступен только в режиме SD.",
    "error.hdOnlyExport": "Экспорт в .bmp доступен только в режиме HD.",
    "status.exported": "Экспортировано: {name}",
    "error.export": "Ошибка экспорта: {msg}",
    "status.importedMcm": "Импортирован .mcm: {count} символов.",
    "status.importedBmp": "Импортирован HD .bmp: {count} символов ({w}×{h}).",
    "status.importedPng": "Импортирован PNG-лист: {count} символов.",
    "status.importedJson": "Загружен проект «{name}».",
    "error.import": "Ошибка импорта: {msg}",
    "error.importAlert": "Не удалось импортировать файл:\n{msg}",
  },
  en: {
    "nav.new": "New",
    "nav.import": "Import",
    "nav.export": "Export",
    "nav.logoTab": "Logo",
    "nav.logoTabBack": "Back to glyphs",
    "dialog.ok": "OK",
    "dialog.cancel": "Cancel",
    "import.mcm": ".mcm (SD MAX7456)",
    "import.bmp": ".bmp (HD sheet)",
    "import.png": ".png (sprite sheet)",
    "import.json": ".json (project)",
    "export.mcm": ".mcm (SD MAX7456)",
    "export.bmp": ".bmp (HD sheet)",
    "export.png": ".png (sprite sheet)",
    "export.json": ".json (project)",
    "sidebar.jumpLabel": "No.",
    "sidebar.hoverDefault": "— hover a glyph —",
    "tool.pen": "Brush",
    "tool.fill": "Fill",
    "tool.eyedrop": "Eyedropper",
    "tool.brushSizeOut": "Decrease brush width",
    "tool.brushSizeIn": "Increase brush width",
    "swatch.black": "Black",
    "swatch.white": "White",
    "swatch.transparent": "Transparent",
    "tool.undo": "Undo (Ctrl+Z)",
    "tool.redo": "Redo (Ctrl+Y)",
    "tool.mirrorH": "Flip horizontally",
    "tool.mirrorV": "Flip vertically",
    "tool.invert": "Invert black/white",
    "tool.clear": "Delete glyph entirely",
    "tool.restoreStock": "Restore from the stock font",
    "tool.outline": "Outline while drawing",
    "tool.outlineColor": "Outline color",
    "tool.outlineWidth": "Outline width, px",
    "tool.zoomOut": "Zoom out",
    "tool.zoomIn": "Zoom in",
    "logo.title": "Boot logo",
    "logo.threshold": "Threshold",
    "logo.thresholdTitle": "Black/white brightness threshold",
    "logo.upload": "Upload image",
    "logo.clear": "Clear",
    "logo.hint": "Draw right on the logo with the same tools as for glyphs, above. Or drop an image — it will be center-cropped and sliced into the glyphs automatically.",
    "logo.tileHint": "Double-click a tile to open that glyph on its own in the glyph tab.",
    "logo.dropTitle": "Draw right here with the same tools above, or drop an image",
    "logo.confirmClear": "Clear the boot logo area (96 glyphs)?",
    "status.ready": "Ready. Pick a glyph on the sheet or import a font.",
    "status.stockLoaded": "Loaded the stock Betaflight font (default.mcm). Edit it or start fresh.",
    "status.stockMissing": "Stock font not found — starting with an empty project.",
    "status.unsaved": "unsaved",
    "charLabel": "Glyph #{n}",
    "hoverLabel": "Glyph #{n} ({hex})",
    "dimLabel": "{w}×{h} · {count} glyphs",
    "logoRangeLabel": "glyphs {start}–{end} · grid {cols}×{rows}",
    "confirm.modeSwitch": "Switching format will clear the current project. Continue?",
    "confirm.newProject": "Start a new project? Unsaved changes will be lost.",
    "confirm.clearChar": "Clear glyph #{n}?",
    "status.modeSwitched": "Switched to {mode}. Loaded the default template.",
    "status.newProject": "Loaded the default template.",
    "status.noUndo": "Nothing to undo for this glyph.",
    "status.noRedo": "Nothing to redo for this glyph.",
    "status.restoredStock": "Restored from the stock font.",
    "error.sdOnlyExport": ".mcm export is only available in SD mode.",
    "error.hdOnlyExport": ".bmp export is only available in HD mode.",
    "status.exported": "Exported: {name}",
    "error.export": "Export error: {msg}",
    "status.importedMcm": "Imported .mcm: {count} glyphs.",
    "status.importedBmp": "Imported HD .bmp: {count} glyphs ({w}×{h}).",
    "status.importedPng": "Imported PNG sheet: {count} glyphs.",
    "status.importedJson": "Loaded project “{name}”.",
    "error.import": "Import error: {msg}",
    "error.importAlert": "Could not import the file:\n{msg}",
  },
};

let currentLang = "ru";

export function getLang() {
  return currentLang;
}

export function t(key, vars) {
  const entry = DICT[currentLang]?.[key] ?? DICT.ru[key] ?? key;
  if (!vars) return entry;
  return entry.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
}

export function applyStaticI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.documentElement.lang = currentLang;
}

export function setLang(lang) {
  if (!DICT[lang]) return;
  currentLang = lang;
  applyStaticI18n();
}
