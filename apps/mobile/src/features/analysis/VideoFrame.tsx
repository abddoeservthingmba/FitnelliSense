/**
 * A video sized to the video, rather than to a shape guessed in advance.
 *
 * THE BUG THIS FIXES: the player used to sit in a hardcoded 9:16 box. That is
 * right for a phone held upright and wrong for everything else — a landscape
 * clip was letterboxed into a tall frame with black bars down most of it, and
 * the result looked broken rather than merely imperfect. A gym video can be
 * either orientation, and often is: a squat is filmed upright, a bench press
 * from the side.
 *
 * So the aspect ratio is READ from the track instead. `videoTrackChange` fires
 * once the source is far enough along to know its dimensions, and the frame
 * reshapes itself then. Before that there is nothing to read, so it holds a
 * portrait default — the common case for a phone — and a wrong guess lasts a
 * fraction of a second rather than the life of the screen.
 *
 * Height is capped so a very tall clip cannot push the rest of the screen out
 * of view, and the cap is applied to the CONTAINER while the aspect ratio
 * stays on the frame inside it. Setting both on one element is what produced
 * the original squashed box: React Native resolves `width: 100%` against the
 * aspect ratio, then `maxHeight` clamps the result and the ratio quietly stops
 * holding.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { VideoView, type VideoPlayer } from 'expo-video';
import { useTheme } from '../../theme';

/** A phone held upright: the likeliest shape before the track is known. */
const PORTRAIT = 9 / 16;

export interface VideoFrameProps {
  player: VideoPlayer;
  /** Tallest the frame may get, so a 9:16 clip cannot fill the whole screen. */
  maxHeight?: number;
  nativeControls?: boolean;
}

export function VideoFrame({ player, maxHeight = 420, nativeControls = true }: VideoFrameProps) {
  const theme = useTheme();
  const [aspect, setAspect] = useState<number | null>(null);

  useEffect(() => {
    /*
     * The track may already be resolved by the time this mounts — a replayed
     * or cached source resolves immediately — so the current value is read
     * before subscribing, or the event has already fired and nothing would
     * ever set the shape.
     */
    const apply = (size: { width: number; height: number } | undefined) => {
      if (!size || size.width <= 0 || size.height <= 0) return;
      setAspect(size.width / size.height);
    };

    apply(player.videoTrack?.size);

    const subscription = player.addListener('videoTrackChange', (payload) => {
      apply(payload.videoTrack?.size ?? undefined);
    });
    return () => subscription.remove();
  }, [player]);

  return (
    <View
      style={{
        width: '100%',
        maxHeight,
        borderRadius: theme.radius.md,
        overflow: 'hidden',
        backgroundColor: '#000',
        // Centres the frame when the cap above has made the container wider
        // than the video is allowed to be.
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <VideoView
        player={player}
        style={{ width: '100%', aspectRatio: aspect ?? PORTRAIT, maxHeight }}
        // `contain` never crops. A bar path judged from a cropped frame would
        // be judged from the wrong picture, and letterboxing is the honest
        // trade for that.
        contentFit="contain"
        nativeControls={nativeControls}
      />
    </View>
  );
}
