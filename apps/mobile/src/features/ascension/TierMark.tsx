/**
 * The icon for one tier: a character, in costume, at that form.
 *
 * The first version of this drew a head and a crest and it read as a face
 * shape, which is not what a tier icon is for. This draws a FIGURE — head,
 * shoulders, torso, arms, legs — wearing the tier's colours and carrying that
 * Ascension's signature: a cape, a straw hat, a hollow mask, a headband,
 * lightning down the limbs. At 28px you read the silhouette; at 64px you read
 * the costume.
 *
 * These are original stylised figures rather than the licensed artwork, which
 * is the one honest thing to say about them. It is also the practical shape:
 * seven Ascensions × six tiers is forty-two icons, they weigh nothing, they
 * stay sharp at every size, and each one recolours from its own tier.
 *
 * The escalation is carried by the costume, not by the pose. Crest count,
 * reach and aura climb with the rank, so the sixth form is visibly the sixth
 * form of the same character.
 */
import Svg, { Circle, Ellipse, G, Path, Polygon, Rect } from 'react-native-svg';
import type { AscensionTier, Motif } from '@fi/domain';
import { useTheme } from '../../theme';

export interface TierMarkProps {
  tier: AscensionTier;
  /** Overrides the current Ascension's motif — the picker shows all seven. */
  motif?: Motif;
  size?: number;
}

/* The figure is laid out in a 100×100 box. */
const CX = 50;
const HEAD_Y = 27;
const HEAD_R = 11;
const SHOULDER_Y = 41;
const HIP_Y = 68;
const FOOT_Y = 95;
const SHOULDER_W = 15;
const HIP_W = 9;

export function TierMark({ tier, motif, size = 44 }: TierMarkProps) {
  const theme = useTheme();
  const family = motif ?? theme.ascension.motif;
  const { colour, crest, reach, aura } = tier.form;
  const body = theme.colors.borderStrong;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* Aura behind everything, so a late form radiates. */}
      {Array.from({ length: aura }, (_, index) => (
        <Circle
          key={`aura-${index}`}
          cx={CX}
          cy={54}
          r={30 + index * 8}
          stroke={colour}
          strokeWidth={1}
          opacity={0.26 - index * 0.06}
          fill="none"
        />
      ))}

      {/* Anything worn BEHIND the figure — a cape, a coat, shadow. */}
      {behind(family, colour, reach)}

      {/* Legs and arms first: the torso overlaps them at the joints. */}
      <Path
        d={`M ${CX - 4} ${HIP_Y} L ${CX - 6} ${FOOT_Y} M ${CX + 4} ${HIP_Y} L ${CX + 6} ${FOOT_Y}`}
        stroke={body}
        strokeWidth={7}
        strokeLinecap="round"
      />
      <Path
        d={`M ${CX - SHOULDER_W + 2} ${SHOULDER_Y + 2} L ${CX - SHOULDER_W - 3} ${HIP_Y - 2}
            M ${CX + SHOULDER_W - 2} ${SHOULDER_Y + 2} L ${CX + SHOULDER_W + 3} ${HIP_Y - 2}`}
        stroke={body}
        strokeWidth={6}
        strokeLinecap="round"
      />

      {/* The torso, in the tier's colour — this is the costume. */}
      <Path
        d={`M ${CX - SHOULDER_W} ${SHOULDER_Y}
            L ${CX + SHOULDER_W} ${SHOULDER_Y}
            L ${CX + HIP_W} ${HIP_Y}
            L ${CX - HIP_W} ${HIP_Y} Z`}
        fill={colour}
      />

      {/* Costume detail on the torso: belt, emblem, sash. */}
      {torso(family, colour, body, reach)}

      {/* The head, then whatever sits on or around it. */}
      <Circle cx={CX} cy={HEAD_Y} r={HEAD_R} fill={body} />
      <G>{above(family, crest, reach, colour, body)}</G>
      {face(family, colour)}
    </Svg>
  );
}

