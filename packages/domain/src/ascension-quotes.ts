/**
 * A line of encouragement, in the voice of the chosen Ascension.
 *
 * These are ORIGINAL lines written in each character's spirit, not transcribed
 * dialogue. Two reasons, and the second is the one that matters:
 *
 * 1. Actual dialogue is someone else's copyrighted text, and unlike a tier
 *    name — a word or two — a quotation is the part that is unambiguously not
 *    ours to ship.
 * 2. Real quotes are written for the moment they appear in. "I never go back
 *    on my word" is stirring in context and inert above a set of curls. A line
 *    written for the fourth set of a Tuesday can actually land there.
 *
 * Like the tier names, they are data: swapping the pool is one file.
 *
 * WHY IT IS DETERMINISTIC. `quoteFor` is pure and keyed on a seed, so the same
 * screen on the same day shows the same line. A quote that reshuffles on every
 * render is not encouragement, it is a distraction — and one that changes while
 * you are reading it is worse than none.
 */
import { DEFAULT_ASCENSION, type AscensionId } from './ascension';

/** Where the line is being shown. Tone differs sharply between these. */
export type QuoteContext =
  | 'home'
  /** Mid-session, between sets. Short. Nobody reads a paragraph here. */
  | 'training'
  /** Just finished. Earned, not pushy. */
  | 'finish'
  /** Looking at their own numbers. Perspective rather than hype. */
  | 'insights'
  /** Opened the app having not trained in a while. Never scolding. */
  | 'return';

type Pool = Readonly<Record<QuoteContext, readonly string[]>>;

const POOLS: Readonly<Record<AscensionId, Pool>> = {
  monarch: {
    home: [
      'No one is coming to level you up. That is the good news.',
      'The gate does not care how you feel today. Go in anyway.',
    ],
    training: ['One more. Quietly.', 'Nobody is watching. That is the point.'],
    finish: [
      'Logged. The System does not forget what you did today.',
      'Small clearances, every day, become an unrecognisable person.',
    ],
    insights: [
      'You were weaker than this a month ago. Read it again.',
      'Progress you can measure is progress nobody can talk you out of.',
    ],
    return: ['You are still ranked. Pick up where you stopped.'],
  },

  saiyan: {
    home: [
      'Find the wall today. It only moves if you push it.',
      'Yesterday was your ceiling. Make it your floor.',
    ],
    training: ['One more rep than last time. That is all.', 'Push. Recover. Return stronger.'],
    finish: ['You broke something today. It grows back heavier.', "Good session. Now who's next?"],
    insights: [
      'The number went up. That is not luck, that is training.',
      'Every form you have was once impossible. Look at the chart.',
    ],
    return: ['Rest was training too. Come and see what it bought you.'],
  },

  shinobi: {
    home: [
      'Talent trains on the good days. You train on the others.',
      'The strongest person in the room is usually the most stubborn.',
    ],
    training: ['Again.', 'This is the set nobody would blame you for skipping.'],
    finish: [
      'Showing up is the whole technique. You did it again.',
      'One more session in a very long line of them.',
    ],
    insights: [
      'You were last in the class once. This is the receipt.',
      'Slow progress is still the direction everyone wants to be going.',
    ],
    return: ['Nobody is keeping score against you. Start again today.'],
  },

  shinigami: {
    home: [
      'You do not need to feel ready. You need to begin.',
      'Fear is information, not instruction.',
    ],
    training: ['Hold the line. One more.', 'Heavy is the point.'],
    finish: [
      'You went past where you wanted to stop. Remember that.',
      'That is resolve, and it is trainable.',
    ],
    insights: [
      'You have carried heavier than you believe. Here is proof.',
      'Strength you built deliberately is strength you can rely on.',
    ],
    return: ['The blade keeps its edge. Pick it up.'],
  },

  pirate: {
    home: [
      'Absurd goals are the only ones worth the trouble.',
      'Say the ridiculous number out loud, then go and get it.',
    ],
    training: ['One more, obviously.', 'This is the fun part. Act like it.'],
    finish: [
      'Logged, and the number went up. Excellent.',
      'That is another one nobody can take off you.',
    ],
    insights: [
      'Look how far you have sailed from where you started.',
      'The plan was ridiculous. The chart says it is working.',
    ],
    return: ['The crew waited. Back to it.'],
  },
};

/**
 * A stable index from a seed.
 *
 * A tiny FNV-style hash rather than `Math.random`, because the whole point is
 * that the same seed gives the same line — the function has to be pure to be
 * testable and to stop the text changing mid-read.
 */
function hash(text: string): number {
  let value = 2_166_136_261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16_777_619);
  }
  // `>>> 0` because imul yields a signed 32-bit result and a negative index
  // would silently reach past the start of the array.
  return value >>> 0;
}

/**
 * The line to show.
 *
 * `seed` is anything stable for as long as the line should be: a date keeps it
 * fixed for the day, a workout id fixes it for a session. An unknown Ascension
 * falls back to the default rather than throwing, exactly as `ascensionFor`
 * does — a missing quote must never be able to break a screen.
 */
export function quoteFor(ascension: string, context: QuoteContext, seed: string): string {
  const pool = POOLS[ascension as AscensionId] ?? POOLS[DEFAULT_ASCENSION];
  const lines = pool[context];
  // Every pool has every context, so this is a lookup rather than a search.
  return lines[hash(`${ascension}:${context}:${seed}`) % lines.length] as string;
}

/** Every line for an Ascension, for anywhere that wants to show the set. */
export function quotesFor(ascension: string): Pool {
  return POOLS[ascension as AscensionId] ?? POOLS[DEFAULT_ASCENSION];
}
