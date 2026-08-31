/**
 * Cloudflare R2 access (NFR-S-04, FR-CV-02).
 *
 * Buckets are private. The API never proxies bytes: it hands out presigned URLs
 * with a short TTL. R2 being unavailable degrades media to placeholders rather
 * than failing a request (NFR-B-06), so every method here can report "not
 * configured" instead of throwing.
 */
import { DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Config } from '../config';

export interface PresignedUpload {
  readonly url: string;
  readonly key: string;
  readonly expiresAt: Date;
  readonly requiredHeaders: Record<string, string>;
}

export interface Storage {
  readonly configured: boolean;
  /** Presigned GET, or null when storage is unavailable. */
  signDownload(key: string, ttlSecs: number): Promise<string | null>;
  signUpload(input: {
    key: string;
    contentType: string;
    contentLength?: number;
    ttlSecs: number;
  }): Promise<PresignedUpload | null>;
  deleteObject(key: string): Promise<void>;
  /** Cheap reachability probe for /health/deep (NFR-O-01). */
  check(): Promise<{ ok: boolean; detail: string | null }>;
}

class DisabledStorage implements Storage {
  readonly configured = false;

  async signDownload(): Promise<null> {
    return null;
  }

  async signUpload(): Promise<null> {
    return null;
  }

  async deleteObject(): Promise<void> {
    // Nothing to delete without a bucket; callers still mark the row deleted.
  }

  async check(): Promise<{ ok: boolean; detail: string | null }> {
    return { ok: false, detail: 'R2 is not configured' };
  }
}

class R2Storage implements Storage {
  readonly configured = true;
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    accountId: string,
    accessKeyId: string,
    secretAccessKey: string,
  ) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async signDownload(key: string, ttlSecs: number): Promise<string | null> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: ttlSecs },
    );
  }

  async signUpload(input: {
    key: string;
    contentType: string;
    contentLength?: number;
    ttlSecs: number;
  }): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ContentType: input.contentType,
      ...(input.contentLength === undefined ? {} : { ContentLength: input.contentLength }),
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: input.ttlSecs });
    return {
      url,
      key: input.key,
      expiresAt: new Date(Date.now() + input.ttlSecs * 1000),
      // The signature covers these headers; sending anything else invalidates it.
      requiredHeaders: { 'Content-Type': input.contentType },
    };
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async check(): Promise<{ ok: boolean; detail: string | null }> {
    try {
      // Signing exercises credentials and configuration without a network call
      // costing a request against the free-tier operation quota.
      await this.signDownload('healthcheck', 60);
      return { ok: true, detail: null };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : 'unknown error' };
    }
  }
}

export function createStorage(config: Config): Storage {
  if (!config.r2Configured) return new DisabledStorage();
  return new R2Storage(
    config.R2_BUCKET,
    config.R2_ACCOUNT_ID,
    config.R2_ACCESS_KEY_ID,
    config.R2_SECRET_ACCESS_KEY,
  );
}

/** Object key layouts, in one place so nothing invents its own path. */
export const keys = {
  avatar: (userId: string, extension: string) => `avatars/${userId}/${Date.now()}.${extension}`,
  exerciseMedia: (mediaId: string, extension: string) => `exercises/${mediaId}.${extension}`,
  cvVideo: (userId: string, analysisId: string) => `cv/${userId}/${analysisId}.mp4`,
} as const;
