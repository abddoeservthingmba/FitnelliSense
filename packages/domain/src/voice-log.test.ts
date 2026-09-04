import { describe, expect, it } from 'vitest';
import { describeVoiceLog, parseVoiceLog } from './voice-log';

describe('parseVoiceLog — the phrase that was asked for', () => {
  it('reads the example verbatim', () => {
    const log = parseVoiceLog('1 set of incline dumbell press with 35 kgs for 12 reps');
    expect(log.sets).toBe(1);
    expect(log.exerciseQuery).toBe('incline dumbell press');
    expect(log.weight).toBe(35);
    expect(log.unit).toBe('kg');
    expect(log.reps).toBe(12);
    expect(log.missing).toEqual([]);
  });

  it('reads it spoken entirely in words', () => {
    // Dictation returns digits sometimes and words other times, for the same
    // speaker in the same session.
    const log = parseVoiceLog(
      'one set of incline dumbbell press with thirty five kilos for twelve reps',
    );
    expect(log.sets).toBe(1);
    expect(log.weight).toBe(35);
    expect(log.reps).toBe(12);
    expect(log.exerciseQuery).toBe('incline dumbbell press');
  });
});

describe('parseVoiceLog — how people actually talk', () => {
  const cases: [
    string,
    { query: string; weight: number | null; reps: number | null; sets: number },
  ][] = [
    ['bench press 80 kg 8 reps', { query: 'bench press', weight: 80, reps: 8, sets: 1 }],
    [
      '3 sets of squats at 100 kilos for 5 reps',
      { query: 'squats', weight: 100, reps: 5, sets: 3 },
    ],
    ['deadlift 140 for 3', { query: 'deadlift', weight: 140, reps: 3, sets: 1 }],
    ['squat 100 by 5', { query: 'squat', weight: 100, reps: 5, sets: 1 }],
    ['overhead press 45 kg times 10', { query: 'overhead press', weight: 45, reps: 10, sets: 1 }],
    ['logged pull ups 20 reps', { query: 'pull ups', weight: null, reps: 20, sets: 1 }],
    [
      'i did four sets of barbell row with 70 kilograms for 10 repetitions',
      { query: 'barbell row', weight: 70, reps: 10, sets: 4 },
    ],
    ['lateral raise 12 kg 15 times', { query: 'lateral raise', weight: 12, reps: 15, sets: 1 }],
    ['cable fly 20 pounds for 12 reps', { query: 'cable fly', weight: 20, reps: 12, sets: 1 }],
  ];

  for (const [spoken, expected] of cases) {
    it(`reads "${spoken}"`, () => {
      const log = parseVoiceLog(spoken);
      expect(log.exerciseQuery).toBe(expected.query);
      expect(log.weight).toBe(expected.weight);
      expect(log.reps).toBe(expected.reps);
      expect(log.sets).toBe(expected.sets);
    });
  }
});

describe('parseVoiceLog — units', () => {
  it('reads every way of saying kilograms', () => {
    for (const unit of ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms']) {
      expect(parseVoiceLog(`bench 80 ${unit} for 5 reps`).unit, unit).toBe('kg');
    }
  });

  it('reads every way of saying pounds', () => {
    for (const unit of ['lb', 'lbs', 'pound', 'pounds']) {
      expect(parseVoiceLog(`bench 180 ${unit} for 5 reps`).unit, unit).toBe('lb');
    }
  });

  it('leaves the unit null when none was spoken', () => {
    // The caller then applies the user's own preference, which is the only
    // safe reading — assuming kg for someone who trains in pounds would log a
    // set more than twice as heavy as the one they did.
    const log = parseVoiceLog('bench 80 for 5');
    expect(log.weight).toBe(80);
    expect(log.unit).toBeNull();
  });

  it('takes a decimal weight, in either notation', () => {
    expect(parseVoiceLog('dumbbell curl 12.5 kg for 10 reps').weight).toBe(12.5);
    expect(parseVoiceLog('dumbbell curl 12,5 kg for 10 reps').weight).toBe(12.5);
  });
});

