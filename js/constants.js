// Константы форматов и режимов.
// Внутреннее представление пикселя: 0 = чёрный, 1 = белый, 2 = прозрачный.
export const PX = {
  BLACK: 0,
  WHITE: 1,
  TRANSPARENT: 2,
};

export const PX_ORDER = [PX.TRANSPARENT, PX.BLACK, PX.WHITE];

// Профили форматов OSD-шрифтов.
export const MODES = {
  SD: {
    id: "SD",
    label: "SD · MAX7456 (.mcm)",
    charW: 12,
    charH: 18,
    counts: [256], // фиксированный набор для SD
    defaultCount: 256,
  },
  HD: {
    id: "HD",
    label: "HD · DJI/HDZero (.bmp)",
    charW: 24,
    charH: 36,
    counts: [256, 512], // 16x16 либо 16x32 тайлов
    defaultCount: 512,
  },
};

export const HD_GRID_COLS = 16;

export function hdRowsForCount(count) {
  return count / HD_GRID_COLS;
}

// Цвета для отрисовки в UI (не влияют на экспорт).
export const PX_COLOR = {
  [PX.BLACK]: "#0a0a0c",
  [PX.WHITE]: "#f5f5f0",
  [PX.TRANSPARENT]: "checker", // особая маркировка — рисуем шахматку
};

export const APP_VERSION = "0.1.0";

// ---------------------------------------------------------------------------
// Стартовый логотип (boot logo). Раскладка 24x4 тайла подтверждена по
// исходникам betaflight-configurator (src/js/LogoManager.js): TILES_NUM_HORIZ
// = 24, TILES_NUM_VERT = 4, а старт для SD (256 символов) — SYM.LOGO = 0xA0
// (160), т.е. ровно последние 96 символов шрифта. Для HD берём тот же
// принцип: последние 96 символов набора, независимо от его размера.
// ---------------------------------------------------------------------------
export const LOGO_TILES_H = 24;
export const LOGO_TILES_V = 4;
export const LOGO_TILE_COUNT = LOGO_TILES_H * LOGO_TILES_V; // 96

export function logoStartIndex(charCount) {
  return Math.max(0, charCount - LOGO_TILE_COUNT);
}
