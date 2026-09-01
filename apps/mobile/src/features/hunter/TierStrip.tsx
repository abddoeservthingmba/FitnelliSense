/**
 * The current tier, in one line.
 *
 * The Hunter tab shows the full status; this is the version that belongs at the
 * top of a screen you did not open to look at your rank. It answers "what am I
 * right now" — rank, level, progress to the next one — and taps through to the
 * detail rather than trying to be the detail.
 *
 * It renders nothing at all while the status is loading or unavailable. A tier
 * placeholder would be a claim about the user's rank, and a wrong one; the
 * screen it sits on has to read correctly without it.
 */
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Overline, Text } from '../../components/Text';
import { RankBadge } from './RankBadge';
import { useHunterStatus } from '../../api/hooks/use-hunter';
import { useTheme } from '../../theme';
import { RANK_COLORS } from '../../theme/tokens';

export function TierStrip() {
  const theme = useTheme();
  const status = useHunterStatus();

  if (!status.data) return null;

  const { level, rank, fraction, xpIntoLevel, xpForThisLevel, nextRank } = status.data;
  const colour = theme.colors[RANK_COLORS[rank] ?? 'text'];

  return (
    <Pressable
      onPress={() => router.push('/(tabs)/hunter')}
      accessibilityRole="button"
      accessibilityLabel={`Rank ${rank}, level ${level}. ${xpIntoLevel} of ${xpForThisLevel} XP into this level. Opens your hunter status.`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.md,
        paddingVertical: theme.space.sm,
        paddingHorizontal: theme.space.md,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
      }}
    >
      <RankBadge rank={rank} size={40} />

      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.space.sm }}>
          <Text variant="label" weight="heavy" style={{ color: colour }}>
            {`RANK ${rank}`}
          </Text>
          <Text variant="caption" tone="muted">
            {`Level ${level}`}
          </Text>
        </View>

        {/* The bar is the only moving part, so it carries the accent. */}
        <View
          style={{
            height: 4,
            backgroundColor: theme.colors.surfaceRaised,
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`,
              height: '100%',
              backgroundColor: colour,
            }}
          />
        </View>

        <Text variant="micro" tone="faint">
          {nextRank
            ? `${xpForThisLevel - xpIntoLevel} XP to level ${level + 1} · rank ${nextRank.rank} at ${nextRank.atLevel}`
            : `${xpForThisLevel - xpIntoLevel} XP to level ${level + 1}`}
        </Text>
      </View>

      <Overline tone="faint">status</Overline>
    </Pressable>
  );
}
