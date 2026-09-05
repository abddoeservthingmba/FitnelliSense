/**
 * Puts a built APK into R2 so a release is downloadable without GitHub.
 *
 *   node --use-system-ca scripts/upload-apk.mjs [path/to.apk]
 *
 * Called automatically at the end of scripts/build-apk.sh. Run it by hand to
 * re-upload an existing build.
 *
 * `--use-system-ca` is needed behind TLS-intercepting security software
 * (Kaspersky here): Node ships its own CA bundle and does not know the
 * interceptor's root, so the connection fails with "self-signed certificate in
 * certificate chain". The flag reads the OS trust store instead. Do NOT reach
 * for NODE_TLS_REJECT_UNAUTHORIZED=0 — that would send the R2 credentials over
 * a connection whose certificate is never checked at all.
 *
 * LAYOUT, and why it is not just the file at the top level:
 *
 *   android/<version>+<versionCode>/Ascension-<version>.apk
 *   android/<version>+<versionCode>/metadata.json
 *
 * Every build gets its own prefix, so nothing is ever overwritten and the
 * bucket is the version history rather than a folder of files with the same
 * name. `metadata.json` carries the hashes and the signing certificate, which
 * is what makes a download verifiable by whoever fetches it — an APK on its own
 * proves nothing about where it came from.
 *
 * The bucket is SEPARATE from the app's `ascension` bucket on purpose. That one
 * has a 90-day lifecycle rule on the `cv/` prefix; releases must not sit next
 * to anything that expires, and a build that vanished after 90 days would be a
 * release nobody could reinstall.
 */
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { releaseEmail, sendMail } from './lib/release-mail.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The release bucket. Deliberately not the app's media bucket. */
const BUCKET = 'apkstorageversioning';

/**
 * What this build contains, in the announcement.
 *
 * Kept here rather than read from a changelog because there is no machine
 * -readable one; edit it when the build changes. An empty array omits the
 * section entirely rather than printing a heading with nothing under it.
 */
const RELEASE_NOTES = [
  'Pick a long video and choose which part gets analysed — with the video playing, so you can see the set rather than guess at it.',
  'Watch a clip back: the analysis screen now plays the footage.',
  'A filmed set shows a video link in your workout history.',
  'Voice logging has its own microphone button, instead of the keyboard one.',
  'Google sign-in (turns on once the server has its client ids).',
  'The analysis itself still does not run: an uploaded clip stays on "Working on it".',
];

function env(name) {
  const file = readFileSync(join(ROOT, 'apps/api/.env'), 'utf8');
  const match = file.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return match ? match[1].trim() : null;
}

/*
 * Its own credentials, falling back to the app's.
 *
 * Separate on purpose: the key the API runs with can write user video, and a
 * key that can publish a release is a different level of trust. Widening the
 * runtime token to cover releases would mean the server could overwrite an
 * APK, which is a strange power for it to have.
 */
const accountId = env('R2_ACCOUNT_ID');
const accessKeyId = env('R2_APK_ACCESS_KEY_ID') ?? env('R2_ACCESS_KEY_ID');
const secretAccessKey = env('R2_APK_SECRET_ACCESS_KEY') ?? env('R2_SECRET_ACCESS_KEY');

if (!accountId || !accessKeyId || !secretAccessKey) {
  console.error('R2 credentials are not set in apps/api/.env — nothing uploaded.');
  process.exit(1);
}

const app = JSON.parse(readFileSync(join(ROOT, 'apps/mobile/app.json'), 'utf8')).expo;
const version = app.version;
const versionCode = app.android.versionCode;

const apkPath = process.argv[2] ?? join(ROOT, 'build-output', `Ascension-${version}.apk`);
const bytes = readFileSync(apkPath);
const sha256 = createHash('sha256').update(bytes).digest('hex');

