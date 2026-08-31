/**
 * Auth routes (FR-AUTH-01..06). Thin: parse, delegate, respond.
 *
 * NFR-S-06: these endpoints carry their own tighter limit, keyed on IP, because
 * they are the ones worth guessing against.
 */
import { z } from 'zod';
import {
  authResponseSchema,
  loginRequestSchema,
  logoutRequestSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
  routes,
  tokenPairSchema,
} from '@fi/shared';
import * as authService from '../services/auth-service.js';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

const acceptedSchema = z.object({ ok: z.literal(true) });

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const { config, database, tokens } = app.ctx;

  const deps: authService.AuthDeps = {
    db: database.db,
    tokens,
    passwordResetTtlSecs: config.PASSWORD_RESET_TTL,
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
    { config: authLimit, schema: { body: loginRequestSchema, response: { 200: authResponseSchema } } },
    async (request) => authService.login(deps, request.body),
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
      schema: { body: passwordResetRequestSchema, response: { 202: acceptedSchema } },
    },
    async (request, reply) => {
      const reset = await authService.createPasswordReset(deps, request.body.email);

      // Q11: no email provider is chosen yet. Until one is, the token is logged
      // in development only and the response is identical either way, so the
      // endpoint never reveals whether the address is registered.
      if (reset && config.isDevelopment) {
        request.log.warn(
          { event: 'auth.password_reset', resetToken: reset.token },
          'password reset token issued (development only)',
        );
      }
      return reply.status(202).send({ ok: true as const });
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
}