/** Worn behind the body — drawn before the figure so it reads as behind. */
function behind(motif: Motif, colour: string, reach: number) {
  switch (motif) {
    /* A cape, widening with the rank. The Hero's whole silhouette. */
    case 'cape':
      return (
        <Path
          d={`M ${CX - SHOULDER_W - 1} ${SHOULDER_Y}
              Q ${CX - 30 - reach * 14} ${HIP_Y + 12} ${CX - 16 - reach * 8} ${FOOT_Y - 2}
              L ${CX + 16 + reach * 8} ${FOOT_Y - 2}
              Q ${CX + 30 + reach * 14} ${HIP_Y + 12} ${CX + SHOULDER_W + 1} ${SHOULDER_Y} Z`}
          fill={colour}
          opacity={0.32}
        />
      );

    /* A long coat, split at the front. */
    case 'horn':
      return (
        <Path
          d={`M ${CX - SHOULDER_W - 2} ${SHOULDER_Y}
              L ${CX - 18 - reach * 5} ${FOOT_Y - 4}
              L ${CX - 3} ${FOOT_Y - 4} L ${CX - 3} ${SHOULDER_Y}
              M ${CX + SHOULDER_W + 2} ${SHOULDER_Y}
              L ${CX + 18 + reach * 5} ${FOOT_Y - 4}
              L ${CX + 3} ${FOOT_Y - 4} L ${CX + 3} ${SHOULDER_Y}`}
          fill={colour}
          opacity={0.4}
        />
      );

    /* Shadow: the Monarch's army, implied. */
    case 'crown':
      return (
        <Ellipse
          cx={CX}
          cy={FOOT_Y - 4}
          rx={20 + reach * 12}
          ry={5 + reach * 3}
          fill={colour}
          opacity={0.22}
        />
      );

    /* Lightning arcing off the body — Full Cowl. */
    case 'bolt': {
      const arcs = Math.max(2, Math.round(reach * 6));
      return Array.from({ length: arcs }, (_, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        const y = SHOULDER_Y + (index / arcs) * (FOOT_Y - SHOULDER_Y);
        const span = 10 + reach * 14;
        return (
          <Path
            key={index}
            d={`M ${CX + side * 13} ${y}
                l ${side * span * 0.4} ${-5}
                l ${side * span * 0.25} ${7}
                l ${side * span * 0.35} ${-4}`}
            stroke={colour}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
            opacity={0.85}
          />
        );
      });
    }

    default:
      return null;
  }
}

/** Costume detail across the chest and waist. */
function torso(motif: Motif, colour: string, body: string, reach: number) {
  const beltY = HIP_Y - 7;

  switch (motif) {
    /* Belt and gloves — the Hero's suit. */
    case 'cape':
      return (
        <>
          <Rect x={CX - 12} y={beltY} width={24} height={5} fill={body} />
          <Circle cx={CX} cy={beltY + 2.5} r={2.4} fill={colour} />
        </>
      );

    /* A gi: crossed lapels, and a sash. */
    case 'spike':
      return (
        <>
          <Path
            d={`M ${CX - 9} ${SHOULDER_Y + 1} L ${CX} ${SHOULDER_Y + 13} L ${CX + 9} ${SHOULDER_Y + 1}`}
            stroke={body}
            strokeWidth={3}
            fill="none"
          />
          <Rect x={CX - 11} y={beltY} width={22} height={4.5} fill={body} opacity={0.85} />
        </>
      );

    /* An open vest over a bare chest. */
    case 'brim':
      return (
        <Path
          d={`M ${CX - 5} ${SHOULDER_Y} L ${CX - 5} ${HIP_Y} M ${CX + 5} ${SHOULDER_Y} L ${CX + 5} ${HIP_Y}`}
          stroke={body}
          strokeWidth={3}
        />
      );

    /* A flak vest with a high collar. */
    case 'band':
      return (
        <>
          <Rect x={CX - 8} y={SHOULDER_Y} width={16} height={9} rx={2} fill={body} opacity={0.7} />
          <Rect x={CX - 11} y={beltY} width={22} height={4} fill={body} />
        </>
      );

    /* A hero costume: a mask-green suit with a chest line. */
    case 'bolt':
      return (
        <>
          <Path
            d={`M ${CX} ${SHOULDER_Y + 2} L ${CX} ${HIP_Y - 2}`}
            stroke={body}
            strokeWidth={2}
            opacity={0.6}
          />
          <Rect x={CX - 12} y={beltY} width={24} height={4.5} fill={body} />
        </>
      );

    /* Armour plates, gaining a line as the rank climbs. */
    case 'crown':
      return (
        <>
          {Array.from({ length: Math.max(1, Math.round(reach * 4)) }, (_, index) => (
            <Path
              key={index}
              d={`M ${CX - 12 + index} ${SHOULDER_Y + 6 + index * 6} L ${CX + 12 - index} ${SHOULDER_Y + 6 + index * 6}`}
              stroke={body}
              strokeWidth={1.6}
              opacity={0.55}
            />
          ))}
          <Rect x={CX - 10} y={beltY} width={20} height={4} fill={body} />
        </>
      );

    default:
      return <Rect x={CX - 11} y={beltY} width={22} height={4} fill={body} opacity={0.8} />;
  }
}

