/**
 * The tier badge: a chamfered plate carrying the tier's own mark.
 *
 * It used to render the raw rank letter — "A" on a coloured plate. That was the
 * bug behind "the Hunter tab doesn't follow the theme": the tier NAME was
 * themed in `TierStrip`, but the badge beside it, and every other place a rank
 * appeared, still showed the letter. Fixing it here fixes the Hunter screen, the
 * ranking list and athlete profiles at once, because they all use this.
 *
 * The plate is drawn from the tier's palette; the letter is gone entirely.
 * `E`–`S` remains the internal rank and is never shown to a user again.
 */
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ascensionFor, tierForRank, type AscensionId } from '@fi/domain';
import type { Rank } from '@fi/shared';
import { Overline } from '../../components/Text';
import { TierMark } from '../ascension/TierMark';
import { useTheme } from '../../theme';

export interface RankBadgeProps {
  rank: Rank;
  size?: number;
  /** Shows the tier's name beneath, for the status screen. */
  labelled?: boolean;
  /**
   * Renders in another athlete's Ascension rather than the viewer's.
   *
   * Their tier is part of who they are on the ranking, so showing it in the
   * viewer's costume would misrepresent them.
   */
  ascension?: AscensionId | null;
}

export function RankBadge({ rank, size = 56, labelled = false, ascension }: RankBadgeProps) {
  const theme = useTheme();
  const active = ascension ? ascensionFor(ascension) : theme.ascension;
  const tier = tierForRank(active, rank);
  const colour = tier.form.colour;
  const cut = 22;

  return (
    <View style={{ alignItems: 'center', gap: theme.space.xs }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} viewBox="0 0 100 100" style={{ position: 'absolute' }}>
          <Path
            d={`M${cut},4 L96,4 L96,${100 - cut} L${100 - cut},96 L4,96 L4,${cut} Z`}
            fill={theme.colors.surfaceRaised}
            stroke={colour}
            strokeWidth={4}
          />
        </Svg>
        {/* Inset so the mark sits inside the chamfer rather than over it. */}
        <TierMark tier={tier} motif={active.motif} size={size * 0.78} />
      </View>
      {labelled ? <Overline>{tier.name}</Overline> : null}
    </View>
  );
}