const metadata = {
  version,
  versionCode,
  package: app.android.package,
  file: basename(apkPath),
  sizeBytes: statSync(apkPath).size,
  sha256,
  /*
   * The certificate every install is checked against. Recorded per build so a
   * change is visible here as well as in build-output/README.md — a signing
   * identity that changes without anyone noticing means every existing user
   * must uninstall before they can update.
   */
  signingCertSha256: 'c35574e619810ce487e6e92d2e3cbabced3e85356f32e4d793183335a0fee5de',
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://fitnellisense.onrender.com',
  /*
   * The commit the BINARY was built from, which is not necessarily HEAD.
   *
   * build-apk.sh exports APK_GIT_COMMIT at the moment it builds. Run this
   * script by hand against an older APK and HEAD may have moved on, so a
   * plain `rev-parse HEAD` would attach a commit the binary does not contain
   * — a claim that reads exactly like a true one and cannot be checked from
   * the file. Unknown is stated instead.
   */
  gitCommit: process.env.APK_GIT_COMMIT ?? null,
  gitDirty: process.env.APK_GIT_COMMIT ? process.env.APK_GIT_DIRTY === '1' : null,
  builtAt: new Date().toISOString(),
};

const prefix = `android/${version}+${versionCode}`;

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

async function put(key, body, contentType) {
  await client.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }),
  );
  console.log(`  ${key}`);
}

console.log(`==> uploading to r2://${BUCKET}/${prefix}/`);

try {
  await put(`${prefix}/${basename(apkPath)}`, bytes, 'application/vnd.android.package-archive');
  await put(`${prefix}/metadata.json`, JSON.stringify(metadata, null, 2), 'application/json');
} catch (error) {
  /*
   * Never fatal to the build. The APK on disk is the deliverable; the upload is
   * a convenience, and a network failure here should not send someone back
   * through eleven minutes of Gradle.
   */
  const denied = error.$metadata?.httpStatusCode === 403 || error.name === 'AccessDenied';

  console.error(`\nUpload failed: ${error.name ?? 'Error'} — ${error.message}`);

  if (denied) {
    // The single most likely cause, said specifically, because "Access Denied"
    // sends people to check the bucket name when the name is fine.
    console.error(
      [
        '',
        `403 means the API token does not cover "${BUCKET}". The credentials are`,
        'valid — they reach the app bucket — so this is token SCOPE, not a bad key',
        'and not a wrong bucket name.',
        '',
        'In the Cloudflare dashboard: R2 > API > Manage API tokens. Either edit the',
        `existing token to include "${BUCKET}", or create a second token scoped to`,
        'it alone and put the pair in apps/api/.env as:',
        '',
        '  R2_APK_ACCESS_KEY_ID=...',
        '  R2_APK_SECRET_ACCESS_KEY=...',
        '',
        'A separate token is the better of the two: the runtime key then still',
        'cannot publish or overwrite a release.',
      ].join('\n'),
    );
  }

  console.error('\nThe APK is still in build-output/. Re-run this script to retry.');
  process.exit(1);
}

console.log(`\nsha256  ${sha256}`);
if (metadata.gitDirty) {
  console.log('NOTE: built from a dirty working tree — recorded as such in metadata.json.');
}

/*
 * Tell someone, through the same provider as the one-time-code emails.
 *
 * Only AFTER both objects are in the bucket, so the mail can never announce a
 * release that is not actually downloadable. Failure to send is reported and
 * ignored — the upload has already succeeded and a mail provider outage must
 * not make this script exit non-zero and mark a good build as failed.
 */
const recipient = process.env.RELEASE_NOTIFY ?? 'abdullahkhanabd8@gmail.com';

const mail = await sendMail(
  recipient,
  releaseEmail({
    metadata,
    storedAt: `r2://${BUCKET}/${prefix}/`,
    notes: RELEASE_NOTES,
  }),
);

console.log(
  mail.sent
    ? `notified ${recipient} via ${mail.provider}`
    : `notification not sent (${mail.failure})`,
);
