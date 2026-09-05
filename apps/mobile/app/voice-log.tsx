/**
 * Logging a set by speaking it (FR-VOX-01, ADR 0006).
 *
 * WHY THERE IS NO MICROPHONE BUTTON HERE, and this is the interesting decision:
 * it uses the KEYBOARD's dictation instead. Every Android keyboard has a mic
 * key, it is the speech engine the user has already chosen and trained, it
 * works offline on most phones, and it needs no native module, no
 * RECORD_AUDIO permission, and no change to the privacy policy — which
 * currently says the microphone is never used, and stays true because the
 * audio never reaches this app.
 *
 * A dedicated in-app recogniser would need `@react-native-voice/voice`, a
 * clean native rebuild, a new permission, a policy amendment, and would give a
 * worse result than Gboard. If keyboard dictation proves too fiddly in
 * practice that trade can be revisited, but it should be paid for a reason
 * rather than by default.
 *
 * The parsing is `parseVoiceLog` in @fi/domain — 47 tests, 100% branch. This
 * screen resolves the spoken name against the catalogue and confirms before
 * anything is written, because dictation misfires quietly and "45" for "4.5"
 * is only ever caught by a reader.
 */
import { useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
import { Stack, router } from 'expo-router';
import {
  dec,
  decToString,
  describeVoiceLog,
  fromDisplayUnit,
  lbToKg,
  parseVoiceLog,
  type VoiceLog,
} from '@fi/domain';
import type { ExerciseSummary } from '@fi/shared';
import { Button } from '../src/components/Button';
import { Card, Row, Stack as Column } from '../src/components/Card';
import { Chip } from '../src/components/Chip';
import { Screen } from '../src/components/Screen';
import { Overline, Text } from '../src/components/Text';
import { TextField } from '../src/components/TextField';
import { useExercises } from '../src/api/hooks/use-catalogue';
import { useActiveWorkout, useAddSet, useAddWorkoutExercise } from '../src/api/hooks/use-workout';
import { useMe } from '../src/api/hooks/use-profile';
import { useDebounced } from '../src/lib/use-debounced';
import { uuidv7 } from '../src/lib/uuid';
import { useTheme } from '../src/theme';

const EXAMPLES = [
  'one set of incline dumbbell press with 35 kilos for 12 reps',
  'bench press 80 kg 8 reps',
  'three sets of squats at 100 kilos for 5 reps',
];

export default function VoiceLogScreen() {
  const theme = useTheme();
  const me = useMe();
  const active = useActiveWorkout();
  const addExercise = useAddWorkoutExercise(active.data?.id);
  const addSet = useAddSet(active.data?.id);

  const [spoken, setSpoken] = useState('');
  const parsed: VoiceLog | null = spoken.trim() === '' ? null : parseVoiceLog(spoken);

  /*
   * The parser deliberately does not know the catalogue, so the name it
   * returns is matched here. Debounced, because this runs as the words arrive
   * from dictation and each change would otherwise be a request.
   */
  const query = useDebounced(parsed?.exerciseQuery ?? '', 300);
  const matches = useExercises(query.trim() ? { q: query.trim(), scope: 'all' } : { scope: 'all' });
  const candidates = useMemo(
    () => (matches.data?.pages.flatMap((page) => page.items) ?? []).slice(0, 4),
    [matches.data],
  );

  const [chosen, setChosen] = useState<ExerciseSummary | null>(null);
  const exercise = chosen ?? candidates[0] ?? null;

  /*
   * A SPOKEN unit always wins; silence falls back to the user's setting.
   * Getting this backwards is the worst bug this screen could have — reading
   * "80 pounds" as 80 kg logs a set more than twice as heavy as the one that
   * happened, and it would poison every 1RM and PR downstream.
   *
   * The conversion is `@fi/domain`'s, on a `Dec`, not a float multiply here
   * (BRD §9.3 — this file is the presentation layer and does no arithmetic).
   */
  const units = me.data?.profile.units ?? 'metric';
  const weightKg = useMemo(() => {
    if (parsed?.weight == null) return null;
    const spoken = dec(parsed.weight);
    const kg =
      parsed.unit === 'lb'
        ? lbToKg(spoken)
        : parsed.unit === 'kg'
          ? spoken
          : fromDisplayUnit(spoken, units);
    return decToString(kg);
  }, [parsed?.weight, parsed?.unit, units]);

  const ready = parsed !== null && exercise !== null && parsed.reps !== null;

  const save = () => {
    if (!parsed || !exercise || !active.data || parsed.reps === null) return;

    /*
     * Reuse the exercise if the workout already has it. Saying "another two
     * sets of bench" after logging bench should extend that entry, not open a
     * second one — which is also what the picker enforces with `excludeIds`.
     */
    const already = active.data.exercises.find((entry) => entry.exerciseId === exercise.id);
    const workoutExerciseId = already?.id ?? uuidv7();

    if (!already) {
      // The id is passed in so the sets below can be addressed at once. Without
      // it the optimistic row is named `pending-…` and we would have to wait
      // for the server — which is precisely what set logging must never do.
      addExercise.mutate({
        id: workoutExerciseId,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
      });
    }

    // One row per spoken set — "three sets of" means three.
    const completedAt = new Date().toISOString();
    for (let index = 0; index < parsed.sets; index += 1) {
      addSet.mutate({
        id: uuidv7(),
        workoutExerciseId,
        setType: 'normal',
        weightKg,
        reps: parsed.reps,
        isCompleted: true,
        completedAt,
      });
    }
    router.replace('/workout/active');
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Say the set' }} />
      <Screen scroll footerSpace={160}>
        <Column gap="xl" style={{ paddingTop: theme.space.lg }}>
          <Column gap="xs">
            <Overline>hands full</Overline>
            <Text variant="heading">Say it instead of typing it</Text>
            <Text variant="caption" tone="muted">
              {/* Desktop keyboards have no microphone key, so pointing at one
                  would be an instruction that cannot be followed. Typing the
                  sentence works identically — the parsing is the same. */}
              {Platform.OS === 'web'
                ? 'Describe the whole set in one sentence, the way you would to a training partner. Dictation lives on your phone keyboard; here, type it.'
                : 'Tap the field, then the microphone on your keyboard, and describe the set the way you would to a training partner.'}
            </Text>
          </Column>

          <TextField
            label="The set"
            value={spoken}
            onChangeText={(text) => {
              setSpoken(text);
              // A new sentence invalidates a manual pick from the old one.
              setChosen(null);
            }}
            placeholder="one set of bench press with 80 kilos for 8 reps"
            multiline
            autoFocus
          />

          {parsed === null ? (
            <Column gap="sm">
              <Overline>for example</Overline>
              {EXAMPLES.map((example) => (
                <Card key={example}>
                  <Text variant="caption" tone="muted" style={{ fontStyle: 'italic' }}>
                    “{example}”
                  </Text>
                </Card>
              ))}
            </Column>
          ) : (
            <Column gap="lg">
              {/* Read back before anything is written. Dictation misfires
                  quietly, and only a reader catches "45" for "4.5". */}
              <Card>
                <Column gap="xs">
                  <Overline>heard</Overline>
                  <Text variant="callout" weight="semibold">
                    {describeVoiceLog(parsed, exercise?.name ?? (parsed.exerciseQuery || '—'))}
                  </Text>
                  {weightKg && parsed.unit === null ? (
                    <Text variant="micro" tone="faint">
                      No unit was spoken, so this is read as{' '}
                      {units === 'imperial' ? 'pounds' : 'kilograms'} — your setting.
                    </Text>
                  ) : null}
                </Column>
              </Card>

              {parsed.missing.length > 0 ? (
                <Card>
                  <Column gap="xs">
                    <Overline>still needed</Overline>
                    <Text variant="caption" tone="warning">
                      {/* Never guessed. A missing number is asked for. */}
                      {parsed.missing
                        .map((what) =>
                          what === 'exercise'
                            ? 'which exercise'
                            : what === 'weight'
                              ? 'the weight'
                              : 'how many reps',
                        )
                        .join(', ')}
                    </Text>
                  </Column>
                </Card>
              ) : null}

              {candidates.length > 1 ? (
                <Column gap="sm">
                  <Overline>exercise</Overline>
                  <Row gap="sm" wrap>
                    {candidates.map((candidate) => (
                      <Chip
                        key={candidate.id}
                        label={candidate.name}
                        selected={exercise?.id === candidate.id}
                        onPress={() => setChosen(candidate)}
                      />
                    ))}
                  </Row>
                </Column>
              ) : null}
            </Column>
          )}

          {active.data ? null : (
            <Card>
              <Text variant="caption" tone="muted">
                No workout in progress. Start one and the set will be added to it.
              </Text>
            </Card>
          )}
        </Column>
      </Screen>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: theme.space.lg,
          paddingBottom: theme.space.xxl,
          gap: theme.space.sm,
          backgroundColor: theme.colors.surface,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
        }}
      >
        <Button
          label={
            !active.data
              ? 'Start a workout first'
              : ready
                ? `Log ${parsed.sets === 1 ? 'the set' : `${parsed.sets} sets`}`
                : 'Say the whole set'
          }
          onPress={save}
          disabled={!ready || !active.data}
          loading={addSet.isPending}
          size="large"
          haptic
          fullWidth
        />
        <Button label="Cancel" variant="ghost" onPress={() => router.back()} fullWidth />
      </View>
    </>
  );
}
