/**
 * Generates ARISE's icon set.
 *
 * The mark is a rising chevron inside four corner brackets — the same bracket
 * motif the app draws around a System window, so the icon and the interface
 * read as one thing. It works as an A, as an upward arrow, and as a peak.
 *
 * Drawn here rather than committed as opaque binaries so it stays editable:
 * change the palette or the proportions and re-run
 * `node scripts/generate-icons.mjs`.
 *
 * A minimal PNG encoder is included because the alternative is adding an image
 * dependency to a mobile app that never processes images at runtime.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets');

/**
 * The palette, taken from the icon artwork.
 *
 * The ground is a radial gradient — deep navy at the corners lifting to a
 * brighter blue behind the mark. That gradient is what stops a flat square
 * looking like a placeholder at 48 px on a home screen.
 */
const NAVY_EDGE = [0x05, 0x0d, 0x1f];
const NAVY_CORE = [0x1a, 0x4a, 0x8c];
const ICE = [0xdc, 0xec, 0xff, 0xff];
const GLOW = [0x8c, 0xc8, 0xff, 0xff];
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

// ------------------------------------------------------------------ drawing --

/** Everything is drawn at 4x and averaged down, which is the anti-aliasing. */
const SUPERSAMPLE = 4;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * The radial ground: brighter behind the mark, falling to near-black at the
 * corners. Painting this per-pixel is cheap and avoids a gradient library.
 */
function paintGround(pixels, size) {
  const centre = size / 2;
  // Normalised against the half-diagonal so the corners reach the darkest tone.
  const maxDistance = Math.hypot(centre, centre);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - centre, y - centre) / maxDistance;
      // Eased so the bright core stays broad rather than a small hotspot.
      const t = Math.min(1, distance ** 1.35);
      const index = (y * size + x) * 4;
      pixels[index] = Math.round(lerp(NAVY_CORE[0], NAVY_EDGE[0], t));
      pixels[index + 1] = Math.round(lerp(NAVY_CORE[1], NAVY_EDGE[1], t));
      pixels[index + 2] = Math.round(lerp(NAVY_CORE[2], NAVY_EDGE[2], t));
      pixels[index + 3] = 0xff;
    }
  }
}

/** Alpha-composites `colour` over the pixel at (x, y). */
function blend(pixels, size, x, y, colour, alpha) {
  if (x < 0 || y < 0 || x >= size || y >= size || alpha <= 0) return;
  const index = (y * size + x) * 4;
  const a = Math.min(1, alpha);
  const existing = pixels[index + 3] / 255;
  const out = a + existing * (1 - a);

  pixels[index] = Math.round(colour[0] * a + pixels[index] * existing * (1 - a));
  pixels[index + 1] = Math.round(colour[1] * a + pixels[index + 1] * existing * (1 - a));
  pixels[index + 2] = Math.round(colour[2] * a + pixels[index + 2] * existing * (1 - a));
  pixels[index + 3] = Math.round(out * 255);
}

/** Distance from point p to the segment ab — the whole of the shape maths. */
function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Strokes a polyline with a soft outer glow.
 *
 * Every stroke in the mark goes through here, so the chevron and the brackets
 * share one lighting model — which is why they look like the same object rather
 * than two shapes that happen to be the same colour.
 */
function stroke(pixels, size, points, width, glowWidth) {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let nearest = Infinity;
      for (let i = 0; i < points.length - 1; i += 1) {
        const [ax, ay] = points[i];
        const [bx, by] = points[i + 1];
        nearest = Math.min(nearest, distanceToSegment(x + 0.5, y + 0.5, ax, ay, bx, by));
      }

      // The glow first, so the solid core paints over its inner edge.
      if (nearest < glowWidth) {
        const falloff = 1 - nearest / glowWidth;
        blend(pixels, size, x, y, GLOW, falloff ** 2.2 * 0.55);
      }
      if (nearest < width) {
        // One pixel of feathering at the edge is all the shape needs.
        blend(pixels, size, x, y, ICE, Math.min(1, (width - nearest) / 1.5));
      }
    }
  }
}

