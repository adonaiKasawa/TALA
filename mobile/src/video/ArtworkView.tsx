import React from 'react';
import { StyleSheet, Text, View, type ViewProps } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect, Path } from 'react-native-svg';
import type { Artwork, TextLayer } from './artwork';
export const textLayerStyle = (
  layer: TextLayer,
  width: number,
  height: number,
) => ({
  position: 'absolute' as const,
  left: layer.x * width,
  top: layer.y * height,
  maxWidth: width * 0.9,
  paddingHorizontal: 8,
  paddingVertical: 5,
  borderRadius: 5,
  fontSize: layer.size * width,
  fontWeight: '700' as const,
  lineHeight: layer.size * width * 1.25,
  color: layer.color,
  backgroundColor:
    layer.background === 'dark'
      ? '#111111'
      : layer.background === 'light'
      ? '#ffffff'
      : 'transparent',
  textShadowColor: layer.background === 'none' ? '#0008' : 'transparent',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: layer.background === 'none' ? 2 : 0,
});
export function ArtworkView({
  art,
  width,
  height,
  ...props
}: ViewProps & {
  ref?: React.Ref<React.ComponentRef<typeof View>>;
  art: Artwork;
  width: number;
  height: number;
}) {
  return (
    <View
      {...props}
      style={[{ width, height }, canvasStyle.canvas, props.style]}
    >
      <Svg
        pointerEvents="none"
        width={width}
        height={height}
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <RadialGradient id="vignette">
            <Stop offset="30%" stopColor="#000" stopOpacity={0} />
            <Stop offset="100%" stopColor="#000" stopOpacity={0.65} />
          </RadialGradient>
        </Defs>
        {art.effect === 'warm' && (
          <Rect width={width} height={height} fill="#ffad55" opacity={0.2} />
        )}
        {art.effect === 'cool' && (
          <Rect width={width} height={height} fill="#6d9dff" opacity={0.18} />
        )}
        {art.effect === 'vignette' && (
          <Rect width={width} height={height} fill="url(#vignette)" />
        )}
        {art.strokes.map(stroke => (
          <Path
            key={stroke.id}
            d={stroke.points
              .map(
                (p, i) =>
                  (i ? 'L' : 'M') +
                  (p.x * width).toFixed(2) +
                  ',' +
                  (p.y * height).toFixed(2),
              )
              .join(' ')}
            stroke={stroke.color}
            strokeWidth={stroke.width * width}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}
      </Svg>
      {art.texts.map(layer => (
        <Text key={layer.id} style={textLayerStyle(layer, width, height)}>
          {layer.text}
        </Text>
      ))}
    </View>
  );
}
const canvasStyle = StyleSheet.create({
  canvas: { backgroundColor: 'transparent', overflow: 'hidden' },
});