describe('parseVoiceLog — a label always beats position', () => {
  it('does not mistake the rep count for the weight', () => {
    // "12 reps of curls at 20 kg" says reps FIRST. Reading positionally would
    // log 12 kg for 20 reps — a plausible-looking set that never happened.
    const log = parseVoiceLog('12 reps of curls at 20 kg');
    expect(log.reps).toBe(12);
    expect(log.weight).toBe(20);
  });

  it('does not mistake the set count for either', () => {
    const log = parseVoiceLog('5 sets of bench press 100 kg 5 reps');
    expect(log.sets).toBe(5);
    expect(log.weight).toBe(100);
    expect(log.reps).toBe(5);
  });

  it('falls back to weight-then-reps only for unlabelled numbers', () => {
    const log = parseVoiceLog('bench press 100 5');
    expect(log.weight).toBe(100);
    expect(log.reps).toBe(5);
  });
});

describe('parseVoiceLog — it never invents a number', () => {
  it('reports a missing weight rather than assuming one', () => {
    const log = parseVoiceLog('push ups for 20 reps');
    expect(log.weight).toBeNull();
    expect(log.missing).toContain('weight');
  });

  it('reports missing reps', () => {
    const log = parseVoiceLog('bench press 80 kg');
    expect(log.reps).toBeNull();
    expect(log.missing).toContain('reps');
  });

  it('reports a missing exercise', () => {
    const log = parseVoiceLog('80 kg for 5 reps');
    expect(log.exerciseQuery).toBe('');
    expect(log.missing).toContain('exercise');
  });

  it('returns a result for nonsense rather than throwing', () => {
    // Dictation misfires constantly. A thrown error for every stray word
    // would make the feature unusable.
    for (const noise of ['', '   ', 'um', 'okay so', '...', '!!!']) {
      const log = parseVoiceLog(noise);
      expect(log.sets).toBe(1);
      expect(log.missing).toContain('weight');
      expect(log.missing).toContain('reps');
    }
  });
});

describe('parseVoiceLog — bounds and tidying', () => {
  it('strips filler without eating the exercise name', () => {
    expect(
      parseVoiceLog('i just did a set of the incline bench press at 60 kg for 8 reps')
        .exerciseQuery,
    ).toBe('incline bench press');
  });

  it('takes the longest run of words as the name', () => {
    // "kg" splits the sentence; the name must not absorb the tail.
    expect(parseVoiceLog('3 sets seated cable row 55 kg 12 reps').exerciseQuery).toBe(
      'seated cable row',
    );
  });

  it('never returns fewer than one set', () => {
    expect(parseVoiceLog('0 sets of bench 80 kg 5 reps').sets).toBe(1);
  });

  it('caps an implausible set count', () => {
    // A mis-heard "100 sets" should not queue a hundred rows.
    expect(parseVoiceLog('100 sets of bench 80 kg 5 reps').sets).toBe(20);
  });

  it('truncates fractional reps, which do not exist', () => {
    expect(parseVoiceLog('bench 80 kg for 8.5 reps').reps).toBe(8);
  });

  it('reads a hundred spoken as words', () => {
    expect(parseVoiceLog('squat one hundred kilos for five reps').weight).toBe(100);
    expect(parseVoiceLog('squat a hundred and twenty kilos for five reps').weight).toBe(120);
  });

  it('is unbothered by punctuation dictation adds', () => {
    const log = parseVoiceLog('Bench press, 80 kg — for 8 reps.');
    expect(log.exerciseQuery).toBe('bench press');
    expect(log.weight).toBe(80);
    expect(log.reps).toBe(8);
  });
});

describe('describeVoiceLog', () => {
  it('reads the parse back for confirmation', () => {
    const log = parseVoiceLog('1 set of incline dumbbell press with 35 kgs for 12 reps');
    expect(describeVoiceLog(log, 'Incline Dumbbell Press')).toBe(
      '1 set of Incline Dumbbell Press — 35 kg × 12 reps',
    );
  });

  it('pluralises sets', () => {
    const log = parseVoiceLog('3 sets of squat 100 kg 5 reps');
    expect(describeVoiceLog(log, 'Squat')).toBe('3 sets of Squat — 100 kg × 5 reps');
  });

  it('says plainly what it did not hear', () => {
    // Shown before saving, because "45" for "4.5" is only caught by a reader.
    const log = parseVoiceLog('push ups for 20 reps');
    expect(describeVoiceLog(log, 'Push Up')).toBe('1 set of Push Up — weight not heard × 20 reps');
  });

  it('assumes kg for display only when no unit was spoken', () => {
    const log = parseVoiceLog('bench 80 for 5');
    expect(describeVoiceLog(log, 'Bench Press')).toContain('80 kg');
  });
});

