/**
 * Where each muscle sits on the body diagram.
 *
 * Original artwork, deliberately: §6.8 forbids rendering media whose licence we
 * cannot state, and an anatomical illustration is exactly the kind of asset
 * that is easy to find and impossible to license casually. Drawing it as
 * geometry we own sidesteps that entirely — and it stays in sync with the
 * taxonomy, because it is keyed on the same muscle slugs.
 *
 * Schematic rather than anatomical: the job is "which part of me does this
 * work", answered at a glance, not a textbook plate.
 */

/** Both figures share this coordinate space. */
export const FIGURE_WIDTH = 120;
export const FIGURE_HEIGHT = 240;

export type BodyView = 'front' | 'back';

export interface Region {
  /** Rounded rectangle, in figure coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
  /** Drawn again mirrored across the centre line — limbs, mostly. */
  mirror?: boolean;
}

export interface MuscleShape {
  view: BodyView;
  regions: Region[];
}

const CENTRE = FIGURE_WIDTH / 2;

/** An x position measured outward from the centre line. */
function right(offsetFromCentre: number): number {
  return CENTRE + offsetFromCentre;
}

/**
 * The map. A muscle absent from here simply is not drawn — the diagram degrades
 * to the body outline rather than guessing at a location.
 */
export const MUSCLE_SHAPES: Record<string, MuscleShape> = {
  // ---- Front: chest and shoulders ----
  'pectoralis-major': {
    view: 'front',
    regions: [{ x: right(2), y: 56, w: 20, h: 18, r: 5, mirror: true }],
  },
  'pectoralis-minor': {
    view: 'front',
    regions: [{ x: right(4), y: 68, w: 14, h: 8, r: 3, mirror: true }],
  },
  'serratus-anterior': {
    view: 'front',
    regions: [{ x: right(16), y: 76, w: 8, h: 14, r: 3, mirror: true }],
  },
  'anterior-deltoid': {
    view: 'front',
    regions: [{ x: right(20), y: 50, w: 16, h: 16, r: 7, mirror: true }],
  },
  'lateral-deltoid': {
    view: 'front',
    regions: [{ x: right(32), y: 52, w: 12, h: 18, r: 6, mirror: true }],
  },

  // ---- Front: arms ----
  'biceps-brachii': {
    view: 'front',
    regions: [{ x: right(34), y: 72, w: 13, h: 26, r: 6, mirror: true }],
  },
  brachialis: {
    view: 'front',
    regions: [{ x: right(36), y: 92, w: 10, h: 12, r: 4, mirror: true }],
  },
  'forearm-flexors': {
    view: 'front',
    regions: [{ x: right(38), y: 104, w: 12, h: 30, r: 5, mirror: true }],
  },

  // ---- Front: core ----
  'rectus-abdominis': {
    view: 'front',
    regions: [{ x: CENTRE - 13, y: 80, w: 26, h: 34, r: 5 }],
  },
  obliques: {
    view: 'front',
    regions: [{ x: right(13), y: 82, w: 10, h: 30, r: 4, mirror: true }],
  },
  'transverse-abdominis': {
    view: 'front',
    regions: [{ x: CENTRE - 11, y: 100, w: 22, h: 16, r: 5 }],
  },
  'hip-flexors': {
    view: 'front',
    regions: [{ x: right(2), y: 116, w: 16, h: 12, r: 4, mirror: true }],
  },

  // ---- Front: legs ----
  quadriceps: {
    view: 'front',
    regions: [{ x: right(2), y: 128, w: 20, h: 44, r: 8, mirror: true }],
  },
  adductors: {
    view: 'front',
    regions: [{ x: right(1), y: 128, w: 9, h: 32, r: 4, mirror: true }],
  },
  'tibialis-anterior': {
    view: 'front',
    regions: [{ x: right(5), y: 178, w: 13, h: 36, r: 5, mirror: true }],
  },

  // ---- Back: upper ----
  trapezius: {
    view: 'back',
    regions: [
      { x: CENTRE - 22, y: 44, w: 44, h: 20, r: 8 },
      { x: CENTRE - 10, y: 60, w: 20, h: 18, r: 5 },
    ],
  },
  rhomboids: {
    view: 'back',
    regions: [{ x: CENTRE - 16, y: 62, w: 32, h: 16, r: 4 }],
  },
  'latissimus-dorsi': {
    view: 'back',
    regions: [{ x: right(3), y: 70, w: 22, h: 30, r: 8, mirror: true }],
  },
  'teres-major': {
    view: 'back',
    regions: [{ x: right(17), y: 66, w: 12, h: 12, r: 5, mirror: true }],
  },
  'erector-spinae': {
    view: 'back',
    regions: [{ x: CENTRE - 8, y: 78, w: 16, h: 40, r: 4 }],
  },
  'posterior-deltoid': {
    view: 'back',
    regions: [{ x: right(22), y: 50, w: 16, h: 16, r: 7, mirror: true }],
  },
  'rotator-cuff': {
    view: 'back',
    regions: [{ x: right(20), y: 58, w: 12, h: 10, r: 5, mirror: true }],
  },

  // ---- Back: arms ----
  'triceps-brachii': {
    view: 'back',
    regions: [{ x: right(34), y: 70, w: 13, h: 28, r: 6, mirror: true }],
  },
  'forearm-extensors': {
    view: 'back',
    regions: [{ x: right(38), y: 102, w: 12, h: 30, r: 5, mirror: true }],
  },

  // ---- Back: lower ----
  'gluteus-maximus': {
    view: 'back',
    regions: [{ x: right(2), y: 118, w: 20, h: 22, r: 8, mirror: true }],
  },
  'gluteus-medius': {
    view: 'back',
    regions: [{ x: right(18), y: 114, w: 11, h: 14, r: 5, mirror: true }],
  },
  hamstrings: {
    view: 'back',
    regions: [{ x: right(2), y: 140, w: 20, h: 38, r: 7, mirror: true }],
  },
  calves: {
    view: 'back',
    regions: [{ x: right(4), y: 180, w: 16, h: 34, r: 6, mirror: true }],
  },
};

/** Which views a set of muscles actually needs, so an empty figure is never shown. */
export function viewsFor(muscleSlugs: readonly string[]): BodyView[] {
  const views = new Set<BodyView>();
  for (const slug of muscleSlugs) {
    const shape = MUSCLE_SHAPES[slug];
    if (shape) views.add(shape.view);
  }
  return ['front', 'back'].filter((view): view is BodyView => views.has(view as BodyView));
}

/** Mirrors a region across the centre line. */
export function mirrored(region: Region): Region {
  return { ...region, x: FIGURE_WIDTH - region.x - region.w };
}
