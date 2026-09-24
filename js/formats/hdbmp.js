import { PX, HD_GRID_COLS } from "../constants.js";

// ---------------------------------------------------------------------------
// Формат HD OSD (DJI / HDZero / Walksnail и т.п.): 24-битный BMP,
// лист тайлов 16 колонок x (16 или 32) строк, тайл 24x36 (720p/540p).
// Прозрачный пиксель = RGB(127,127,127). Чёрный = (0,0,0), белый = (255,255,255).
// Раскладка подтверждена документацией HDZero / hd-zero/hdzero-osd-font-library.
// ---------------------------------------------------------------------------

const TRANSPARENT_RGB = 127;

function classifyPixel(r, g, b) {
  // Прозрачная зона (серая, ~127,127,127) с запасом на артефакты сжатия/масштабирования.
  if (Math.abs(r - TRANSPARENT_RGB) < 40 && Math.abs(g - TRANSPARENT_RGB) < 40 && Math.abs(b - TRANSPARENT_RGB) < 40) {
    return PX.TRANSPARENT;
  }
  const lum = (r + g + b) / 3;
  return lum > 127 ? PX.WHITE : PX.BLACK;
}

function pxToRGB(px) {
  if (px === PX.BLACK) return [0, 0, 0];
  if (px === PX.WHITE) return [255, 255, 255];
  return [TRANSPARENT_RGB, TRANSPARENT_RGB, TRANSPARENT_RGB];
}

/**
 * Разбор HD .bmp файла (через встроенный в браузер декодер изображений).
 * @param {Blob|File} blob
 * @returns {Promise<{charW:number, charH:number, charCount:number, characters:Uint8Array[]}>}
 */
export function parseHDBMP(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const cols = HD_GRID_COLS;
        const charW = Math.round(img.width / cols);
        // Тайл HD пропорционален 24x36 (2:3) => высота тайла = ширина * 1.5
        const charH = Math.round(charW * 1.5);
        const rowsExact = Math.round(img.height / charH);
        if (cols * charW !== img.width || rowsExact * charH !== img.height) {
          console.warn("Размер HD BMP не кратен ожидаемой сетке 16 колонок, продолжаем по best-effort.");
        }

        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, img.width, img.height);

        const charCount = cols * rowsExact;
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
              px[y * charW + x] = classifyPixel(data[si], data[si + 1], data[si + 2]);
            }
          }
          characters[idx] = px;
        }

        URL.revokeObjectURL(url);
        resolve({ charW, charH, charCount, characters });
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось декодировать BMP-файл (браузер не смог его прочитать)."));
    };
    img.src = url;
  });
}

/**
 * Сборка несжатого 24-битного BMP из массива символов.
 * @param {Uint8Array[]} characters
 * @param {number} charW
 * @param {number} charH
 * @param {number} cols
 * @returns {Uint8Array}
 */
export function buildHDBMP(characters, charW, charH, cols = HD_GRID_COLS) {
  const rows = Math.ceil(characters.length / cols);
  const width = cols * charW;
  const height = rows * charH;
  const rowSize = Math.ceil((width * 3) / 4) * 4; // выравнивание строки по 4 байта
  const pixelArraySize = rowSize * height;
  const fileHeaderSize = 14;
  const dibHeaderSize = 40;
  const pixelOffset = fileHeaderSize + dibHeaderSize;
  const fileSize = pixelOffset + pixelArraySize;

  const buf = new ArrayBuffer(fileSize);
  const view = new DataView(buf);
  let o = 0;

  // BITMAPFILEHEADER
  view.setUint8(o++, 0x42); // 'B'
  view.setUint8(o++, 0x4d); // 'M'
  view.setUint32(o, fileSize, true); o += 4;
  view.setUint32(o, 0, true); o += 4; // reserved
  view.setUint32(o, pixelOffset, true); o += 4;

  // BITMAPINFOHEADER
  view.setUint32(o, dibHeaderSize, true); o += 4;
  view.setInt32(o, width, true); o += 4;
  view.setInt32(o, height, true); o += 4; // положительная высота => bottom-up
  view.setUint16(o, 1, true); o += 2; // planes
  view.setUint16(o, 24, true); o += 2; // bpp
  view.setUint32(o, 0, true); o += 4; // без сжатия
  view.setUint32(o, pixelArraySize, true); o += 4;
  view.setInt32(o, 2835, true); o += 4; // ~72 DPI
  view.setInt32(o, 2835, true); o += 4;
  view.setUint32(o, 0, true); o += 4; // палитра
  view.setUint32(o, 0, true); o += 4; // важные цвета

  const pixels = new Uint8Array(buf, pixelOffset, pixelArraySize);
  pixels.fill(TRANSPARENT_RGB); // фон листа — прозрачный, если тайлов меньше, чем ячеек сетки

  for (let idx = 0; idx < characters.length; idx++) {
    const tileCol = idx % cols;
    const tileRow = Math.floor(idx / cols);
    const ox = tileCol * charW;
    const oyTop = tileRow * charH; // строка тайла считая сверху
    const px = characters[idx];
    for (let y = 0; y < charH; y++) {
      // BMP хранится bottom-up: строка изображения снизу = y=0 в файле.
      const fileY = height - 1 - (oyTop + y);
      const rowStart = fileY * rowSize;
      for (let x = 0; x < charW; x++) {
        const [r, g, b] = pxToRGB(px[y * charW + x]);
        const di = rowStart + (ox + x) * 3;
        pixels[di] = b;
        pixels[di + 1] = g;
        pixels[di + 2] = r;
      }
    }
  }

  return new Uint8Array(buf);
}
