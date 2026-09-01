/**
 * Attaches movement demonstration images to the seeded catalogue.
 *
 * Source: yuhonas/free-exercise-db — 876 exercises under **The Unlicense**
 * (public domain, commercial use explicit). Two frames per exercise, start and
 * end position, which the client alternates into a movement animation.
 *
 * This writes into `content/exercises.seed.json` rather than the database, so
 * the media lands as reviewable data in a pull request (FR-ADM-07) and is then
 * imported with recorded provenance by the ordinary seed path. Nothing here
 * bypasses §6.8: every entry carries source, licence and attribution.
 *
 * **Matching is deliberately strict.** Showing a leg press on the bench press
 * page is worse than showing nothing, so a match must clear a high similarity
 * bar and unmatched exercises are simply left with their placeholder. The
 * script prints every match and every rejection for review.
 *
 *   node scripts/import-movement-media.mjs           # report only
 *   node scripts/import-movement-media.mjs --write   # update the seed file
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATASET =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
/** jsDelivr rather than raw.githubusercontent: a CDN, and meant for hotlinking. */
const CDN = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises';
const SOURCE_URL = 'https://github.com/yuhonas/free-exercise-db';
const SOURCE_NAME = 'free-exercise-db';
const LICENCE = 'public_domain';
const LICENCE_URL = 'https://github.com/yuhonas/free-exercise-db/blob/main/LICENSE.md';

/**
 * Their equipment vocabulary mapped onto ours, so a name whose only extra word
 * is the equipment can still match.
 */
const EQUIPMENT_ALIASES = {
  barbell: ['barbell'],
  dumbbell: ['dumbbell', 'dumbbells'],
  cable: ['cable', 'cables'],
  machine: ['machine', 'lever', 'sled'],
  'body only': ['bodyweight', 'body'],
  kettlebells: ['kettlebell', 'kettlebells'],
  'e-z curl bar': ['ez', 'bar', 'curl'],
  bands: ['band', 'bands', 'resistance'],
  'medicine ball': ['medicine', 'ball'],
  'exercise ball': ['exercise', 'ball', 'stability'],
};

/** Our equipment slug, as their vocabulary would name it. */
const OUR_EQUIPMENT_TO_THEIRS = {
  barbell: 'barbell',
  dumbbell: 'dumbbell',
  kettlebell: 'kettlebells',
  'ez-bar': 'e-z curl bar',
  'trap-bar': 'barbell',
  machine: 'machine',
  cable: 'cable',
  'smith-machine': 'machine',
  bodyweight: 'body only',
  'resistance-band': 'bands',
  'medicine-ball': 'medicine ball',
  sled: 'machine',
  other: null,
};

/**
 * Words that carry no distinguishing meaning and may differ freely.
 *
 * Kept deliberately tiny. An earlier version also ignored "front" and "bar",
 * which produced "Front Squat ← Barbell Squat" and "Pull-Up ← V-Bar Pullup" —
 * both different movements. Any word that could name a variant belongs out of
 * this set.
 */
const IGNORABLE = new Set(['grip', 'medium', 'gym']);

/**
 * Hand-checked pairings where the two catalogues name the same movement
 * differently enough that no rule could equate them.
 *
 * Every line here is a claim that these are the same lift, and I have checked
 * each one against the dataset's own instructions. They are listed explicitly
 * rather than inferred precisely so that a wrong one is visible in review.
 */
const EXPLICIT_MATCHES = {
  'back-squat': 'Barbell Squat',
  'front-squat': 'Front Squat (Clean Grip)',
  'overhead-press': 'Barbell Shoulder Press',
  'seated-dumbbell-shoulder-press': 'Dumbbell Shoulder Press',
  'lat-pulldown': 'Wide-Grip Lat Pulldown',
  'barbell-row': 'Bent Over Barbell Row',
  'seated-cable-row': 'Seated Cable Rows',
  't-bar-row': 'T-Bar Row with Handle',
  'pull-up': 'Pullups',
  'push-up': 'Pushups',
  'dumbbell-fly': 'Dumbbell Flyes',
  'dumbbell-lateral-raise': 'Side Lateral Raise',
  'hammer-curl': 'Hammer Curls',
  'skull-crusher': 'EZ-Bar Skullcrusher',
  'leg-extension': 'Leg Extensions',
  'lying-leg-curl': 'Lying Leg Curls',
  crunch: 'Crunches',
  'triceps-dip': 'Dips - Triceps Version',
  'chest-dip': 'Dips - Chest Version',
  'bench-dip': 'Bench Dips',
};

const seedPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../content/exercises.seed.json',
);

/** Words that carry no distinguishing meaning between exercise names. */
const NOISE = new Set(['the', 'a', 'with', 'and', 'of', 'to', 'on', 'in', 'up', 'exercise']);

function tokens(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word.length > 1 && !NOISE.has(word));
}

/** Spelling differences that are not meaning differences. */
const SYNONYMS = new Map([
  ['pullup', 'pull'],
  ['pushup', 'push'],
  ['chinup', 'chin'],
  ['situp', 'sit'],
  ['dumbbells', 'dumbbell'],
  ['kettlebells', 'kettlebell'],
  ['bands', 'band'],
  ['ez', 'ez'],
  ['e', 'ez'],
  ['z', 'ez'],
]);