/** Hair, headwear and horns — the part that identifies the form. */
function above(motif: Motif, count: number, reach: number, colour: string, body: string) {
  switch (motif) {
    /* Hair. Spikes fan upward, longest in the middle. */
    case 'spike': {
      const length = 9 + reach * 30;
      if (count === 0) return null;
      return Array.from({ length: count }, (_, index) => {
        const spread = count === 1 ? 0 : index / (count - 1) - 0.5;
        const baseX = CX + spread * HEAD_R * 1.8;
        const taper = 1 - Math.abs(spread) * 0.8;
        return (
          <Polygon
            key={index}
            points={`${baseX - 4},${HEAD_Y - HEAD_R + 3} ${baseX + spread * 18},${HEAD_Y - HEAD_R - length * taper} ${baseX + 4},${HEAD_Y - HEAD_R + 3}`}
            fill={colour}
          />
        );
      });
    }

    /* A hollow mask, growing horns. */
    case 'horn': {
      const length = 6 + reach * 20;
      return (
        <>
          <Circle cx={CX} cy={HEAD_Y} r={HEAD_R + 1} fill={colour} opacity={0.92} />
          {Array.from({ length: count }, (_, index) => {
            const side = index % 2 === 0 ? -1 : 1;
            const rank = Math.floor(index / 2);
            const rootX = CX + side * (HEAD_R - 3 - rank * 3);
            const rootY = HEAD_Y - HEAD_R + 3 + rank * 3;
            return (
              <Path
                key={index}
                d={`M ${rootX} ${rootY} Q ${rootX + side * 9} ${rootY - length * 0.7} ${rootX + side * (5 + length * 0.4)} ${rootY - length}`}
                stroke={colour}
                strokeWidth={4 - rank * 0.8}
                strokeLinecap="round"
                fill="none"
              />
            );
          })}
        </>
      );
    }

    /* A crown, centre point tallest. */
    case 'crown': {
      const height = 7 + reach * 18;
      const width = HEAD_R * 1.9;
      const points = Array.from({ length: Math.max(2, count) }, (_, index) => {
        const spread = index / (Math.max(2, count) - 1) - 0.5;
        const taper = 1 - Math.abs(spread) * 0.5;
        return `${CX + spread * width},${HEAD_Y - HEAD_R - height * taper}`;
      });
      const baseY = HEAD_Y - HEAD_R + 2;
      return (
        <Polygon
          points={`${CX - width / 2},${baseY} ${points.join(' ')} ${CX + width / 2},${baseY}`}
          fill={colour}
        />
      );
    }

    /* A straw hat with a band. */
    case 'brim':
      return (
        <>
          <Rect
            x={CX - HEAD_R + 1}
            y={HEAD_Y - HEAD_R - 7}
            width={(HEAD_R - 1) * 2}
            height={10}
            rx={3}
            fill={colour}
          />
          <Ellipse
            cx={CX}
            cy={HEAD_Y - HEAD_R + 3}
            rx={HEAD_R * (1.5 + reach * 0.6)}
            ry={4 + reach * 2}
            fill={colour}
          />
          <Rect
            x={CX - HEAD_R + 1}
            y={HEAD_Y - HEAD_R - 1}
            width={(HEAD_R - 1) * 2}
            height={2.5}
            fill={body}
            opacity={0.7}
          />
        </>
      );

    /* A headband with tails down the back. */
    case 'band':
      return (
        <>
          <Rect
            x={CX - HEAD_R - 2}
            y={HEAD_Y - HEAD_R + 1}
            width={(HEAD_R + 2) * 2}
            height={6}
            rx={2}
            fill={colour}
          />
          {Array.from({ length: count }, (_, index) => (
            <Circle
              key={index}
              cx={CX - (count - 1) * 2.6 + index * 5.2}
              cy={HEAD_Y - HEAD_R + 4}
              r={1.2}
              fill={body}
              opacity={0.7}
            />
          ))}
          <Path
            d={`M ${CX + HEAD_R} ${HEAD_Y - HEAD_R + 5} L ${CX + HEAD_R + 5 + reach * 10} ${HEAD_Y + 8 + reach * 14}`}
            stroke={colour}
            strokeWidth={3}
            strokeLinecap="round"
          />
        </>
      );

    /* The Hero: bald, so the head reads by its shine and jaw alone. */
    case 'cape':
      return (
        <Path
          d={`M ${CX - 5} ${HEAD_Y - HEAD_R + 3} Q ${CX - 1} ${HEAD_Y - HEAD_R} ${CX + 3} ${HEAD_Y - HEAD_R + 2}`}
          stroke={colour}
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
          opacity={0.8}
        />
      );

    /* A mask with two long ears, and hair tufts. */
    case 'bolt':
      return (
        <>
          {Array.from({ length: Math.max(2, count) }, (_, index) => {
            const side = index % 2 === 0 ? -1 : 1;
            return (
              <Path
                key={index}
                d={`M ${CX + side * 6} ${HEAD_Y - HEAD_R + 1} L ${CX + side * (9 + reach * 5)} ${HEAD_Y - HEAD_R - 9 - reach * 9}`}
                stroke={colour}
                strokeWidth={3.5}
                strokeLinecap="round"
              />
            );
          })}
          <Path
            d={`M ${CX - HEAD_R} ${HEAD_Y - 2} Q ${CX} ${HEAD_Y - HEAD_R - 3} ${CX + HEAD_R} ${HEAD_Y - 2}`}
            fill={colour}
          />
        </>
      );
  }
}

/** Eyes, or a mask's markings. */
function face(motif: Motif, colour: string) {
  if (motif === 'horn') {
    return (
      <Path
        d={`M ${CX - 7} ${HEAD_Y - 1} L ${CX + 7} ${HEAD_Y - 1}`}
        stroke="rgba(0,0,0,0.65)"
        strokeWidth={2.4}
        strokeLinecap="round"
      />
    );
  }
  return (
    <>
      <Circle cx={CX - 4} cy={HEAD_Y} r={1.9} fill={colour} />
      <Circle cx={CX + 4} cy={HEAD_Y} r={1.9} fill={colour} />
    </>
  );
}
