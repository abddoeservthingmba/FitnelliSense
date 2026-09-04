/**
 * Turning a spoken sentence into a set.
 *
 *   "one set of incline dumbbell press with 35 kilos for 12 reps"
 *   -> 1 set · incline dumbbell press · 35 kg · 12 reps
 *
 * The request behind this is worth restating, because it shapes every decision
 * here: people short of time want to log a set without stopping to type. So
 * the parser has to cope with how people actually talk, not with a grammar —
 * word order varies, units are dropped, "reps" becomes "times", and
 * speech-to-text hands back "35 kgs" one time and "thirty five kilos" the next.
 *
 * TWO RULES.
 *
 * **It never guesses a number it was not given.** A missing weight comes back
 * as null and is listed in `missing`, so the UI can ask rather than invent.
 * Logging 80 kg because someone mumbled is worse than logging nothing.
 *
 * **It does not know the exercise catalogue.** It extracts a NAME as spoken and
 * leaves matching to the caller, which is the only way this module stays pure
 * and the only way the same phrase can resolve differently for two users with
 * different custom exercises.
 */

export type VoiceUnit = 'kg' | 'lb';

export interface VoiceLog {
  /** How many sets were described. Defaults to 1 — "bench 80 for 8" is one set. */
  readonly sets: number;
  /** The exercise as spoken, for the caller to match against the catalogue. */
  readonly exerciseQuery: string;
  /** Null when no weight was heard. Never invented. */
  readonly weight: number | null;
  /** The unit as spoken. Null when a number was heard with no unit. */
  readonly unit: VoiceUnit | null;
  readonly reps: number | null;
  /** What could not be found, so the caller can ask for exactly that. */
  readonly missing: readonly ('exercise' | 'weight' | 'reps')[];
}

/**
 * Spoken numbers, because dictation is inconsistent about them.
 *
 * Up to twenty plus the tens, which covers reps and set counts entirely. Weight
 * is nearly always dictated as digits, and "one hundred and seventeen point
 * five" is not worth the parser it would need.
 */
const WORD_NUMBERS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
};

/** Words that carry no meaning for us and only get in the way of the name. */
const FILLER = new Set([
  'a',
  'an',
  'the',
  'of',
  'at',
  'with',
  'for',
  'and',
  'on',
  'using',
  'did',
  'do',
  'log',
  'logged',
  'just',
  'i',
  'set',
  'sets',
  'rep',
  'reps',
  'repetition',
  'repetitions',
  'time',
  'times',
  'by',
  'x',
  'times',
]);

const KG_WORDS = new Set(['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms', 'kilogramme']);
const LB_WORDS = new Set(['lb', 'lbs', 'pound', 'pounds']);

/**
 * Normalises spoken number words into digits before anything else runs.
 *
 * "thirty five" becomes 35 rather than 30 and 5, which is the difference
 * between a plausible weight and two useless ones. Handles the tens-plus-units
 * pattern English actually uses, and "a hundred and ten".
 */
function digitise(words: readonly string[]): string[] {
  const out: string[] = [];

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index] as string;
    const value = WORD_NUMBERS[word];
    if (value === undefined) {
      out.push(word);
      continue;
    }

    let total = value;
    let consumed = index;

    /*
     * "two hundred" — the hundred multiplies what came before it. Checked
     * first, and separately from bare "hundred" (which "a hundred" reduces to,
     * since "a" is not a number word), because reading those two the same way
     * turned "a hundred and twenty" into 20.
     */
    if (WORD_NUMBERS[words[consumed + 1] ?? ''] === 100 && total < 100) {
      total *= 100;
      consumed += 1;
    }

    // "and" between hundreds and the remainder carries no value.
    if (total >= 100 && (words[consumed + 1] ?? '') === 'and') consumed += 1;

    // The remainder: "thirty five", "a hundred and twenty", "…and twenty five".
    let next = WORD_NUMBERS[words[consumed + 1] ?? ''];
    if (next !== undefined && total >= 100 && next < 100) {
      total += next;
      consumed += 1;
      // And once more for "a hundred and twenty five".
      next = WORD_NUMBERS[words[consumed + 1] ?? ''];
      if (next !== undefined && next < 10 && total % 10 === 0) {
        total += next;
        consumed += 1;
      }
    } else if (next !== undefined && total >= 20 && total < 100 && total % 10 === 0 && next < 10) {
      total += next;
      consumed += 1;
    }

    out.push(String(total));
    index = consumed;
  }

  return out;
}

interface Quantity {
  readonly value: number;
  /** The token index it was found at, so nearby words can be inspected. */
  readonly at: number;
}

/** Every number in the sentence, in order, with where it sat. */
function quantities(words: readonly string[]): Quantity[] {
  const found: Quantity[] = [];
  words.forEach((word, at) => {
    // Allows "82.5" and "82,5", which dictation produces in different locales.
    const match = /^(\d+(?:[.,]\d+)?)$/.exec(word);
    if (match) found.push({ value: Number((match[1] as string).replace(',', '.')), at });
  });
  return found;
}

/**
 * Reads a spoken set.
 *
 * Always returns a result. An unparseable sentence comes back with an empty
 * query and everything in `missing`, which the caller shows as a question
 * rather than an error — dictation misfires constantly and a red failure for
 * every stray word would make the feature unusable.
 */
