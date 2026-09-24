import { PX } from "../constants.js";

// ---------------------------------------------------------------------------
// Универсальный PNG-спрайт-лист: 16 колонок тайлов, реальная альфа-прозрачность
// (удобно открывать/редактировать в Photoshop, Aseprite, GIMP и т.п.).
// Это не формат прошивки, а «мост» для дизайнеров — экспорт/импорт обратно.
// ---------------------------------------------------------------------------

const COLS = 16;

function pxToRGBA(px) {
  if (px === PX.BLACK) return [0, 0, 0, 255];
  if (px === PX.WHITE) return [255, 255, 255, 255];
  return [0, 0, 0, 0]; // прозрачный
}

function rgbaToPx(r, g, b, a) {
  if (a < 128) return PX.TRANSPARENT;
  const lum = (r + g + b) / 3;
  return lum > 127 ? PX.WHITE : PX.BLACK;
}

/**
 * Рендер всех символов в один PNG-лист (Blob).
 */
export function buildPNGSheet(characters, charW, charH) {
  const cols = COLS;
  const rows = Math.ceil(characters.length / cols);
  const canvas = document.createElement("canvas");
  canvas.width = cols * charW;
  canvas.height = rows * charH;
  const ctx = canvas.getContext("2d");
  const imgData = ctx.createImageData(canvas.width, canvas.height);

  for (let idx = 0; idx < characters.length; idx++) {
    const tileCol = idx % cols;
    const tileRow = Math.floor(idx / cols);
    const ox = tileCol * charW;
    const oy = tileRow * charH;
    const px = characters[idx];
    for (let y = 0; y < charH; y++) {
      for (let x = 0; x < charW; x++) {
        const [r, g, b, a] = pxToRGBA(px[y * charW + x]);
        const di = ((oy + y) * canvas.width + (ox + x)) * 4;
        imgData.data[di] = r;
        imgData.data[di + 1] = g;
        imgData.data[di + 2] = b;
        imgData.data[di + 3] = a;
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/**
 * Импорт PNG-листа обратно в массив символов.
 * @param {Blob|File} blob
 * @param {number} charW
 * @param {number} charH
 */
export function parsePNGSheet(blob, charW, charH) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const cols = COLS;
        const rows = Math.round(img.height / charH);
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, img.width, img.height);

        const charCount = cols * rows;
        const characters = new Array(charCount);
        for (let idx = 0; idx < charCount; idx++) {
          const tileCol = idx % cols;
          const tileRow = Math.floor(idx / cols);
          const ox = tileCol * charW;
          const oy = tileRow * charH;
          const px = new Uint8Array(charW * charH);
          for (let y = 0; y < charH; y++) {
            for (let x = 0; x < charW; x++) {
              const si = ((oy + y) * img.width + (ox + x)) * 4;
              px[y * charW + x] = rgbaToPx(data[si], data[si + 1], data[si + 2], data[si + 3]);
            }
          }
          characters[idx] = px;
        }
        URL.revokeObjectURL(url);
        resolve({ charCount, characters });
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось декодировать PNG-файл."));
    };
    img.src = url;
  });
}
