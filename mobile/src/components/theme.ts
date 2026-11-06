/** Semantic TALA tokens. Legacy names are aliases to preserve consumers. */
export const palette = {
  background: '#0e1012',
  surface: '#191b1e',
  raised: '#242629',
  text: '#ffffff',
  secondary: '#a4a4a8',
  accent: '#ffc64b',
  onAccent: '#0e1012',
  border: '#303236',
  controlBorder: '#657080',
  success: '#ffc64b',
  successSurface: '#2b2114',
  danger: '#ff9db2',
  dangerSurface: '#351b26',
} as const;
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  page: 32,
} as const;
export const radius = { control: 10, panel: 20, pill: 999 } as const;
export const colors = {
  ...palette,
  ink: palette.text,
  muted: palette.secondary,
  blue: palette.accent,
  bg: palette.background,
  line: palette.border,
  red: palette.danger,
  green: palette.success,
} as const;
