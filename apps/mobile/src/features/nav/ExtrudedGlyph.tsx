/**
 * A tab glyph with depth.
 *
 * There is no 3D engine here and there should not be one — a spinning icon does
 * not justify a renderer, a scene graph and a megabyte of native code. Depth
 * comes from extrusion instead: the same glyph drawn `DEPTH_STEPS` times along
 * a diagonal, darkening as it recedes, with the lit face on top.
 *
 * That is the technique animation used before 3D existed, and under the
 * perspective rotation the flourish applies it reads as a solid object, because
 * the extrusion's edge is exactly what your eye uses to judge thickness.
 */
import { View } from 'react-native';
import { Text } from '../../components/Text';
import { useTheme } from '../../theme';

export interface ExtrudedGlyphProps {
  glyph: string;
  size: number;
}

/** More steps read as smoother; beyond about ten the cost stops buying depth. */
const DEPTH_STEPS = 9;
const STEP = 1.6;

export function ExtrudedGlyph({ glyph, size }: ExtrudedGlyphProps) {
  const theme = useTheme();

  // Back to front, so the face lands last and on top.
  const layers = Array.from({ length: DEPTH_STEPS }, (_, index) => DEPTH_STEPS - 1 - index);

  return (
    <View
      style={{
        width: size * 1.6,
        height: size * 1.6,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {layers.map((depth) => {
        const isFace = depth === 0;
        // The sides darken toward the back. The face keeps the accent, so the
        // object looks lit from the front-left rather than flatly coloured.
        const shade = 1 - depth / DEPTH_STEPS;
        return (
          <Text
            key={depth}
            style={{
              position: 'absolute',
              fontSize: size,
              lineHeight: size * 1.16,
              transform: [{ translateX: depth * STEP }, { translateY: depth * STEP }],
              color: isFace ? theme.colors.accent : theme.colors.accentSoft,
              opacity: isFace ? 1 : 0.35 + shade * 0.5,
              // The face carries the glow; the extrusion must not, or the whole
              // stack blurs into a smear.
              textShadowColor: isFace ? theme.colors.accent : 'transparent',
              textShadowRadius: isFace ? size * 0.35 : 0,
              textShadowOffset: { width: 0, height: 0 },
            }}
          >
            {glyph}
          </Text>
        );
      })}
    </View>
  );
}
