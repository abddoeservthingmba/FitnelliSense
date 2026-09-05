/**
 * Getting a video of a set for form analysis (FR-VID-01, 03, 11, 12, 13).
 *
 * Six states in one screen, in the order they are reached: consent, choosing a
 * window, uploading, web, permission, camera. One screen because they are one
 * task — splitting them would mean six routes and a back button that lands
 * somewhere useless.
 *
 * THE ORDER OF THOSE CHECKS IS LOAD-BEARING, and it is why `pickFromLibrary`
 * is defined above all of them: several states offer it, so it cannot live
 * between two of the returns. The window chooser and the upload spinner sit
 * ABOVE the web check for the same reason — a browser can pick a file even
 * though it cannot film, and a web user who picks a long video still has to
 * choose a window.
 *
 * THE CONSENT STATE IS NOT DECORATION. The API refuses to issue an upload
 * target without a recorded consent, so this screen cannot skip it even if
 * someone tried: the request would 403. What it does is explain what is being
 * agreed to before asking, which the API cannot do.
 *
 * Filming is MUTED and 1080p at an explicit bitrate. Muted because the app
 * never uses the microphone, and a gym recording would otherwise pick up other
 * people's conversations.
 *
 * THE PREVIEW IS ASPECT-CORRECT, NOT FULL-BLEED, and that is the fix for a
 * camera that looked "zoomed in". A `flex: 1` preview is stretched to fill a
 * modern phone screen — around 9:19.5 — while the sensor delivers 9:16, so the
 * sides of every frame were being cropped away on screen. Nothing was actually
 * magnified; the viewfinder was lying about the framing, which is worse,
 * because someone frames a squat against a preview that is not what gets
 * recorded. Constraining the preview to the recorded aspect ratio shows the
 * whole frame, letterboxed.
 *
 * Zoom is a real control on top of that, since a phone propped at the end of a
 * rack is often too far away.
 *
 * A video picked from the library gets neither of those guarantees, because
 * the app has no transcoder and cannot re-encode what it is handed. It is
 * uploaded exactly as it is, sound and all. That is stated at the point of
 * consent rather than left to be discovered (FR-VID-13).
 */
import { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import {
  MAX_UPLOAD_BYTES,
  planUpload,
  type ClipWindow,
  type PickedVideo,
} from '@fi/domain';
import { ClipChooser } from '../../../src/features/analysis/ClipChooser';
import { Button } from '../../../src/components/Button';
import { Card, Row, Stack as Column } from '../../../src/components/Card';
import { Screen } from '../../../src/components/Screen';
import { Overline, Text } from '../../../src/components/Text';
import { LoadingState } from '../../../src/components/StateViews';
import {
  useGrantVideoConsent,
  useSetAnalyses,
  useUploadSetVideo,
  UploadFailure,
} from '../../../src/api/hooks/use-analysis';
import { useMe } from '../../../src/api/hooks/use-profile';
import { useTheme } from '../../../src/theme';

/**
 * How long the camera will run before stopping itself.
 *
 * Deliberately far below the analysable ceiling: one set is fifteen to forty
 * seconds, and a two-minute recording is someone who forgot to stop. A longer
 * video is what the library picker is for.
 */
const MAX_SECONDS = 60;

const MB = 1024 * 1024;

/**
 * The aspect ratio the camera actually records, as width / height in portrait.
 *
 * 1080p is 1920x1080, so portrait is 1080x1920 — 9:16. The preview is
 * constrained to this so what you frame is what gets recorded.
 */
const FRAME_ASPECT = 9 / 16;

/**
 * Bits per second, stated rather than left to the device.
 *
 * The default is chosen for file size and is visibly soft on a moving barbell,
 * which is the one thing this feature has to resolve clearly. 6 Mbps for 60
 * seconds is about 45 MB — comfortably inside the 80 MB cap with room for a
 * device that overshoots.
 */
const VIDEO_BITRATE = 6_000_000;

/** How far one tap of the zoom control moves, on expo-camera's 0–1 scale. */
const ZOOM_STEP = 0.05;

export default function RecordSetScreen() {
  const theme = useTheme();
  const { setId } = useLocalSearchParams<{ setId: string }>();
  const me = useMe();
  const grantConsent = useGrantVideoConsent();
  const upload = useUploadSetVideo();
  const [permission, requestPermission] = useCameraPermissions();

  /*
   * Takes already recorded for this set. Without this the screen is
   * write-only: the flow pushes straight to a result, and once that is
   * dismissed there is no route back to it from anywhere in the app.
   */
  const takes = useSetAnalyses(setId ?? null);

  const camera = useRef<CameraView>(null);
  const [recording, setRecording] = useState(false);
  const startedAt = useRef<number>(0);

  /** A video chosen from the library, waiting on a window before it uploads. */
  const [picked, setPicked] = useState<(PickedVideo & { uri: string }) | null>(null);
  // Not `window` — that shadows the global, which this file runs beside on web.
  const [chosenWindow, setChosenWindow] = useState<ClipWindow | null>(null);
  /** Why a pick was refused, when it was. */
  const [pickError, setPickError] = useState<string | null>(null);
  /** 0 is the widest the lens goes; 1 is the device's maximum. */
  const [zoom, setZoom] = useState(0);

  /**
   * Choose an existing video instead of filming one.
   *
   * No permission request of its own: on every platform the picker runs out of
   * process and hands back only the file the user selected, so asking for
   * library access first would be a prompt for something the app never does.
   */
  const pickFromLibrary = async () => {
    setPickError(null);

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsMultipleSelection: false,
      // Ask for the original. Any transform here would be a re-encode we have
      // no control over, and the file has to stay an mp4 the worker can read.
      quality: 1,
    });
    if (result.canceled) return;

    // `canceled: false` with an empty list is not a state the picker documents,
    // but the type admits it and a non-null assertion is not allowed here.
    const asset = result.assets[0];
    if (asset === undefined) return;

    /*
     * Both fields are optional in the picker's contract, and `duration` is the
     * one that matters: without it there is no way to know what was chosen, and
     * writing a guessed length into the analysis record would make every later
     * reading of it wrong. So it is refused rather than assumed — the same rule
     * the voice parser follows.
     */
    if (asset.duration == null) {
      setPickError(
        'That video did not report its length, so it cannot be measured. Try filming the set instead.',
      );
      return;
    }

    const video: PickedVideo = {
      durationSecs: asset.duration / 1000,
      // `fileSize` is absent often enough that the blob is the reliable source.
      // This is the early check; the upload measures the blob and the server
      // enforces the cap for real.
      byteLength: asset.fileSize ?? 0,
    };
    const plan = planUpload(video);

    if (plan.kind === 'too_short') {
      setPickError('That clip is under a second long.');
      return;
    }
    if (plan.kind === 'too_large') {
      setPickError(
        `That file is ${Math.round(plan.byteLength / MB)} MB and the limit is ${MAX_UPLOAD_BYTES / MB} MB. Trim it in your gallery app first, then choose it again.`,
      );
      return;
    }

    setPicked({ ...video, uri: asset.uri });
    setChosenWindow(plan.window);

    // Short enough that there is no choice to make — upload it as it is.
    if (plan.kind === 'ok') {
      upload.mutate(
        { setId, uri: asset.uri, durationSecs: Math.floor(video.durationSecs) },
        { onSuccess: (analysis) => router.replace(`/analysis/${analysis.id}`) },
      );
    }
  };

  const startUpload = (uri: string, durationSecs: number, clipStartSecs?: number) =>
    upload.mutate(
      { setId, uri, durationSecs, clipStartSecs },
      { onSuccess: (analysis) => router.replace(`/analysis/${analysis.id}`) },
    );

  if (me.isLoading) return <LoadingState />;

  const consented = me.data?.profile.videoConsentAt !== null;
  const failure = upload.error;

  const header = (title: string) => <Stack.Screen options={{ headerShown: true, title }} />;

  /** Earlier takes, as tappable rows. Shared by the web and camera states. */
  const takeRows = (takes.data?.items.length ?? 0) > 0 && (
    <Column gap="sm">
      <Overline>takes for this set</Overline>
      {takes.data?.items.map((take, index) => (
        <Pressable key={take.id} onPress={() => router.push(`/analysis/${take.id}`)}>
          <Card>
            <Row justify="space-between">
              <Text variant="caption" weight="semibold">
                {`Take ${takes.data.items.length - index}`}
              </Text>
              <Text variant="caption" tone="muted">
                {take.status === 'complete' && take.repCount !== null
                  ? `${take.repCount} reps`
                  : take.status}
              </Text>
            </Row>
          </Card>
        </Pressable>
      ))}
    </Column>
  );

  // ------------------------------------------------------------ consent --

  if (!consented) {
    return (
      <>
        {header('Form analysis')}
        <Screen scroll>
          <Column gap="xl" style={{ paddingTop: theme.space.xl }}>
            <Column gap="sm">
              <Overline>before you record</Overline>
              <Text variant="heading">This one records you</Text>
              <Text tone="muted">
                Everything else in Ascension is numbers you typed. This is a video of you training,
                so it is worth knowing exactly what happens to it.
              </Text>
            </Column>

            <Card>
              <Column gap="md">
                {[
                  'The clip is stored privately. There is no sharing feature — nobody else can see it, ever.',
                  'It is deleted automatically after 90 days.',
                  'The measurements are kept, because they are what your charts read. They contain no image of you.',
                  'Filming in the app records no sound. A video you pick from your phone is uploaded as it is, with any sound already on it — we cannot strip it out.',
                  'Nothing is sent to any outside AI service, and nothing is used to train anything.',
                  'You can delete any clip immediately, and turn this off again whenever you like.',
                ].map((line) => (
                  <Row key={line} gap="sm">
                    <Text style={{ color: theme.colors.accent }}>·</Text>
                    <Text variant="caption" tone="muted" style={{ flex: 1 }}>
                      {line}
                    </Text>
                  </Row>
                ))}
              </Column>
            </Card>

            <Column gap="sm">
              <Button
                label="I understand — turn it on"
                onPress={() => grantConsent.mutate()}
                loading={grantConsent.isPending}
                size="large"
                haptic
                fullWidth
              />
              <Button label="Not now" variant="ghost" onPress={() => router.back()} fullWidth />
              <Text variant="micro" tone="faint" style={{ textAlign: 'center' }}>
                The full policy is linked from your profile.
              </Text>
            </Column>
          </Column>
        </Screen>
      </>
    );
  }

  // ------------------------------------------------------ choose a window --

  if (picked !== null && chosenWindow !== null && !upload.isPending) {
    return (
      <>
        {header('Which part?')}
        <Screen scroll>
          <ClipChooser
            uri={picked.uri}
            durationSecs={picked.durationSecs}
            window={chosenWindow}
            onChange={setChosenWindow}
            onConfirm={() =>
              startUpload(picked.uri, Math.floor(picked.durationSecs), chosenWindow.startSecs)
            }
            onCancel={() => {
              setPicked(null);
              setChosenWindow(null);
            }}
          />
        </Screen>
      </>
    );
  }

  // ----------------------------------------------------------- uploading --

  if (upload.isPending) {
    return (
      <>
        {header('Uploading')}
        <Screen>
          <Column gap="md" style={{ paddingTop: theme.space.xxl }}>
            <LoadingState label="Uploading the clip…" />
            <Text variant="caption" tone="faint" style={{ textAlign: 'center' }}>
              Going straight to storage, so this is your connection rather than our server.
            </Text>
          </Column>
        </Screen>
      </>
    );
  }

  // ---------------------------------------------------------------- web --

  /*
   * expo-camera's web build implements `record()` as a console warning that
   * returns nothing. Left alone, a browser would show a working camera preview
   * and a record button that does nothing at all, forever — the worst kind of
   * broken, because it looks fine.
   *
   * Picking a file, on the other hand, works perfectly well on web, where the
   * picker is an `<input type="file">`. So the browser loses filming and keeps
   * everything else, which suits the machine: a laptop is the wrong thing to
   * film with and the right thing to read a result on.
   */
  if (Platform.OS === 'web') {
    return (
      <>
        {header('Form analysis')}
        <Screen scroll>
          <Column gap="xl" style={{ paddingTop: theme.space.xl }}>
            <Column gap="sm">
              <Overline>form analysis</Overline>
              <Text variant="heading">Upload a clip you already have</Text>
              <Text tone="muted">
                A browser cannot record video, and a laptop is an awkward thing to film a squat
                with. Choose a video here, or film the set in the Android app — the result reads
                the same on both.
              </Text>
            </Column>

            {pickError || failure ? (
              <Card>
                <Column gap="xs">
                  <Overline>{pickError ? 'cannot use that video' : stageLabel(failure)}</Overline>
                  <Text variant="caption" tone="warning">
                    {pickError ?? failure?.message}
                  </Text>
                </Column>
              </Card>
            ) : null}

            <Button
              label="Choose a video"
              onPress={() => void pickFromLibrary()}
              size="large"
              haptic
              fullWidth
            />

            {takeRows}

            <Button label="Back" variant="ghost" onPress={() => router.back()} fullWidth />
          </Column>
        </Screen>
      </>
    );
  }

  // --------------------------------------------------------- permission --

  if (!permission) return <LoadingState label="Checking the camera…" />;

  if (!permission.granted) {
    return (
      <>
        {header('Camera')}
        <Screen scroll>
          <Column gap="xl" style={{ paddingTop: theme.space.xxl }}>
            <Column gap="sm">
              <Overline>camera</Overline>
              <Text variant="heading">Filming needs the camera</Text>
              <Text tone="muted">Only while this screen is open, and without the microphone.</Text>
            </Column>
            <Column gap="sm">
              <Button label="Allow the camera" onPress={() => void requestPermission()} fullWidth />
              {/* Refusing the camera should not end the feature — an existing
                  video needs no camera at all. */}
              <Button
                label="Choose a video instead"
                variant="secondary"
                onPress={() => void pickFromLibrary()}
                fullWidth
              />
              <Button label="Back" variant="ghost" onPress={() => router.back()} fullWidth />
            </Column>
          </Column>
        </Screen>
      </>
    );
  }

  // ------------------------------------------------------------- camera --

  const stop = () => {
    // Guarded: stopRecording on a camera that is not recording throws.
    if (!recording) return;
    setRecording(false);
    camera.current?.stopRecording();
  };

  const start = async () => {
    if (recording) {
      stop();
      return;
    }
    setRecording(true);
    startedAt.current = Date.now();

    // recordAsync resolves when recording STOPS, so this await spans the whole
    // take rather than returning immediately.
    const result = await camera.current
      ?.recordAsync({
        maxDuration: MAX_SECONDS,
        // A hard stop at the server's cap. Without it a device that overshoots
        // the requested bitrate produces a file that records fine and is then
        // refused at presign — after the user has already done the set.
        maxFileSize: MAX_UPLOAD_BYTES,
      })
      .catch(() => null);

    setRecording(false);
    if (!result?.uri) return;

    startUpload(result.uri, Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)));
  };

  return (
    <>
      {header('Record the set')}
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {/* Centred and letterboxed rather than stretched to fill. See the note
            at the top of the file: full-bleed was cropping the sides off the
            viewfinder while recording the full frame. */}
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <CameraView
            ref={camera}
            style={{ width: '100%', aspectRatio: FRAME_ASPECT }}
            mode="video"
            videoQuality="1080p"
            // Stated, not left to the device — the default is soft on a moving
            // barbell, which is the one thing this has to resolve clearly.
            videoBitrate={VIDEO_BITRATE}
            zoom={zoom}
            // The app never uses the microphone. This is that sentence — and it
            // also stops a gym recording picking up other people's conversations.
            mute
            facing="back"
          />
        </View>

        {/* Framing guide. The analysis scales pixels to metres from a plate in
            shot, so a clip with no plate visible cannot produce a velocity. */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: theme.space.lg }}
        >
          <Card>
            <Text variant="caption" tone="muted">
              {recording
                ? 'Recording — tap to stop. Keep the bar and a plate in frame.'
                : 'Stand the phone side-on, whole lift in frame, with a weight plate visible. Under a minute.'}
            </Text>
          </Card>
        </View>

        {/* Earlier takes, hidden while filming so nothing competes with the
            frame. `pointerEvents` is set per-layer, not on the parent, because
            the guide above must stay tap-through and these must not. */}
        {!recording && takeRows ? (
          <View
            style={{ position: 'absolute', left: 0, right: 0, top: 96, paddingHorizontal: theme.space.lg }}
          >
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Row gap="sm">
                {takes.data?.items.map((take, index) => (
                  <Pressable
                    key={take.id}
                    onPress={() => router.push(`/analysis/${take.id}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`Take ${index + 1}, ${take.status}`}
                    style={({ pressed }) => ({
                      paddingVertical: theme.space.xs,
                      paddingHorizontal: theme.space.md,
                      borderRadius: theme.radius.pill,
                      backgroundColor: theme.colors.surface,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Text variant="micro" weight="semibold">
                      {`Take ${takes.data.items.length - index}`}
                      {take.status === 'complete' && take.repCount !== null
                        ? ` · ${take.repCount} reps`
                        : take.status === 'failed'
                          ? ' · failed'
                          : ' · working'}
                    </Text>
                  </Pressable>
                ))}
              </Row>
            </ScrollView>
          </View>
        ) : null}

        {failure || pickError ? (
          <View
            style={{ position: 'absolute', left: 0, right: 0, bottom: 140, padding: theme.space.lg }}
          >
            <Card>
              <Column gap="xs">
                <Overline>{pickError ? 'cannot use that video' : stageLabel(failure)}</Overline>
                <Text variant="caption" tone="warning">
                  {pickError ?? failure?.message}
                </Text>
              </Column>
            </Card>
          </View>
        ) : null}

        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: theme.space.xl,
            alignItems: 'center',
            gap: theme.space.md,
          }}
        >
          {/* Zoom stays available WHILE recording — a lifter who set the phone
              down and started a set cannot walk over and reframe it. */}
          <Row gap="sm" style={{ alignItems: 'center' }}>
            <ZoomButton
              label="−"
              accessibilityLabel="Zoom out"
              disabled={zoom <= 0}
              onPress={() => setZoom((current) => Math.max(0, current - ZOOM_STEP))}
            />
            <Text
              variant="micro"
              weight="semibold"
              style={{ color: '#FFFFFF', minWidth: 56, textAlign: 'center' }}
            >
              {/* A percentage of the device's maximum, because expo-camera's
                  scale is a fraction of a maximum that differs per phone —
                  printing "2x" would be a number we cannot stand behind. */}
              {zoom === 0 ? 'no zoom' : `${Math.round(zoom * 100)}%`}
            </Text>
            <ZoomButton
              label="+"
              accessibilityLabel="Zoom in"
              disabled={zoom >= 1}
              onPress={() => setZoom((current) => Math.min(1, current + ZOOM_STEP))}
            />
          </Row>

          <Pressable
            onPress={() => void start()}
            accessibilityRole="button"
            accessibilityLabel={recording ? 'Stop recording' : 'Start recording'}
            style={({ pressed }) => ({
              width: 76,
              height: 76,
              borderRadius: 38,
              borderWidth: 4,
              borderColor: '#FFFFFF',
              backgroundColor: recording ? theme.colors.danger : 'rgba(255,255,255,0.25)',
              opacity: pressed ? 0.7 : 1,
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            {recording ? (
              <View style={{ width: 26, height: 26, borderRadius: 4, backgroundColor: '#FFFFFF' }} />
            ) : null}
          </Pressable>

          {/* Hidden while filming: tapping into the picker mid-take would lose
              the recording with no way to get it back. */}
          {recording ? null : (
            <Row gap="md">
              <Button label="Choose a video" variant="ghost" onPress={() => void pickFromLibrary()} />
              <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
            </Row>
          )}
        </View>
      </View>
    </>
  );
}

/**
 * One zoom control. Big enough to hit without looking away from the bar, and
 * drawn in plain white because it sits on a camera preview rather than on the
 * app's own surfaces — a theme colour would vanish against the wrong gym wall.
 */
function ZoomButton({
  label,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.55)',
        backgroundColor: 'rgba(0,0,0,0.35)',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.35 : pressed ? 0.6 : 1,
      })}
    >
      <Text variant="callout" weight="heavy" style={{ color: '#FFFFFF' }}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Names the step that failed.
 *
 * Worth the detail: "upload failed" sends someone to check their signal when
 * the real answer might be that storage is switched off server-side, which
 * they cannot fix and should not waste time on.
 */
function stageLabel(error: unknown): string {
  if (!(error instanceof UploadFailure)) return 'something went wrong';
  return error.stage === 'ask'
    ? 'could not start'
    : error.stage === 'put'
      ? 'upload interrupted'
      : 'uploaded, but not queued';
}
