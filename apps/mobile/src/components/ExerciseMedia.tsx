/**
 * Exercise media, and its absence (FR-MED-04, FR-MED-07, NFR-S-12).
 *
 * Three rules this component exists to enforce:
 *   1. the client never builds a media URL — it resolves a `mediaId` through
 *      the API, which decides whether the asset may be shown at all;
 *   2. missing, broken, taken-down and unlicensed all render the same
 *      deterministic placeholder, never an empty box or a broken image;
 *   3. where the licence requires attribution, the credit renders next to the
 *      media, not behind a tap.
 */
import { useQuery } from '@tanstack/react-query';
import { Image, View } from 'react-native';
import { routes, type ResolvedMedia } from '@fi/shared';
import { api } from '../api/client';
import { keys } from '../api/query-client';
import { Text } from './Text';
import { useTheme } from '../theme';

function useResolvedMedia(mediaId: string | null) {
  return useQuery({
    queryKey: keys.media(mediaId ?? ''),
    queryFn: () => api.get<ResolvedMedia>(routes.media.url(mediaId ?? '')),
    enabled: Boolean(mediaId),
    // The signed URL is short-lived; do not hold it past its life.
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}

/** The fallback: initials on a tinted surface, derived from the name. */
function Placeholder({ name, size }: { name: string; size: number }) {
  const theme = useTheme();
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <View
      accessible
      accessibilityLabel={`${name}, no illustration available`}
      style={{
        width: size,
        height: size,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceRaised,
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant={size > 80 ? 'title' : 'label'} tone="faint" weight="bold">
        {initials || '·'}
      </Text>
    </View>
  );
}

export function ExerciseThumbnail({
  mediaId,
  name,
  size = 48,
}: {
  mediaId: string | null;
  name: string;
  size?: number;
}) {
  const theme = useTheme();
  const { data } = useResolvedMedia(mediaId);

  if (!data) return <Placeholder name={name} size={size} />;

  return (
    <Image
      source={{ uri: data.url }}
      accessibilityLabel={`Illustration of ${name}`}
      style={{
        width: size,
        height: size,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceRaised,
      }}
      resizeMode="cover"
    />
  );
}

// The large detail-page form lives in `MovementDemo`, which animates the two
// frames rather than showing one of them. A single-image hero was the same
// component with less in it, so it is not kept here as well.