export function parseVoiceLog(spoken: string): VoiceLog {
  const words = digitise(
    spoken
      .toLowerCase()
      // '.' and ',' are kept for now: they carry meaning inside a decimal.
      .replace(/[^a-z0-9.,\s]/g, ' ')
      .split(/\s+/)
      /*
       * Then stripped back off anything that is not a number. Dictation
       * punctuates — "Bench press, 80 kg." — and a comma left clinging to a
       * word ended up part of the exercise name.
       */
      .map((word) => (/^\d+(?:[.,]\d+)?$/.test(word) ? word : word.replace(/[.,]/g, '')))
      .filter((word) => word.length > 0),
  );

  const numbers = quantities(words);

  // ------------------------------------------------------------ weight --

  let weight: number | null = null;
  let unit: VoiceUnit | null = null;
  let weightAt = -1;

  // A number immediately followed by a unit is unambiguous, so it wins.
  for (const candidate of numbers) {
    const after = words[candidate.at + 1] ?? '';
    if (KG_WORDS.has(after)) {
      weight = candidate.value;
      unit = 'kg';
      weightAt = candidate.at;
      break;
    }
    if (LB_WORDS.has(after)) {
      weight = candidate.value;
      unit = 'lb';
      weightAt = candidate.at;
      break;
    }
  }

  // ------------------------------------------------------------- reps --

  let reps: number | null = null;
  let repsAt = -1;

  // Likewise: a number followed by "reps" or "times" is the rep count.
  for (const candidate of numbers) {
    if (candidate.at === weightAt) continue;
    const after = words[candidate.at + 1] ?? '';
    if (after === 'reps' || after === 'rep' || after === 'times' || after === 'time') {
      reps = candidate.value;
      repsAt = candidate.at;
      break;
    }
  }

  // ------------------------------------------------------------- sets --

  let sets = 1;
  let setsAt = -1;
  for (const candidate of numbers) {
    const after = words[candidate.at + 1] ?? '';
    if (after === 'sets' || after === 'set') {
      sets = candidate.value;
      setsAt = candidate.at;
      break;
    }
  }

  /*
   * Whatever is left over, in order. "bench 80 for 8" and "squat 100 by 5"
   * label nothing, and both mean weight then reps — the order everyone writes
   * a set in. Assigned only after every labelled number is claimed, so a
   * label always beats position.
   */
  const unclaimed = numbers.filter(
    (candidate) => candidate.at !== weightAt && candidate.at !== repsAt && candidate.at !== setsAt,
  );

  if (weight === null && unclaimed.length > 0) {
    const first = unclaimed.shift() as Quantity;
    weight = first.value;
    weightAt = first.at;
  }
  if (reps === null && unclaimed.length > 0) {
    const next = unclaimed.shift() as Quantity;
    reps = next.value;
    repsAt = next.at;
  }

  // ---------------------------------------------------------- exercise --

  /*
   * The name is everything that is not a number, a unit or filler. Taken as
   * the longest RUN of such words rather than all of them concatenated, so
   * "three sets of incline dumbbell press at 35 kg" gives "incline dumbbell
   * press" and not "incline dumbbell press kg".
   */
  const runs: string[][] = [];
  let run: string[] = [];
  for (const word of words) {
    const isNumber = /^\d/.test(word);
    const isUnit = KG_WORDS.has(word) || LB_WORDS.has(word);
    if (isNumber || isUnit || FILLER.has(word)) {
      if (run.length > 0) runs.push(run);
      run = [];
      continue;
    }
    run.push(word);
  }
  if (run.length > 0) runs.push(run);

  const longest = runs.reduce<string[]>(
    (best, candidate) => (candidate.join(' ').length > best.join(' ').length ? candidate : best),
    [],
  );
  const exerciseQuery = longest.join(' ');

  // ----------------------------------------------------------- missing --

  const missing: ('exercise' | 'weight' | 'reps')[] = [];
  if (exerciseQuery === '') missing.push('exercise');
  if (weight === null) missing.push('weight');
  if (reps === null) missing.push('reps');

  return {
    // A spoken "zero sets" or a mis-heard 0 is not a set count.
    sets: Number.isFinite(sets) && sets >= 1 ? Math.min(Math.trunc(sets), 20) : 1,
    exerciseQuery,
    weight,
    unit,
    reps: reps === null ? null : Math.trunc(reps),
    missing,
  };
}

/**
 * The parse read back as a sentence, for confirmation before it is saved.
 *
 * Reading it back is not decoration: dictation misfires quietly, and "45" for
 * "4.5" is the kind of error someone only catches if they are shown it. The
 * caller supplies the resolved exercise name, because by then the query has
 * been matched to something real.
 */
export function describeVoiceLog(log: VoiceLog, exerciseName: string): string {
  const weight = log.weight === null ? 'weight not heard' : `${log.weight} ${log.unit ?? 'kg'}`;
  const reps = log.reps === null ? 'reps not heard' : `${log.reps} reps`;
  const sets = log.sets === 1 ? '1 set' : `${log.sets} sets`;
  return `${sets} of ${exerciseName} — ${weight} × ${reps}`;
}
