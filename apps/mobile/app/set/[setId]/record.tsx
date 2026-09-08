/**
 * Getting a video of a set for form analysis (FR-VID-01, 03, 11, 12, 13).
 *
 * Seven states in one screen, in the order they are reached: consent, tapping
 * the plate, choosing a window, uploading, web, permission, camera. One screen
 * because they are one task — splitting them would mean seven routes and a
 * back button that lands somewhere useless.
 *
 * THE ORDER OF THOSE CHECKS IS LOAD-BEARING, and it is why `pickFromLibrary`
 * is defined above all of them: several states offer it, so it cannot live
 * between two of the returns. The window chooser and the upload spinner sit
 * ABOVE the web check for the same reason — a browser can pick a file even
 * though it cannot film, and a web user who picks a long video still has to
 * choose a window.
 *
 * THE TAP SITS ABOVE THE WINDOW CHOOSER, which is the subtle one. A short
 * picked clip sets `picked` and `chosenWindow` on its way through, so the
 * chooser's condition matches it too — it used to be hidden only because
 * `startUpload` made the upload pending in the same tick. Now that a tap comes
 * first nothing is pending, and the chooser would render over the top asking
 * which part of a twelve-second video to measure.
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
  canRequestAnalysis,
  planUpload,
  type ClipWindow,
  type PickedVideo,
} from '@fi/domain';
import type { BarSeed } from '@fi/shared';
import { ClipChooser } from '../../../src/features/analysis/ClipChooser';
import { PlateTapper } from '../../../src/features/analysis/PlateTapper';
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
  const { setId, slug } = useLocalSearchParams<{ setId: string; slug?: string }>();
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
  /**
   * A clip waiting on the lifter to point at the plate.
   *
   * Held here rather than uploaded immediately, because the tap has to travel
   * WITH the upload request — the seed is part of the presign body, so there
   * is no adding it afterwards.
   */
  const [pendingTap, setPendingTap] = useState<{ uri: string; durationSecs: number } | null>(null);
  /** 0 is the widest the lens goes; 1 is the device's maximum. */
  const [zoom, setZoom] = useState(0);

  /*
   * Whether the analyser has rules for this lift. The server decides for real —
   * a client can send anything — but the screen needs to know so it does not
   * offer a choice that cannot be honoured, or promise a measurement that will
   * never arrive.
   */
  const measurable = canRequestAnalysis(slug ?? null);

  /*
   * Defaults to measuring when the lift supports it, and cannot be turned on
   * when it does not. Someone who set a phone up to film a squat almost
   * certainly wants the numbers; someone filming a curl cannot have them.
   */
  const [analyse, setAnalyse] = useState(measurable);

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

    // Short enough that there is no window to choose — upload it as it is.
    if (plan.kind === 'ok') {
      startUpload(asset.uri, Math.floor(video.durationSecs));
    }
  };

  /**
   * THE ONLY WAY AN UPLOAD STARTS. Every path — filmed, picked short, picked
   * long and trimmed — comes through here.
   *
   * That is not tidiness. This function is where `analyse` gets attached, and
   * when the library path called `upload.mutate` directly it silently omitted
   * it: the flag defaults to false on the wire, so a gallery clip uploaded with
   * the toggle ON was stored without analysis and the result screen then told
   * the user they had not asked for it. Two call sites, one of which forgot a
   * parameter, and nothing in the types could catch it because the parameter is
   * optional.
   *
   * One entry point makes that class of bug unrepresentable rather than merely
   * fixed.
   */
  const startUpload = (uri: string, durationSecs: number, clipStartSecs?: number) => {
    /*
     * ASK FOR THE TAP FIRST, when it is worth asking for.
     *
     * It is worth asking whenever the clip is going to be measured, because
     * without it the tracker has to work out for itself which circular thing
     * in the gym is the bar — and on real footage it abstains far more often
     * than it succeeds. On the first real clip the guess reached 59% coherence
     * and was refused; a tap reached 85% and produced a measurable path.
     *
     * NOT asked for a clip that is only being kept: there is nothing to point
     * at a tracker that will not run. And not asked for a WINDOWED clip
     * either — a tap belongs to a specific frame, this screen can only show
     * the first frame of the file, and the analysed window starts somewhere
     * else. The worker refuses a windowed clip today in any case, so asking
     * would collect an answer nothing could use.
     */
    if (analyse && measurable && !clipStartSecs) {
      setPendingTap({ uri, durationSecs });
      return;
    }
    submitUpload(uri, durationSecs, clipStartSecs);
  };

  /** The mutation itself. Reached from `startUpload`, or from the tap screen. */
  const submitUpload = (
    uri: string,
    durationSecs: number,
    clipStartSecs?: number,
    seed?: BarSeed,
  ) =>
    upload.mutate(
      // `analyse && measurable`, not just `analyse`: belt and braces against a
      // stale toggle if the slug were ever to change under the screen. The
      // server checks this too and is the authority.
      { setId, uri, durationSecs, clipStartSecs, analyse: analyse && measurable, seed },
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

  // ------------------------------------------------------- tap the plate --

  /*
   * BEFORE the window chooser, and that ordering is load-bearing. A short
   * picked clip sets `picked` and `chosenWindow` on its way through, so the
   * chooser's condition below is satisfied for it too — it used to be hidden
   * only because `startUpload` made `upload.isPending` true in the same tick.
   * Now that a tap comes first, nothing is pending, and the chooser would
   * render over the top asking which part of a 12-second video to analyse.
   */
  if (pendingTap !== null && !upload.isPending) {
    return (
      <>
        {header('Tap the plate')}
        <Screen scroll>
          <PlateTapper
            uri={pendingTap.uri}
            onDone={(seed) => {
              const clip = pendingTap;
              setPendingTap(null);
              submitUpload(clip.uri, Math.floor(clip.durationSecs), undefined, seed ?? undefined);
            }}
            onCancel={() => {
              setPendingTap(null);
              setPicked(null);
              setChosenWindow(null);
            }}
          />
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
    const percent = Math.round(upload.progress * 100);
    const done = upload.progress >= 1;

    return (
      <>
        {header('Uploading')}
        <Screen>
          <Column gap="lg" style={{ paddingTop: theme.space.xxl }}>
            <Column gap="xs" style={{ alignItems: 'center' }}>
              {/* A real number, not a spinner. A 45 MB file on gym wifi takes
                  long enough that "uploading…" is indistinguishable from
                  "hung", and the difference matters because leaving this
                  screen cancels the upload. */}
              <Text variant="display" weight="heavy">
                {`${percent}%`}
              </Text>
              <Text variant="caption" tone="muted">
                {done ? 'Finishing off…' : 'Uploading the clip'}
              </Text>
            </Column>

            <View
              style={{
                height: 8,
                borderRadius: 4,
                backgroundColor: theme.colors.surfaceRaised,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${percent}%`,
                  height: '100%',
                  backgroundColor: theme.colors.accent,
                }}
              />
            </View>

            <Text variant="caption" tone="faint" style={{ textAlign: 'center' }}>
              Going straight to storage, so this is your connection rather than our server. Stay on
              this screen until it finishes.
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
                : measurable
                  ? 'Stand the phone side-on, whole lift in frame, with a weight plate visible. Under a minute.'
                  : 'Film whatever is useful to watch back. Set the phone somewhere stable.'}
            </Text>
          </Card>
        </View>

        {/* The choice, stated before filming rather than after — the framing
            advice above only matters if the clip is going to be measured. */}
        {recording ? null : (
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 96,
              paddingHorizontal: theme.space.lg,
            }}
          >
            <Pressable
              onPress={() => measurable && setAnalyse((on) => !on)}
              disabled={!measurable}
              accessibilityRole="switch"
              accessibilityState={{ checked: analyse, disabled: !measurable }}
              accessibilityLabel="Analyse this set"
            >
              <Card>
                <Row justify="space-between" style={{ alignItems: 'center' }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="caption" weight="semibold">
                      {measurable ? 'Analyse this set' : 'Analysis not available for this lift'}
                    </Text>
                    <Text variant="micro" tone="faint">
                      {!measurable
                        ? 'The clip is saved and you can watch it back. Squats, deadlifts, bench and overhead press can be measured.'
                        : analyse
                          ? 'Bar path and rep measurements when the analyser is switched on.'
                          : 'Just keep the video — nothing will be measured.'}
                    </Text>
                  </View>
                  <Text
                    variant="callout"
                    weight="heavy"
                    style={{
                      color: analyse && measurable ? theme.colors.accent : theme.colors.textFaint,
                      marginLeft: theme.space.md,
                    }}
                  >
                    {analyse && measurable ? 'ON' : 'OFF'}
                  </Text>
                </Row>
              </Card>
            </Pressable>
          </View>
        )}

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
