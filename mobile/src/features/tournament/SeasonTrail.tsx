import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fontsV2, palette, typeV2 } from '@/theme';

import type { RoundResult, RoundStep } from './derive';

const SLOT = 30;
const NODE = 26;
const CURRENT = 38;
const MIN_LINK = 4;
const TURN = 10;

const LETTER: Record<RoundResult, string> = { W: 'V', D: 'E', L: 'D' };
const WORD: Record<RoundResult, string> = { W: 'victoria', D: 'empate', L: 'derrota' };
const COLOR: Record<RoundResult, string> = { W: palette.positive, D: palette.cardYellow, L: palette.cardRed };

type Item = { kind: 'step'; step: RoundStep } | { kind: 'trophy'; reached: boolean };

const isDone = (item: Item) => item.kind === 'step' && item.step.state === 'done';

/** Board-game path: one node per round in a snake (rows alternate direction), the cup at the end, my result in each finished round. */
export function SeasonTrail({ steps }: { steps: RoundStep[] }) {
  const [width, setWidth] = useState(0);
  const items: Item[] = [
    ...steps.map((step) => ({ kind: 'step' as const, step })),
    { kind: 'trophy', reached: steps.length > 0 && steps.every((s) => s.state === 'done') },
  ];

  const cols = Math.max(2, Math.floor((width + MIN_LINK) / (SLOT + MIN_LINK)));
  const linkWidth = Math.max(MIN_LINK, Math.floor((width - cols * SLOT) / (cols - 1)));
  const rows: Item[][] = [];
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));

  return (
    <View>
      <View style={styles.board} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width === 0
          ? null
          : rows.map((row, r) => {
              const reversed = r % 2 === 1;
              const shown = reversed ? [...row].reverse() : row;
              return (
                <View key={r}>
                  <View style={[styles.row, { justifyContent: reversed ? 'flex-end' : 'flex-start' }]}>
                    {shown.map((item, j) => {
                      const path = r * cols + (reversed ? row.length - 1 - j : j);
                      // The link to the left of this node joins it with its left neighbour; the path-earlier of the two lights it.
                      const earlier = reversed ? item : shown[j - 1];
                      const hasLink = j > 0;
                      return (
                        <View key={path} style={styles.cell}>
                          {hasLink ? <View style={[styles.link, { width: linkWidth }, earlier && isDone(earlier) && styles.linkDone]} /> : null}
                          <NodeView item={item} />
                        </View>
                      );
                    })}
                  </View>
                  {r < rows.length - 1 ? (
                    <View
                      style={[
                        styles.turn,
                        { alignSelf: reversed ? 'flex-start' : 'flex-end' },
                        isDone(row[row.length - 1]) && styles.linkDone,
                      ]}
                    />
                  ) : null}
                </View>
              );
            })}
      </View>
      <View style={styles.legend}>
        {(['W', 'D', 'L'] as const).map((res) => (
          <View key={res} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: COLOR[res] }]} />
            <Text style={styles.legendText}>{WORD[res][0].toUpperCase() + WORD[res].slice(1)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function NodeView({ item }: { item: Item }) {
  if (item.kind === 'trophy') {
    return (
      <View style={styles.slot} accessible accessibilityLabel={item.reached ? 'Torneo completado' : 'Meta: el campeón del torneo'}>
        <View style={[styles.trophy, item.reached && styles.trophyReached]}>
          <MaterialCommunityIcons name="trophy" size={22} color={item.reached ? palette.onSignal : palette.cardYellow} />
        </View>
      </View>
    );
  }

  const { step } = item;
  const label = `Fecha ${step.round}: ${
    step.state === 'current' ? 'en curso' : step.state === 'upcoming' ? 'por jugar' : step.result ? WORD[step.result] : 'descanso'
  }`;

  if (step.state === 'current') {
    return (
      <View style={styles.slot} accessible accessibilityLabel={label}>
        <View style={[styles.node, styles.nodeCurrent]}>
          <Text style={styles.currentNumber}>{step.round}</Text>
        </View>
      </View>
    );
  }
  if (step.state === 'done') {
    const color = step.result ? COLOR[step.result] : palette.lineStrong;
    return (
      <View style={styles.slot} accessible accessibilityLabel={label}>
        <View style={[styles.node, { backgroundColor: color, borderColor: color }]}>
          <Text style={[styles.letter, !step.result && { color: palette.textSecondary }]}>{step.result ? LETTER[step.result] : '–'}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.slot} accessible accessibilityLabel={label}>
      <View style={[styles.node, styles.nodeUpcoming]}>
        <Text style={styles.upcomingNumber}>{step.round}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  board: { minHeight: 80 },
  row: { flexDirection: 'row', alignItems: 'center', height: CURRENT },
  cell: { flexDirection: 'row', alignItems: 'center' },
  slot: { width: SLOT, height: CURRENT, alignItems: 'center', justifyContent: 'center' },
  link: { height: 3, backgroundColor: palette.line },
  linkDone: { backgroundColor: palette.signalBorder },
  turn: { width: 3, height: TURN, marginHorizontal: SLOT / 2 - 1.5, backgroundColor: palette.line },
  node: { width: NODE, height: NODE, borderRadius: NODE / 2, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  nodeCurrent: {
    width: CURRENT,
    height: CURRENT,
    borderRadius: CURRENT / 2,
    borderWidth: 3,
    borderColor: palette.signal,
    backgroundColor: palette.signalSoft,
    shadowColor: palette.signal,
    shadowOpacity: 0.8,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  nodeUpcoming: { borderColor: palette.lineStrong, backgroundColor: palette.panel },
  currentNumber: { fontFamily: fontsV2.displayBlack, fontSize: 20, lineHeight: 24, color: palette.signal },
  upcomingNumber: { ...typeV2.tabLabel, color: palette.textTertiary },
  letter: { fontFamily: fontsV2.display, fontSize: 14, lineHeight: 18, color: palette.onSignal },
  trophy: {
    width: CURRENT,
    height: CURRENT,
    borderRadius: CURRENT / 2,
    borderWidth: 2,
    borderColor: palette.cardYellow,
    backgroundColor: palette.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trophyReached: {
    backgroundColor: palette.cardYellow,
    shadowColor: palette.cardYellow,
    shadowOpacity: 0.8,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  legend: { flexDirection: 'row', gap: 16, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { ...typeV2.caption, color: palette.textSecondary },
});