/**
 * The chevron and its four corner brackets.
 *
 * `safeArea` is the fraction of the canvas the mark may occupy. Android's
 * adaptive icon masks the outer edge to a circle or a squircle depending on the
 * launcher, so the foreground layer has to stay well inside it.
 */
function drawMark(pixels, size, safeArea, withBrackets) {
  const inset = (size * (1 - safeArea)) / 2;
  const span = size * safeArea;

  // --- the chevron: an A with no crossbar, apex slightly above centre.
  const apexX = size / 2;
  const apexY = inset + span * 0.16;
  const footY = inset + span * 0.84;
  const halfWidth = span * 0.235;
  const strokeWidth = Math.max(2, span * 0.058);

  stroke(
    pixels,
    size,
    [
      [apexX - halfWidth, footY],
      [apexX, apexY],
      [apexX + halfWidth, footY],
    ],
    strokeWidth,
    strokeWidth * 3.2,
  );

  if (!withBrackets) return;

  // --- corner brackets, the same motif as SystemWindow draws in the app.
  const bracketInset = inset - span * 0.06;
  const arm = span * 0.165;
  const bracketWidth = Math.max(2, span * 0.042);
  const left = bracketInset;
  const right = size - bracketInset;
  const top = bracketInset;
  const bottom = size - bracketInset;

  const corners = [
    [
      [left + arm, top],
      [left, top],
      [left, top + arm],
    ],
    [
      [right - arm, top],
      [right, top],
      [right, top + arm],
    ],
    [
      [left, bottom - arm],
      [left, bottom],
      [left + arm, bottom],
    ],
    [
      [right, bottom - arm],
      [right, bottom],
      [right - arm, bottom],
    ],
  ];

  for (const corner of corners) {
    stroke(pixels, size, corner, bracketWidth, bracketWidth * 2.4);
  }
}

function canvas(size, ground) {
  const pixels = Buffer.alloc(size * size * 4);
  if (ground === TRANSPARENT) return pixels;
  paintGround(pixels, size);
  return pixels;
}

/**
 * Renders at `SUPERSAMPLE`x and averages down.
 *
 * A chevron is all diagonals, and a diagonal drawn at final size is a staircase.
 * Averaging four samples per axis is the difference between a mark that looks
 * drawn and one that looks aliased.
 */
function write(name, size, ground, safeArea, withBrackets = true) {
  const big = size * SUPERSAMPLE;
  const large = canvas(big, ground);
  drawMark(large, big, safeArea, withBrackets);

  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const index = ((y * SUPERSAMPLE + sy) * big + (x * SUPERSAMPLE + sx)) * 4;
          r += large[index];
          g += large[index + 1];
          b += large[index + 2];
          a += large[index + 3];
        }
      }
      const samples = SUPERSAMPLE * SUPERSAMPLE;
      const index = (y * size + x) * 4;
      out[index] = Math.round(r / samples);
      out[index + 1] = Math.round(g / samples);
      out[index + 2] = Math.round(b / samples);
      out[index + 3] = Math.round(a / samples);
    }
  }

  writeFileSync(path.join(OUT, name), encodePng(size, size, out));
  console.log(`wrote assets/${name} (${size}x${size})`);
}

mkdirSync(OUT, { recursive: true });

// The launcher icon and the web favicon carry their own gradient ground.
write('icon.png', 1024, 'ground', 0.62);
write('favicon.png', 96, 'ground', 0.66);
// Android composes the adaptive foreground over a colour set in app.json, so
// this layer is transparent and keeps the mark inside the safe circle. The
// brackets are dropped here: at the mask's edge they are the first thing a
// round launcher clips, and a half-eaten bracket looks like a mistake.
write('adaptive-icon.png', 1024, TRANSPARENT, 0.46, false);
// The splash mark sits on the app's own background, so it is transparent too,
// but keeps the brackets — nothing masks a splash.
write('splash-icon.png', 512, TRANSPARENT, 0.58);
