# ADR 0005 — Video storage, and how bar path gets captured

**Status:** Proposed
**Date:** 2026-09-03
**Requirements:** FR-VID-\* (new), NFR-S-\*, BRD §6.8

## Context

Lifting analysis needs video: record or upload a barbell set, downscale it to
720p30, track the bar, and show the path with the numbers that come off it.

Video does not fit anywhere we currently store things. Neon's free tier is
512 MB for the whole database, and a single 30-second 720p clip is around 6 MB
— ninety clips would fill it, and that space is meant for every workout, set
and exercise anyone ever logs. Putting binaries in Postgres would also make
every backup and every migration drag them along.

So this needs an object store, and it needs to be free at trial scale.

## Options considered

Numbers are from the providers' published free tiers on 2026-09-03. **Verify
before relying on them** — free tiers move.

| Option              | Free storage | Egress                            | Notes                                                                  |
| ------------------- | ------------ | --------------------------------- | ---------------------------------------------------------------------- |
| **Cloudflare R2**   | 10 GB        | **Free, unmetered**               | S3-compatible. Already modelled in our media schema.                   |
| Backblaze B2        | 10 GB        | 3× stored per month, then charged | Free via Cloudflare in front of it, which means running two accounts.  |
| Supabase Storage    | 1 GB         | 5 GB/mo                           | 1 GB is roughly 160 clips in total. Too small to bother wiring up.     |
| Cloudinary          | ~25 GB-ish   | Shared "credits"                  | Would transcode for us, but video burns credits fast and it is opaque. |
| Neon (bytea column) | 512 MB       | n/a                               | Shares the app's only database. Not seriously an option.               |

## Decision

**Cloudflare R2.**

Two reasons, in order of weight:

**Egress is what actually costs money with video.** Storage is the number
everyone compares, and it is the wrong one. A clip is written once and watched
repeatedly; on any metered-egress provider the bill scales with how much people
use the feature, which is precisely the wrong incentive. R2 charges nothing for
egress at any volume.

**We already model R2.** `packages/shared/src/media.ts` has a `delivery` of
`r2_copy` with an `r2Key`, and `content/exercises.seed.json` carries those keys
today. Choosing anything else would mean two object stores, two sets of
credentials and two code paths for "where does this asset live". This is not a
new decision so much as the one already made, applied to a second kind of media.

### The rule that keeps this inside the free tier

**The video is evidence. The path is the data.**

A tracked path is about 900 points for a 30-second set — under 20 KB of JSON,
and less stored as parallel arrays. Every metric in `packages/domain/bar-path.ts`
is computed from the path alone. The video is only needed to _watch_ the rep.

So:

- **Paths live in Postgres, permanently.** They are small, they are queryable,
  and they are what history and insights read.
- **Videos live in R2, with a lifecycle rule** — expire after 90 days, or keep
  the most recent N per user. Storage becomes bounded by a policy rather than by
  how enthusiastic the user is.

The consequence to be honest about: after 90 days you keep your numbers and lose
your footage. That is the right trade at zero cost, and it needs saying in the UI
rather than being discovered.

## Capture: what is actually possible

The request was "scale it down to 720p 30fps like WhatsApp". Two paths, and they
are not equally hard:

**Recording in-app is solved.** `expo-camera` records at a requested quality, so
asking for 720p means no transcoding step at all — the frames are never captured
larger. This is the path to build first.

**Uploading an existing video needs a transcoder.** A clip from the camera roll
is whatever the phone shot, commonly 1080p60 or 4K. Downscaling it on-device
needs a native module (`react-native-compressor` is the usual choice, and works
through a config plugin in a dev build — which this project already produces,
since we build the APK locally). Server-side transcoding is the alternative and
is worse here: it would need ffmpeg on Render's free instance, which has neither
the CPU nor the disk for it.

**Tracking the bar is the genuinely hard part, and it is not solved by any of
the above.** `expo-camera` gives no per-frame pixel access, so real tracking
means `react-native-vision-camera` with a frame processor plus either optical
flow or a small detection model. That is a substantial piece of work with real
risk.

Staging it so the risk lands last:

1. **Metrics first — done.** `packages/domain/src/bar-path.ts` turns a sequence
   of timestamped points into range of motion, drift, straightness, rep
   segmentation, mean and peak concentric velocity, and velocity loss. Pure, 47
   tests, 100% branch coverage. It does not care where the points came from.
2. **Points by hand.** Scrub the clip and tap the plate on a dozen frames. Not
   glamorous, works today, and it proves the metrics are worth having before
   anyone writes a tracker.
3. **Points by tracker.** Template-match the patch the user tapped, frame to
   frame. This is where vision-camera becomes necessary.

Scale comes from a plate, not the camera: a competition plate is 450 mm across
and is already in shot, so `calibrationFromPlate` converts pixels to metres
against it. Without a reference in frame, no video can produce a velocity in
m/s — only pixels per second, which is not a number anyone can train on.

## Consequences

- A second R2 bucket (`arise-user-media`) separate from catalogue media, so a
  lifecycle rule that deletes user clips can never touch the exercise library.
- Uploads must be presigned and scoped to the authenticated user's own prefix.
  A client that can write anywhere in the bucket can overwrite someone else's
  clip.
- User video is personal data of a different order to a set log — it shows the
  user's face and their gym. It is private by default, never part of the
  leaderboard, and **the privacy policy must be updated before the first upload
  ships**, because the published one names four processors and R2-for-user-video
  is not among them.
- No transcoding on the API. If the client cannot produce 720p30, it uploads
  nothing.
- Nothing in this ADR is wired up yet. The domain layer is built; storage,
  capture and UI are not.
