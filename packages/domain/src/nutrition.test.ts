import { describe, expect, it } from 'vitest';
import { ZERO, dec, decToString } from './decimal';
import {
  EMPTY_CONTRIBUTION,
  applyTargetOverrides,
  contributionOf,
  contributionToWire,
  energyFromMacrosKj,
  estimateTargets,
  kcalToKj,
  kjToKcal,
  panelIsPlausible,
  sumContributions,
  targetFraction,
  type Panel,
  type TargetInputs,
} from './nutrition';

/** Chicken breast, raw, roughly as a label states it. */
const chicken: Panel = {
  energyKj: 460,
  proteinG: dec('23.10'),
  carbsG: ZERO,
  fatG: dec('1.50'),
};

/** Oats — carbohydrate-dominant, so the balancing arithmetic is exercised. */
const oats: Panel = {
  energyKj: 1560,
  proteinG: dec('13.50'),
  carbsG: dec('60.00'),
  fatG: dec('8.00'),
};

describe('energy units', () => {
  it('converts between kJ and kcal at the labelling factor', () => {
    expect(kjToKcal(4184)).toBe(1000);
    expect(kcalToKj(1000)).toBe(4184);
  });

  it('round-trips closely enough for display', () => {
    // Rounding to whole units each way, so the trip is not exact — but it must
    // not drift by more than a rounding step.
    expect(Math.abs(kcalToKj(kjToKcal(2000)) - 2000)).toBeLessThanOrEqual(5);
  });

  it('handles zero', () => {
    expect(kjToKcal(0)).toBe(0);
    expect(kcalToKj(0)).toBe(0);
  });
});

describe('contributionOf', () => {
  it('scales a per-100 g panel to the quantity logged', () => {
    const result = contributionOf(chicken, dec('200'));
    expect(result.energyKj).toBe(920);
    expect(decToString(result.proteinG)).toBe('46.20');
    expect(decToString(result.fatG)).toBe('3.00');
    expect(decToString(result.carbsG)).toBe('0.00');
  });

  it('handles a quantity below 100 g', () => {
    const result = contributionOf(oats, dec('40'));
    expect(result.energyKj).toBe(624);
    expect(decToString(result.proteinG)).toBe('5.40');
    expect(decToString(result.carbsG)).toBe('24.00');
  });

  it('contributes nothing for a zero quantity', () => {
    const result = contributionOf(oats, ZERO);
    expect(result).toEqual(EMPTY_CONTRIBUTION);
  });

  it('rounds a fractional gram to two places rather than carrying it', () => {
    // 33 g of chicken: 23.1 * 0.33 = 7.623 -> 7.62
    const result = contributionOf(chicken, dec('33'));
    expect(decToString(result.proteinG)).toBe('7.62');
  });

  it('is exact when the same entry is logged repeatedly', () => {
    // The float-arithmetic bug this module exists to prevent: 0.1 ten times.
    const tenth: Panel = { energyKj: 1, proteinG: dec('10'), carbsG: ZERO, fatG: ZERO };
    const each = contributionOf(tenth, dec('1')); // 0.10 g protein
    expect(decToString(each.proteinG)).toBe('0.10');

    const total = sumContributions(Array.from({ length: 10 }, () => each));
    expect(decToString(total.proteinG)).toBe('1.00');
  });
});

describe('sumContributions', () => {
  it('is zero for no entries', () => {
    expect(sumContributions([])).toEqual(EMPTY_CONTRIBUTION);
  });

  it("equals the sum of what is on screen", () => {
    const a = contributionOf(chicken, dec('150'));
    const b = contributionOf(oats, dec('80'));
    const total = sumContributions([a, b]);

    expect(total.energyKj).toBe(a.energyKj + b.energyKj);
    expect(decToString(total.proteinG)).toBe('45.45'); // 34.65 + 10.80
  });
});

describe('contributionToWire', () => {
  it('renders decimal strings, matching the shared schema', () => {
    expect(contributionToWire(contributionOf(chicken, dec('100')))).toEqual({
      energyKj: 460,
      proteinG: '23.10',
      carbsG: '0.00',
      fatG: '1.50',
    });
  });
});

