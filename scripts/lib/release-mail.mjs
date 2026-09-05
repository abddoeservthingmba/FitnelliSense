/**
 * The release announcement: one template, one sender, used by both the manual
 * announcer and the automatic post-upload notice.
 *
 * It goes through the SAME provider as the one-time-code emails — the
 * precedence below mirrors `providerFor` in apps/api/src/lib/mailer.ts, so a
 * release notice cannot silently come from a different sender than the
 * verification mail people already trust.
 *
 * It deliberately does NOT import the API's mailer. That module is bundled for
 * the server; pulling it in would make a release announcement depend on the API
 * building, and a build script should not be able to fail for that reason.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

export function env(name) {
  const file = readFileSync(join(ROOT, 'apps/api/.env'), 'utf8');
  const match = file.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return match ? match[1].trim() : null;
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** `Name <address>` or a bare address. */
function parseSender(value) {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return match
    ? { name: match[1] || 'Ascension', email: match[2] }
    : { name: 'Ascension', email: value.trim() };
}

function formatBytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB (${bytes.toLocaleString('en-GB')} bytes)`;
}

/**
 * Builds the announcement from a build's own facts.
 *
 * Every value is read from the build rather than passed as prose, so the mail
 * cannot describe a version that was not made or quote a hash belonging to a
 * different binary.
 */
export function releaseEmail({ metadata, storedAt, notes }) {
  const subject = `Ascension ${metadata.version} (build ${metadata.versionCode}) is uploaded`;

  const facts = [
    ['Version', `${metadata.version}  (versionCode ${metadata.versionCode})`],
    ['Package', metadata.package],
    ['File', metadata.file],
    ['Size', formatBytes(metadata.sizeBytes)],
    ['SHA-256', metadata.sha256],
    ['Signing certificate', metadata.signingCertSha256],
    ['API', metadata.apiUrl],
    ['Stored at', storedAt],
    ['Built from', metadata.gitCommit ? metadata.gitCommit.slice(0, 12) : 'unrecorded'],
    ['Working tree', metadata.gitDirty === null ? 'unrecorded' : metadata.gitDirty ? 'dirty' : 'clean'],
    ['Built at', metadata.builtAt],
  ];

  const width = Math.max(...facts.map(([label]) => label.length));
  const table = facts.map(([label, value]) => `  ${label.padEnd(width)}   ${value}`).join('\n');

  const text = [
    `Ascension ${metadata.version} has been built, signed and uploaded.`,
    '',
    table,
    '',
    ...(notes && notes.length > 0 ? ['What is in it', ...notes.map((n) => `  - ${n}`), ''] : []),
    'The signing certificate above must match the previous release, or the build',
    'cannot install as an update over an existing copy. Verify before sharing:',
    '',
    `  apksigner verify --print-certs ${metadata.file}`,
    '',
    'This is an automated notice from the build script.',
  ].join('\n');

  const rows = facts
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#6b7280;white-space:nowrap">${escapeHtml(label)}</td>` +
        `<td style="padding:4px 0;font-family:ui-monospace,Menlo,Consolas,monospace;word-break:break-all">${escapeHtml(value)}</td></tr>`,
    )
    .join('');

  const html = [
    '<div style="font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#111827;max-width:640px">',
    `<h2 style="margin:0 0 4px;font-size:20px">Ascension ${escapeHtml(metadata.version)}</h2>`,
    '<p style="margin:0 0 20px;color:#6b7280">Built, signed and uploaded.</p>',
    `<table style="border-collapse:collapse;font-size:14px">${rows}</table>`,
    ...(notes && notes.length > 0
      ? [
          '<h3 style="font-size:15px;margin:24px 0 8px">What is in it</h3>',
          `<ul style="margin:0;padding-left:20px;color:#374151">${notes
            .map((n) => `<li style="margin-bottom:4px">${escapeHtml(n)}</li>`)
            .join('')}</ul>`,
        ]
      : []),
    '<p style="margin:24px 0 0;font-size:13px;color:#6b7280">',
    'The signing certificate must match the previous release, or this cannot install ',
    'as an update over an existing copy.</p>',
    '<p style="margin:8px 0 0;font-size:12px;color:#9ca3af">Automated notice from the build script.</p>',
    '</div>',
  ].join('');

  return { subject, text, html };
}

/**
 * Sends one message. Resolves to a result rather than throwing, because every
 * caller is a build script for which mail is a courtesy and not the job.
 */
export async function sendMail(to, message) {
  const from = env('EMAIL_FROM');
  const brevo = env('BREVO_API_KEY');
  const resend = env('RESEND_API_KEY');

  if (!from) return { sent: false, failure: 'EMAIL_FROM is not set' };

  // Same precedence as the API: Brevo verifies a single sender address and
  // works without a domain, so it wins when both are present.
  const provider = brevo ? 'brevo' : resend ? 'resend' : null;
  if (!provider) return { sent: false, failure: 'no mail provider configured' };

  const request =
    provider === 'brevo'
      ? {
          url: 'https://api.brevo.com/v3/smtp/email',
          headers: { 'api-key': brevo, 'content-type': 'application/json' },
          body: {
            sender: parseSender(from),
            to: [{ email: to }],
            subject: message.subject,
            textContent: message.text,
            htmlContent: message.html,
          },
        }
      : {
          url: 'https://api.resend.com/emails',
          headers: { authorization: `Bearer ${resend}`, 'content-type': 'application/json' },
          body: { from, to: [to], subject: message.subject, text: message.text, html: message.html },
        };

  try {
    const response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body),
    });
    if (!response.ok) {
      // The status and the provider. Never the key, never the recipient.
      return { sent: false, provider, failure: `HTTP ${response.status}` };
    }
    return { sent: true, provider };
  } catch (error) {
    return { sent: false, provider, failure: error.message };
  }
}
