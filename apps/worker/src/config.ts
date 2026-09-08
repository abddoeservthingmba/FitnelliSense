/**
 * The worker's environment, validated once at boot.
 *
 * SEPARATE FROM THE API'S CONFIG ON PURPOSE. The API refuses to start without
 * JWT secrets, CORS origins and an email provider, none of which a worker has
 * any use for — sharing that schema would mean inventing values for half of it
 * and would make a missing worker variable look like an API misconfiguration.
 *
 * Every variable here is required except the poll interval. A worker that
 * starts with half its configuration and then fails on the first row it claims
 * has already marked that row `processing`, and the failure surfaces to a user
 * as a broken analysis rather than to us as a broken deployment.
 */
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  R2_ACCOUNT_ID: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),

  /**
   * The Python interpreter that has the analyzer's dependencies.
   *
   * Named explicitly rather than discovered on PATH. The analyzer pins numpy,
   * opencv and scipy exactly — because a minor version bump moves keypoint
   * values in the last decimal place and that is enough to flip a threshold —
   * and `python` on PATH is whatever was installed last.
   */
  ANALYZER_PYTHON: z.string().min(1),
  /** The analyzer package root: the directory holding `src/analyzer`. */
  ANALYZER_DIR: z.string().min(1),

  /**
   * How long to wait after finding nothing to do.
   *
   * A POLL RATHER THAN A QUEUE, and that is a decision the BRD already made:
   * no Redis, no Kafka (§3.3.1). The queue is a column, `status = 'queued'`,
   * and claiming is a conditional UPDATE — which is atomic without any of it.
   *
   * Five seconds is chosen against Neon's free tier rather than against
   * latency: the compute suspends when idle, so a tighter poll would keep it
   * awake continuously and spend the monthly allowance on finding nothing.
   */
  POLL_INTERVAL_MS: z.coerce.number().int().min(250).default(5_000),

  /** Give up on one clip after this long and mark it failed. */
  ANALYSIS_TIMEOUT_MS: z.coerce.number().int().min(10_000).default(10 * 60_000),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`The worker's environment is incomplete:\n${problems}`);
  }
  return parsed.data;
}
