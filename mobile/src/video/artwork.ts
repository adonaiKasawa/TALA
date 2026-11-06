export type Point = { x: number; y: number };
export type Stroke = {
  id: string;
  color: string;
  width: number;
  points: Point[];
};
export type TextLayer = {
  id: string;
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
  background: 'none' | 'dark' | 'light';
};
export type Artwork = {
  effect: 'none' | 'warm' | 'cool' | 'vignette';
  texts: TextLayer[];
  strokes: Stroke[];
};
export const emptyArtwork = (): Artwork => ({
  effect: 'none',
  texts: [],
  strokes: [],
});
export function hasArtwork(art: Artwork) {
  return (
    art.effect !== 'none' || art.texts.length > 0 || art.strokes.length > 0
  );
}
export function fitFrame(
  width: number,
  height: number,
  sourceWidth: number,
  sourceHeight: number,
) {
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  return {
    width: sourceWidth * scale,
    height: sourceHeight * scale,
    left: (width - sourceWidth * scale) / 2,
    top: (height - sourceHeight * scale) / 2,
  };
}
export const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));