describe('energyFromMacrosKj', () => {
  it('applies the Atwater factors', () => {
    // 10 g protein + 10 g carbs + 10 g fat = 170 + 170 + 370
    const panel: Panel = {
      energyKj: 0,
      proteinG: dec('10'),
      carbsG: dec('10'),
      fatG: dec('10'),
    };
    expect(energyFromMacrosKj(panel)).toBe(710);
  });

  it('is zero for a food with no macros', () => {
    expect(energyFromMacrosKj({ energyKj: 0, proteinG: ZERO, carbsG: ZERO, fatG: ZERO })).toBe(0);
  });
});

describe('panelIsPlausible', () => {
  it('accepts a real label', () => {
    expect(panelIsPlausible(chicken)).toBe(true);
    expect(panelIsPlausible(oats)).toBe(true);
  });

  it('accepts water and black coffee — nothing stated, nothing implied', () => {
    expect(panelIsPlausible({ energyKj: 0, proteinG: ZERO, carbsG: ZERO, fatG: ZERO })).toBe(true);
  });

  it('rejects zero energy with real macros', () => {
    expect(
      panelIsPlausible({ energyKj: 0, proteinG: dec('20'), carbsG: ZERO, fatG: ZERO }),
    ).toBe(false);
  });

  it('allows a trace of macros against zero energy', () => {
    // A label may state 0 kJ and round a trace of macros up.
    expect(
      panelIsPlausible({ energyKj: 0, proteinG: dec('0.50'), carbsG: dec('1.00'), fatG: ZERO }),
    ).toBe(true);
  });

  it('rejects a panel whose macros are far below its stated energy', () => {
    expect(
      panelIsPlausible({ energyKj: 2000, proteinG: dec('1'), carbsG: dec('1'), fatG: dec('1') }),
    ).toBe(false);
  });

  it('rejects a panel whose macros far exceed its stated energy', () => {
    expect(
      panelIsPlausible({ energyKj: 100, proteinG: dec('30'), carbsG: dec('30'), fatG: dec('30') }),
    ).toBe(false);
  });

  it('tolerates the imprecision a real label carries', () => {
    // Within 25%: fibre and label rounding legitimately move this.
    expect(
      panelIsPlausible({ energyKj: 800, proteinG: dec('10'), carbsG: dec('30'), fatG: dec('8') }),
    ).toBe(true);
  });
});

describe('estimateTargets', () => {
  const base: TargetInputs = {
    bodyweightKg: dec('80'),
    experience: 'intermediate',
    trainingDaysPerWeek: 4,
  };

  it('refuses to invent a target without a bodyweight', () => {
    const targets = estimateTargets({ ...base, bodyweightKg: null });
    expect(targets.origin).toBe('none');
    expect(targets.energyKj).toBe(0);
    // And says what would make an estimate possible.
    expect(targets.basis).toContain('bodyweight');
  });

  it('scales energy with bodyweight and training days', () => {
    // 80 kg * 130 + 2 extra days * 550 = 10400 + 1100
    expect(estimateTargets(base).energyKj).toBe(11_500);

    const lighter = estimateTargets({ ...base, bodyweightKg: dec('60') });
    expect(lighter.energyKj).toBeLessThan(estimateTargets(base).energyKj);

    const moreDays = estimateTargets({ ...base, trainingDaysPerWeek: 6 });
    expect(moreDays.energyKj).toBeGreaterThan(estimateTargets(base).energyKj);
  });

  it('caps the training-day bonus rather than scaling forever', () => {
    const six = estimateTargets({ ...base, trainingDaysPerWeek: 6 });
    const seven = estimateTargets({ ...base, trainingDaysPerWeek: 7 });
    expect(seven.energyKj).toBe(six.energyKj);
  });

  it('does not reduce energy below maintenance for a rest-day-heavy week', () => {
    const two = estimateTargets({ ...base, trainingDaysPerWeek: 2 });
    const one = estimateTargets({ ...base, trainingDaysPerWeek: 1 });
    // No deficit is ever applied, so fewer days floors at maintenance.
    expect(one.energyKj).toBe(two.energyKj);
    expect(one.energyKj).toBe(80 * 130);
  });

  it('raises protein with training experience', () => {
    const beginner = estimateTargets({ ...base, experience: 'beginner' });
    const advanced = estimateTargets({ ...base, experience: 'advanced' });
    expect(Number(decToString(advanced.proteinG))).toBeGreaterThan(
      Number(decToString(beginner.proteinG)),
    );
    // 80 kg at 1.6 g/kg
    expect(decToString(beginner.proteinG)).toBe('128.00');
  });

  it('falls back to sensible assumptions for unanswered profile questions', () => {
    const sparse = estimateTargets({
      bodyweightKg: dec('80'),
      experience: null,
      trainingDaysPerWeek: null,
    });
    expect(sparse.origin).toBe('estimated');
    // beginner protein, 3 training days
    expect(decToString(sparse.proteinG)).toBe('128.00');
    expect(sparse.energyKj).toBe(80 * 130 + 550);
  });

  it('makes the three macros account for the energy figure', () => {
    const targets = estimateTargets(base);
    const fromMacros = energyFromMacrosKj({
      energyKj: targets.energyKj,
      proteinG: targets.proteinG,
      carbsG: targets.carbsG,
      fatG: targets.fatG,
    });
    // Carbohydrate is the balancing term, so this should land within rounding.
    expect(Math.abs(fromMacros - targets.energyKj)).toBeLessThan(30);
  });

  it('never produces a negative carbohydrate target', () => {
    // A very light person with an advanced protein multiplier is the case where
    // protein and fat could in principle exceed the energy budget.
    const targets = estimateTargets({
      bodyweightKg: dec('35'),
      experience: 'advanced',
      trainingDaysPerWeek: 1,
    });
    expect(Number(decToString(targets.carbsG))).toBeGreaterThanOrEqual(0);
  });

  it('says how it was derived, and does not present it as advice', () => {
    const { basis } = estimateTargets(base);
    expect(basis).toContain('80.0 kg');
    expect(basis).toContain('not a prescription');
  });
});

