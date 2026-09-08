/**
 * Getting the video out of R2 and onto disk.
 *
 * A PLAIN `GetObject`, not a presigned URL. The API presigns because its
 * clients are phones and browsers that must never hold bucket credentials;
 * this worker holds them already, so a presign would be a round trip and a
 * signature to buy nothing.
 *
 * The analyzer needs a real file: OpenCV opens a path and seeks within it, so
 * the object is streamed to disk rather than held in memory. A 1080p clip is
 * up to 80 MB and the frames decoded from it are far larger — keeping the
 * source in memory as well would be the cheapest way to run out of it.
 */
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import type { Config } from './config';

/** The object genuinely is not there. The clip's own fault, not ours. */
export class VideoMissing extends Error {}

/**
 * Storage could not be reached or refused us. OURS, not the clip's.
 *
 * SEPARATE FROM `VideoMissing`, and the first run against production is why.
 * Behind TLS-intercepting security software the very first download failed with
 * "self-signed certificate in certificate chain", and because every storage
 * error was treated as a missing object the lifter's analysis was marked failed
 * with "That video could not be found." The video was fine. Telling someone
 * their recording is gone when it is sitting in the bucket is the worst
 * available answer, and it is unrecoverable — the client is told a failed
 * analysis needs a fresh upload.
 */
export class StorageUnreachable extends Error {}

/**
 * Whether an S3 error means the object is absent, or that we could not ask.
 *
 * Decided on the status code and the error NAME, never on the message: a
 * message is human prose that changes between SDK versions, and this decides
 * what a lifter is told about their recording.
 *
 * Exported so it can be tested. It is six lines of logic and one production
 * incident, which is a ratio that earns a test.
 */
export function classifyStorageError(cause: unknown): 'missing' | 'unreachable' {
  if (typeof cause !== 'object' || cause === null) return 'unreachable';
  const error = cause as { name?: string; $metadata?: { httpStatusCode?: number } };
  const absent =
    error.$metadata?.httpStatusCode === 404 ||
    error.name === 'NoSuchKey' ||
    error.name === 'NotFound';
  return absent ? 'missing' : 'unreachable';
}

export interface Storage {
  download(key: string, to: string): Promise<void>;
}

export function createStorage(config: Config): Storage {
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.R2_ACCESS_KEY_ID,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY,
    },
  });

  return {
    async download(key, to) {
      const response = await client
        .send(new GetObjectCommand({ Bucket: config.R2_BUCKET, Key: key }))
        .catch((cause: Error) => {
          /*
           * A missing object is a NORMAL outcome, not a fault: the client
           * confirms its own upload, so a client that lied — or died between
           * the PUT and the confirm — leaves a queued row with nothing behind
           * it. That has to fail this one analysis, not the worker.
           *
           * Everything else is ours. See `StorageUnreachable`.
           */
          if (classifyStorageError(cause) === 'missing') {
            throw new VideoMissing(`the video is not in the bucket (${cause.message})`);
          }
          throw new StorageUnreachable(`could not reach storage (${cause.message})`);
        });

      const body = response.Body as Readable | undefined;
      if (body === undefined) throw new VideoMissing('the video object is empty');

      await pipeline(body, createWriteStream(to));
    },
  };
}
