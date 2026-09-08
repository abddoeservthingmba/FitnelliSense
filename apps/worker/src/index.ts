/**
 * The analysis worker: the thing that was missing.
 *
 * Everything else in the video pipeline has existed for a while — consent, the
 * presigned upload, the analysis row and its states, the record screen and the
 * result screen. What no part of the system had was anything that looked at a
 * `queued` row. ADR 0005 said so plainly: "an uploaded clip reaches `queued`
 * and stays there until a worker exists". This is that worker.
 *
 * WHAT IT DOES, once per clip:
 *
 *   1. Claims the oldest queued analysis in one atomic UPDATE.
 *   2. Streams the video out of R2 to a temporary file.
 *   3. Runs the Python analyzer, which tracks the bar and writes its PATH.
 *   4. Hands that path to `@fi/domain`, which computes every published number.
 *   5. Writes the result, or a reason a user can act on.
 *
 * NO QUEUE, NO BROKER, NO CONTAINER. The BRD rules out Redis, Kafka and Docker
 * (§3.3.1), and none is needed: the queue is a column and claiming is a
 * conditional UPDATE, which is atomic on its own. The cost is a poll, and a
 * poll is a `SELECT` every few seconds.
 *
 * IT NEVER LEAVES A ROW IN `processing`. Every failure path below ends in
 * `fail` with a message written for the lifter, because a row stuck in
 * `processing` shows the user "Working on it" forever — the exact state the
 * client was changed to stop displaying.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyserExercise } from '@fi/domain';
import { AnalyzerError, parseBarPath, runAnalyzer } from './analyser';
import { loadConfig, type Config } from './config';
import { measure, NotMeasurable } from './measure';
import { createStorage, VideoMissing, type Storage } from './storage';
import { createStore, type Claimed, type Store } from './store';

/**
 * What the user is told when something broke on our side.
 *
 * ONE MESSAGE FOR EVERY INTERNAL FAULT, deliberately. A missing Python
 * interpreter, a full disk and a bug in the tracker are all the same event to
 * a lifter — we could not do the thing we said we would — and the detail
 * belongs in the log, where it is actionable, not on a screen where it is
 * alarming and reveals how the service is built.
 */
const INTERNAL_FAILURE = 'Something went wrong measuring this set. The video is safe.';

