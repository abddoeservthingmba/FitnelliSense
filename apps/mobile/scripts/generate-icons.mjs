/**
 * Generates the app's icon set.
 *
 * The mark is three ascending bars — a progress chart, which is what the
 * product is — in the theme's lime on its near-black ground. Drawn here rather
 * than committed as opaque binaries so it stays editable: change the palette
 * or the proportions and re-run `node scripts/generate-icons.mjs`.
 *
 * A minimal PNG encoder is included because the alternative is adding an image
 * dependency to a mobile app that never processes images at runtime.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets');

const INK = [0x08, 0x09, 0x0a, 0xff]; // background
const LIME = [0xc8, 0xff, 0x4d, 0xff]; // accent
const TRANSPARENT = [0, 0, 0, 0];

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Encodes RGBA pixels as a PNG. `pixels` is width*height*4 bytes. */
function encodePng(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  // 10..12 stay zero: deflate, adaptive filtering, no interlace.

  // Each scanline is prefixed with its filter type; 0 means none.
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function canvas(size, background) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    pixels[i * 4] = background[0];
    pixels[i * 4 + 1] = background[1];
    pixels[i * 4 + 2] = background[2];
    pixels[i * 4 + 3] = background[3];
  }
  return pixels;
}

function fillRect(pixels, size, x, y, width, height, colour) {
  const left = Math.max(0, Math.round(x));
  const top = Math.max(0, Math.round(y));
  const right = Math.min(size, Math.round(x + width));
  const bottom = Math.min(size, Math.round(y + height));

  for (let row = top; row < bottom; row += 1) {
    for (let column = left; column < right; column += 1) {
      const index = (row * size + column) * 4;
      pixels[index] = colour[0];
      pixels[index + 1] = colour[1];
      pixels[index + 2] = colour[2];
      pixels[index + 3] = colour[3];
    }
  }
}

/**
 * Three ascending bars, centred.
 *
 * `safeArea` is the fraction of the canvas the mark may occupy — Android's
 * adaptive icon masks the outer edge to a circle or squircle depending on the
 * launcher, so the foreground layer has to stay well inside it.
 */
function drawMark(pixels, size, safeArea) {
  const markWidth = size * safeArea;
  const markHeight = size * safeArea * 0.72;
  const originX = (size - markWidth) / 2;
  const baseline = (size + markHeight) / 2;

  const gap = markWidth * 0.11;
  const barWidth = (markWidth - gap * 2) / 3;
  const heights = [0.42, 0.72, 1];

  heights.forEach((fraction, index) => {
    const barHeight = markHeight * fraction;
    fillRect(
      pixels,
      size,
      originX + index * (barWidth + gap),
      baseline - barHeight,
      barWidth,
      barHeight,
      LIME,
    );
  });
}

function write(name, size, background, safeArea) {
  const pixels = canvas(size, background);
  drawMark(pixels, size, safeArea);
  writeFileSync(path.join(OUT, name), encodePng(size, size, pixels));
  console.log(`wrote assets/${name} (${size}x${size})`);
}

mkdirSync(OUT, { recursive: true });

// The launcher icon and the web favicon carry their own background.
write('icon.png', 1024, INK, 0.56);
write('favicon.png', 96, INK, 0.6);
// Android composes the adaptive foreground over a colour set in app.json, so
// this layer is transparent and keeps the mark inside the safe circle.
write('adaptive-icon.png', 1024, TRANSPARENT, 0.42);
// The splash mark sits on the same ink as the app's background.
write('splash-icon.png', 512, TRANSPARENT, 0.5);
