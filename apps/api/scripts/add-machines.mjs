/**
 * Adds the plate-loaded and selectorised machines the catalogue was missing.
 *
 * Written into `content/exercises.seed.json` rather than the database, so the
 * additions land as reviewable data (FR-ADM-07) and reach every environment
 * through the ordinary seed path.
 *
 * Idempotent: re-running skips anything whose slug already exists.
 *
 *   node scripts/add-machines.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const seedPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../content/exercises.seed.json',
);

const seed = JSON.parse(await readFile(seedPath, 'utf8'));
const known = new Set(seed.taxonomy.muscles.map((m) => m.slug));
const existing = new Set(seed.exercises.map((e) => e.slug));

/**
 * Plate-loaded machines get their own equipment slug.
 *
 * Not pedantry: a plate-loaded press and a selectorised one load differently,
 * feel different at the same nominal weight, and the search filter is more
 * useful when it can tell them apart.
 */
if (!seed.taxonomy.equipment.some((e) => e.slug === 'plate-loaded')) {
  seed.taxonomy.equipment.push({ slug: 'plate-loaded', name: 'Plate-loaded machine' });
}

/**
 * Deliberately excluded, because the catalogue already had them under a
 * different name: Assisted Pull-Up, Hip Abduction, Hip Adduction, Seated and
 * Standing Calf Raise, Belt Squat, Machine Row.
 *
 * The first run of this script added all seven anyway, because it checked for
 * an existing SLUG rather than an existing movement — so the catalogue briefly
 * listed 'Hip Abduction' next to 'Hip Abduction Machine'. A duplicate is worse
 * than a gap: it makes the user choose between two identical things and splits
 * their history across both.
 */
