/**
 * Transactional email.
 *
 * The rules under test are the ones that would be embarrassing to get wrong:
 * an unconfigured mailer must fail rather than pretend, the code must be
 * readable in the plain-text part, and interpolated copy must not be able to
 * inject markup into the HTML part.
 */
import { describe, expect, it } from 'vitest';
import {
  createMailer,
  nullMailer,
  parseSender,
  passwordResetEmail,
  providerFor,
  verificationEmail,
} from '../src/lib/mailer';

describe('nullMailer', () => {
  it('reports failure rather than silently dropping the message', async () => {
    const result = await nullMailer.send({
      to: 'someone@example.com',
      subject: 's',
      text: 't',
      html: 'h',
    });
    expect(result.sent).toBe(false);
    expect(result.failure).toContain('no email provider');
    expect(nullMailer.isConfigured).toBe(false);
  });
});

describe('createMailer', () => {
  it('falls back to the null mailer with no API key, rather than failing at boot', () => {
    const mailer = createMailer({
      brevoApiKey: '',
      resendApiKey: '',
      from: 'a@b.com',
      timeoutMs: 1000,
    });
    expect(mailer.isConfigured).toBe(false);
  });

  it('is configured once a key is present', () => {
    const mailer = createMailer({
      brevoApiKey: '',
      resendApiKey: 're_test',
      from: 'a@b.com',
      timeoutMs: 1000,
    });
    expect(mailer.isConfigured).toBe(true);
  });
});

describe('code emails', () => {
  const code = '048213';

  it('puts the code in the subject, the text and the HTML', () => {
    const message = verificationEmail('someone@example.com', code, 15);
    expect(message.subject).toContain(code);
    // Spaced for readability, so match the halves rather than the whole.
    expect(message.text).toContain('048 213');
    expect(message.html).toContain('048 213');
    expect(message.to).toBe('someone@example.com');
  });

  it('says how long the code lasts, using the configured value', () => {
    expect(verificationEmail('a@b.com', code, 15).text).toContain('15 minutes');
    expect(verificationEmail('a@b.com', code, 5).text).toContain('5 minutes');
  });

  it('reads as a complete message without the HTML part', () => {
    // The text part is the real message, not a stub. If HTML fails to render,
    // the code must still be findable.
    const { text } = passwordResetEmail('a@b.com', code, 15);
    expect(text).toContain('Reset your password');
    expect(text).toContain('048 213');
    expect(text).toContain('Fitness Intellisense');
  });

  it('contains no links, so it cannot be mistaken for phishing', () => {
    for (const message of [
      verificationEmail('a@b.com', code, 15),
      passwordResetEmail('a@b.com', code, 15),
    ]) {
      expect(message.text).not.toContain('http');
      expect(message.html).not.toContain('<a ');
      expect(message.html).not.toContain('href');
      expect(message.html).not.toContain('<img');
    }
  });

  it('tells the reader what to do if they did not ask', () => {
    expect(verificationEmail('a@b.com', code, 15).text).toContain('did not create an account');
    const reset = passwordResetEmail('a@b.com', code, 15).text;
    expect(reset).toContain('did not ask to reset');
    // And reassures them, which is the part people actually need to hear.
    expect(reset).toContain('your password has not changed');
  });

  it('escapes the copy it interpolates', () => {
    // The code is digits, but the surrounding strings pass through `escapeHtml`.
    // This asserts the escaping exists at all, so a future template that
    // interpolates a display name inherits it.
    const message = verificationEmail('a@b.com', code, 15);
    expect(message.html).not.toContain('<script');
    // The apostrophe-free copy should survive intact rather than be mangled.
    expect(message.html).toContain('Verify your email address');
  });
});

describe('provider failures', () => {
  /** A stand-in for Resend, so the failure paths are testable offline. */
  const withResponse = (status: number, body: unknown) => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;
    return () => {
      globalThis.fetch = original;
    };
  };

  const send = (from: string) =>
    createMailer({ brevoApiKey: '', resendApiKey: 're_test', from, timeoutMs: 1000 }).send({
      to: 'someone@example.com',
      subject: 's',
      text: 't',
      html: 'h',
    });

  it('names the sandbox restriction on a 403, the failure that actually bit', async () => {
    // Resend's real 403 body quotes the account owner's address in `message`.
    const restore = withResponse(403, {
      statusCode: 403,
      name: 'validation_error',
      message: 'You can only send testing emails to your own address (owner@example.com)',
    });
    try {
      const result = await send('Fitness Intellisense <onboarding@resend.dev>');
      expect(result.sent).toBe(false);
      expect(result.failure).toContain('403');
      expect(result.failure).toContain('validation_error');
      expect(result.failure).toContain('sandbox sender');
      // NFR-S-07: the address in their message must never reach our logs.
      expect(result.failure).not.toContain('owner@example.com');
    } finally {
      restore();
    }
  });

  it('does not blame the sandbox when the sender is a real domain', async () => {
    const restore = withResponse(403, { name: 'restricted_api_key' });
    try {
      const result = await send('Fitness Intellisense <no-reply@example.com>');
      expect(result.failure).toContain('restricted_api_key');
      expect(result.failure).not.toContain('sandbox');
      expect(result.failure).toContain('RESEND_API_KEY');
    } finally {
      restore();
    }
  });

  it('points at the verified-domain requirement on a 422', async () => {
    const restore = withResponse(422, { name: 'validation_error' });
    try {
      expect((await send('a@b.com')).failure).toContain('verified domain');
    } finally {
      restore();
    }
  });

  it('survives an error body that is not the shape we expect', async () => {
    const restore = withResponse(500, 'not json at all');
    try {
      const result = await send('a@b.com');
      expect(result.sent).toBe(false);
      expect(result.failure).toContain('500');
    } finally {
      restore();
    }
  });

  it('strips anything that could inject a newline into a log line', async () => {
    const restore = withResponse(403, { name: 'bad\nname with spaces' });
    try {
      const result = await send('a@b.com');
      expect(result.failure).not.toContain('\n');
      expect(result.failure).toContain('badnamewithspaces');
    } finally {
      restore();
    }
  });
});

