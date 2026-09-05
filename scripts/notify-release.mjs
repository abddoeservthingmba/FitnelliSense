/**
 * Tells people a new build is out.
 *
 *   node --use-system-ca scripts/notify-release.mjs <recipient>
 *
 * `--use-system-ca` is needed on any machine running TLS-intercepting security
 * software (Kaspersky here), which re-signs HTTPS with its own root. Node
 * ships its own CA bundle and does not know that root, so `fetch` fails with
 * "self-signed certificate in certificate chain". The flag makes Node read the
 * OS trust store, where the interceptor's root already is.
 *
 * Use the flag rather than NODE_TLS_REJECT_UNAUTHORIZED=0 — that would send the
 * provider API key over a connection whose certificate is never checked at all.
 *
 * An OPERATIONAL script, not part of the app: it reads apps/api/.env directly
 * and talks to the mail provider itself. It deliberately does not import the
 * API's mailer — that module is bundled for the server and pulling it in here
 * would make a release announcement depend on the API building.
 *
 * The version, size and hashes are read from build-output/README.md rather than
 * typed in, so the mail cannot claim a build that was never made or quote a
 * hash that belongs to a different binary.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function env(name) {
  const file = readFileSync(join(ROOT, 'apps/api/.env'), 'utf8');
  const match = file.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return match ? match[1].trim() : null;
}

/** Pulls the current build's facts out of the version log. */
function currentBuild() {
  const readme = readFileSync(join(ROOT, 'build-output/README.md'), 'utf8');
  const field = (label) => {
    const match = readme.match(new RegExp(`\\|\\s*${label}\\s*\\|\\s*\`?([^|\`]+)\`?\\s*\\|`));
    return match ? match[1].trim() : null;
  };
  return {
    file: field('File'),
    version: field('versionName / versionCode'),
    size: field('Size'),
    sha256: field('SHA-256'),
  };
}

const [, , recipient] = process.argv;
if (!recipient) {
  console.error('usage: node scripts/notify-release.mjs <recipient>');
  process.exit(1);
}

const build = currentBuild();
const from = env('EMAIL_FROM');
const brevo = env('BREVO_API_KEY');
const resend = env('RESEND_API_KEY');

if (!from) {
  console.error('EMAIL_FROM is not set in apps/api/.env');
  process.exit(1);
}

// Same precedence as the API's `providerFor`: Brevo verifies a single sender
// address and works without a domain, so it wins when both are present.
const provider = brevo ? 'brevo' : resend ? 'resend' : null;
if (!provider) {
  console.error('Neither BREVO_API_KEY nor RESEND_API_KEY is set.');
  process.exit(1);
}

const subject = `Ascension ${build.version ?? ''} is out`.replace(/\s+/g, ' ').trim();

const lines = [
  `Ascension ${build.version} is built and signed.`,
  '',
  'What is new',
  '  - Film a set, or pick an existing video, for barbell form analysis.',
  '  - A video longer than three minutes lets you choose which three minutes',
  '    are measured.',
  '  - Log a set by speaking it: "one set of incline dumbbell press with 35',
  '    kilos for 12 reps". Uses your keyboard\'s own dictation, so the app',
  '    never touches the microphone.',
  '',
  'Please read this before you try the video part',
  '  The upload works. The analysis does NOT run yet — there is no worker to',
  '  process the footage, so a clip you upload will sit on "Working on it"',
  '  and never finish. That is expected, not a bug. Everything around it is',
  '  real: consent, upload, storage, and the 90-day deletion rule.',
  '',
  'Installing',
  `  ${build.file} (${build.size})`,
  '  It is signed with the same certificate as 1.3.0, so it installs straight',
  '  over your existing copy. No uninstall, and you stay signed in.',
  '',
  `  SHA-256: ${build.sha256}`,
  '',
  'A note on permissions',
  '  You will see one new permission, MODIFY_AUDIO_SETTINGS. It comes from the',
  '  video picker and only changes ringer/volume mode. There is still no',
  '  microphone permission and no photo-library permission — the app cannot',
  '  browse your gallery, only receive the one file you hand it.',
  '',
  'The privacy policy has been updated to cover video. The short version: it is',
  'off until you turn it on, nobody else can ever see a clip, and clips are',
  'deleted after 90 days while the measurements are kept.',
];

const text = lines.join('\n');
const html = `<pre style="font:14px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap">${text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')}</pre>`;

/** `Name <address>` or a bare address. */
function parseSender(value) {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return match ? { name: match[1] || 'Ascension', email: match[2] } : { name: 'Ascension', email: value.trim() };
}

const sender = parseSender(from);

const request =
  provider === 'brevo'
    ? {
        url: 'https://api.brevo.com/v3/smtp/email',
        headers: { 'api-key': brevo, 'content-type': 'application/json' },
        body: {
          sender,
          to: [{ email: recipient }],
          subject,
          textContent: text,
          htmlContent: html,
        },
      }
    : {
        url: 'https://api.resend.com/emails',
        headers: { authorization: `Bearer ${resend}`, 'content-type': 'application/json' },
        body: { from, to: [recipient], subject, text, html },
      };

const response = await fetch(request.url, {
  method: 'POST',
  headers: request.headers,
  body: JSON.stringify(request.body),
});

const payload = await response.text();

if (!response.ok) {
  // The status and the provider, never the key and never the recipient.
  console.error(`${provider} refused the message: HTTP ${response.status}`);
  console.error(payload.slice(0, 400));
  process.exit(1);
}

console.log(`sent via ${provider} — subject: ${subject}`);
