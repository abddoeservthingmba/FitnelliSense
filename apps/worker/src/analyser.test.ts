/**
 * The boundary with the Python analyzer.
 *
 * Two things are worth testing without spawning anything: the arguments, and
 * the refusal to read a contract this worker does not understand. The second
 * matters more than it looks — the analyzer is released independently, and the
 * failure mode of ignoring a version bump is not a crash but a plausible
 * number computed from a field that changed meaning.
 */
import { describe, expect, it } from 'vitest';
import { analyzerArgs, AnalyzerError, parseBarPath } from './analyser';

const baseOptions = {
  python: 'python',
  analyzerDir: '/analyzer',
  video: '/tmp/set.mp4',
  out: '/tmp/path.json',
  exercise: 'deadlift',
  seed: null,
  timeoutMs: 60_000,
};

const validPayload = {
  path_schema_version: '1.0.0',
  status: 'ok' as const,
  reason: null,
  fps: 60,
  frame_count: 100,
  width: 1080,
  height: 1920,
  plate_radius_px: 168.75,
  quality: { coherence: 0.85, radius_spread: 1.4, travel_plate_radii: 4.4 },
  samples: [[0, 540, 1430] as [number, number, number]],
};

describe('analyzerArgs', () => {
  it('asks for the path rather than the result envelope', () => {
    expect(analyzerArgs(baseOptions)).toContain('--emit-path');
    expect(analyzerArgs(baseOptions)).toContain('/tmp/path.json');
  });

  it('omits the seed entirely when there was no tap', () => {
    const args = analyzerArgs(baseOptions);
    expect(args).not.toContain('--seed-frac');
    expect(args).not.toContain('--seed');
  });

  it('passes the tap as fractions, not pixels', () => {
    // The analyzer resolves them against the frames it decodes, which is the
    // only place that knows the post-rotation size. Sending pixels would put
    // the client in charge of reasoning about container rotation, which is what
    // had this pipeline measuring deadlifts sideways for three iterations.
    const args = analyzerArgs({ ...baseOptions, seed: { x: 0.2083, y: 0.75, atSecs: 0 } });
    expect(args).toContain('--seed-frac');
    expect(args[args.indexOf('--seed-frac') + 1]).toBe('0.2083,0.75,0');
  });

  it('carries the time of the tap, not just the point', () => {
    // A plate tapped at rest is somewhere else entirely by mid-pull, so the
    // moment has to travel with the coordinates.
    const args = analyzerArgs({ ...baseOptions, seed: { x: 0.5, y: 0.5, atSecs: 2.5 } });
    expect(args[args.indexOf('--seed-frac') + 1]).toBe('0.5,0.5,2.5');
  });

  it('names the exercise it was given', () => {
    const args = analyzerArgs({ ...baseOptions, exercise: 'back_squat' });
    expect(args[args.indexOf('--exercise') + 1]).toBe('back_squat');
  });
});

describe('parseBarPath', () => {
  it('accepts the contract it was built against', () => {
    expect(parseBarPath(validPayload).status).toBe('ok');
  });

  it('accepts a minor addition on the analyzer side', () => {
    // A MINOR bump means a field was added. Nothing this worker reads changed
    // meaning, so refusing would strand every clip for no reason.
    expect(parseBarPath({ ...validPayload, path_schema_version: '1.4.0' }).status).toBe('ok');
  });

  it('refuses a major version it cannot read', () => {
    expect(() => parseBarPath({ ...validPayload, path_schema_version: '2.0.0' })).toThrow(
      AnalyzerError,
    );
  });

  it('refuses a payload missing a field it divides by', () => {
    const { plate_radius_px: _dropped, ...without } = validPayload;
    expect(() => parseBarPath(without)).toThrow();
  });

  it('refuses a sample that is not a triple', () => {
    // `[tMs, x, y]`. A pair would read x as y and produce a bar path at right
    // angles to the lift.
    expect(() => parseBarPath({ ...validPayload, samples: [[0, 540]] })).toThrow();
  });

  it('keeps an abstention as an abstention', () => {
    const refused = parseBarPath({
      ...validPayload,
      status: 'insufficient_quality',
      reason: 'bar_not_tracked',
      plate_radius_px: null,
      samples: [],
    });
    expect(refused.status).toBe('insufficient_quality');
    expect(refused.reason).toBe('bar_not_tracked');
  });
});
