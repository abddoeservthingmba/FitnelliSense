/**
 * Which storage failures are the clip's fault, and which are ours.
 *
 * THE DISTINCTION COST A LIFTER'S ANALYSIS on the very first production run.
 * Behind TLS-intercepting security software the download failed with
 * "self-signed certificate in certificate chain"; every storage error was
 * treated as a missing object, and a perfectly good recording was marked
 * `failed` with "That video could not be found." `failed` is terminal and the
 * client tells the user to film the set again, so the wrong classification
 * destroys work that was never at risk.
 */
import { describe, expect, it } from 'vitest';
import { classifyStorageError } from './storage';

describe('classifyStorageError', () => {
  it('calls a 404 a missing object', () => {
    expect(classifyStorageError({ $metadata: { httpStatusCode: 404 } })).toBe('missing');
  });

  it('recognises the SDK names for absence', () => {
    expect(classifyStorageError({ name: 'NoSuchKey' })).toBe('missing');
    expect(classifyStorageError({ name: 'NotFound' })).toBe('missing');
  });

  it('calls an intercepted certificate unreachable, not missing', () => {
    // The exact failure from the first production run.
    expect(
      classifyStorageError({
        name: 'Error',
        message: 'self-signed certificate in certificate chain',
      }),
    ).toBe('unreachable');
  });

  it('calls a refusal unreachable rather than absence', () => {
    // 403 means the credentials are wrong. The object may well be there, and
    // telling the user their video is gone would be false.
    expect(classifyStorageError({ $metadata: { httpStatusCode: 403 } })).toBe('unreachable');
    expect(classifyStorageError({ $metadata: { httpStatusCode: 500 } })).toBe('unreachable');
  });

  it('calls a timeout unreachable', () => {
    expect(classifyStorageError({ name: 'TimeoutError' })).toBe('unreachable');
  });

  it('does not decide on the message text', () => {
    // Messages are human prose that changes between SDK versions, and this
    // decides what a lifter is told.
    expect(classifyStorageError({ message: 'NoSuchKey: not found' })).toBe('unreachable');
  });

  it('treats something that is not an error object as unreachable', () => {
    expect(classifyStorageError(undefined)).toBe('unreachable');
    expect(classifyStorageError(null)).toBe('unreachable');
    expect(classifyStorageError('boom')).toBe('unreachable');
  });
});
