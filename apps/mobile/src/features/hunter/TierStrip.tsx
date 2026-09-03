/**
 * The current tier, in one line.
 *
 * The tier NAME comes from the chosen Path, while the rank behind it stays
 * E..S — so the wording changes and the ladder does not.
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
import { tierForRank, nextTier } from '@fi/domain';
import { useTheme } from '../../theme';
import { RANK_COLORS } from '../../theme/tokens';

export function TierStrip() {
  const theme = useTheme();
  const status = useHunterStatus();

  if (!status.data) return null;

  const { level, rank, fraction, xpIntoLevel, xpForThisLevel } = status.data;
  const tier = tierForRank(theme.path, rank);
  const next = nextTier(theme.path, level);
  const colour = theme.colors[RANK_COLORS[rank] ?? 'text'];

  return (
    <Pressable
      onPress={() => router.push('/(tabs)/hunter')}
      accessibilityRole="button"
      accessibilityLabel={`${tier.name}, ${theme.path.levelWord.toLowerCase()} ${level}. ${xpIntoLevel} of ${xpForThisLevel} XP into this level. Opens your status.`}
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
          {/* The tier's own name, not the letter behind it. numberOfLines
              because "Shadow Sovereign" is a great deal longer than "RANK A". */}
          <Text
            variant="label"
            weight="heavy"
            numberOfLines={1}
            style={{ color: colour, flexShrink: 1 }}
          >
            {tier.name.toUpperCase()}
          </Text>
          <Text variant="caption" tone="muted">
            {`${theme.path.levelWord} ${level}`}
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
          {next
            ? `${xpForThisLevel - xpIntoLevel} XP to ${theme.path.levelWord.toLowerCase()} ${level + 1} · ${next.tier.name} at ${next.atLevel}`
            : `${xpForThisLevel - xpIntoLevel} XP to ${theme.path.levelWord.toLowerCase()} ${level + 1}`}
        </Text>
      </View>

      <Overline tone="faint">status</Overline>
    </Pressable>
  );
}
