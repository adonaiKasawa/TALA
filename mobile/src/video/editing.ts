export type ClipEdit = {
  start: number;
  end: number;
  speed: 0.5 | 1 | 1.5 | 2;
  muted: boolean;
};
export function clipDuration(edit: ClipEdit) {
  return (edit.end - edit.start) / edit.speed;
}
export function coverTime(edit: ClipEdit, sourcePosition: number) {
  return Math.max(
    0,
    Math.min(
      clipDuration(edit) - 0.05,
      (sourcePosition - edit.start) / edit.speed,
    ),
  );
}
export function clampTrim(duration: number, start: number, end: number) {
  const safeEnd = Math.min(duration, Math.max(0.25, end));
  return { start: Math.max(0, Math.min(start, safeEnd - 0.25)), end: safeEnd };
}
export function timeLabel(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return Math.floor(whole / 60) + ':' + String(whole % 60).padStart(2, '0');
}
