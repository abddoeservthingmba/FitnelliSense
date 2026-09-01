/**
 * Media resolution (FR-MED-01..08, NFR-S-12).
 *
 * The client holds a `mediaId` and asks for a URL. This is the only code that
 * turns an asset into something renderable, and it refuses to do so unless the
 * row says it may: active state, an allowlisted licence, and attribution text
 * present when the licence demands it.
 */
import { eq } from 'drizzle-orm';
import { RENDERABLE_LICENCES, type ResolvedMedia } from '@fi/shared';
import { mediaAssets } from '../db/schema';
import { notFound } from '../lib/errors';
import type { Database } from '../db/client';
import type { Storage } from '../lib/r2';

export interface MediaDeps {
  readonly db: Database;
  readonly storage: Storage;
  readonly urlTtlSecs: number;
}

type AssetRow = typeof mediaAssets.$inferSelect;

/**
 * The single renderability test (FR-MED-03, FR-MED-06, FR-MED-08). A takedown
 * is a state change, so it takes effect on the next request with no deploy.
 */
export function isRenderable(asset: Pick<AssetRow, 'state' | 'licence'>): boolean {
  return (
    asset.state === 'active' && (RENDERABLE_LICENCES as readonly string[]).includes(asset.licence)
  );
}

function attributionOf(asset: AssetRow): ResolvedMedia['attribution'] {
  if (!asset.attributionText) return null;
  return {
    text: asset.attributionText,
    sourceName: asset.sourceName,
    licence: asset.licence,
    licenceUrl: asset.licenceUrl,
  };
}

/**
 * Resolves an asset to a URL, or returns null so the caller can fall back to
 * the deterministic placeholder (FR-MED-07). Null is a normal answer here:
 * missing, taken down, broken and unlicensed all look the same to the UI.
 */
export async function resolveMedia(
  deps: MediaDeps,
  mediaId: string,
): Promise<ResolvedMedia | null> {
  const [asset] = await deps.db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, mediaId))
    .limit(1);

  if (!asset || !isRenderable(asset)) return null;

  if (asset.delivery === 'external_embed') {
    if (!asset.externalUrl) return null;
    return {
      mediaId: asset.id,
      kind: asset.kind,
      url: asset.externalUrl,
      // An external URL is not ours to expire.
      expiresAt: null,
      requiresAttribution: asset.requiresAttribution,
      attribution: attributionOf(asset),
    };
  }

  if (!asset.r2Key) return null;
  const url = await deps.storage.signDownload(asset.r2Key, deps.urlTtlSecs);
  // NFR-B-06: R2 unavailable degrades to a placeholder rather than an error.
  if (!url) return null;

  return {
    mediaId: asset.id,
    kind: asset.kind,
    url,
    expiresAt: new Date(Date.now() + deps.urlTtlSecs * 1000).toISOString(),
    requiresAttribution: asset.requiresAttribution,
    attribution: attributionOf(asset),
  };
}

/** Used by the route so a genuinely unknown id is still a 404. */
export async function resolveMediaOrThrow(
  deps: MediaDeps,
  mediaId: string,
): Promise<ResolvedMedia> {
  const resolved = await resolveMedia(deps, mediaId);
  if (!resolved) throw notFound('That media is not available');
  return resolved;
}
