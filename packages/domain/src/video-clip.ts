/**
 * What may be uploaded for form analysis, and what to do when it does not fit
 * (FR-VID-03, ADR 0006).
 *
 * THE THING TO UNDERSTAND ABOUT "CLIPPING" HERE: the app has no video
 * transcoder, so it cannot cut an MP4. What the user chooses is a WINDOW —
 * which 180 seconds of a longer recording should be analysed. The whole file
 * is uploaded and the window travels with it as two numbers.
 *
 * That distinction is not a detail, and it is why the size rule is separate
 * from the duration rule and checked first. Choosing a window shortens what
 * gets ANALYSED; it does not shorten what gets UPLOADED. A ten-minute video
 * that is too big to upload stays too big however narrow the window, so
 * offering a window there would be an interaction that cannot succeed.
 *
 * When a real trimmer exists, `clipWindow` is what it should cut to, and this
 * module keeps working unchanged.
 */

/**
 * The longest span that will be analysed.
 *
 * Three minutes is many times longer than a set — the reason it is not 60s is
 * that people film from the gallery, where a clip usually contains the walk-up,
 * the set and the rack.
 */
export const MAX_CLIP_SECONDS = 180;

/**
 * Matches `requestVideoUploadSchema.contentLength`. Kept here as the single
 * number both sides reason about; the schema is the enforcement.
 */
export const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;

/** Below this there is nothing to analyse — a stray file, or a bad pick. */
export const MIN_CLIP_SECONDS = 1;

export interface ClipWindow {
  /** Seconds from the start of the file. */
  readonly startSecs: number;
  readonly endSecs: number;
}

export function clipLengthSecs(window: ClipWindow): number {
  return window.endSecs - window.startSecs;
}

/**
 * The window that will be analysed, given where the user has put the handle.
 *
 * Total by construction rather than by guarding: the length is whichever is
 * smaller of the video and the ceiling, and the start is clamped so the window
 * can never run off the end. A start of 9999 on a 200-second video returns the
 * last 180 seconds rather than an error, because a slider dragged to the end
 * means "the end".
 */
export function clipWindow(durationSecs: number, startSecs: number): ClipWindow {
  const duration = Math.max(0, Math.floor(durationSecs));
  const length = Math.min(duration, MAX_CLIP_SECONDS);
  const latestStart = duration - length;
  const start = Math.min(Math.max(0, Math.floor(startSecs)), latestStart);
  return { startSecs: start, endSecs: start + length };
}

/**
 * The windows to offer someone choosing which part of a long video to analyse.
 *
 * Consecutive spans of the ceiling's length, so a nine-minute video becomes
 * three or four choices rather than a slider. Chosen over a slider on purpose:
 * a slider needs a dependency the app does not have and a preview it cannot
 * render, and "which third of the video is my set in" is the actual question —
 * nobody needs second-level precision to answer it.
 *
 * The last window is pulled back to end at the video's end rather than running
 * past it, so it can overlap the one before. That is deliberate: the final
 * choice should always mean "the end", whatever the arithmetic.
 */
export function clipSegments(durationSecs: number): ClipWindow[] {
  const duration = Math.max(0, Math.floor(durationSecs));
  const count = Math.max(1, Math.ceil(duration / MAX_CLIP_SECONDS));

  const windows: ClipWindow[] = [];
  for (let index = 0; index < count; index += 1) {
    const next = clipWindow(duration, index * MAX_CLIP_SECONDS);
    // A short tail can clamp onto the previous window. One copy is enough.
    const last = windows[windows.length - 1];
    if (last === undefined || last.startSecs !== next.startSecs) {
      windows.push(next);
    }
  }
  return windows;
}

export interface PickedVideo {
  readonly durationSecs: number;
  readonly byteLength: number;
}

/**
 * What should happen to a video the user just picked.
 *
 * `clip` is not a refusal — it is the upload proceeding with a window the user
 * gets to move first. Only `too_short` and `too_large` are dead ends.
 */
export type UploadPlan =
  | { readonly kind: 'ok'; readonly window: ClipWindow }
  | { readonly kind: 'clip'; readonly durationSecs: number; readonly window: ClipWindow }
  | { readonly kind: 'too_large'; readonly byteLength: number }
  | { readonly kind: 'too_short' };

/**
 * Order matters, and it is size before duration.
 *
 * A file over the cap cannot be uploaded at all, so sending the user to a
 * window picker first would end in a refusal after the work rather than
 * before it.
 */
export function planUpload(video: PickedVideo): UploadPlan {
  const duration = Math.floor(video.durationSecs);

  if (duration < MIN_CLIP_SECONDS) {
    return { kind: 'too_short' };
  }
  if (video.byteLength > MAX_UPLOAD_BYTES) {
    return { kind: 'too_large', byteLength: video.byteLength };
  }
  if (duration > MAX_CLIP_SECONDS) {
    return { kind: 'clip', durationSecs: duration, window: clipWindow(duration, 0) };
  }
  return { kind: 'ok', window: { startSecs: 0, endSecs: duration } };
}