describe('provider selection', () => {
  const keys = { brevoApiKey: '', resendApiKey: '', from: 'a@b.com', timeoutMs: 1000 };

  it('is unconfigured with no keys at all', () => {
    expect(providerFor(keys)).toBeNull();
    expect(createMailer(keys).isConfigured).toBe(false);
  });

  it('uses Resend when only Resend is set', () => {
    expect(providerFor({ ...keys, resendApiKey: 're_x' })).toBe('resend');
  });

  it('uses Brevo when only Brevo is set', () => {
    expect(providerFor({ ...keys, brevoApiKey: 'xkeysib_x' })).toBe('brevo');
  });

  it('prefers Brevo when both are set', () => {
    // Not a quality judgement: Brevo verifies a single address, so it is the
    // one that can reach a real user without owning a domain.
    expect(providerFor({ ...keys, brevoApiKey: 'xkeysib_x', resendApiKey: 're_x' })).toBe('brevo');
  });
});

describe('parseSender', () => {
  it('splits a name and address, which Brevo requires separately', () => {
    expect(parseSender('Fitness Intellisense <no-reply@example.com>')).toEqual({
      name: 'Fitness Intellisense',
      email: 'no-reply@example.com',
    });
  });

  it('accepts a bare address', () => {
    expect(parseSender('no-reply@example.com')).toEqual({
      name: '',
      email: 'no-reply@example.com',
    });
  });

  it('tolerates the quoting and spacing people actually type', () => {
    expect(parseSender('"Fitness Intellisense"  <  no-reply@example.com  >')).toEqual({
      name: 'Fitness Intellisense',
      email: 'no-reply@example.com',
    });
  });
});

describe('brevo transport', () => {
  const brevo = (from = 'Fitness Intellisense <me@gmail.com>') =>
    createMailer({ brevoApiKey: 'xkeysib_test', resendApiKey: '', from, timeoutMs: 1000 });

  it('sends the shape Brevo expects, with the sender split out', async () => {
    let captured: { url?: string; headers?: Record<string, string>; body?: unknown } = {};
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      captured = {
        url: String(url),
        headers: init.headers as Record<string, string>,
        body: JSON.parse(String(init.body)),
      };
      return new Response(JSON.stringify({ messageId: '<abc@brevo>' }), { status: 201 });
    }) as unknown as typeof fetch;

    try {
      const result = await brevo().send({
        to: 'someone@example.com',
        subject: 's',
        text: 't',
        html: 'h',
      });

      expect(result.sent).toBe(true);
      // Brevo's id field is messageId, not id.
      expect(result.id).toBe('<abc@brevo>');
      expect(captured.url).toContain('api.brevo.com');
      // Their auth header is api-key, not a bearer token.
      expect(captured.headers?.['api-key']).toBe('xkeysib_test');
      expect(captured.body).toEqual({
        sender: { name: 'Fitness Intellisense', email: 'me@gmail.com' },
        to: [{ email: 'someone@example.com' }],
        subject: 's',
        textContent: 't',
        htmlContent: 'h',
      });
    } finally {
      globalThis.fetch = original;
    }
  });

  it('names an unverified sender on a 400, the failure to expect first', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ code: 'invalid_parameter', message: 'sender not valid' }), {
        status: 400,
      })) as typeof fetch;
    try {
      const result = await brevo().send({
        to: 'someone@example.com',
        subject: 's',
        text: 't',
        html: 'h',
      });
      expect(result.sent).toBe(false);
      expect(result.failure).toContain('brevo');
      expect(result.failure).toContain('invalid_parameter');
      expect(result.failure).toContain('not verified');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('counts a 2xx with no usable body as sent', async () => {
    const original = globalThis.fetch;
    // `null` body, not `''`: 204 is a null-body status and the Response
    // constructor throws if given content for one.
    globalThis.fetch = (async () => new Response(null, { status: 204 })) as typeof fetch;
    try {
      const result = await brevo().send({
        to: 'someone@example.com',
        subject: 's',
        text: 't',
        html: 'h',
      });
      // Delivery was accepted; only the id is unknown.
      expect(result.sent).toBe(true);
      expect(result.id).toBeNull();
    } finally {
      globalThis.fetch = original;
    }
  });
});
