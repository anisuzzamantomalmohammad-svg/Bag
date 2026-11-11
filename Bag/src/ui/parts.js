// Larger shared pieces: the tab bar, a record row (with swipe actions), and
// the two-line chart.
import React, { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useApp } from '../state/store';
import { F, IconBox, T, useTheme } from './kit';
import { fmtShort } from '../lib/dates';
import { isOpen, kindOf, statusOf } from '../lib/ledger';

export const TABS = [
  { id: 'Home', label: 'Home', icon: 'home' },
  { id: 'Records', label: 'Records', icon: 'list' },
  { id: 'Owed', label: 'Owed', icon: 'swap' },
  { id: 'Plan', label: 'Plan', icon: 'target' },
  { id: 'Reports', label: 'Reports', icon: 'bar-chart-2' },
];

export function TabBar({ active, onChange }) {
  const th = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: th.tabBg, borderTopWidth: 1, borderTopColor: th.line, paddingBottom: insets.bottom }}>
      {TABS.map((t) => {
        const on = t.id === active;
        const color = on ? th.accent : th.muted;
        return (
          <Pressable key={t.id} onPress={() => onChange(t.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.label} style={{ flex: 1, alignItems: 'center', paddingTop: 8, paddingBottom: 8, minHeight: 56, gap: 2 }}>
            {t.icon === 'swap' ? <MaterialCommunityIcons name="swap-horizontal" size={23} color={color} /> : <Feather name={t.icon} size={21} color={color} />}
            <T size={11} weight="medium" color={color}>{t.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

// What a record shows on the right: its own amount, coloured by what it did.
export function recordAmount(r) {
  const a = Number(r.amount) || 0;
  if (r.status === 'pending') return { value: r.type === 'income' ? a : -a, kind: r.type === 'income' ? 'in' : 'out', muted: true };
  if (r.type === 'expense') return { value: -a, kind: 'out' };
  if (r.type === 'income') return { value: a, kind: 'in' };
  if (r.type === 'transfer') return { value: a, kind: 'neutral' };
  if (r.type === 'iowe') return isOpen(r) ? { value: a, kind: 'neutral' } : kindOf(r) === 'bill' ? { value: -a, kind: 'out' } : { value: a, kind: 'neutral' };
  if (r.type === 'owed') return !isOpen(r) && kindOf(r) === 'work' ? { value: a, kind: 'in' } : { value: a, kind: 'neutral' };
  return { value: a, kind: 'neutral' };
}

export function recordEmoji(r, categories) {
  if (r.type === 'transfer') return '🔀';
  const c = categories && categories[r.categoryId];
  return c && !c.deleted ? c.emoji : r.type === 'income' ? '💰' : '🏷️';
}

export function recordSub(r, data) {
  const cats = data.categories || {};
  const accs = data.accounts || {};
  const parts = [];
  if (r.type === 'transfer') parts.push(`${(accs[r.accountId] || {}).name || '?'} → ${(accs[r.toAccountId] || {}).name || '?'}`);
  else if (r.type === 'iowe' || r.type === 'owed') {
    parts.push(r.type === 'iowe' ? 'I owe' : 'Owed to me');
    if (r.who) parts.push(r.who);
    const st = statusOf(r);
    if (st === 'Settled') parts.push(r.type === 'iowe' ? 'paid' : 'back');
    else if (r.dueDate) parts.push(`due ${fmtShort(r.dueDate, { weekday: true })}`);
  } else {
    const c = cats[r.categoryId];
    if (c && !c.deleted) parts.push(c.name);
    if (r.status === 'pending') parts.push('Pending');
  }
  return parts.join(' · ');
}

// A record row. Swipe left or right for the actions chosen in Customise.
export function RecordRow({ record, onPress, onSwipe, showDate, first }) {
  const th = useTheme();
  const { data, money } = useApp();
  const x = useRef(new Animated.Value(0)).current;
  const swipeRef = useRef(onSwipe);
  swipeRef.current = onSwipe;
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => !!swipeRef.current && Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderMove: (_, g) => x.setValue(Math.max(-110, Math.min(110, g.dx))),
    onPanResponderRelease: (_, g) => {
      const dir = g.dx < -80 ? 'left' : g.dx > 80 ? 'right' : null;
      Animated.timing(x, { toValue: 0, duration: 160, useNativeDriver: true }).start();
      if (dir && swipeRef.current) swipeRef.current(dir, record);
    },
    onPanResponderTerminate: () => Animated.timing(x, { toValue: 0, duration: 160, useNativeDriver: true }).start(),
  }), [record.id]);
  const amt = recordAmount(record);
  const color = amt.muted ? th.faint : amt.kind === 'in' ? th.in : amt.kind === 'out' ? th.out : th.ink;
  const sub = [showDate ? fmtShort(record.date, { weekday: true }) : null, recordSub(record, data)].filter(Boolean).join(' · ');
  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: th.line }}>
      <Animated.View {...(onSwipe ? pan.panHandlers : {})} style={{ transform: [{ translateX: x }] }}>
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${record.name || 'Record'}, ${money(amt.value, { currency: record.currency })}`} style={({ pressed }) => [{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, backgroundColor: th.card }, pressed && { opacity: 0.7 }]}>
          <IconBox emoji={recordEmoji(record, data.categories)} />
          <View style={{ flex: 1 }}>
            <T numberOfLines={1}>{record.name || (record.type === 'transfer' ? 'Transfer' : 'Untitled')}</T>
            {sub ? <T size={13} color={th.faint} numberOfLines={1}>{sub}</T> : null}
          </View>
          <T weight="medium" color={color}>{money(amt.value, { currency: record.currency, plus: amt.kind === 'in' })}</T>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// Gridline gap that gives 2 to 5 lines: 50, 100, 200, 500, 1000, 2000...
export function niceStep(max) {
  const steps = [];
  for (let p = 10; p <= 1e9; p *= 10) steps.push(p, 2 * p, 5 * p);
  return steps.find((s) => max / s <= 5) || 1e9;
}

// Two lines (income green, spending red) over months or weeks. Tap a point to
// see its numbers.
export function TwoLineChart({ series, height = 200, onSelect, selected }) {
  const th = useTheme();
  const [w, setW] = useState(320);
  const max = Math.max(1, ...series.map((s) => Math.max(s.income, s.expense)));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const left = 30;
  const right = 10;
  const plotH = height - 30;
  const n = series.length;
  const xAt = (i) => (n <= 1 ? left + (w - left - right) / 2 : left + (i * (w - left - right)) / (n - 1));
  const yAt = (v) => 10 + plotH - (v / top) * (plotH - 10);
  const pts = (k) => series.map((s, i) => `${xAt(i)},${yAt(s[k])}`).join(' ');
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  const label = (v) => (v >= 1000 ? `${v / 1000}k` : String(v));
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityLabel="Income and spending chart">
      <Svg width={w} height={height}>
        {ticks.map((v) => (
          <React.Fragment key={v}>
            <Line x1={left} x2={w - right} y1={yAt(v)} y2={yAt(v)} stroke={th.line} strokeWidth={1} />
            <SvgText x={0} y={yAt(v) + 4} fill={th.faint2} fontSize={11} fontFamily={F.regular}>{label(v)}</SvgText>
          </React.Fragment>
        ))}
        {n > 1 ? <Polyline points={pts('expense')} fill="none" stroke={th.out} strokeWidth={2.5} strokeLinejoin="round" /> : null}
        {n > 1 ? <Polyline points={pts('income')} fill="none" stroke={th.in} strokeWidth={2.5} strokeLinejoin="round" /> : null}
        {series.map((s, i) => (
          <React.Fragment key={s.key || i}>
            {selected === i ? <Line x1={xAt(i)} x2={xAt(i)} y1={10} y2={10 + plotH} stroke={th.lineStrong} strokeWidth={1} /> : null}
            <Circle cx={xAt(i)} cy={yAt(s.expense)} r={4} fill={s.partial ? th.card : th.out} stroke={th.out} strokeWidth={2} />
            <Circle cx={xAt(i)} cy={yAt(s.income)} r={4} fill={s.partial ? th.card : th.in} stroke={th.in} strokeWidth={2} />
            {n <= 6 || (n - 1 - i) % 2 === 0 ? <SvgText x={xAt(i)} y={height - 6} fill={th.faint2} fontSize={11} fontFamily={F.regular} textAnchor="middle">{s.label}</SvgText> : null}
          </React.Fragment>
        ))}
      </Svg>
      {onSelect ? (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row', paddingLeft: left - 14, paddingRight: right - 14 }}>
          {series.map((s, i) => (
            <Pressable key={s.key || i} style={{ flex: 1 }} onPress={() => onSelect(selected === i ? null : i)} accessibilityRole="button" accessibilityLabel={s.label} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

// The round + button on the tabs.
export function Fab({ onPress, label = 'Add record' }) {
  const th = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ position: 'absolute', right: 20, bottom: 20, width: 58, height: 58, borderRadius: 20, backgroundColor: th.accentFill, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1, elevation: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } })}
    >
      <Feather name="plus" size={26} color={th.onAccent} />
    </Pressable>
  );
}

// Big title row used by the five tabs, with optional icon buttons on the right.
export function TabTitle({ title, children }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8, paddingVertical: 6, minHeight: 56 }}>
      <T size={26} serif style={{ flex: 1 }}>{title}</T>
      {children}
    </View>
  );
}

export function IconButton({ name, onPress, label, color }) {
  const th = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <Feather name={name} size={21} color={color || th.ink} />
    </Pressable>
  );
}
