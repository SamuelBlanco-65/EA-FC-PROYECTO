import { TextStyle } from 'react-native';
import {
  BarlowCondensed_700Bold,
  BarlowCondensed_800ExtraBold,
  BarlowCondensed_800ExtraBold_Italic,
} from '@expo-google-fonts/barlow-condensed';
import { Barlow_400Regular, Barlow_500Medium, Barlow_600SemiBold, Barlow_700Bold } from '@expo-google-fonts/barlow';

// Barlow Condensed / Barlow are the candidates named in design-system.md §2 (deduced visually, not confirmed).
export const fontAssets = {
  BarlowCondensed_700Bold,
  BarlowCondensed_800ExtraBold,
  BarlowCondensed_800ExtraBold_Italic,
  Barlow_400Regular,
  Barlow_500Medium,
  Barlow_600SemiBold,
  Barlow_700Bold,
};

export const fonts = {
  display: 'BarlowCondensed_800ExtraBold',
  displayItalic: 'BarlowCondensed_800ExtraBold_Italic',
  displayBold: 'BarlowCondensed_700Bold',
  regular: 'Barlow_400Regular',
  medium: 'Barlow_500Medium',
  semibold: 'Barlow_600SemiBold',
  bold: 'Barlow_700Bold',
} as const;

const tabular: Pick<TextStyle, 'fontVariant'> = { fontVariant: ['tabular-nums'] };

// Each style fixes fontFamily (weight lives in the family name: Android ignores fontWeight on custom fonts).
export const type = {
  titleScreen: { fontFamily: fonts.displayItalic, fontSize: 32, lineHeight: 34, textTransform: 'uppercase' },
  titleHero: { fontFamily: fonts.displayItalic, fontSize: 36, lineHeight: 38, textTransform: 'uppercase' },
  titleCard: { fontFamily: fonts.displayItalic, fontSize: 28, lineHeight: 30, textTransform: 'uppercase' },
  scoreDigit: { fontFamily: fonts.display, fontSize: 44, lineHeight: 46, ...tabular },
  scoreDigitSmall: { fontFamily: fonts.display, fontSize: 28, lineHeight: 30, ...tabular },
  statValue: { fontFamily: fonts.displayItalic, fontSize: 32, lineHeight: 34 },
  eyebrow: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16, letterSpacing: 2, textTransform: 'uppercase' },
  label: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  badge: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 16 },
  button: { fontFamily: fonts.displayItalic, fontSize: 20, lineHeight: 24, letterSpacing: 0.5, textTransform: 'uppercase' },
  tabLabel: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16 },
  tableCell: { fontFamily: fonts.displayBold, fontSize: 17, lineHeight: 20, ...tabular },
} satisfies Record<string, TextStyle>;