function log(event: string, fields: Record<string, unknown> = {}): void {
  /*
   * JSON to stdout, one line per event, matching the API's logger closely
   * enough that both can be read by the same eye. Never a video key, an email
   * or a user id — the analysis id is the only identifier logged, and it is the
   * one a support question actually arrives with.
   *
   * `process.stdout.write` rather than `console.log`, because the lint rule
   * that forbids `console.log` is right: it exists so that stray debugging does
   * not ship. Structured output is not debugging, and writing to the stream
   * directly says so rather than adding an override that would re-admit the
   * stray calls too.
   */
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), event, ...fields })}\n`);
}

/**
 * Analyse one claimed row. Returns the message to fail with, or null on success.
 *
 * Returning the message rather than writing it keeps every database write in
 * `runOnce`, so there is exactly one place that decides a row's final state.
 */
async function analyse(
  analysis: Claimed,
  config: Config,
  store: Store,
  storage: Storage,
): Promise<string | null> {
  const slug = await store.exerciseSlug(analysis);
  const exercise = analyserExercise(slug);
  if (exercise === null) {
    // The API checks this before queueing, so reaching here means the
    // catalogue changed under a clip that was already in flight. Reported as
    // the fact it is rather than as an error.
    return 'This lift is not one we can measure.';
  }

  /*
   * A clip whose analysed window is not the whole file is refused rather than
   * silently analysed in full.
   *
   * The window exists so someone can pick which three minutes of a long
   * recording to measure, and honouring it needs the decoder to skip frames —
   * which the analyzer does not do yet. Analysing the whole file instead would
   * measure a part of the video the lifter did not choose and report it as if
   * they had. The 80 MB upload cap makes this rare; it is not made impossible.
   */
  if (analysis.clipStartSecs > 0) {
    return 'Analysing part of a longer video is not supported yet. Film the set on its own.';
  }

  const scratch = await mkdtemp(join(tmpdir(), 'fi-analysis-'));
  try {
    const video = join(scratch, 'set.mp4');
    const pathFile = join(scratch, 'path.json');

    await storage.download(analysis.videoR2Key, video);

    await runAnalyzer({
      python: config.ANALYZER_PYTHON,
      analyzerDir: config.ANALYZER_DIR,
      video,
      out: pathFile,
      exercise,
      seed: analysis.seed,
      timeoutMs: config.ANALYSIS_TIMEOUT_MS,
    });

    const payload = parseBarPath(JSON.parse(await readFile(pathFile, 'utf8')));
    log('tracked', {
      analysisId: analysis.id,
      status: payload.status,
      reason: payload.reason,
      samples: payload.samples.length,
      ...payload.quality,
    });

    if (payload.status !== 'ok') {
      return explain(payload.reason, analysis.seed !== null);
    }

    const { result, repCount } = measure(payload, exercise);
    await store.complete(analysis, result, repCount);
    log('measured', {
      analysisId: analysis.id,
      repCount,
      verticalRangeM: result.verticalRangeM,
      straightness: result.straightness,
    });
    return null;
  } catch (cause) {
    if (cause instanceof NotMeasurable || cause instanceof VideoMissing) {
      log('unmeasurable', { analysisId: analysis.id, detail: cause.message });
      return cause instanceof NotMeasurable ? cause.message : 'That video could not be found.';
    }
    if (cause instanceof AnalyzerError) {
      log('analyzer-failed', { analysisId: analysis.id, detail: cause.message });
      return INTERNAL_FAILURE;
    }
    log('worker-error', {
      analysisId: analysis.id,
      detail: cause instanceof Error ? cause.message : String(cause),
    });
    return INTERNAL_FAILURE;
  } finally {
    // The clip is somebody's face and their gym. It does not linger in a temp
    // directory once it has been measured.
    await rm(scratch, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Why a clip could not be measured, in words a lifter can act on.
 *
 * THE TAP IS THE ACTIONABLE PART. "We could not follow the bar" leaves someone
 * with nothing to change; the same sentence plus "point at the plate next
 * time" is a fix, and on the first real clip it was worth the difference
 * between 59% and 85% frame-to-frame coherence — between refusing the clip and
 * measuring it.
 */
function explain(reason: string | null, tapped: boolean): string {
  switch (reason) {
    case 'unreadable_video':
      return 'That video could not be opened.';
    case 'fps_below_minimum':
      return 'That video’s frame rate is too low to measure. Record at 30fps or higher.';
    case 'duration_too_long':
      return 'That clip is too long to measure. Film the set on its own.';
    case 'resolution_too_low':
      return 'That video is too small to measure. Record at 720p or higher.';
    case 'ambiguous_rotation':
      return 'We could not tell which way up that video is.';
    case 'bar_not_tracked':
      return tapped
        ? 'We lost track of the bar. Keep the plate in frame for the whole set, side on.'
        : 'We could not tell which plate to follow. Tap the plate before uploading and we can measure it.';
    default:
      return 'We could not measure this set.';
  }
}

async function runOnce(config: Config, store: Store, storage: Storage): Promise<boolean> {
  const analysis = await store.claim();
  if (analysis === null) return false;

  log('claimed', { analysisId: analysis.id, seeded: analysis.seed !== null });
  const started = Date.now();

  let failure: string | null;
  try {
    failure = await analyse(analysis, config, store, storage);
  } catch (cause) {
    // `analyse` handles its own errors; this is the last resort, and it exists
    // so that a bug in the error handling itself cannot strand a row.
    log('worker-error', {
      analysisId: analysis.id,
      detail: cause instanceof Error ? cause.message : String(cause),
    });
    failure = INTERNAL_FAILURE;
  }

  if (failure !== null) await store.fail(analysis, failure);
  log('finished', {
    analysisId: analysis.id,
    ms: Date.now() - started,
    outcome: failure === null ? 'complete' : 'failed',
  });
  return true;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const store = createStore(config);
  const storage = createStorage(config);
  const once = process.argv.includes('--once');

  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    log('stopping');
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  try {
    const recovered = await store.requeueAbandoned(config.ANALYSIS_TIMEOUT_MS);
    if (recovered > 0) log('requeued-abandoned', { count: recovered });

    log('started', { once, pollMs: config.POLL_INTERVAL_MS });

    do {
      const worked = await runOnce(config, store, storage);
      if (once) break;
      // Only sleep when there was nothing to do. Back to back while a backlog
      // exists, so a batch of clips does not drain at one every five seconds.
      if (!worked && !stopping) {
        await new Promise((resolve) => setTimeout(resolve, config.POLL_INTERVAL_MS));
      }
    } while (!stopping);
  } finally {
    await store.close();
    log('stopped');
  }
}

main().catch((cause: Error) => {
  // Configuration and connection failures land here. Exit non-zero so a
  // process supervisor sees a failure rather than a clean shutdown.
  console.error(cause.message);
  process.exit(1);
});
