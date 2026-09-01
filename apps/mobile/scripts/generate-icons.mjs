/**
 * Generates ARISE's icon set.
 *
 * The mark is a hard-edged **A** inside four corner brackets, lit from within.
 * The brackets are the same motif `SystemWindow` draws around a panel in the
 * app, so the launcher icon and the interface read as one object.
 *
 * Drawn in code rather than committed as opaque binaries, so the palette and
 * the proportions stay editable: change a number and re-run
 * `node scripts/generate-icons.mjs`.
 *
 * How it is built, because the order matters:
 *
 *   1. the shape is rasterised into an alpha **mask** at 4x;
 *   2. the mask is box-blurred three times to make the glow — three passes
 *      approximate a gaussian closely enough and cost a fraction of one;
 *   3. the glow is composited first, then the sharp mark over it.
 *
 * Doing the glow as a blurred copy of the real mask, rather than as a widened
 * stroke, is what makes the halo follow the letterform into its corners
 * instead of ballooning around a fatter version of it.
 *
 * A minimal PNG encoder is included because the alternative is adding an image
 * dependency to a mobile app that never processes images at runtime.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets');

/** The ground: deep navy, lifting slightly behind the mark. */
const NAVY_EDGE = [0x04, 0x0b, 0x1c];
const NAVY_CORE = [0x14, 0x36, 0x66];

/**
 * The mark is a vertical gradient — near-white at the apex falling to ice blue
 * at the feet. That is what stops a flat fill looking like a sticker.
 */
const MARK_TOP = [0xff, 0xff, 0xff];
const MARK_BOTTOM = [0xbe, 0xdc, 0xff];
const GLOW = [0xcf, 0xe6, 0xff];

const TRANSPARENT = 'transparent';
const GROUND = 'ground';

// ------------------------------------------------------------ png encoding --

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

  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0; // filter type 0: none
    pixels.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// -------------------------------------------------------------- geometry --

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Barycentric point-in-triangle. Used for the A's outer and inner forms. */
function inTriangle(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (d === 0) return false;
  const a = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
  const b = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
  return a >= 0 && b >= 0 && a + b <= 1;
}

function inRect(px, py, x0, y0, x1, y1) {
  return px >= x0 && px <= x1 && py >= y0 && py <= y1;
}

/**
 * The letter A, in a 0..100 box.
 *
 * Built as `outer triangle − inner triangle + crossbar`, which is how a sans
 * A actually is: two splayed legs, a bar low across them, and a triangular
 * counter left over above the bar. The counter is not drawn — it is what the
 * subtraction leaves behind, so it can never drift out of alignment with the
 * legs that form it.
 */
function inLetterA(px, py) {
  const outer = inTriangle(px, py, [50, 6], [7, 94], [93, 94]);
  if (!outer) return false;

  // The bar sits at 62–75% of the height: low enough to leave a generous
  // counter, high enough that the legs below it still read as legs.
  if (inRect(px, py, 0, 63, 100, 73)) return true;

  const inner = inTriangle(px, py, [50, 27], [30, 94], [70, 94]);
  return !inner;
}

/** One corner bracket, squared off — no rounding, matching the artwork. */
function inBracket(px, py, x0, y0, x1, y1, thickness, arm) {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);

  // Horizontal arm, anchored at whichever corner this bracket belongs to.
  const hy0 = y0 === top ? top : bottom - thickness;
  const horizontal = inRect(
    px,
    py,
    x0 === left ? left : right - arm,
    hy0,
    x0 === left ? left + arm : right,
    hy0 + thickness,
  );

  const hx0 = x0 === left ? left : right - thickness;
  const vertical = inRect(
    px,
    py,
    hx0,
    y0 === top ? top : bottom - arm,
    hx0 + thickness,
    y0 === top ? top + arm : bottom,
  );

  return horizontal || vertical;
}

/**
 * Coverage of the whole mark at a point, in the 0..100 box.
 *
 * `safeArea` is the fraction of the canvas the mark may occupy. Android's
 * adaptive icon masks the outer edge to a circle or a squircle depending on
 * the launcher, so that layer has to stay well inside it.
 */
function markAt(px, py, withBrackets) {
  // The A is inset within the bracket frame rather than filling it.
  const ax = (px - 23.5) / 0.53;
  const ay = (py - 15) / 0.7;
  if (ax >= 0 && ax <= 100 && ay >= 0 && ay <= 100 && inLetterA(ax, ay)) return true;

  if (!withBrackets) return false;

  const thickness = 6.5;
  const arm = 21;
  const inset = 3;
  const far = 100 - inset;

  return (
    inBracket(px, py, inset, inset, inset + arm, inset + arm, thickness, arm) ||
    inBracket(px, py, far, inset, far - arm, inset + arm, thickness, arm) ||
    inBracket(px, py, inset, far, inset + arm, far - arm, thickness, arm) ||
    inBracket(px, py, far, far, far - arm, far - arm, thickness, arm)
  );
}

