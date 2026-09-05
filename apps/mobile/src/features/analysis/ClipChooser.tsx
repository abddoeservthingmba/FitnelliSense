/**
 * Choosing which part of a long video gets analysed, with the video playing
 * (FR-VID-12).
 *
 * A SEPARATE COMPONENT because it owns a video player, and `useVideoPlayer` is
 * a hook: it cannot live inside the branch of the record screen that shows this
 * state. That constraint pushed the code somewhere better than it was.
 *
 * THE INTERACTION, and why there is no two-handled trim bar: you play the
 * video, find the moment your set starts, and press one button. The window
 * follows from there, because its LENGTH is fixed by the analysis ceiling —
 * only the start is a real choice, so a second handle would be a control that
 * cannot do anything. Scrubbing to a frame you can see is also a far better
 * way to pick a moment than dragging a handle along an undifferentiated bar.
 *
 * WHAT THIS DOES NOT DO is cut the file. The app has no transcoder. The whole
 * video is uploaded and the window travels with it as two numbers, which is
 * stated here rather than left to be discovered later.
 */
import { useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { useVideoPlayer } from 'expo-video';
import { clipSegments, clipWindow, MAX_CLIP_SECONDS, type ClipWindow } from '@fi/domain';
import { VideoFrame } from './VideoFrame';
import { Button } from '../../components/Button';
import { Card, Row, Stack as Column } from '../../components/Card';
import { Overline, Text } from '../../components/Text';
import { formatClock } from '../../lib/format';
import { useTheme } from '../../theme';

export interface ClipChooserProps {
  uri: string;
  /** Whole-file length in seconds. */
  durationSecs: number;
  window: ClipWindow;
  onChange: (window: ClipWindow) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ClipChooser({
  uri,
  durationSecs,
  window,
  onChange,
  onConfirm,
  onCancel,
}: ClipChooserProps) {
  const theme = useTheme();
  const total = Math.floor(durationSecs);
  const segments = clipSegments(durationSecs);

  const player = useVideoPlayer({ uri }, (instance) => {
    // Muted: a gym clip may have other people talking on it, and this screen
    // is about finding a moment in the picture.
    instance.muted = true;
    instance.loop = false;
  });

  /*
   * Polled rather than subscribed. expo-video exposes `currentTime` as a
   * property and fires no per-frame event, so a timer is the only way to move
   * a playhead readout — four times a second, which is enough to read and
   * cheap enough not to compete with playback.
   */
  const [position, setPosition] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setPosition(player.currentTime), 250);
    return () => clearInterval(timer);
  }, [player]);

  const [playing, setPlaying] = useState(false);
  const togglePlay = () => {
    if (playing) player.pause();
    else player.play();
    setPlaying(!playing);
  };

  const seekTo = (seconds: number) => {
    // `seekBy` is relative; there is no absolute seek on the player, so the
    // delta is computed from where it currently is.
    player.seekBy(seconds - player.currentTime);
    setPosition(seconds);
  };

  const startHere = () => {
    const next = clipWindow(durationSecs, Math.floor(player.currentTime));
    onChange(next);
  };

  const windowLength = window.endSecs - window.startSecs;

  return (
    <Column gap="lg" style={{ paddingTop: theme.space.md }}>
      <Column gap="xs">
        <Overline>{`${formatClock(total)} long`}</Overline>
        <Text variant="heading">Find the set</Text>
        <Text variant="caption" tone="muted">
          {`Play the video, stop where your set begins, then mark it. ${Math.round(
            MAX_CLIP_SECONDS / 60,
          )} minutes from that point get analysed.`}
        </Text>
      </Column>

      {/* Sized to the video, not to a shape assumed in advance — a landscape
          clip in a portrait box is mostly black bars. */}
      <VideoFrame player={player} maxHeight={340} nativeControls={false} />

      {/* Playhead and transport. Deliberately plain: this is a scrubber for
          finding one moment, not a media player. */}
      <Row gap="sm" style={{ alignItems: 'center' }}>
        <Transport label="◀◀" accessibilityLabel="Back ten seconds" onPress={() => seekTo(Math.max(0, position - 10))} />
        <Transport
          label={playing ? '❚❚' : '▶'}
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          onPress={togglePlay}
        />
        <Transport
          label="▶▶"
          accessibilityLabel="Forward ten seconds"
          onPress={() => seekTo(Math.min(total, position + 10))}
        />
        <Text
          variant="caption"
          weight="semibold"
          style={{ marginLeft: theme.space.sm, fontVariant: ['tabular-nums'] }}
        >
          {`${formatClock(Math.floor(position))} / ${formatClock(total)}`}
        </Text>
      </Row>

      <Button label="Start the analysis here" variant="secondary" onPress={startHere} fullWidth />

      <Card>
        <Column gap="xs">
          <Overline>will be analysed</Overline>
          <Text variant="callout" weight="heavy">
            {`${formatClock(window.startSecs)} – ${formatClock(window.endSecs)}`}
            <Text variant="caption" tone="muted">{`  (${formatClock(windowLength)})`}</Text>
          </Text>
          <Text variant="micro" tone="faint">
            The whole video is uploaded — this chooses the part that gets measured. You can measure
            a different part later without filming again.
          </Text>
        </Column>
      </Card>

      {/* Coarse jumps, for a long video where scrubbing to the third minute by
          hand is tedious. */}
      {segments.length > 1 ? (
        <Column gap="sm">
          <Overline>or jump</Overline>
          <Row gap="sm" wrap>
            {segments.map((segment) => (
              <Pressable
                key={segment.startSecs}
                onPress={() => {
                  onChange(segment);
                  seekTo(segment.startSecs);
                }}
                style={({ pressed }) => ({
                  paddingVertical: theme.space.xs,
                  paddingHorizontal: theme.space.md,
                  borderRadius: theme.radius.pill,
                  borderWidth: 1,
                  borderColor:
                    segment.startSecs === window.startSecs ? theme.colors.accent : theme.colors.border,
                  backgroundColor: theme.colors.surfaceRaised,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text variant="micro" weight="semibold">
                  {formatClock(segment.startSecs)}
                </Text>
              </Pressable>
            ))}
          </Row>
        </Column>
      ) : null}

      <Column gap="sm">
        <Button label="Upload this part" onPress={onConfirm} size="large" haptic fullWidth />
        <Button label="Choose a different video" variant="ghost" onPress={onCancel} fullWidth />
      </Column>
    </Column>
  );
}

/** One transport control. Square, thumb-sized, and readable on a dark card. */
function Transport({
  label,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        borderRadius: theme.radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceRaised,
        borderWidth: 1,
        borderColor: theme.colors.border,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text variant="caption" weight="heavy">
        {label}
      </Text>
    </Pressable>
  );
}
