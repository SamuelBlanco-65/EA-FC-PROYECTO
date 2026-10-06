import { useEffect, useRef } from 'react';
import { StyleSheet, Text, TextStyle, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { palette, radius, typeV2 } from '@/theme';

import { ClubCrest } from './ClubCrest';

export interface ScorebugTeam {
  /** 3-letter code (`shortName`). */
  code: string;
  name: string;
  crestUrl?: string | null;
  /** Club colour for the side block (see `clubColor`). */
  color: string;
  /** null = the match has no score yet. */
  score: number | null;
}

interface ScorebugProps {
  home: ScorebugTeam;
  away: ScorebugTeam;
  /** Which side is the signed-in player: gets a small "TÚ" under the code. */
  mine?: 'home' | 'away' | null;
  variant?: 'hero' | 'compact';
}

const SIZES = {
  hero: { height: 96, block: 12, crest: 40, digit: typeV2.scoreHero, cell: 34, code: typeV2.titleClub },
  compact: { height: 56, block: 8, crest: 28, digit: typeV2.scoreBug, cell: 24, code: typeV2.rowCode },
} as const;

/**
 * Each digit in its own fixed-width cell so the bug does not jump when the score changes (cell widths NOT TESTED on device).
 * A digit that changes after the first render rolls in from above (250 ms); the first render does not animate.
 */
function Digits({ value, style, cell }: { value: number; style: TextStyle; cell: number }) {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  return (
    <View style={styles.digits}>
      {String(value)
        .split('')
        .map((d, i) => (
          <View key={i} style={{ width: cell, alignItems: 'center' }}>
            <Animated.Text key={d} entering={mounted.current ? FadeInDown.duration(250) : undefined} style={[style, { color: palette.paper }]}>
              {d}
            </Animated.Text>
          </View>
        ))}
    </View>
  );
}

function Side({ team, mine, size, align }: { team: ScorebugTeam; mine: boolean; size: (typeof SIZES)[keyof typeof SIZES]; align: 'left' | 'right' }) {
  const code = (
    <View style={styles.codeBox}>
      <Text style={[size.code, { color: palette.paper }]} numberOfLines={1}>
        {team.code}
      </Text>
      {mine ? <Text style={styles.mine}>TÚ</Text> : null}
    </View>
  );
  const crest = <ClubCrest crestUrl={team.crestUrl} name={team.name} size={size.crest} />;
  return (
    <View style={[styles.side, { justifyContent: align === 'left' ? 'flex-end' : 'flex-start' }]}>
      {align === 'left' ? (
        <>
          {code}
          {crest}
        </>
      ) : (
        <>
          {crest}
          {code}
        </>
      )}
    </View>
  );
}

/** Broadcast "scorebug": [colour block | code | crest | score | crest | code | colour block] (design-system-v2.md §7). */
export function Scorebug({ home, away, mine = null, variant = 'compact' }: ScorebugProps) {
  const size = SIZES[variant];
  const played = home.score !== null && away.score !== null;
  const label = played
    ? `${home.name} ${home.score}, ${away.name} ${away.score}`
    : `${home.name} contra ${away.name}`;

  return (
    <View style={[styles.bar, { height: size.height }]} accessible accessibilityLabel={label}>
      <View style={[styles.block, styles.blockLeft, { width: size.block, backgroundColor: home.color }]} />
      <Side team={home} mine={mine === 'home'} size={size} align="left" />
      <View style={styles.center}>
        {played ? (
          <>
            <Digits value={home.score as number} style={size.digit} cell={size.cell} />
            <Text style={[size.digit, styles.separator]}>:</Text>
            <Digits value={away.score as number} style={size.digit} cell={size.cell} />
          </>
        ) : (
          <Text style={[typeV2.label, { color: palette.textSecondary }]}>VS</Text>
        )}
      </View>
      <Side team={away} mine={mine === 'away'} size={size} align="right" />
      <View style={[styles.block, styles.blockRight, { width: size.block, backgroundColor: away.color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.panelRaised,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: palette.lineStrong,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  block: { alignSelf: 'stretch' },
  blockLeft: { borderTopLeftRadius: radius.panel, borderBottomLeftRadius: radius.panel },
  blockRight: { borderTopRightRadius: radius.panel, borderBottomRightRadius: radius.panel },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6 },
  codeBox: { alignItems: 'center', flexShrink: 1 },
  mine: { ...typeV2.tabLabel, color: palette.textSecondary },
  center: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 48, justifyContent: 'center' },
  digits: { flexDirection: 'row' },
  separator: { color: palette.textSecondary },
});
