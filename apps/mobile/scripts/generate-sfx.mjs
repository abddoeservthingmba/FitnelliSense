/**
 * Generates the navigation sound effect as a WAV.
 *
 *   node scripts/generate-sfx.mjs
 *
 * Synthesised rather than downloaded, for the same reason exercise media needs
 * a licence row (BRD §6.8): a sound file off the internet arrives with terms
 * attached, and "it was free on a stock site" is not a licence. This one has no
 * provenance question because it is arithmetic.
 *
 * The sound is a rising sweep that lands on a bright fifth — the shape of
 * something powering up. It is deliberately SHORT. It plays on every tab press,
 * and anything with a tail becomes irritating by the third tap and unbearable
 * by the thirtieth.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RATE = 44_100;
const DURATION = 0.34;
const SAMPLES = Math.floor(RATE * DURATION);

/** Equal-power-ish exponential decay; `k` sets how fast it collapses. */
const decay = (t, k) => Math.exp(-k * t);

/** A few milliseconds of ramp, so the speaker never sees a step edge. */
function edges(i) {
  const attack = Math.min(1, i / (RATE * 0.006));
  const release = Math.min(1, (SAMPLES - i) / (RATE * 0.05));
  return attack * release;
}

const samples = new Float32Array(SAMPLES);
let phaseA = 0;
let phaseB = 0;
let phaseC = 0;

for (let i = 0; i < SAMPLES; i += 1) {
  const t = i / RATE;
  const progress = t / DURATION;

  // The sweep: 300 Hz up to 900 Hz on an ease-out curve, so most of the pitch
  // travel happens early and it arrives rather than keeps climbing.
  const eased = 1 - (1 - progress) ** 2;
  const sweep = 300 + eased * 600;
  phaseA += (2 * Math.PI * sweep) / RATE;
  const body = Math.sin(phaseA) * decay(t, 5) * 0.5;

  // A fifth above, entering late — this is the part that reads as "arrival".
  phaseB += (2 * Math.PI * sweep * 1.5) / RATE;
  const fifth = Math.sin(phaseB) * decay(Math.max(0, t - 0.12), 9) * (progress > 0.35 ? 0.32 : 0);

  // Second harmonic for brightness. Without it the sweep sounds like a hum on
  // a phone speaker, which has nothing below about 500 Hz to work with.
  phaseC += (2 * Math.PI * sweep * 2) / RATE;
  const harmonic = Math.sin(phaseC) * decay(t, 7) * 0.14;

  // A breath of noise under the front, giving the sweep some air.
  const air = (Math.random() * 2 - 1) * decay(t, 26) * 0.06;

  samples[i] = (body + fifth + harmonic + air) * edges(i);
}

// Normalise to a comfortable ceiling. -3 dBFS rather than 0: this plays over
// whatever the user is already listening to, and it is a UI tick, not a track.
let peak = 0;
for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
const gain = peak > 0 ? 0.7 / peak : 1;

const data = Buffer.alloc(SAMPLES * 2);
for (let i = 0; i < SAMPLES; i += 1) {
  const clamped = Math.max(-1, Math.min(1, samples[i] * gain));
  data.writeInt16LE(Math.round(clamped * 32_767), i * 2);
}

/** A canonical 44-byte PCM WAV header. */
function wav(pcm) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // format: PCM
  header.writeUInt16LE(1, 22); // channels: mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'nav-flourish.wav');
writeFileSync(out, wav(data));
console.log(`wrote ${out} — ${(data.length / 1024).toFixed(1)} KB, ${DURATION * 1000} ms`);
