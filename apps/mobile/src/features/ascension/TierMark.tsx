/**
 * The icon for one tier — drawn, not downloaded.
 *
 * Thirty distinct marks (five Ascensions × six tiers) come from thirty rows of
 * data in `@fi/domain` plus one renderer. No image files: nothing to fetch,
 * nothing that goes soft when scaled up, and every mark recolours itself from
 * the tier's own palette.
 *
 * It is a SILHOUETTE, not a portrait. That is partly the honest choice — a
 * drawing of someone else's character is the one asset that cannot be swapped
 * later without redrawing every screen around it — and partly the practical
 * one: a crest that gains elements and reaches further as the rank climbs reads
 * as *the next form of the same thing*, which is exactly what a tier ladder is.
 * Six unrelated portraits would not.
 *
 * The motif decides the geometry family; the tier's `form` decides how far
 * along that family this tier sits.
 */
import Svg, { Circle, Ellipse, G, Path, Polygon, Rect } from 'react-native-svg';
import type { AscensionTier, Motif } from '@fi/domain';
import { useTheme } from '../../theme';

export interface TierMarkProps {
  tier: AscensionTier;
  /** Overrides the current Ascension's motif — the picker shows all five. */
  motif?: Motif;
  size?: number;
}

/** The drawing happens in a 100×100 box and is scaled by the SVG viewBox. */
const BOX = 100;
const CX = 50;
/** The head sits low so the crest has room above it without leaving the box. */
const CY = 62;
const HEAD_R = 21;

