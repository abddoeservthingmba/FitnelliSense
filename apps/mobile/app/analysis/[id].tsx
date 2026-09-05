/**
 * One form analysis: what the bar actually did (FR-VID-*).
 *
 * The screen has to be honest about a pipeline that takes time and can fail.
 * A queued analysis says queued; a failed one says why in words the reader can
 * act on. Neither pretends to have numbers.
 *
 * Every figure here was computed in `packages/domain/bar-path.ts` — this file
 * maps numbers to text and never calculates (BRD §16.1). That includes the
 * judgements: "straightness" is a domain figure, and the wording around it is
 * chosen from thresholds rather than derived here.
 */
import { View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { Analysis } from '@fi/shared';
import { Card, Row, Stack as Column } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { Section, Stat, StatRow } from '../../src/components/Section';
import { Button } from '../../src/components/Button';
import { Overline, Text } from '../../src/components/Text';
import { ErrorState, LoadingState } from '../../src/components/StateViews';
import { useAnalysis } from '../../src/api/hooks/use-analysis';
import { useTheme } from '../../src/theme';

export default function AnalysisScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const analysis = useAnalysis(id);

  if (analysis.isLoading) return <LoadingState />;
  if (analysis.isError || !analysis.data) {
    return <ErrorState error={analysis.error} onRetry={() => void analysis.refetch()} />;
  }

  const data = analysis.data;

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Form analysis' }} />
      <Screen scroll>
        <Column gap="xl" style={{ paddingTop: theme.space.lg }}>
          <Status analysis={data} />

          {/* The footage itself. Worth showing even before any numbers exist,
              because until the analysis worker runs it is the only thing this
              screen actually has — and it is the thing the user shot. */}
          {data.videoUrl ? <Playback url={data.videoUrl} /> : null}

          {data.result ? <Result result={data.result} /> : null}

          <Button
            label="Back to the workout"
            variant="ghost"
            onPress={() => router.back()}
            fullWidth
          />
        </Column>
      </Screen>
    </>
  );
}

/**
 * The clip, played back.
 *
 * `url` is presigned and short-lived, which is why the player is keyed on it:
 * when the query refetches and the URL rotates, the key change replaces the
 * player rather than leaving one holding a link that has since expired.
 *
 * Native controls here, unlike the trim screen — this is watching a video, and
 * the platform's own scrubber is better than anything worth hand-building.
 */
function Playback({ url }: { url: string }) {
  const theme = useTheme();
  const player = useVideoPlayer({ uri: url }, (instance) => {
    instance.loop = true;
    // Muted by default: a set filmed in the app has no audio track at all, and
    // one picked from a gallery may have a conversation on it that the user
    // did not think about when they chose it.
    instance.muted = true;
  });

  return (
    <View
      style={{
        width: '100%',
        aspectRatio: 9 / 16,
        maxHeight: 420,
        borderRadius: theme.radius.md,
        overflow: 'hidden',
        backgroundColor: '#000',
      }}
    >
      <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls />
    </View>
  );
}

/** Where the pipeline has got to, said plainly. */
function Status({ analysis }: { analysis: Analysis }) {
  const waiting = analysis.status === 'queued' || analysis.status === 'processing';

  return (
    <Column gap="sm">
      <Overline>
        {analysis.status === 'awaiting_upload'
          ? 'not uploaded'
          : analysis.status === 'complete'
            ? 'done'
            : analysis.status === 'failed'
              ? 'failed'
              : 'saved'}
      </Overline>

      <Text variant="heading">
        {analysis.status === 'complete'
          ? `${analysis.repCount ?? 0} reps measured`
          : analysis.status === 'failed'
            ? 'Could not read this one'
            : waiting
              ? 'Saved'
              : 'Upload did not finish'}
      </Text>

      {/*
        This used to say "Working on it — tracking the bar through the clip",
        which was not true: there is no analysis worker running yet, so nothing
        was tracking anything and the screen would have said it forever. A
        status that describes work nobody is doing is worse than no status.
      */}
      {waiting ? (
        <Text tone="muted">
          Your clip is stored and you can watch it back any time. Bar-path measurements are not
          switched on yet — when they are, this set will be measured automatically and the numbers
          will appear here.
        </Text>
      ) : null}

      {/* The worker's message, which is written for a reader rather than a log. */}
      {analysis.error ? (
        <Card>
          <Text variant="caption" tone="warning">
            {analysis.error}
          </Text>
        </Card>
      ) : null}

      {analysis.status === 'failed' ? (
        <Text variant="caption" tone="faint">
          The usual cause is no weight plate in frame — the analysis measures pixels against a
          plate to get real distances, so without one it has no scale to work from.
        </Text>
      ) : null}
    </Column>
  );
}

