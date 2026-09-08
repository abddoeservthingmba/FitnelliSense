/**
 * Running the analyzer, and reading the bar path back.
 *
 * A SUBPROCESS AND A FILE, rather than a service to call. The analyzer is
 * Python — opencv, numpy and scipy, pinned exactly — and the alternatives are
 * an HTTP service (a second thing to deploy, health-check and secure, for one
 * caller) or a port of the tracker to TypeScript (there is no equivalent of
 * `cv2.HoughCircles`). A process that reads a file and writes a file is the
 * smallest interface that works, and it fails in exactly one way: a non-zero
 * exit with stderr attached.
 *
 * WHAT COMES BACK IS A PATH, NOT AN ANSWER. The analyzer tracks; the metrics a
 * lifter reads are computed by `@fi/domain` in `measure.ts`. See
 * `services/analyzer/src/analyzer/barpath.py` for why that seam is there.
 */
import { spawn } from 'node:child_process';
import { z } from 'zod';
import type { BarSeed } from '@fi/shared';

/**
 * The payload `--emit-path` writes.
 *
 * Mirrors `PATH_SCHEMA_VERSION` in barpath.py. PARSED, NOT CAST — the analyzer
 * is released independently of this worker, so this schema is the only thing
 * standing between a contract change over there and a silent `undefined`
 * reaching a calibration divide over here.
 */
export const barPathPayloadSchema = z.object({
  path_schema_version: z.string(),
  status: z.enum(['ok', 'insufficient_quality']),
  reason: z.string().nullable(),
  fps: z.number().nullable(),
  frame_count: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  /** The plate's RADIUS. Doubled before calibrating — see measure.ts. */
  plate_radius_px: z.number().nullable(),
  quality: z.object({
    coherence: z.number().nullable(),
    radius_spread: z.number().nullable(),
    travel_plate_radii: z.number().nullable(),
  }),
  /** `[tMs, x, y]` per located frame, in source pixels of the upright frame. */
  samples: z.array(z.tuple([z.number(), z.number(), z.number()])),
});

export type BarPathPayload = z.infer<typeof barPathPayloadSchema>;

/**
 * The major version of the path contract this worker understands.
 *
 * Checked rather than assumed. A MAJOR bump on the analyzer side means a field
 * changed meaning, and the failure mode of ignoring that is not a crash — it
 * is a plausible number computed from the wrong thing.
 */
const SUPPORTED_PATH_MAJOR = '1';

export class AnalyzerError extends Error {}

export interface RunOptions {
  readonly python: string;
  readonly analyzerDir: string;
  readonly video: string;
  readonly out: string;
  readonly exercise: string;
  readonly seed: BarSeed | null;
  readonly timeoutMs: number;
}

/** The arguments, built where they can be asserted on without spawning. */
export function analyzerArgs(options: RunOptions): string[] {
  const args = [
    '-m',
    'analyzer.cli',
    '--video',
    options.video,
    '--exercise',
    options.exercise,
    // Bar tracking does not use the view, and no view detector exists yet
    // (stage 4). Stated rather than omitted because the flag is required, and
    // 'side' is the only view the capture guide asks for.
    '--view',
    'side',
    '--emit-path',
    options.out,
  ];

  if (options.seed !== null) {
    // FRACTIONS, passed through as fractions. The analyzer resolves them
    // against the frames it actually decodes, which is the only place that
    // knows the post-rotation size — and asking either side of this boundary
    // to reason about container rotation is what had the pipeline measuring
    // deadlifts sideways for three iterations.
    args.push('--seed-frac', `${options.seed.x},${options.seed.y},${options.seed.atSecs}`);
  }

  return args;
}

export async function runAnalyzer(options: RunOptions): Promise<void> {
  const args = analyzerArgs(options);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(options.python, args, {
      cwd: options.analyzerDir,
      // The analyzer is installed as an editable package in its own venv, but
      // `src` on PYTHONPATH means this works against a plain checkout too.
      env: { ...process.env, PYTHONPATH: `${options.analyzerDir}/src` },
    });

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      // Bounded: a runaway traceback must not become the worker's memory
      // problem, and the first 8 KB has always been where the cause is.
      if (stderr.length < 8_192) stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(
        new AnalyzerError(
          `the analyzer did not finish within ${Math.round(options.timeoutMs / 1000)}s`,
        ),
      );
    }, options.timeoutMs);

    child.on('error', (cause) => {
      clearTimeout(timer);
      reject(new AnalyzerError(`could not start the analyzer: ${cause.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      reject(new AnalyzerError(`the analyzer exited ${code}: ${stderr.trim() || 'no output'}`));
    });
  });
}

/** Validate a payload and refuse a contract this worker cannot read. */
export function parseBarPath(raw: unknown): BarPathPayload {
  const payload = barPathPayloadSchema.parse(raw);
  const [major] = payload.path_schema_version.split('.');
  if (major !== SUPPORTED_PATH_MAJOR) {
    throw new AnalyzerError(
      `the analyzer speaks bar-path ${payload.path_schema_version}, ` +
        `this worker understands ${SUPPORTED_PATH_MAJOR}.x`,
    );
  }
  return payload;
}
