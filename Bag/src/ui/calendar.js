// A month grid used by the date picker and the bill calendar. Dots under a
// day show what's due then.
import React from 'react';
import { Pressable, View } from 'react-native';
import { Icon, T, useTheme } from './kit';
import { DAY_NAMES, MONTHS_LONG, addMonths, daysInMonth, today, ymd } from '../lib/dates';

export function Calendar({ month, onMonth, value, onPick, marks = {}, weekStart = 1 }) {
  const th = useTheme();
  const [y, m] = month.split('-').map(Number);
  const lead = (new Date(y, m - 1, 1).getDay() - weekStart + 7) % 7;
  const n = daysInMonth(y, m - 1);
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= n; d++) cells.push(ymd(new Date(y, m - 1, d)));
  while (cells.length % 7) cells.push(null);
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  const now = today();
  const names = [0, 1, 2, 3, 4, 5, 6].map((i) => DAY_NAMES[(i + weekStart) % 7]);
  const shift = (k) => onMonth(addMonths(`${month}-01`, k).slice(0, 7));
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <Pressable onPress={() => shift(-1)} accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={6} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chevron-left" size={22} color={th.muted} />
        </Pressable>
        <T size={16} weight="semi" center style={{ flex: 1 }}>{MONTHS_LONG[m - 1]} {y}</T>
        <Pressable onPress={() => shift(1)} accessibilityRole="button" accessibilityLabel="Next month" hitSlop={6} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chevron-right" size={22} color={th.muted} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {names.map((d) => <T key={d} size={12} color={th.faint2} center style={{ flex: 1 }}>{d.slice(0, 2)}</T>)}
      </View>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row' }}>
          {row.map((d, j) => {
            if (!d) return <View key={j} style={{ flex: 1, height: 46 }} />;
            const on = d === value;
            const isToday = d === now;
            const dots = marks[d] || [];
            return (
              <Pressable key={j} onPress={() => onPick && onPick(d)} accessibilityRole="button" accessibilityLabel={d} accessibilityState={{ selected: on }} style={{ flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? th.accentFill : 'transparent', borderWidth: isToday && !on ? 1.5 : 0, borderColor: th.accent }}>
                  <T size={14} weight={on || isToday ? 'semi' : 'regular'} color={on ? th.onAccent : th.ink}>{Number(d.slice(8))}</T>
                </View>
                <View style={{ flexDirection: 'row', gap: 2, height: 5, marginTop: 1 }}>
                  {dots.slice(0, 3).map((c, k) => <View key={k} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c }} />)}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
