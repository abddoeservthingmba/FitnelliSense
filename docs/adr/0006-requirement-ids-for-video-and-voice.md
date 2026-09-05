# ADR 0006 — Requirement IDs for video form analysis and voice logging

**Status:** Accepted
**Date:** 2026-09-05
**Requirements:** defines FR-VID-\*, FR-VOX-\*. Extends BRD v0.1 §6.8, §9.3, §13.

## Context

The BRD is frozen at v0.1 and requirement IDs are the contract — CLAUDE.md
requires every task to name the IDs it implements, and every commit to
reference them.

Video form analysis and voice logging were both requested after the freeze.
Neither exists in the BRD. ADR 0005 introduced the label `FR-VID-*` and marked
it "(new)", but never enumerated the individual requirements, so citations of
`FR-VID-01` scattered through the schema, the routes, the services and the
tests resolved to nothing.

Voice logging was worse. It was being cited as **FR-WK-13**, which reads as an
existing BRD requirement: FR-WK is the BRD's own workout namespace and it stops
at FR-WK-12. A reader checking the contract would not find it and would
reasonably conclude the citation was a lie rather than an extension.

A citation that resolves to nothing is worse than no citation. It borrows the
authority of the frozen document without the review the document had.

## Decision

**New behaviour gets a new namespace, defined here, until the BRD is opened for
v0.2.** Nothing in this ADR edits the BRD, and no new ID is ever allocated
inside a BRD namespace.

`FR-WK-13` is withdrawn and replaced by `FR-VOX-01`.

### FR-VID — video form analysis

| ID            | Requirement                                                                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FR-VID-01** | Video capture is opt-in. No upload target is issued without a recorded consent timestamp, and consent cannot be self-awarded through the profile endpoint.  |
| **FR-VID-02** | A user may attach video to a set they own. Ownership failure is indistinguishable from absence (404, per NFR-S-03).                                         |
| **FR-VID-03** | Clips recorded in-app are captured at 720p, muted, and no longer than 60s. The API refuses anything that is not `video/mp4` or over 80 MB.                    |
| **FR-VID-04** | Upload is presigned and goes client-to-store directly. The API never proxies video bytes.                                                                   |
| **FR-VID-05** | Clips expire from object storage after 90 days by lifecycle policy. Derived measurements are kept indefinitely — they contain no image of the user.         |
| **FR-VID-06** | Every metric shown is computed in `packages/domain/bar-path.ts` from the tracked path alone. No metric is derived in a route, a service or a component.      |
| **FR-VID-07** | Analysis state is explicit and visible: `awaiting_upload`, `queued`, `processing`, `complete`, `failed`. A failure states a reason a reader can act on.      |
| **FR-VID-08** | A user may delete any clip and its analysis immediately. This is a hard delete, not an archive — the exception to the archive-never-delete rule.             |
| **FR-VID-09** | With storage unconfigured the feature answers unavailable and writes no row. Logging, and everything else, keeps working.                                   |
| **FR-VID-10** | Distances are scaled from a reference object in frame (a 450 mm plate). Without one, no analysis claims a distance or a velocity.                           |
| **FR-VID-11** | A video may be chosen from the device library instead of filmed. Only the single file the user picks is read; the library is never browsed or listed.        |
| **FR-VID-12** | At most `MAX_CLIP_SECONDS` of any video is analysed. For a longer video the user chooses which window, and that window is derived server-side, never trusted from the client. |
| **FR-VID-13** | A picked video is uploaded unmodified — the app has no transcoder. Its audio, and the parts outside the chosen window, are uploaded and stored. This is stated at the point of consent and in the policy, because it cannot be prevented. |

### FR-VOX — voice logging

| ID            | Requirement                                                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FR-VOX-01** | A set may be logged from a spoken sentence: sets, exercise, weight, unit and reps.                                                                        |
| **FR-VOX-02** | The parser never invents a number. A value it did not hear is null and is named in `missing` so the caller can ask for exactly that.                      |
| **FR-VOX-03** | A spoken unit always wins over the user's unit preference. Silence falls back to the preference.                                                          |
| **FR-VOX-04** | Parsing is pure and lives in `packages/domain/voice-log.ts`. It does not know the catalogue; it returns the exercise as spoken for the caller to resolve.  |
| **FR-VOX-05** | Nothing is written until the reader has confirmed the interpretation. Dictation fails quietly, and "45" for "4.5" is only ever caught by a person.        |
| **FR-VOX-06** | Speech recognition is the platform keyboard's. The app records no audio, requests no microphone permission, and sends no audio anywhere.                  |

## Consequences

- FR-VOX-06 is load-bearing for the privacy policy, which states the microphone
  is never used. That sentence stays true only while dictation belongs to the
  keyboard. Adopting an in-app recogniser is a policy amendment, not a
  dependency bump.
- FR-VID-05 means someone keeps their numbers and loses their footage after 90
  days. It has to be said in the UI, not discovered.
- FR-VID-13 is the uncomfortable one and is stated rather than softened. The
  consent screen previously promised "no sound is recorded", which was true of
  in-app recording and became false the moment a gallery video could be picked
  — a file that may carry a conversation in the background. Both the screen and
  the policy now separate the two cases. A real trimmer would let the promise be
  restored for both; until then the honest version is the one that ships.
- FR-VID-08 is a deliberate exception to "exercises and routines are ARCHIVED,
  never hard-deleted". A soft-deleted video is not deleted, and for personal
  data of this kind that distinction matters more than the consistency does.
- These IDs are provisional in the sense that they have not been through BRD
  review. They are not provisional in the sense that code may cite them
  loosely: they mean exactly what the tables above say.
- When the BRD opens for v0.2 these tables move into it and this ADR becomes
  the record of where they came from.