function Result({ result }: { result: NonNullable<Analysis['result']> }) {
  const theme = useTheme();

  return (
    <Column gap="xl">
      <StatRow>
        <View style={{ flex: 1 }}>
          <Stat size="small" value={`${(result.verticalRangeM * 100).toFixed(0)} cm`} label="range" />
        </View>
        <View style={{ flex: 1 }}>
          <Stat
            size="small"
            value={`${(result.maxHorizontalDriftM * 100).toFixed(0)} cm`}
            label="drift"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Stat
            size="small"
            value={`${Math.round(result.straightness * 100)}%`}
            label="straight"
          />
        </View>
      </StatRow>

      <Card>
        <Column gap="xs">
          <Overline>bar path</Overline>
          <Text variant="caption" tone="muted">
            {straightnessNote(result.straightness, result.maxHorizontalDriftM)}
          </Text>
        </Column>
      </Card>

      <Section title="Rep by rep">
        <Column gap="sm">
          {result.reps.map((rep) => (
            <Row key={rep.index} justify="space-between" style={{ alignItems: 'center' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="caption" weight="semibold">
                  Rep {rep.index + 1}
                </Text>
                <Text variant="micro" tone="faint">
                  {(rep.romM * 100).toFixed(0)} cm · {(rep.eccentricMs / 1000).toFixed(1)}s down ·{' '}
                  {(rep.concentricMs / 1000).toFixed(1)}s up
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="caption" weight="semibold" style={{ color: theme.colors.accent }}>
                  {rep.meanConcentricVelocityMs.toFixed(2)} m/s
                </Text>
                <Text variant="micro" tone="faint">
                  peak {rep.peakConcentricVelocityMs.toFixed(2)}
                </Text>
              </View>
            </Row>
          ))}
        </Column>
      </Section>

      {result.velocityLossPercent === null ? null : (
        <Card>
          <Column gap="xs">
            <Overline>velocity loss</Overline>
            <Text variant="title" weight="heavy">
              {result.velocityLossPercent}%
            </Text>
            <Text variant="caption" tone="muted">
              {velocityLossNote(result.velocityLossPercent)}
            </Text>
          </Column>
        </Card>
      )}

      <Text variant="micro" tone="faint">
        Distances are scaled from a weight plate in frame, taken as 450 mm across. If the plate in
        your clip is a different size, every distance here is off by the same proportion.
      </Text>
    </Column>
  );
}

/**
 * The bar path in a sentence.
 *
 * Thresholds, not adjectives on a slope: a specific number said plainly beats
 * a grade, and "8 cm of drift" is something a lifter can picture and act on
 * where "B−" is not.
 */
function straightnessNote(straightness: number, driftM: number): string {
  const drift = Math.round(driftM * 100);
  if (straightness >= 0.9) {
    return `Almost perfectly vertical — ${drift} cm of horizontal movement across the whole set.`;
  }
  if (straightness >= 0.75) {
    return `Mostly vertical, drifting ${drift} cm. Normal for most lifts; worth watching if it grows as you fatigue.`;
  }
  return `The bar travelled ${drift} cm sideways. That is work not going into the lift, and usually means the bar is drifting away from you under load.`;
}

/**
 * Velocity loss, in the terms velocity-based training actually uses.
 *
 * Deliberately not prescriptive. This says what the number is generally taken
 * to mean and stops — the app does not know anyone's programme, and telling
 * someone to stop a set on one clip would be advice it has no standing to give.
 */
function velocityLossNote(percent: number): string {
  if (percent < 10) return 'Barely slowed. There was more in the tank at the end of this set.';
  if (percent < 20) return 'A moderate drop — commonly the range aimed for when training for strength.';
  if (percent < 30) return 'A large drop. Past roughly 20% is usually treated as the point where fatigue starts outweighing what the extra reps buy.';
  return 'A very large drop, which is what taking a set close to failure looks like.';
}
