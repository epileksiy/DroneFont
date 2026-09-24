import { PX } from "../constants.js";

// ---------------------------------------------------------------------------
// Формат MAX7456 .mcm (SD OSD, Betaflight/iNav).
// Текстовый файл: заголовок "MAX7456", затем строки по 8 символов '0'/'1' —
// это побайтовая бинарная запись. На символ отводится 64 байта (=256
// двухбитных пикселей), из них реально используются первые 216 (12x18),
// оставшиеся 40 — незначащий хвост, по спеке заполняется 0x55.
// Двухбитный код пикселя: 00 = чёрный, 10 = белый, 01/11 = прозрачный.
// Формат подтверждён по исходникам betaflight-configurator (osdFont.js).
// ---------------------------------------------------------------------------

const HEADER = "MAX7456";
const CHAR_FIELD_BYTES = 64;
const REAL_PIXELS = 216; // 12 x 18
const PAD_BYTE = 0b01010101; // 0x55, каждый пиксель = "01" (прозрачный)

function codeToPx(code) {
  if (code === 0) return PX.BLACK;
  if (code === 2) return PX.WHITE;
  return PX.TRANSPARENT; // 1 или 3
}

function pxToCode(px) {
  if (px === PX.BLACK) return 0b00;
  if (px === PX.WHITE) return 0b10;
  return 0b01; // прозрачный
}

/**
 * Разбор .mcm файла (строка целиком).
 * @returns {{charW:number, charH:number, charCount:number, characters:Uint8Array[]}}
 */
export function parseMCM(text) {
  const lines = text.trim().split("\n").map((l) => l.trim());
  if (lines.shift() !== HEADER) {
    throw new Error('Файл не похож на .mcm: не найден заголовок "MAX7456".');
  }
  const bytes = lines.filter((l) => l.length > 0).map((l) => parseInt(l, 2));
  const charCount = Math.floor(bytes.length / CHAR_FIELD_BYTES);
  if (charCount === 0) throw new Error("Файл .mcm пуст или повреждён.");

  const charW = 12,
    charH = 18;
  const characters = [];
  let ptr = 0;
  for (let c = 0; c < charCount; c++) {
    const px = new Uint8Array(charW * charH);
    let pi = 0;
    for (let b = 0; b < CHAR_FIELD_BYTES && pi < REAL_PIXELS; b++) {
      const byte = bytes[ptr + b] ?? 0;
      for (let shift = 6; shift >= 0 && pi < REAL_PIXELS; shift -= 2) {
        const code = (byte >> shift) & 0b11;
        px[pi++] = codeToPx(code);
      }
    }
    characters.push(px);
    ptr += CHAR_FIELD_BYTES;
  }

  return { charW, charH, charCount, characters };
}

/**
 * Сборка .mcm файла из массива символов (Uint8Array, значения PX.*).
 * @param {Uint8Array[]} characters
 * @returns {string}
 */
export function buildMCM(characters) {
  const lines = [HEADER];
  for (const px of characters) {
    const bytes = [];
    let acc = 0,
      accBits = 0;
    for (let i = 0; i < REAL_PIXELS; i++) {
      const code = pxToCode(px[i] ?? PX.TRANSPARENT);
      acc = (acc << 2) | code;
      accBits += 2;
      if (accBits === 8) {
        bytes.push(acc);
        acc = 0;
        accBits = 0;
      }
    }
    // REAL_PIXELS=216 делится на 4 без остатка, но на всякий случай:
    if (accBits > 0) bytes.push(acc << (8 - accBits));
    while (bytes.length < CHAR_FIELD_BYTES) bytes.push(PAD_BYTE);
    for (const b of bytes) lines.push(b.toString(2).padStart(8, "0"));
  }
  return lines.join("\n") + "\n";
}
