/**
 * The single place an error becomes a response (BRD §10.2, NFR-O-05).
 *
 * Every failure leaves with the shared envelope, the correlation id, and a
 * message safe to show a user. Stack traces are logged, never returned.
 */
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';
import type { ApiError } from '@fi/shared';
import { httpStatusFor } from '@fi/shared';
import { AppError, isConnectionError, serviceUnavailable } from '../lib/errors.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

function envelope(error: AppError, requestId: string): ApiError {
  return {
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
      requestId,
    },
  };
}

function fromZodError(error: ZodError): AppError {
  return new AppError('VALIDATION_ERROR', 'Some of that could not be accepted', {
    details: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  });
}

/** Normalises anything thrown into the one error type we know how to render. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) return fromZodError(error);
  if (isConnectionError(error)) return serviceUnavailable(error);

  if (hasZodFastifySchemaValidationErrors(error)) {
    return new AppError('VALIDATION_ERROR', 'Some of that could not be accepted', {
      details: error.validation.map((issue) => ({
        path: issue.params.issue.path.join('.'),
        message: issue.params.issue.message,
      })),
    });
  }

  // A body larger than the configured limit, or malformed JSON.
  const statusCode = (error as { statusCode?: number }).statusCode;
  if (statusCode === 413) {
    return new AppError('PAYLOAD_TOO_LARGE', 'That upload is too large');
  }
  if (statusCode === 400) {
    return new AppError('VALIDATION_ERROR', 'That request could not be read');
  }
  if (statusCode === 429) {
    return new AppError('RATE_LIMITED', 'Too many requests. Try again shortly.');
  }

  return new AppError('INTERNAL', 'Something went wrong', { cause: error });
}

export const errorHandlerPlugin = fp(
  async (app: FastifyInstance) => {
    app.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
      // A response that fails its own schema is our bug, and a loud one.
      if (isResponseSerializationError(error)) {
        request.log.error(
          { err: error, method: request.method, route: request.routeOptions.url },
          'response failed its schema',
        );
        return reply
          .status(500)
          .send(envelope(new AppError('INTERNAL', 'Something went wrong'), request.id));
      }

      const appError = toAppError(error);

      if (appError.statusCode >= 500) {
        request.log.error({ err: error, code: appError.code }, 'request failed');
      } else {
        request.log.warn({ code: appError.code }, 'request rejected');
      }

      if (appError.retryAfterSecs !== undefined) {
        reply.header('Retry-After', String(appError.retryAfterSecs));
      }
      return reply.status(appError.statusCode).send(envelope(appError, request.id));
    });

    app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) =>
      reply.status(httpStatusFor('NOT_FOUND')).send(
        envelope(new AppError('NOT_FOUND', 'That could not be found'), request.id),
      ),
    );
  },
  { name: 'error-handler' },
);
