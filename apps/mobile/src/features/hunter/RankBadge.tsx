/**
 * The rank glyph. A chamfered plate with the letter in it, coloured by rank —
 * greys through cyan to monarch violet at S.
 */
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { Rank } from '@fi/shared';
import { Overline, Text } from '../../components/Text';
import { useTheme } from '../../theme';
import { RANK_COLORS } from '../../theme/tokens';

export interface RankBadgeProps {
  rank: Rank;
  size?: number;
  /** Shows the word RANK beneath, for the status screen. */
  labelled?: boolean;
}

export function RankBadge({ rank, size = 56, labelled = false }: RankBadgeProps) {
  const theme = useTheme();
  const colour = theme.colors[RANK_COLORS[rank] ?? 'text'];
  const cut = 22;

  return (
    <View style={{ alignItems: 'center', gap: theme.space.xs }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          style={{ position: 'absolute' }}
        >
          <Path
            d={`M${cut},4 L96,4 L96,${100 - cut} L${100 - cut},96 L4,96 L4,${cut} Z`}
            fill={theme.colors.surfaceRaised}
            stroke={colour}
            strokeWidth={4}
          />
        </Svg>
        <Text
          variant="title"
          weight="heavy"
          style={{ color: colour, fontSize: size * 0.44, lineHeight: size * 0.5 }}
        >
          {rank}
        </Text>
      </View>
      {labelled ? <Overline>rank</Overline> : null}
    </View>
  );
}