describe('applyTargetOverrides', () => {
  const estimated = estimateTargets({
    bodyweightKg: dec('80'),
    experience: 'intermediate',
    trainingDaysPerWeek: 4,
  });

  const noOverrides = { energyKj: null, proteinG: null, carbsG: null, fatG: null };

  it('returns the estimate untouched when nothing is overridden', () => {
    expect(applyTargetOverrides(estimated, noOverrides)).toBe(estimated);
  });

  it('replaces only the fields set, and keeps the rest derived', () => {
    const result = applyTargetOverrides(estimated, { ...noOverrides, proteinG: dec('200') });
    expect(decToString(result.proteinG)).toBe('200.00');
    expect(result.energyKj).toBe(estimated.energyKj);
    expect(result.carbsG).toBe(estimated.carbsG);
  });

  it('stops calling the set an estimate once the user owns any of it', () => {
    const result = applyTargetOverrides(estimated, { ...noOverrides, energyKj: 9000 });
    expect(result.origin).toBe('custom');
    expect(result.basis).toBe('Your own targets.');
  });

  it('accepts an override on every field', () => {
    const result = applyTargetOverrides(estimated, {
      energyKj: 9000,
      proteinG: dec('180'),
      carbsG: dec('250'),
      fatG: dec('60'),
    });
    expect(result).toMatchObject({ energyKj: 9000, origin: 'custom' });
    expect(decToString(result.fatG)).toBe('60.00');
  });

  it('can override on top of "no estimate available"', () => {
    const none = estimateTargets({
      bodyweightKg: null,
      experience: null,
      trainingDaysPerWeek: null,
    });
    const result = applyTargetOverrides(none, { ...noOverrides, energyKj: 8000 });
    expect(result.origin).toBe('custom');
    expect(result.energyKj).toBe(8000);
  });
});

describe('targetFraction', () => {
  it('reports progress for a real target', () => {
    expect(targetFraction(500, 1000)).toBe(0.5);
  });

  it('bounds the bar at full without hiding that a target was passed', () => {
    // The fraction is for the bar; the caller still shows the real total.
    expect(targetFraction(1500, 1000)).toBe(1);
  });

  it('bounds at zero for a negative actual', () => {
    expect(targetFraction(-10, 1000)).toBe(0);
  });

  it('returns null when there is no target, so no bar is drawn', () => {
    expect(targetFraction(500, 0)).toBeNull();
    expect(targetFraction(500, -1)).toBeNull();
  });
});
