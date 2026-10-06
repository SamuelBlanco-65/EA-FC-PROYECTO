// Design system v2 (docs/design/design-system-v2.md §3, §6). Values PROPOSED, not sampled: validate on the phone.
// Lives next to the v1 `colors`/`radii`/`layout` in tokens.ts until every screen is migrated; then v1 is deleted.
export const palette = {
  ink: '#0B0E13',
  panel: '#18202D',
  panelRaised: '#222B3B',
  line: '#2C3648',
  lineStrong: '#3D4962',
  paper: '#F2F4F7',
  textSecondary: '#9AA4B5',
  textTertiary: '#7A8498',
  signal: '#FF5B14',
  signalSoft: 'rgba(255,91,20,0.14)',
  signalBorder: 'rgba(255,91,20,0.55)',
  dangerSoft: 'rgba(229,56,76,0.14)',
  dangerBorder: 'rgba(229,56,76,0.5)',
  onSignal: '#0B0E13',
  signalPressed: '#E04E0C',
  cardYellow: '#FFC72C',
  cardRed: '#E5384C',
  dangerText: '#FF6B7A',
  positive: '#35C98A',
  overlay: 'rgba(0,0,0,0.72)',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { badge: 4, button: 6, input: 8, panel: 8, crest: 8, modal: 12 } as const;

export const metrics = {
  screenPadding: 16,
  tabBarHeight: 64,
  inputHeight: 56,
  buttonHeight: 56,
  buttonSecondaryHeight: 52,
  rowHeight: 56,
  clubBarWidth: 4,
} as const;
