/**
 * The badge collection.
 *
 * Locked badges are shown, not hidden, with the requirement spelled out —
 * a collection you cannot see the shape of is not a collection, and "what do I
 * have to do" is the only interesting question about a locked one.
 */
import { View } from 'react-native';
import type { Badge } from '@fi/shared';
import { Row } from '../../components/Card';
import { Overline, Text } from '../../components/Text';
import { badgeName } from '@fi/domain';
import { useTheme } from '../../theme';
import { BADGE_TIER_COLORS } from '../../theme/tokens';

export function BadgeGrid({ badges }: { badges: readonly Badge[] }) {
  const theme = useTheme();

  // Earned first, so the collection reads as an achievement rather than a
  // to-do list, then locked ones in tier order.
  const ordered = [...badges].sort((a, b) => {
    if (a.earned !== b.earned) return a.earned ? -1 : 1;
    return 0;
  });

  return (
    <View style={{ gap: theme.space.sm }}>
      {ordered.map((badge) => (
        <BadgeRow key={badge.key} badge={badge} />
      ))}
    </View>
  );
}

function BadgeRow({ badge }: { badge: Badge }) {
  const theme = useTheme();
  const tierColour = theme.colors[BADGE_TIER_COLORS[badge.tier] ?? 'textMuted'];
  // Rank badges take the chosen Ascension's tier name; the rest describe the
  // work rather than the world and keep theirs.
  const displayName = badgeName(theme.ascension, badge.key, badge.name);

  return (
    <View
      accessible
      accessibilityLabel={
        badge.earned
          ? `${displayName}, earned. ${badge.requirement}`
          : `${displayName}, locked. ${badge.requirement}`
      }
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.md,
        paddingVertical: theme.space.sm,
        opacity: badge.earned ? 1 : 0.45,
      }}
    >
      {/* A filled diamond for earned, an outline for locked. */}
      <View
        style={{
          width: 22,
          height: 22,
          transform: [{ rotate: '45deg' }],
          backgroundColor: badge.earned ? tierColour : 'transparent',
          borderWidth: badge.earned ? 0 : 1.5,
          borderColor: tierColour,
        }}
      />

      <View style={{ flex: 1, gap: 2 }}>
        <Row gap="sm" align="center">
          <Text variant="callout" weight="semibold" style={{ color: tierColour }}>
            {displayName}
          </Text>
          {badge.tier === 'monarch' ? <Overline tone="monarch">monarch</Overline> : null}
        </Row>
        <Text variant="caption" tone="faint">
          {badge.requirement}
        </Text>
      </View>

      <Text variant="caption" tone={badge.earned ? 'muted' : 'faint'}>
        {badge.earned ? 'earned' : `+${badge.xp}`}
      </Text>
    </View>
  );
}
