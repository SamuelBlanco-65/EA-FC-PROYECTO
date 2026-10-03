// Values estimated from design/reference (see docs/design/design-system.md §1). Correct hex here only.
export const colors = {
  bg: '#0A0E1A',
  surface: '#141A2E',
  surfaceRaised: '#1B2340',
  surfaceSunken: '#070A14',
  border: '#2A3150',
  borderDashed: '#5A6285',
  textPrimary: '#F2F4FF',
  textSecondary: '#8B93B0',
  textOnAccent: '#04120C',
  accent: '#00E58D',
  accentGradientTop: '#2BFFA0',
  accentGradientBottom: '#00D984',
  accentSoft: 'rgba(0,229,141,0.14)',
  accentDisabled: 'rgba(15,122,74,0.8)',
  info: '#3B6CF0',
  infoSoft: 'rgba(59,108,240,0.22)',
  infoText: '#8FA8FF',
  warning: '#F5C230',
  warningSoft: 'rgba(245,194,48,0.16)',
  danger: '#FF4D5E',
  dangerSoft: 'rgba(255,77,94,0.14)',
  onWhite: '#FFFFFF',
  glowGreen: 'rgba(0,229,141,0.12)',
  glowBlue: 'rgba(59,108,240,0.14)',
  glowRed: 'rgba(255,77,94,0.10)',
  stripe: 'rgba(255,255,255,0.03)',
  overlay: 'rgba(0,0,0,0.7)',
} as const;

export const leagueColors: Record<string, string> = {
  LaLiga: '#1F8F5A',
  'Premier League': '#3B6CF0',
  Bundesliga: '#D4A52A',
  'Serie A': '#C93A4A',
  'Ligue 1': '#7C5CD6',
};
export const leagueColorFallback = '#5A6285';

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 40 } as const;

export const radii = { card: 20, modal: 24, input: 14, button: 18, chip: 14, badge: 10, digit: 12, crest: 14 } as const;

export const layout = { screenPadding: 16, cardGap: 12, tabBarHeight: 72, inputHeight: 56, buttonHeight: 60 } as const;

// Android honours shadowColor only with elevation and API >= 28 (Android 14 does); visual result NOT TESTED.
export const shadows = {
  glowAccent: { shadowColor: '#00E58D', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  glowDanger: { shadowColor: '#FF4D5E', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  card: { shadowColor: '#000000', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
} as const;
