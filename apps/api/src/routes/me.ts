/**
 * Account routes (FR-AUTH-07..10). Every handler is scoped to the
 * authenticated user; no id is ever read from the path (NFR-S-03).
 */
import { z } from 'zod';
import {
  avatarUploadUrlResponseSchema,
  meResponseSchema,
  routes,
  updateProfileRequestSchema,
} from '@fi/shared';
import { currentUser } from '../plugins/auth';
import { keys } from '../lib/r2';
import { badRequest } from '../lib/errors';
import * as profileService from '../services/profile-service';
import * as authService from '../services/auth-service';
import { exportUserData } from '../services/export-service';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

/** FR-AUTH-08: a small allowlist, so an upload URL cannot be used for anything. */
const AVATAR_CONTENT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const avatarUploadRequestSchema = z.object({
  contentType: z.string(),
  contentLength: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024, 'Avatars are limited to 5 MB'),
});

export async function meRoutes(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const { config, database, storage, tokens } = app.ctx;

  const profileDeps: profileService.ProfileDeps = {
    db: database.db,
    storage,
    avatarUrlTtlSecs: config.MEDIA_URL_TTL_SECONDS,
  };

  typed.get(
    routes.me.root,
    { preHandler: app.requireUser, schema: { response: { 200: meResponseSchema } } },
    async (request) => profileService.getMe(profileDeps, currentUser(request).id),
  );

  typed.patch(
    routes.me.root,
    {
      preHandler: app.requireUser,
      schema: { body: updateProfileRequestSchema, response: { 200: meResponseSchema } },
    },
    async (request) =>
      profileService.updateProfile(profileDeps, currentUser(request).id, request.body),
  );

  typed.post(
    routes.me.avatarUploadUrl,
    {
      preHandler: app.requireUser,
      schema: {
        body: avatarUploadRequestSchema,
        response: { 200: avatarUploadUrlResponseSchema },
      },
    },
    async (request) => {
      const extension = AVATAR_CONTENT_TYPES[request.body.contentType];
      if (!extension) throw badRequest('Avatars must be a JPEG, PNG or WebP image');

      const user = currentUser(request);
      const presigned = await storage.signUpload({
        key: keys.avatar(user.id, extension),
        contentType: request.body.contentType,
        contentLength: request.body.contentLength,
        ttlSecs: config.MEDIA_URL_TTL_SECONDS,
      });
      if (!presigned) throw badRequest('Avatar uploads are not available right now');

      return {
        uploadUrl: presigned.url,
        r2Key: presigned.key,
        expiresAt: presigned.expiresAt.toISOString(),
        requiredHeaders: presigned.requiredHeaders,
      };
    },
  );

  typed.get(
    routes.me.export,
    { preHandler: app.requireUser, schema: { response: { 200: z.looseObject({}) } } },
    async (request, reply) => {
      const data = await exportUserData(database.db, currentUser(request).id);
      reply.header('Content-Disposition', 'attachment; filename="fitness-intellisense-export.json"');
      return data;
    },
  );

  typed.delete(
    routes.me.root,
    {
      preHandler: app.requireUser,
      schema: { response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    async (request) => {
      const user = currentUser(request);
      const deps: authService.AuthDeps = {
        db: database.db,
        tokens,
        passwordResetTtlSecs: config.PASSWORD_RESET_TTL,
      };
      await authService.revokeAllForUser(deps, user.id);
      await profileService.markAccountDeleted(profileDeps, user.id);
      request.log.info({ event: 'account.deleted' }, 'account marked for deletion');
      return { ok: true as const };
    },
  );
}
