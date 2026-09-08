import { describe, expect, it } from 'vitest';
import {
  MAX_CLIP_SECONDS,
  MAX_UPLOAD_BYTES,
  clipLengthSecs,
  clipSegments,
  clipWindow,
  planUpload,
  tapToFrameFraction,
  videoContentRect,
} from './video-clip';

const MB = 1024 * 1024;

/** What an unusable view or aspect ratio produces. */
const EMPTY = { left: 0, top: 0, width: 0, height: 0 };

describe('clipWindow', () => {
  it('takes the whole video when it is already short enough', () => {
    expect(clipWindow(45, 0)).toEqual({ startSecs: 0, endSecs: 45 });
  });

  it('takes exactly the ceiling from a longer video', () => {
    expect(clipWindow(600, 0)).toEqual({ startSecs: 0, endSecs: MAX_CLIP_SECONDS });
  });

  it('moves the whole window when the handle moves', () => {
    expect(clipWindow(600, 120)).toEqual({ startSecs: 120, endSecs: 120 + MAX_CLIP_SECONDS });
  });

  it('clamps a start dragged past the end to the LAST window, not to zero', () => {
    // The interesting one: "past the end" means the end, not a reset.
    expect(clipWindow(600, 9999)).toEqual({ startSecs: 420, endSecs: 600 });
  });

  it('clamps a negative start to zero', () => {
    expect(clipWindow(600, -30)).toEqual({ startSecs: 0, endSecs: MAX_CLIP_SECONDS });
  });

  it('cannot produce a window that runs past the end of the video', () => {
    for (const start of [0, 1, 100, 419, 420, 421, 10_000]) {
      expect(clipWindow(600, start).endSecs).toBeLessThanOrEqual(600);
    }
  });

  it('ignores a start on a video shorter than the ceiling, because there is nowhere to move', () => {
    expect(clipWindow(45, 30)).toEqual({ startSecs: 0, endSecs: 45 });
  });

  it('floors fractional seconds rather than carrying them into the window', () => {
    expect(clipWindow(45.9, 10.7)).toEqual({ startSecs: 0, endSecs: 45 });
    expect(clipWindow(600.9, 10.7)).toEqual({ startSecs: 10, endSecs: 190 });
  });

  it('survives a zero-length video without going negative', () => {
    expect(clipWindow(0, 0)).toEqual({ startSecs: 0, endSecs: 0 });
    expect(clipWindow(-5, 0)).toEqual({ startSecs: 0, endSecs: 0 });
  });

  it('measures its own length', () => {
    expect(clipLengthSecs(clipWindow(600, 60))).toBe(MAX_CLIP_SECONDS);
    expect(clipLengthSecs(clipWindow(45, 0))).toBe(45);
  });
});

describe('clipSegments', () => {
  it('offers one window for a video that needs no choice', () => {
    expect(clipSegments(45)).toEqual([{ startSecs: 0, endSecs: 45 }]);
  });

  it('splits a long video into consecutive windows', () => {
    expect(clipSegments(540)).toEqual([
      { startSecs: 0, endSecs: 180 },
      { startSecs: 180, endSecs: 360 },
      { startSecs: 360, endSecs: 540 },
    ]);
  });

  it('pulls the last window back so it ends with the video', () => {
    const segments = clipSegments(600);
    expect(segments[segments.length - 1]).toEqual({ startSecs: 420, endSecs: 600 });
    expect(segments.every((window) => window.endSecs <= 600)).toBe(true);
  });

  it('drops a tail window that clamps onto the one before it', () => {
    // 181s: the second window would clamp to start 1 — near-identical to the
    // first, and a choice between them would be meaningless.
    const segments = clipSegments(181);
    const starts = segments.map((window) => window.startSecs);
    expect(new Set(starts).size).toBe(starts.length);
  });

  it('covers the whole video across its windows', () => {
    for (const duration of [30, 180, 181, 360, 600, 3600]) {
      const segments = clipSegments(duration);
      expect(segments.at(0)?.startSecs).toBe(0);
      expect(segments.at(-1)?.endSecs).toBe(duration);
    }
  });

  it('always offers at least one window, even for nothing', () => {
    expect(clipSegments(0)).toEqual([{ startSecs: 0, endSecs: 0 }]);
  });

  it('never offers a window longer than the ceiling', () => {
    for (const duration of [30, 181, 600, 3600]) {
      for (const window of clipSegments(duration)) {
        expect(clipLengthSecs(window)).toBeLessThanOrEqual(MAX_CLIP_SECONDS);
      }
    }
  });
});

