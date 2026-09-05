/**
 * Auth routes (FR-AUTH-01..06). Thin: parse, delegate, respond.
 *
 * NFR-S-06: these endpoints carry their own tighter limit, keyed on IP, because
 * they are the ones worth guessing against.
 */
import { z } from 'zod';
import {
  authResponseSchema,
  codeRequestResponseSchema,
  googleSignInSchema,
  loginRequestSchema,
  logoutRequestSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
  routes,
  tokenPairSchema,
  verificationStatusSchema,
  verifyEmailConfirmSchema,
} from '@fi/shared';
import { passwordResetEmail, verificationEmail } from '../lib/mailer';
import { GoogleAuthError } from '../lib/google';
import { conflict, unauthenticated } from '../lib/errors';
import { currentUser } from '../plugins/auth';
import * as authService from '../services/auth-service';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

const acceptedSchema = z.object({ ok: z.literal(true) });

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const { config, database, mailer, tokens } = app.ctx;

  const deps: authService.AuthDeps = {
    db: database.db,
    tokens,
    otpTtlSecs: config.OTP_TTL,
    google: app.ctx.google,
  };

  const codeMinutes = Math.max(1, Math.round(config.OTP_TTL / 60));

  /**
   * Sends a code email and logs the outcome.
   *
   * Delivery failure is logged, not raised: the endpoints answer 202 whatever
   * happens, because the alternative leaks whether an address is registered
   * and turns a provider outage into a login-shaped error. The log line carries
   * the reason and the user id — never the address, the code, or the body
   * (NFR-S-07).
   */
  const deliver = async (
    request: {
      log: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void };
    },
    event: string,
    userId: string,
    message: Parameters<typeof mailer.send>[0],
  ): Promise<void> => {
    const result = await mailer.send(message);
    if (result.sent) {
      request.log.info({ event, userId, messageId: result.id }, 'code email sent');
    } else {
      request.log.warn({ event, userId, failure: result.failure }, 'code email not sent');
    }
  };

  const authLimit = {
    rateLimit: {
      max: config.AUTH_RATE_LIMIT_PER_MIN,
      timeWindow: '1 minute',
      keyGenerator: (request: { ip: string }) => request.ip,
    },
  };

  typed.post(
    routes.auth.register,
    {
      config: authLimit,
      schema: { body: registerRequestSchema, response: { 201: authResponseSchema } },
    },
    async (request, reply) => {
      const result = await authService.register(deps, request.body);
      request.log.info({ event: 'auth.register' }, 'account created');
      return reply.status(201).send(result);
    },
  );

  typed.post(
    routes.auth.login,
    {
      config: authLimit,
      schema: { body: loginRequestSchema, response: { 200: authResponseSchema } },
    },
    async (request) => authService.login(deps, request.body),
  );

  /**
   * FR-AUTH-11. Same tight rate limit as the password routes: a valid Google
   * token is as good as a password here, so this is equally worth guessing at.
   */
  typed.post(
    routes.auth.google,
    {
      config: authLimit,
      schema: { body: googleSignInSchema, response: { 200: authResponseSchema } },
    },
    async (request) => {
      try {
        return await authService.signInWithGoogle(deps, request.body.idToken);
      } catch (error) {
        if (error instanceof GoogleAuthError) {
          /*
           * The REASON is logged and never returned. "email_unverified" tells
           * an attacker their token parsed and only the last check stopped
           * them, which is a free oracle; the client gets one opaque failure
           * for every way a token can be bad.
           */
          request.log.warn({ event: 'google_sign_in_rejected', reason: error.reason }, 'rejected');

          if (error.reason === 'not_configured') {
            // Distinguishable on purpose: nothing the caller did is wrong, and
            // the app needs to know to stop offering the button.
            throw conflict('Google sign-in is not available on this deployment');
          }
          throw unauthenticated('That Google sign-in could not be completed');
        }
        throw error;
      }
    },
  );

  typed.post(
    routes.auth.refresh,
    {
      config: authLimit,
      schema: { body: refreshRequestSchema, response: { 200: tokenPairSchema } },
    },
    async (request) => {
      const result = await authService.refresh(deps, request.body.refreshToken);
      return result.tokens;
    },
  );

  typed.post(
    routes.auth.logout,
    { schema: { body: logoutRequestSchema, response: { 200: acceptedSchema } } },
    async (request) => {
      await authService.logout(deps, request.body.refreshToken);
      return { ok: true as const };
    },
  );

  typed.post(
    routes.auth.passwordResetRequest,
    {
      config: authLimit,
      schema: { body: passwordResetRequestSchema, response: { 202: codeRequestResponseSchema } },
    },
    async (request, reply) => {
      const reset = await authService.createPasswordReset(deps, request.body.email);

      // An unknown address produces no code and no email, but exactly the same
      // response. That is the whole point of answering 202 here.
      if (reset) {
        await deliver(
          request,
          'auth.password_reset',
          reset.userId,
          passwordResetEmail(request.body.email, reset.code, codeMinutes),
        );
      }

      return reply.status(202).send({
        ok: true as const,
        deliveryConfigured: mailer.isConfigured,
        expiresInSeconds: config.OTP_TTL,
      });
    },
  );

  typed.post(
    routes.auth.passwordResetConfirm,
    {
      config: authLimit,
      schema: { body: passwordResetConfirmSchema, response: { 200: acceptedSchema } },
    },
    async (request) => {
      await authService.confirmPasswordReset(deps, request.body);
      return { ok: true as const };
    },
  );

  // ------------------------------------------------- email verification --

  /**
   * Verification is authenticated: you prove you hold the account, then prove
   * you hold the address. That ordering is why there is no email in the body —
   * a caller cannot request a code for someone else's address.
   *
   * The decision on record is that an unverified account stays fully
   * functional and is reminded rather than blocked, so nothing here gates
   * anything; `emailVerified` is a fact the client displays.
   */
  typed.post(
    routes.auth.verifyEmailRequest,
    {
      config: authLimit,
      preHandler: app.requireUser,
      schema: { response: { 202: codeRequestResponseSchema } },
    },
    async (request, reply) => {
      const userId = currentUser(request).id;
      const issued = await authService.createEmailVerification(deps, userId);

      // Null means already verified. Reported as success, because it is.
      if (issued) {
        await deliver(
          request,
          'auth.verify_email',
          userId,
          verificationEmail(issued.email, issued.code, codeMinutes),
        );
      }

      return reply.status(202).send({
        ok: true as const,
        deliveryConfigured: mailer.isConfigured,
        expiresInSeconds: config.OTP_TTL,
      });
    },
  );

  typed.post(
    routes.auth.verifyEmailConfirm,
    {
      config: authLimit,
      preHandler: app.requireUser,
      schema: { body: verifyEmailConfirmSchema, response: { 200: verificationStatusSchema } },
    },
    async (request) => {
      const userId = currentUser(request).id;
      await authService.confirmEmailVerification(deps, userId, request.body.code);
      return authService.verificationStatus(deps, userId);
    },
  );
}