const MACHINES = [
  // ---------------------------------------------------------------- chest --
  {
    slug: 'machine-chest-press',
    name: 'Machine Chest Press',
    equipment: 'machine',
    primary: ['pectoralis-major'],
    secondary: ['anterior-deltoid', 'triceps-brachii'],
    instructions:
      'Set the seat so the handles sit level with the middle of your chest. Press without slamming the elbows straight at the end.',
  },
  {
    slug: 'incline-plate-loaded-chest-press',
    name: 'Incline Plate-Loaded Chest Press',
    equipment: 'plate-loaded',
    primary: ['pectoralis-major'],
    secondary: ['anterior-deltoid', 'triceps-brachii'],
    instructions:
      'The incline shifts the work toward the upper chest. Plate-loaded arms move independently, so neither side can quietly carry the other.',
  },
  {
    slug: 'decline-chest-press-machine',
    name: 'Decline Chest Press Machine',
    equipment: 'machine',
    primary: ['pectoralis-major'],
    secondary: ['triceps-brachii'],
    instructions:
      'The decline angle favours the lower chest. Keep your shoulders pinned back against the pad throughout.',
  },
  {
    slug: 'seated-machine-fly',
    name: 'Seated Machine Fly',
    equipment: 'machine',
    primary: ['pectoralis-major'],
    secondary: ['anterior-deltoid'],
    instructions:
      'Elbows slightly bent and then fixed. The movement happens at the shoulder, not the elbow.',
  },

  // ----------------------------------------------------------------- back --
  {
    slug: 'chest-supported-row-machine',
    name: 'Chest-Supported Row Machine',
    equipment: 'machine',
    primary: ['latissimus-dorsi'],
    secondary: ['rhomboids', 'trapezius', 'posterior-deltoid'],
    instructions:
      'The pad takes the lower back out of it completely, which is the point: everything goes to the upper back.',
  },
  {
    slug: 'machine-pullover',
    name: 'Machine Pullover',
    equipment: 'machine',
    primary: ['latissimus-dorsi'],
    secondary: ['triceps-brachii', 'teres-major'],
    instructions:
      'One of the few machines that loads the lats without the biceps doing much of the work. Move at the shoulder, keeping the elbows fixed.',
  },

  // ------------------------------------------------------ shoulders, arms --
  {
    slug: 'machine-shoulder-press',
    name: 'Machine Shoulder Press',
    equipment: 'machine',
    primary: ['anterior-deltoid'],
    secondary: ['lateral-deltoid', 'triceps-brachii'],
    instructions:
      'Press overhead with your back flat against the pad, stopping just short of locking out.',
  },
  {
    slug: 'machine-lateral-raise',
    name: 'Machine Lateral Raise',
    equipment: 'machine',
    primary: ['lateral-deltoid'],
    secondary: ['anterior-deltoid'],
    instructions:
      'The machine holds tension through the whole range, which dumbbells lose at the bottom.',
  },
  {
    slug: 'reverse-pec-deck',
    name: 'Reverse Pec Deck',
    equipment: 'machine',
    primary: ['posterior-deltoid'],
    secondary: ['rhomboids', 'trapezius'],
    instructions:
      'The rear delts get almost nothing from pressing, so this is where they get trained. Light weight, controlled.',
  },
  {
    slug: 'machine-biceps-curl',
    name: 'Machine Biceps Curl',
    equipment: 'machine',
    primary: ['biceps-brachii'],
    secondary: ['brachialis', 'forearm-flexors'],
    instructions:
      'The pad fixes your upper arm so the weight cannot be swung. That is the whole advantage over a dumbbell.',
  },
  {
    slug: 'machine-triceps-extension',
    name: 'Machine Triceps Extension',
    equipment: 'machine',
    primary: ['triceps-brachii'],
    secondary: [],
    instructions:
      'Keep the elbows against the pad. If they drift forward, the chest has started helping.',
  },

  // ----------------------------------------------------------------- legs --
  {
    slug: 'vertical-leg-press',
    name: 'Vertical Leg Press',
    equipment: 'plate-loaded',
    primary: ['quadriceps'],
    secondary: ['gluteus-maximus', 'hamstrings'],
    instructions:
      'The load sits directly above you, so it feels heavier than a 45-degree press at the same weight. Do not let the lower back peel off the pad at the bottom.',
  },
  {
    slug: 'horizontal-leg-press',
    name: 'Horizontal Leg Press',
    equipment: 'machine',
    primary: ['quadriceps'],
    secondary: ['gluteus-maximus', 'hamstrings'],
    instructions:
      'Seated rather than angled. Kinder to the lower back than the 45-degree version, and a sensible place to start.',
  },
  {
    slug: 'pendulum-squat',
    name: 'Pendulum Squat',
    equipment: 'plate-loaded',
    primary: ['quadriceps'],
    secondary: ['gluteus-maximus', 'adductors'],
    instructions:
      'The arc keeps the load over your feet through the whole range, so the knees track naturally. Go deep.',
  },
  {
    slug: 'smith-machine-squat',
    name: 'Smith Machine Squat',
    equipment: 'smith-machine',
    primary: ['quadriceps'],
    secondary: ['gluteus-maximus', 'hamstrings'],
    instructions:
      'The fixed bar path lets you set your feet further forward than a free squat allows, which shifts work onto the quads.',
  },
  {
    slug: 'glute-kickback-machine',
    name: 'Glute Kickback Machine',
    equipment: 'machine',
    primary: ['gluteus-maximus'],
    secondary: ['hamstrings'],
    unilateral: true,
    instructions:
      'One leg at a time. Drive through the heel and stop when the hip is straight — arching past that is the lower back, not the glute.',
  },
];

let added = 0;
const unknown = [];

for (const machine of MACHINES) {
  if (existing.has(machine.slug)) continue;

  for (const muscle of [...machine.primary, ...machine.secondary]) {
    if (!known.has(muscle)) unknown.push(`${machine.slug}: ${muscle}`);
  }

  seed.exercises.push({
    slug: machine.slug,
    name: machine.name,
    description: null,
    instructions: machine.instructions,
    equipment: machine.equipment,
    kind: 'strength',
    isUnilateral: machine.unilateral === true,
    primaryMuscles: machine.primary.filter((m) => known.has(m)),
    secondaryMuscles: machine.secondary.filter((m) => known.has(m)),
    movementPattern: null,
    media: [],
  });
  added += 1;
}

seed.exercises.sort((a, b) => a.slug.localeCompare(b.slug));
await writeFile(seedPath, `${JSON.stringify(seed, null, 2)}\n`, 'utf8');

const cardio = seed.exercises.filter((e) => e.kind === 'cardio').length;
console.log(`added ${added} machines`);
console.log(`${seed.exercises.length} exercises total, of which ${cardio} are cardio`);
console.log(unknown.length ? `UNKNOWN MUSCLES: ${unknown.join(', ')}` : 'every muscle slug exists');