describe('planUpload', () => {
  it('passes a normal set straight through', () => {
    expect(planUpload({ durationSecs: 40, byteLength: 8 * MB })).toEqual({
      kind: 'ok',
      window: { startSecs: 0, endSecs: 40 },
    });
  });

  it('accepts a video exactly at the ceiling without asking for a clip', () => {
    const plan = planUpload({ durationSecs: MAX_CLIP_SECONDS, byteLength: 20 * MB });
    expect(plan.kind).toBe('ok');
  });

  it('asks for a clip one second over the ceiling', () => {
    const plan = planUpload({ durationSecs: MAX_CLIP_SECONDS + 1, byteLength: 20 * MB });
    expect(plan).toEqual({
      kind: 'clip',
      durationSecs: 181,
      window: { startSecs: 0, endSecs: 180 },
    });
  });

  it('rejects a file over the byte cap', () => {
    expect(planUpload({ durationSecs: 40, byteLength: MAX_UPLOAD_BYTES + 1 })).toEqual({
      kind: 'too_large',
      byteLength: MAX_UPLOAD_BYTES + 1,
    });
  });

  it('accepts a file exactly at the byte cap', () => {
    expect(planUpload({ durationSecs: 40, byteLength: MAX_UPLOAD_BYTES }).kind).toBe('ok');
  });

  it('rejects a file too short to hold anything', () => {
    expect(planUpload({ durationSecs: 0, byteLength: 2048 })).toEqual({ kind: 'too_short' });
    expect(planUpload({ durationSecs: 0.4, byteLength: 2048 })).toEqual({ kind: 'too_short' });
  });

  /*
   * The ordering rule, stated as a test because it is the one design decision
   * in this module a future edit could quietly reverse.
   */
  it('says too large rather than offering a window it could never upload', () => {
    const plan = planUpload({ durationSecs: 600, byteLength: 400 * MB });
    expect(plan.kind).toBe('too_large');
  });

  it('says too short before too large, so an empty file is not blamed on its size', () => {
    const plan = planUpload({ durationSecs: 0, byteLength: 400 * MB });
    expect(plan.kind).toBe('too_short');
  });

  it('never returns a window longer than the ceiling', () => {
    for (const durationSecs of [1, 60, 179, 180, 181, 600, 7200]) {
      const plan = planUpload({ durationSecs, byteLength: 10 * MB });
      if (plan.kind === 'ok' || plan.kind === 'clip') {
        expect(clipLengthSecs(plan.window)).toBeLessThanOrEqual(MAX_CLIP_SECONDS);
      }
    }
  });
});

describe('videoContentRect', () => {
  it('fills a view that matches the video exactly', () => {
    expect(videoContentRect({ width: 90, height: 160 }, 9 / 16)).toEqual({
      left: 0,
      top: 0,
      width: 90,
      height: 160,
    });
  });

  it('puts bars top and bottom when the view is taller than the video', () => {
    // A landscape clip on a phone. This is the case that made the bug matter:
    // the bars are most of the screen.
    const rect = videoContentRect({ width: 400, height: 800 }, 16 / 9);
    expect(rect.width).toBe(400);
    expect(rect.height).toBeCloseTo(225, 6);
    expect(rect.top).toBeCloseTo(287.5, 6);
    expect(rect.left).toBe(0);
  });

  it('puts bars down the sides when the view is wider than the video', () => {
    const rect = videoContentRect({ width: 800, height: 400 }, 9 / 16);
    expect(rect.height).toBe(400);
    expect(rect.width).toBeCloseTo(225, 6);
    expect(rect.left).toBeCloseTo(287.5, 6);
    expect(rect.top).toBe(0);
  });

  it('is empty for a view or an aspect ratio that cannot be drawn into', () => {
    expect(videoContentRect({ width: 0, height: 100 }, 1)).toEqual(EMPTY);
    expect(videoContentRect({ width: 100, height: 0 }, 1)).toEqual(EMPTY);
    expect(videoContentRect({ width: 100, height: 100 }, 0)).toEqual(EMPTY);
    expect(videoContentRect({ width: 100, height: 100 }, -1)).toEqual(EMPTY);
    expect(videoContentRect({ width: 100, height: 100 }, Number.NaN)).toEqual(EMPTY);
  });
});

describe('tapToFrameFraction', () => {
  const view = { width: 90, height: 160 };

  it('reads the centre of a perfectly fitted video as the centre of the frame', () => {
    expect(tapToFrameFraction({ x: 45, y: 80 }, view, 9 / 16)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('reads the corners as the corners', () => {
    expect(tapToFrameFraction({ x: 0, y: 0 }, view, 9 / 16)).toEqual({ x: 0, y: 0 });
    expect(tapToFrameFraction({ x: 90, y: 160 }, view, 9 / 16)).toEqual({ x: 1, y: 1 });
  });

  it('discounts the letterbox instead of measuring against the view', () => {
    // A landscape clip in a portrait view: 225pt of picture centred in 800pt,
    // so the top of the frame is at y=287.5 and the middle at y=400.
    const tall = { width: 400, height: 800 };
    expect(tapToFrameFraction({ x: 200, y: 400 }, tall, 16 / 9)).toEqual({ x: 0.5, y: 0.5 });

    // Measured against the VIEW, that same tap would have read y=0.5 as well —
    // so the test that matters is a tap that is NOT in the middle.
    const upper = tapToFrameFraction({ x: 200, y: 343.75 }, tall, 16 / 9);
    expect(upper?.y).toBeCloseTo(0.25, 4);
  });

  it('refuses a tap in the bars rather than clamping it to the edge', () => {
    // Clamping would record the border of the picture as a deliberate choice,
    // and the tracker would follow whatever sits there.
    const tall = { width: 400, height: 800 };
    expect(tapToFrameFraction({ x: 200, y: 10 }, tall, 16 / 9)).toBeNull();
    expect(tapToFrameFraction({ x: 200, y: 790 }, tall, 16 / 9)).toBeNull();

    const wide = { width: 800, height: 400 };
    expect(tapToFrameFraction({ x: 10, y: 200 }, wide, 9 / 16)).toBeNull();
    expect(tapToFrameFraction({ x: 790, y: 200 }, wide, 9 / 16)).toBeNull();
  });

  it('refuses a tap when there is nothing drawn yet', () => {
    expect(tapToFrameFraction({ x: 5, y: 5 }, { width: 0, height: 0 }, 9 / 16)).toBeNull();
    expect(tapToFrameFraction({ x: 5, y: 5 }, view, 0)).toBeNull();
  });

  it('rounds finely enough that a fingertip is the limit, not the maths', () => {
    const point = tapToFrameFraction({ x: 30, y: 50 }, view, 9 / 16);
    // A fifth of a pixel on a 1080-wide frame.
    expect(point?.x).toBeCloseTo(1 / 3, 4);
    expect(point?.y).toBeCloseTo(0.3125, 4);
  });
});