// ------------------------------------------------------------- rendering --

/** Drawn at 4x and averaged down; a diagonal at final size is a staircase. */
const SUPERSAMPLE = 4;

/** A single box-blur pass, separable, operating on a Float32 alpha plane. */
function boxBlur(source, size, radius) {
  const horizontal = new Float32Array(size * size);
  const window = radius * 2 + 1;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let total = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const sx = Math.min(size - 1, Math.max(0, x + k));
        total += source[y * size + sx];
      }
      horizontal[y * size + x] = total / window;
    }
  }

  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let total = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const sy = Math.min(size - 1, Math.max(0, y + k));
        total += horizontal[sy * size + x];
      }
      out[y * size + x] = total / window;
    }
  }
  return out;
}

function render(size, ground, safeArea, withBrackets) {
  // The mask is built at final resolution, with coverage from supersampling.
  const mask = new Float32Array(size * size);
  const inset = (1 - safeArea) / 2;
  const step = 1 / (SUPERSAMPLE * size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let hits = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const u = (x + (sx + 0.5) / SUPERSAMPLE) / size;
          const v = (y + (sy + 0.5) / SUPERSAMPLE) / size;
          // Into the mark's own 0..100 space.
          const mx = ((u - inset) / safeArea) * 100;
          const my = ((v - inset) / safeArea) * 100;
          if (mx >= 0 && mx <= 100 && my >= 0 && my <= 100 && markAt(mx, my, withBrackets)) {
            hits += 1;
          }
        }
      }
      mask[y * size + x] = hits / (SUPERSAMPLE * SUPERSAMPLE);
    }
  }
  void step;

  // Three passes ≈ gaussian. The radius scales with the canvas so a 96 px
  // favicon and a 1024 px icon carry the same *proportional* halo.
  const radius = Math.max(1, Math.round(size * 0.016));
  let glow = mask;
  for (let pass = 0; pass < 3; pass += 1) glow = boxBlur(glow, size, radius);

  const pixels = Buffer.alloc(size * size * 4);
  const centre = size / 2;
  const maxDistance = Math.hypot(centre, centre);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      if (ground === GROUND) {
        const t = Math.min(1, (Math.hypot(x - centre, y - centre) / maxDistance) ** 1.3);
        r = lerp(NAVY_CORE[0], NAVY_EDGE[0], t);
        g = lerp(NAVY_CORE[1], NAVY_EDGE[1], t);
        b = lerp(NAVY_CORE[2], NAVY_EDGE[2], t);
        a = 1;
      }

      // The glow. Amplified and clamped, so it stays visible well away from
      // the mark without washing the whole square out.
      const halo = Math.min(1, glow[y * size + x] * 1.9);
      if (halo > 0.002) {
        const strength = halo * 0.62;
        r = lerp(r, GLOW[0], strength);
        g = lerp(g, GLOW[1], strength);
        b = lerp(b, GLOW[2], strength);
        a = a + (1 - a) * strength;
      }

      // The mark itself, over the top, with its vertical gradient.
      const coverage = mask[y * size + x];
      if (coverage > 0) {
        const t = y / size;
        const fr = lerp(MARK_TOP[0], MARK_BOTTOM[0], t);
        const fg = lerp(MARK_TOP[1], MARK_BOTTOM[1], t);
        const fb = lerp(MARK_TOP[2], MARK_BOTTOM[2], t);
        r = lerp(r, fr, coverage);
        g = lerp(g, fg, coverage);
        b = lerp(b, fb, coverage);
        a = a + (1 - a) * coverage;
      }

      pixels[index] = Math.round(r);
      pixels[index + 1] = Math.round(g);
      pixels[index + 2] = Math.round(b);
      pixels[index + 3] = Math.round(a * 255);
    }
  }

  return pixels;
}

function write(name, size, ground, safeArea, withBrackets = true) {
  writeFileSync(
    path.join(OUT, name),
    encodePng(size, size, render(size, ground, safeArea, withBrackets)),
  );
  console.log(`wrote assets/${name} (${size}x${size})`);
}

mkdirSync(OUT, { recursive: true });

// The launcher icon and the web favicon carry their own navy ground.
write('icon.png', 1024, GROUND, 0.86);
write('favicon.png', 96, GROUND, 0.86);
// Android composes the adaptive foreground over a colour set in app.json, so
// this layer is transparent and pulls well inside the mask's safe circle.
write('adaptive-icon.png', 1024, TRANSPARENT, 0.62);
// Nothing masks a splash, so it can sit closer to the artwork's framing.
write('splash-icon.png', 512, TRANSPARENT, 0.8);