function normalised(name) {
  return new Set(tokens(name).map((word) => SYNONYMS.get(word) ?? word));
}

/**
 * Whether two names describe the same movement.
 *
 * Not a similarity score with a threshold — that is how "Barbell Bench Press"
 * ends up illustrated by a *Guillotine* bench press, which is a different lift
 * aimed at a different part of the chest. A score cannot distinguish a harmless
 * extra word from a disqualifying one.
 *
 * So the rule is exact token equivalence, with two principled exemptions: a
 * word that merely names the equipment we already record, and a small set of
 * genuinely empty words. Anything else unexplained means "not the same
 * movement", and the exercise keeps its placeholder.
 */
function describesSameMovement(ourExercise, theirExercise) {
  const ours = normalised(ourExercise.name);
  const theirs = normalised(theirExercise.name);

  const theirEquipmentWords = new Set(
    (EQUIPMENT_ALIASES[theirExercise.equipment] ?? []).map(
      (word) => SYNONYMS.get(word) ?? word,
    ),
  );

  const explainable = (word, equipmentWords) =>
    IGNORABLE.has(word) || equipmentWords.has(word);

  // Words in their name that ours does not have.
  for (const word of theirs) {
    if (ours.has(word)) continue;
    if (!explainable(word, theirEquipmentWords)) return false;
  }

  // Words in our name that theirs does not have. Equipment we record but they
  // omit is fine; anything else is a real difference.
  const ourEquipmentWords = new Set(
    (EQUIPMENT_ALIASES[OUR_EQUIPMENT_TO_THEIRS[ourExercise.equipment ?? 'other'] ?? ''] ?? []).map(
      (word) => SYNONYMS.get(word) ?? word,
    ),
  );
  for (const word of ours) {
    if (theirs.has(word)) continue;
    if (!explainable(word, ourEquipmentWords)) return false;
  }

  // And the equipment itself must not contradict.
  const expected = OUR_EQUIPMENT_TO_THEIRS[ourExercise.equipment ?? 'other'];
  if (expected && theirExercise.equipment && expected !== theirExercise.equipment) return false;

  return true;
}

function mediaEntry(imagePath, isPrimary) {
  return {
    kind: 'image',
    delivery: 'external_embed',
    externalUrl: `${CDN}/${imagePath}`,
    sourceUrl: SOURCE_URL,
    sourceName: SOURCE_NAME,
    licence: LICENCE,
    licenceUrl: LICENCE_URL,
    // Public domain requires no attribution, but crediting the source costs
    // nothing and makes the provenance visible rather than merely recorded.
    attributionText: 'Public domain via free-exercise-db',
    requiresAttribution: false,
    isPrimary,
  };
}

async function main() {
  const write = process.argv.includes('--write');

  const response = await fetch(DATASET);
  if (!response.ok) throw new Error(`Could not fetch the dataset: ${response.status}`);
  const dataset = await response.json();

  const withImages = dataset.filter((entry) => entry.images?.length > 0);
  console.log(`Dataset: ${dataset.length} exercises, ${withImages.length} with images\n`);

  const seed = JSON.parse(await readFile(seedPath, 'utf8'));

  const matched = [];
  const rejected = [];

  for (const exercise of seed.exercises) {
    const alias = EXPLICIT_MATCHES[exercise.slug];
    if (alias) {
      const named = withImages.find((candidate) => candidate.name === alias);
      if (named) {
        matched.push({ exercise, candidate: named });
        continue;
      }
      // A stale alias is a bug in this file, not a reason to guess.
      console.warn(`  ! alias not found in dataset: ${exercise.slug} → "${alias}"`);
    }

    const candidates = withImages.filter((candidate) =>
      describesSameMovement(exercise, candidate),
    );

    // Where several entries describe the same movement, take the one with the
    // shortest name: the least-qualified variant is the plainest illustration.
    const best = candidates.sort((a, b) => a.name.length - b.name.length)[0];

    if (best) matched.push({ exercise, candidate: best });
    else rejected.push(exercise.name);
  }

  console.log(`Matched ${matched.length} of ${seed.exercises.length}\n`);
  for (const entry of matched) {
    const exact = entry.exercise.name.toLowerCase() === entry.candidate.name.toLowerCase();
    console.log(
      `  ${exact ? ' ' : '~'} ${entry.exercise.name}${exact ? '' : `  ←  ${entry.candidate.name}`}`,
    );
  }

  console.log(`\nLeft with placeholders (${rejected.length}):`);
  console.log(`   ${rejected.join(', ')}`);

  if (!write) {
    console.log('\nReport only. Re-run with --write to update the seed file.');
    return;
  }

  for (const entry of matched) {
    // Replace rather than append, so re-running is idempotent.
    entry.exercise.media = entry.candidate.images
      .slice(0, 2)
      .map((image, index) => mediaEntry(image, index === 0));
  }

  await writeFile(seedPath, `${JSON.stringify(seed, null, 2)}\n`, 'utf8');
  const total = matched.reduce((sum, entry) => sum + Math.min(2, entry.candidate.images.length), 0);
  console.log(`\nWrote ${total} media entries across ${matched.length} exercises.`);
  console.log('Review the diff, then run: pnpm db:seed');
}

main().catch((error) => {
  console.error('Import failed:', error.message);
  process.exit(1);
});