describe('parseVoiceLog — spoken numbers in full', () => {
  const weightOf = (spoken: string) => parseVoiceLog(spoken).weight;

  it('reads a hundred and a remainder with units', () => {
    expect(weightOf('squat a hundred and twenty five kilos for five reps')).toBe(125);
    expect(weightOf('squat one hundred and forty kilos for three reps')).toBe(140);
  });

  it('reads a multiplied hundred', () => {
    expect(weightOf('leg press two hundred kilos for ten reps')).toBe(200);
    expect(weightOf('leg press three hundred and fifty kilos for five reps')).toBe(350);
  });

  it('reads the teens, which are single words', () => {
    expect(parseVoiceLog('bench eighty kilos for fifteen reps').reps).toBe(15);
    expect(parseVoiceLog('bench eighty kilos for eighteen reps').reps).toBe(18);
  });

  it('reads tens with a unit digit', () => {
    expect(weightOf('curl twenty two kilos for ten reps')).toBe(22);
    expect(weightOf('curl ninety seven kilos for ten reps')).toBe(97);
  });

  it('leaves a lone ten alone', () => {
    // "ten" must not absorb the next number as a unit digit.
    expect(parseVoiceLog('bench eighty kilos for ten reps').reps).toBe(10);
  });
});

describe('parseVoiceLog — a sentence that stops mid-thought', () => {
  /*
   * Someone gets cut off, or the recogniser truncates. The number-word reader
   * looks one and two tokens ahead, so a trailing number reads past the end of
   * the sentence — which must be a missing value, not a crash.
   */
  it('handles a trailing tens word', () => {
    const log = parseVoiceLog('bench press eighty');
    expect(log.weight).toBe(80);
    expect(log.reps).toBeNull();
    expect(log.missing).toContain('reps');
  });

  it('handles a trailing hundred', () => {
    expect(parseVoiceLog('squat one hundred').weight).toBe(100);
    expect(parseVoiceLog('leg press two hundred').weight).toBe(200);
  });

  it('handles a trailing single digit', () => {
    expect(parseVoiceLog('curl twenty').weight).toBe(20);
  });

  it('handles a sentence that is only a number word', () => {
    const log = parseVoiceLog('eighty');
    expect(log.weight).toBe(80);
    expect(log.exerciseQuery).toBe('');
    expect(log.missing).toContain('exercise');
  });

  it('handles a sentence with no numbers at all', () => {
    const log = parseVoiceLog('incline dumbbell press');
    expect(log.exerciseQuery).toBe('incline dumbbell press');
    expect(log.weight).toBeNull();
    expect(log.reps).toBeNull();
  });
});

describe('parseVoiceLog — the last three branches, named', () => {
  it('handles a hundred-and-remainder that ends the sentence', () => {
    // "a hundred and twenty" with nothing after it: the reader looks two
    // tokens past the number and finds the end.
    expect(parseVoiceLog('squat a hundred and twenty').weight).toBe(120);
  });

  it('keeps the longest name when a shorter run follows it', () => {
    // Two runs of words either side of the numbers. The first is the name;
    // the trailing fragment must not replace it just for being later.
    expect(parseVoiceLog('incline dumbbell press 35 kg fly').exerciseQuery).toBe(
      'incline dumbbell press',
    );
  });
});

describe('describeVoiceLog — the unheard rep count', () => {
  it('says so when reps were not heard', () => {
    const log = parseVoiceLog('bench press 80 kg');
    expect(log.reps).toBeNull();
    expect(describeVoiceLog(log, 'Bench Press')).toBe(
      '1 set of Bench Press — 80 kg × reps not heard',
    );
  });

  it('says so when neither was heard', () => {
    const log = parseVoiceLog('bench press');
    expect(describeVoiceLog(log, 'Bench Press')).toBe(
      '1 set of Bench Press — weight not heard × reps not heard',
    );
  });
});
