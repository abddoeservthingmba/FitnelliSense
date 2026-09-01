/**
 * Transactional email (FR-AUTH-06, NFR-S-07).
 *
 * Two messages, both one-time codes: verify your address, and reset your
 * password. That is the whole surface, and it is worth keeping it that small —
 * every additional template is another thing that can leak.
 *
 * The provider sits behind `Mailer` so nothing above this file knows it is
 * Resend. Without an API key the app boots and runs on `nullMailer`: sending
 * reports failure and the caller behaves as it would for any delivery failure.
 * That is deliberate — an unconfigured mailer must not stop the API starting,
 * and must not silently look like success either.
 *
 * **Nothing here logs a code, an address, or a message body** (NFR-S-07). The
 * result carries a boolean and a provider message id, and no more.
 */
export interface Mailer {
  /** True if the provider accepted the message for delivery. */
  send(message: OutgoingEmail): Promise<SendResult>;
  /** False when no provider is configured, so callers can say so honestly. */
  readonly isConfigured: boolean;
}

export interface OutgoingEmail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export interface SendResult {
  readonly sent: boolean;
  /** The provider's id, for correlating a support question with their logs. */
  readonly id: string | null;
  /** Safe to log: a reason, never the address or the body. */
  readonly failure: string | null;
}

export interface MailerConfig {
  readonly apiKey: string;
  readonly from: string;
  readonly timeoutMs: number;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * A loggable reason for a transport failure.
 *
 * Deliberately a fixed set of strings rather than `error.message`: the message
 * on a fetch failure can contain the URL, and on some runtimes the request
 * details with it. This is written into the log, so it says only what went
 * wrong in kind.
 */
/**
 * The provider's machine-readable error code, or null.
 *
 * Only the `name`/`code` field is read. The accompanying `message` is not, and
 * must not be: on a 403 it contains the recipient's address.
 */
async function providerErrorCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null) return null;
    const named = body as { name?: unknown; code?: unknown };
    const value = typeof named.name === 'string' ? named.name : named.code;
    if (typeof value !== 'string') return null;
    // Bounded and stripped, so a hostile provider response cannot inject a
    // newline into our log lines.
    return value.replace(/[^a-z0-9_-]/gi, '').slice(0, 60);
  } catch {
    return null;
  }
}

/**
 * A sentence pointing at the usual cause, for the statuses that have one.
 *
 * This exists because the failure that actually happened in practice — a 403
 * from the sandbox sender — is invisible from the status code alone, and the
 * response body that would explain it cannot be logged.
 */
function hintFor(status: number, from: string): string {
  if (status === 403 && from.includes('resend.dev')) {
    return ' — the sandbox sender only delivers to the Resend account owner; verify a domain and set EMAIL_FROM to an address on it';
  }
  if (status === 401 || status === 403) return ' — check RESEND_API_KEY and EMAIL_FROM';
  if (status === 422) return ' — EMAIL_FROM is probably not on a verified domain';
  if (status === 429) return ' — provider rate limit';
  return '';
}

function transportFailure(error: unknown): string {
  if (error instanceof Error && error.name === 'TimeoutError') {
    return 'the email provider did not respond in time';
  }
  if (error instanceof SyntaxError) return 'the email provider returned a malformed response';
  return 'the email provider could not be reached';
}

/** Used when no API key is configured. Honest failure, not a silent drop. */
export const nullMailer: Mailer = {
  isConfigured: false,
  send: async () => ({
    sent: false,
    id: null,
    failure: 'no email provider is configured',
  }),
};

export function createMailer(config: MailerConfig): Mailer {
  if (!config.apiKey) return nullMailer;

  return {
    isConfigured: true,
    async send(message) {
      // The whole request is bounded: a hanging provider must not hold a
      // request open, because the caller answers 202 regardless.
      const abort = AbortSignal.timeout(config.timeoutMs);

      try {
        const response = await fetch(RESEND_ENDPOINT, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            from: config.from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            html: message.html,
          }),
          signal: abort,
        });

        if (!response.ok) {
          // The status alone was not enough to diagnose a real 403: it took a
          // database query and two log reads to work out that the sandbox
          // sender only delivers to the account owner. Resend also returns a
          // machine-readable `name` for the error, which is safe to log and
          // says which of the many 403 causes it was.
          //
          // Their `message` field is NOT logged: it quotes the recipient
          // address back (NFR-S-07).
          const code = await providerErrorCode(response);
          return {
            sent: false,
            id: null,
            failure: `provider rejected the message (HTTP ${response.status}${
              code === null ? '' : `, ${code}`
            })${hintFor(response.status, config.from)}`,
          };
        }

        const body: unknown = await response.json();
        const id =
          typeof body === 'object' && body !== null && 'id' in body && typeof body.id === 'string'
            ? body.id
            : null;
        return { sent: true, id, failure: null };
      } catch (error) {
        return { sent: false, id: null, failure: transportFailure(error) };
      }
    },
  };
}

// ----------------------------------------------------------------- templates --

/**
 * Plain text first, and the HTML is a near-copy of it.
 *
 * A code is unreadable if the email does not render, so the text part is the
 * real message rather than a fallback afterthought. No links, no images, no
 * tracking pixel: there is nothing here to click, which is also the simplest
 * way to keep these messages from resembling phishing.
 */
function codeEmail(input: {
  heading: string;
  intro: string;
  code: string;
  minutes: number;
  ignoreLine: string;
}): Pick<OutgoingEmail, 'text' | 'html'> {
  const spaced = `${input.code.slice(0, 3)} ${input.code.slice(3)}`;

  const text = [
    input.heading,
    '',
    input.intro,
    '',
    `    ${spaced}`,
    '',
    `This code expires in ${input.minutes} minutes and can be used once.`,
    input.ignoreLine,
    '',
    '— Fitness Intellisense',
  ].join('\n');

  const html = `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#12161f">
  <p style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#6b7280;margin:0 0 24px">Fitness Intellisense</p>
  <h1 style="font-size:20px;font-weight:700;margin:0 0 12px">${escapeHtml(input.heading)}</h1>
  <p style="font-size:15px;line-height:1.6;margin:0 0 24px">${escapeHtml(input.intro)}</p>
  <p style="font-size:34px;font-weight:700;letter-spacing:.18em;font-variant-numeric:tabular-nums;margin:0 0 24px;padding:16px 0;text-align:center;background:#f4f5f7;border-radius:8px">${escapeHtml(spaced)}</p>
  <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:0">This code expires in ${input.minutes} minutes and can be used once.<br>${escapeHtml(input.ignoreLine)}</p>
</div>`;

  return { text, html };
}

/** The code is digits, but the surrounding copy is interpolated, so escape it. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function verificationEmail(to: string, code: string, minutes: number): OutgoingEmail {
  return {
    to,
    subject: `${code} is your Fitness Intellisense verification code`,
    ...codeEmail({
      heading: 'Verify your email address',
      intro: 'Enter this code in the app to confirm this address is yours.',
      code,
      minutes,
      ignoreLine: 'If you did not create an account, you can ignore this email.',
    }),
  };
}

export function passwordResetEmail(to: string, code: string, minutes: number): OutgoingEmail {
  return {
    to,
    subject: `${code} is your Fitness Intellisense password reset code`,
    ...codeEmail({
      heading: 'Reset your password',
      intro: 'Enter this code in the app, then choose a new password.',
      code,
      minutes,
      ignoreLine:
        'If you did not ask to reset your password, ignore this email — your password has not changed.',
    }),
  };
}
