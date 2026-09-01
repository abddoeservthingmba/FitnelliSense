# Release builds

The signed Android APK, committed as the distributable artefact.

**Note on repo size:** each build is ~69 MB and git keeps every version
forever, so this directory grows permanently. If the repo gets heavy, GitHub
Releases is the usual home for binaries — the build itself is reproducible from
[docs/runbook.md](../docs/runbook.md) either way.

## Current

| | |
|---|---|
| File | `FitnessIntellisense-0.3.0.apk` |
| versionName | 0.3.0 |
| versionCode | 4 |
| Size | 72,260,597 bytes (68.9 MB) |
| SHA-256 | `1bfb1ed5db8c5292d8e6bec41563b66b894cb02a52147e74f7878813274a17c1` |
| Signing cert SHA-256 | `c35574e619810ce487e6e92d2e3cbabced3e85356f32e4d793183335a0fee5de` |
| API it points at | `https://fitnellisense.onrender.com` |
| ABIs | arm64-v8a, armeabi-v7a |

The signing certificate is **the same as version 0.2.0's**, so this installs
over an existing install without uninstalling first. Verify before shipping any
future build:

```bash
apksigner verify --print-certs build-output/FitnessIntellisense-*.apk
```

If that digest ever changes, the signing identity changed, and every user has
to uninstall before they can update.

## What 0.3.0 adds over 0.2.0

- Movement demonstrations: two frames per exercise, cross-faded, on 71 of the
  169 catalogue exercises (public domain, ADR 0004)
- Current tier — rank, level, progress — on Home and Profile
- Email verification and password reset by six-digit code
- Nutrition: food diary, search, **barcode scanning**, custom foods, daily
  targets derived from the profile

## ABIs

x86 and x86_64 are deliberately excluded. They exist only for emulators and
nearly doubled the file. Every physical Android phone is arm.

## Installing

Sideloading needs "install unknown apps" enabled for whichever app opens the
file (browser, file manager). The build is signed with a self-generated key, not
a Play Store one, so Play Protect will warn — that is expected for a sideloaded
build and not a sign of anything wrong.
