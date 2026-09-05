/**
 * Logging a set by speaking it (FR-VOX-01, ADR 0006).
 *
 * THE MICROPHONE IS THE APP'S OWN, not the keyboard's, and that was a
 * deliberate reversal. Keyboard dictation cost nothing — no native module, no
 * permission, no policy change — but it is two taps behind a keyboard that has
 * to be summoned first, and on a gym floor with a phone in one hand that is
 * the difference between using the feature and not. A button you can hit
 * without looking is the whole point of speaking a set instead of typing it.
 *
 * What it costs, stated plainly because it is a real cost: the app now holds
 * RECORD_AUDIO, and the privacy policy had to be amended — it previously said
 * the microphone was never used. Recognition runs on-device where Android
 * supports it, nothing is recorded to a file, and no audio is uploaded
 * anywhere; only the recognised TEXT is kept, and only until it is parsed.
 *
 * The parsing is `parseVoiceLog` in @fi/domain — 47 tests, 100% branch. This
 * screen resolves the spoken name against the catalogue and confirms before
 * anything is written, because dictation misfires quietly and "45" for "4.5"
 * is only ever caught by a reader.
 */
import { useMemo, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Stack, router } from 'expo-router';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
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

  /*
   * Listening state, driven by the module's own events rather than by what the
   * button did. The recogniser stops itself on a pause, on a timeout and on an
   * error, so a flag set at the tap would strand the UI showing "listening"
   * over a microphone that had already closed.
   */
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('result', (event) => {
    // Interim results included, so the words appear as they are said — without
    // them a long sentence looks like nothing is happening.
    const said = event.results[0]?.transcript;
    if (said !== undefined) {
      setSpoken(said);
      setChosen(null);
    }
  });
  useSpeechRecognitionEvent('error', (event) => {
    setListening(false);
    setMicError(
      event.error === 'no-speech'
        ? 'Nothing was heard. Tap the microphone and speak the whole set.'
        : 'The microphone could not be used. You can type the set instead.',
    );
  });

  const toggleListening = async () => {
    setMicError(null);

    if (listening) {
      // `stop` finishes the utterance and delivers a final result; `abort`
      // would throw the sentence away mid-word.
      ExpoSpeechRecognitionModule.stop();
      return;
    }

    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setMicError('Without the microphone this screen still works — type the set instead.');
      return;
    }

    setSpoken('');
    setChosen(null);
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      // On-device where the platform offers it: faster, works without signal,
      // and the audio never leaves the phone.
      requiresOnDeviceRecognition: false,
      // The words are exercise names and numbers, not prose.
      addsPunctuation: false,
      continuous: false,
    });
  };
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
                ? 'Describe the whole set in one sentence, the way you would to a training partner. Speech input needs the app; here, type it.'
                : 'Tap the microphone and describe the set the way you would to a training partner. You can fix any word by typing.'}
            </Text>
          </Column>

          {/* Field and microphone on one row: the mic is the primary way in,
              and the field is there so a misheard word can be corrected
              without starting the whole sentence again. */}
          <Row gap="sm" style={{ alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
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
              />
            </View>

            {Platform.OS === 'web' ? null : (
              <Pressable
                onPress={() => void toggleListening()}
                accessibilityRole="button"
                accessibilityLabel={listening ? 'Stop listening' : 'Speak the set'}
                accessibilityState={{ busy: listening }}
                style={({ pressed }) => ({
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: listening ? theme.colors.accent : theme.colors.surfaceRaised,
                  borderWidth: 1,
                  borderColor: listening ? theme.colors.accent : theme.colors.border,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text
                  variant="title"
                  style={{ color: listening ? theme.colors.accentText : theme.colors.text }}
                >
                  ●
                </Text>
              </Pressable>
            )}
          </Row>

          {listening ? (
            <Text variant="caption" tone="accent">
              Listening — say the whole set, then tap again to stop.
            </Text>
          ) : null}

          {micError ? (
            <Text variant="caption" tone="warning">
              {micError}
            </Text>
          ) : null}

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