export function TierMark({ tier, motif, size = 44 }: TierMarkProps) {
  const theme = useTheme();
  const family = motif ?? theme.ascension.motif;
  const { colour, crest, reach, aura } = tier.form;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`}>
      {/* Aura rings, faintest first, so a high tier reads as radiating. */}
      {Array.from({ length: aura }, (_, index) => (
        <Circle
          key={`aura-${index}`}
          cx={CX}
          cy={CY - 4}
          r={HEAD_R + 7 + index * 7}
          stroke={colour}
          strokeWidth={1}
          opacity={0.3 - index * 0.07}
          fill="none"
        />
      ))}

      {/* The crest sits BEHIND the head, so spikes emerge from it. */}
      <G>{crestFor(family, crest, reach, colour)}</G>

      {/* The head: neutral, so the crest carries the identity. */}
      <Circle cx={CX} cy={CY} r={HEAD_R} fill={theme.colors.surfaceRaised} />
      <Circle
        cx={CX}
        cy={CY}
        r={HEAD_R}
        stroke={theme.colors.borderStrong}
        strokeWidth={1.5}
        fill="none"
      />

      {/* Face detail belongs to the motif — a mask reads very differently
          from a headband, and this is where that difference lands. */}
      {faceFor(family, colour, reach)}
    </Svg>
  );
}

/**
 * The crest, in the motif's own geometry.
 *
 * `reach` scales length rather than count, so the same number of elements can
 * describe an early and a late form of one shape — which is what makes a third
 * form read as "longer" rather than "different".
 */
function crestFor(motif: Motif, count: number, reach: number, colour: string) {
  if (count === 0 && motif !== 'brim') return null;

  switch (motif) {
    /* Hair. Spikes fan across the top, longest in the middle, swept upward. */
    case 'spike': {
      const length = 16 + reach * 46;
      return Array.from({ length: count }, (_, index) => {
        const spread = count === 1 ? 0 : index / (count - 1) - 0.5;
        const baseX = CX + spread * HEAD_R * 1.7;
        // The middle spikes are the long ones; the outer ones fall away.
        const taper = 1 - Math.abs(spread) * 0.85;
        const tipY = CY - HEAD_R - length * taper;
        const tipX = baseX + spread * 26;
        return (
          <Polygon
            key={index}
            points={`${baseX - 6},${CY - HEAD_R + 5} ${tipX},${tipY} ${baseX + 6},${CY - HEAD_R + 5}`}
            fill={colour}
          />
        );
      });
    }

    /* Horns, curving outward from the temples. A mask growing into a form. */
    case 'horn': {
      const length = 10 + reach * 34;
      return Array.from({ length: count }, (_, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        const tier = Math.floor(index / 2);
        const rootX = CX + side * (HEAD_R - 4 - tier * 5);
        const rootY = CY - HEAD_R + 6 + tier * 5;
        const tipX = rootX + side * (8 + length * 0.5);
        const tipY = rootY - length;
        return (
          <Path
            key={index}
            d={`M ${rootX} ${rootY} Q ${rootX + side * 14} ${rootY - length * 0.7} ${tipX} ${tipY}`}
            stroke={colour}
            strokeWidth={5 - tier}
            strokeLinecap="round"
            fill="none"
          />
        );
      });
    }

    /* A crown: points rising from a band, the centre tallest. */
    case 'crown': {
      const height = 12 + reach * 30;
      const width = HEAD_R * 1.8;
      const points = Array.from({ length: count }, (_, index) => {
        const spread = count === 1 ? 0 : index / (count - 1) - 0.5;
        const x = CX + spread * width;
        const taper = 1 - Math.abs(spread) * 0.55;
        return `${x},${CY - HEAD_R - height * taper}`;
      });
      const baseY = CY - HEAD_R + 4;
      return (
        <>
          <Polygon
            points={`${CX - width / 2},${baseY} ${points.join(' ')} ${CX + width / 2},${baseY}`}
            fill={colour}
          />
          <Rect
            x={CX - width / 2 - 2}
            y={baseY - 1}
            width={width + 4}
            height={5}
            rx={2}
            fill={colour}
          />
        </>
      );
    }

    /* A brim: one wide ellipse, plus bands stacked on the crown. */
    case 'brim': {
      const brimW = HEAD_R * (1.5 + reach);
      return (
        <>
          <Ellipse
            cx={CX}
            cy={CY - HEAD_R + 6}
            rx={brimW}
            ry={7 + reach * 3}
            fill={colour}
            opacity={0.95}
          />
          <Rect
            x={CX - HEAD_R * 0.8}
            y={CY - HEAD_R - 12}
            width={HEAD_R * 1.6}
            height={18}
            rx={4}
            fill={colour}
          />
          {Array.from({ length: count }, (_, index) => (
            <Rect
              key={index}
              x={CX - HEAD_R * 0.8}
              y={CY - HEAD_R - 6 + index * 3.2}
              width={HEAD_R * 1.6}
              height={2}
              fill="rgba(0,0,0,0.45)"
            />
          ))}
        </>
      );
    }

    /* A headband, gaining a mark per rank. */
    case 'band': {
      const y = CY - HEAD_R + 9;
      return (
        <>
          <Rect
            x={CX - HEAD_R - 3}
            y={y}
            width={(HEAD_R + 3) * 2}
            height={9 + reach * 5}
            rx={3}
            fill={colour}
          />
          {/* The tails, longer as the rank climbs. */}
          <Path
            d={`M ${CX + HEAD_R} ${y + 6} L ${CX + HEAD_R + 6 + reach * 16} ${y + 16 + reach * 20}`}
            stroke={colour}
            strokeWidth={4}
            strokeLinecap="round"
          />
          {Array.from({ length: count }, (_, index) => (
            <Circle
              key={index}
              cx={CX - (count - 1) * 4 + index * 8}
              cy={y + 5 + reach * 2}
              r={1.8}
              fill="rgba(0,0,0,0.5)"
            />
          ))}
        </>
      );
    }
  }
}

/** Motif-specific detail on the face itself. */
function faceFor(motif: Motif, colour: string, reach: number) {
  // A hollow mask: stripes across the face, heavier at higher tiers.
  if (motif === 'horn') {
    return (
      <>
        <Path
          d={`M ${CX - 12} ${CY - 4} L ${CX + 12} ${CY - 4}`}
          stroke={colour}
          strokeWidth={2.5}
          strokeLinecap="round"
          opacity={0.9}
        />
        <Path
          d={`M ${CX - 9} ${CY + 5 + reach * 4} L ${CX + 9} ${CY + 5 + reach * 4}`}
          stroke={colour}
          strokeWidth={2}
          strokeLinecap="round"
          opacity={0.55}
        />
      </>
    );
  }

  // Everything else: two eyes in the tier's colour, so the mark has a gaze.
  return (
    <>
      <Circle cx={CX - 7} cy={CY - 1} r={2.6} fill={colour} />
      <Circle cx={CX + 7} cy={CY - 1} r={2.6} fill={colour} />
    </>
  );
}
