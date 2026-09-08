/**
 * "Tap the plate" — the one input that makes the tracker work.
 *
 * WHY A HUMAN IS ASKED AT ALL. Deciding which circular thing in a gym is the
 * bar is the half of tracking that kept failing, and it failed differently
 * every time: ceiling lights, then a wall fan, then a circle twice the plate's
 * size. Following, once pointed at the right object, is the half that works.
 * On the first real clip the guess reached 59% frame-to-frame coherence and the
 * clip was refused; a tap reached 85% and produced a path whose vertical extent
 * matches a deadlift. Every acquisition heuristic encodes a guess about gyms; a
 * tap is not a guess, it is the answer, and it costs a second.
 *
 * THE TAP IS SENT AS FRACTIONS OF THE FRAME, NEVER PIXELS. This screen knows
 * where a finger landed inside the view it drew. What it does not reliably know
 * is the video's source resolution — Android reports a rotated clip's
 * dimensions inconsistently, and a `<video>` element reports the post-rotation
 * size while the container stores the other one. So the fraction travels and
 * the analyzer resolves it against the frames it actually decodes, which is the
 * only place that can. Asking either side of that boundary to reason about
 * container rotation is exactly the confusion that had this pipeline measuring
 * deadlifts sideways for three iterations.
 *
 * THE LETTERBOX IS THE PART THAT IS EASY TO GET WRONG. The player uses
 * `contentFit="contain"`, so unless the view happens to match the video's
 * aspect ratio there are bars at the top and bottom or at the sides, and those
 * bars are part of the touch target but NOT part of the frame. Measuring a tap
 * against the view instead of against the video's content rect would offset
 * every seed — by up to a third of the frame on a tall phone showing a
 * landscape clip — and the failure would be silent: the tracker would lock
 * confidently onto whatever happens to be at the wrong place.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { tapToFrameFraction } from '@fi/domain';
import type { BarSeed } from '@fi/shared';
import { Button } from '../../components/Button';
import { Card, Stack as Column, Row } from '../../components/Card';
import { Text } from '../../components/Text';
import { useTheme } from '../../theme';

/** A phone held upright: the likeliest shape before the track is known. */
const PORTRAIT = 9 / 16;

/** How big the marker is. Large enough to see past a fingertip. */
const MARKER = 44;

export interface PlateTapperProps {
  /** The local file URI of the clip about to be uploaded. */
  uri: string;
  /** Called with the tap, or with null when the lifter chooses to skip. */
  onDone: (seed: BarSeed | null) => void;
  onCancel: () => void;
  busy?: boolean;
}

export function PlateTapper({ uri, onDone, onCancel, busy = false }: PlateTapperProps) {
  const theme = useTheme();
  const [aspect, setAspect] = useState<number | null>(null);
  const [view, setView] = useState({ width: 0, height: 0 });
  /** Where the marker is drawn, in view coordinates. */
  const [mark, setMark] = useState<{ x: number; y: number } | null>(null);
  /** What gets sent: fractions of the frame. */
  const seed = useRef<BarSeed | null>(null);

  /*
   * PAUSED ON THE FIRST FRAME, and it must be. `Seed.atSecs` defaults to zero
   * and the analyzer applies the tap on that frame only, so a player left
   * running would have the lifter pointing at a plate that has already moved.
   * Scrubbing is not offered for the same reason it is not needed: the plate is
   * at its most obvious before the lift starts.
   */
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
    instance.muted = true;
    instance.pause();
  });

  useEffect(() => {
    const apply = (size: { width: number; height: number } | undefined) => {
      if (!size || size.width <= 0 || size.height <= 0) return;
      setAspect(size.width / size.height);
    };
    // The track may already be resolved by the time this mounts, in which case
    // the event has fired and nothing would ever set the shape.
    apply(player.videoTrack?.size);
    const subscription = player.addListener('videoTrackChange', (payload) => {
      apply(payload.videoTrack?.size ?? undefined);
    });
    return () => subscription.remove();
  }, [player]);

  const shape = aspect ?? PORTRAIT;

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setView({ width, height });
    // A tap measured against the old size would be in the wrong place, and a
    // stale marker is worse than none: it looks like a recorded answer.
    setMark(null);
    seed.current = null;
  };

  const onTap = (x: number, y: number) => {
    /*
     * The conversion lives in `@fi/domain` rather than here, and not for
     * tidiness: it is the one part of this flow that decides where the
     * analyser will look for the barbell, and `apps/mobile` has no test runner.
     * A null means the tap landed in the letterbox, which is refused rather
     * than clamped — see `tapToFrameFraction`.
     */
    const fraction = tapToFrameFraction({ x, y }, view, shape);
    if (fraction === null) return;

    setMark({ x, y });
    seed.current = { x: fraction.x, y: fraction.y, atSecs: 0 };
  };

  return (
    <Column gap="md">
      <Card>
        <Column gap="xs">
          <Text variant="caption" weight="semibold">
            Tap the plate
          </Text>
          <Text variant="caption" tone="muted">
            Touch the middle of the weight plate on the end of the bar. That is all we need — it
            tells us what to follow, and a gym is full of round things that are not barbells.
          </Text>
        </Column>
      </Card>

      <Pressable
        onLayout={onLayout}
        onPress={(event) => onTap(event.nativeEvent.locationX, event.nativeEvent.locationY)}
        accessibilityRole="button"
        accessibilityLabel="Tap the weight plate in the video"
        style={{
          width: '100%',
          aspectRatio: shape,
          maxHeight: 420,
          borderRadius: theme.radius.md,
          overflow: 'hidden',
          backgroundColor: '#000',
        }}
      >
        <VideoView
          player={player}
          style={{ width: '100%', height: '100%' }}
          contentFit="contain"
          // No controls: the tap target is the whole surface, and a play button
          // sitting on it would both steal touches and start the video moving.
          nativeControls={false}
        />
        {mark !== null && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: mark.x - MARKER / 2,
              top: mark.y - MARKER / 2,
              width: MARKER,
              height: MARKER,
              borderRadius: MARKER / 2,
              borderWidth: 3,
              borderColor: theme.colors.accent,
              backgroundColor: 'transparent',
            }}
          />
        )}
      </Pressable>

      <Row gap="sm">
        <Button
          label={mark === null ? 'Tap the plate first' : 'Upload and measure'}
          onPress={() => onDone(seed.current)}
          disabled={mark === null || busy}
          loading={busy}
        />
      </Row>

      <Column gap="xs">
        {/*
          SKIPPING IS OFFERED, and honestly. The plate is not always visible —
          a bench filmed from the wrong side, a machine, a dumbbell — and
          refusing to upload without a tap would block a clip the lifter still
          wants kept. What it costs is stated rather than discovered.
        */}
        <Button
          label="Upload without tapping"
          variant="ghost"
          onPress={() => onDone(null)}
          disabled={busy}
        />
        <Text variant="caption" tone="muted">
          We will still keep the video, but we probably will not be able to measure it.
        </Text>
        <Button label="Back" variant="ghost" onPress={onCancel} disabled={busy} />
      </Column>
    </Column>
  );
}
