// Larger shared pieces: the tab bar, a record row (press and hold for its menu), and
// the two-line chart.
import React, { useRef, useState } from 'react';
import { Alert, Animated, Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Line, LinearGradient, Polyline, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { useApp } from '../state/store';
import { Bubble, F, Squish, T, useTheme } from './kit';
import { accountEmoji, catColor } from '../lib/look';
import { fmtShort } from '../lib/dates';
import { displayName, isOpen, isPending, kindOf, statusOf } from '../lib/ledger';
import { useNav } from '../nav';

export const TABS = [
  { id: 'Home', label: 'Home', icon: 'home' },
  { id: 'Records', label: 'Records', icon: 'list' },
  { id: 'Upcoming', label: 'Upcoming', icon: 'clock' },
  { id: 'Reports', label: 'Reports', icon: 'bar-chart-2' },
];

// A floating tab bar with a raised + in the middle. The little line under
// the tab slides along with the swipe.
export function TabBar({ active, onChange, pos, onAdd, order }) {
  const th = useTheme();
  const insets = useSafeAreaInsets();
  const [w, setW] = useState(0);
  const slot = w / 5;
  const centers = [0, 1, 3, 4].map((k) => slot * k + slot / 2 - 9);
  const left = pos && w ? pos.interpolate({ inputRange: [0, 1, 2, 3], outputRange: centers, extrapolate: 'clamp' }) : 0;
  const tab = (t) => {
    const on = t.id === active;
    const color = on ? th.chipOn : th.faint;
    return (
      <Pressable key={t.id} onPress={() => onChange(t.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.label} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', height: 64, gap: 3 }}>
        <Feather name={t.icon} size={21} color={color} style={on ? { transform: [{ translateY: -2 }] } : null} />
        <T size={10.5} weight="medium" color={color}>{t.label}</T>
      </Pressable>
    );
  };
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 14, right: 14, bottom: 12 + insets.bottom }}>
      <View
        accessibilityRole="tablist"
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        style={{ height: 66, borderRadius: 24, backgroundColor: th.tabBg, borderWidth: 1, borderColor: th.line, flexDirection: 'row', alignItems: 'center',
          elevation: 10, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } }}
      >
        {TABS.slice(0, 2).map(tab)}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <PlusButton onPress={onAdd} />
        </View>
        {TABS.slice(2).map(tab)}
        {w ? <Animated.View style={{ position: 'absolute', bottom: 7, width: 18, height: 3, borderRadius: 2, backgroundColor: th.chipOn, transform: [{ translateX: left }] }} /> : null}
      </View>
    </View>
  );
}

// The raised + : a soft pillow with a highlight on top.
export function PlusButton({ onPress }) {
  const th = useTheme();
  const s = useRef(new Animated.Value(1)).current;
  const pressIn = () => Animated.spring(s, { toValue: 0.9, useNativeDriver: true, speed: 40 }).start();
  const pressOut = () => Animated.spring(s, { toValue: 1, useNativeDriver: true, friction: 4 }).start();
  return (
    <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onPress(); }} onPressIn={pressIn} onPressOut={pressOut} accessibilityRole="button" accessibilityLabel="Add a record" hitSlop={6}>
      <Animated.View style={{ marginTop: -30, width: 60, height: 60, borderRadius: 21, borderWidth: 4, borderColor: th.bg, overflow: 'hidden', transform: [{ scale: s }],
        elevation: 8, shadowColor: th.plusB, shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } }}>
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs><LinearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={th.plusA} /><Stop offset="1" stopColor={th.plusB} /></LinearGradient></Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#pg)" />
        </Svg>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Feather name="plus" size={26} color={th.plusInk} /></View>
      </Animated.View>
    </Pressable>
  );
}

// The faint colour wash at the top of each tab.
export function TabTint({ tab }) {
  const th = useTheme();
  const c = (th.tints || {})[tab] || th.bg;
  return (
    <Svg pointerEvents="none" style={[StyleSheet.absoluteFill, { height: 420 }]} width="100%" height={420}>
      <Defs><RadialGradient id={`tint${tab}`} cx="50%" cy="-6%" rx="80%" ry="55%" fx="50%" fy="-6%"><Stop offset="0" stopColor={c} stopOpacity="1" /><Stop offset="1" stopColor={th.bg} stopOpacity="0" /></RadialGradient></Defs>
      <Rect x="0" y="0" width="100%" height="420" fill={`url(#tint${tab})`} />
    </Svg>
  );
}

// What a record shows on the right: its own amount, coloured by what it did.
export function recordAmount(r) {
  const a = Number(r.amount) || 0;
  if (isPending(r)) return { value: r.type === 'income' ? a : r.type === 'transfer' ? a : -a, kind: r.type === 'income' ? 'in' : r.type === 'transfer' ? 'neutral' : 'out', muted: true };
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
  const many = Object.values(accs).filter((x) => x && !x.deleted).length > 1;
  const accTag = (id) => { const x = accs[id]; return x ? `${accountEmoji(x)} ${x.name}` : '?'; };
  if (r.type === 'transfer') parts.push(`${accTag(r.accountId)} → ${accTag(r.toAccountId)}`);
  else if (r.type === 'iowe' || r.type === 'owed') {
    parts.push(r.type === 'iowe' ? `Borrowed${r.who ? ` from ${r.who}` : ''}` : `Lent${r.who ? ` to ${r.who}` : ''}`);
    const st = statusOf(r);
    if (st === 'Settled') parts.push(r.type === 'iowe' ? 'paid' : 'back');
    else if (r.dueDate) parts.push(`due ${fmtShort(r.dueDate, { weekday: true })}`);
  } else {
    const c = cats[r.categoryId];
    if (c && !c.deleted) parts.push(c.name);
    if (isPending(r)) parts.push(statusOf(r) === 'Overdue' ? 'Overdue · not paid yet' : 'Upcoming');
  }
  if (many && r.type !== 'transfer' && r.accountId) parts.push(accTag(r.accountId));
  return parts.join(' · ');
}

// Edit, duplicate and delete for a record: the press-and-hold menu, and a
// delete that asks about the other half of a split.
export function useRecordActions() {
  const app = useApp();
  const nav = useNav();
  const remove = (r, after) => {
    const partner = Object.values(app.data.records).find((x) => x && !x.deleted && x.splitOf === r.id && isOpen(x));
    const go = (extra) => { if (after) after(); setTimeout(() => app.deleteRecord(r.id, { extra }), after ? 220 : 0); };
    if (!partner) { go([]); return; }
    Alert.alert(`Delete ${displayName(r, app.data)}?`, `${partner.who || 'Someone'} still owes you ${app.money(partner.amount, { currency: partner.currency })} from this. Keep that?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete both', style: 'destructive', onPress: () => go([partner.id]) },
      { text: 'Keep it', onPress: () => go([]) },
    ]);
  };
  // What holding a record offers depends on what it is.
  const menu = (r) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const money = r.type === 'expense' || r.type === 'income' || r.type === 'transfer';
    const pending = isPending(r);
    const opts = [];
    if (pending) {
      opts.push({ id: 'paid', label: r.type === 'income' ? 'Mark received' : r.type === 'transfer' ? 'Mark moved' : 'Mark paid', emoji: '✓' });
      if (r.repeatId) opts.push({ id: 'skip', label: 'Skip this one', emoji: '⏭' });
    } else if (money && r.status !== 'skipped') {
      opts.push({ id: 'unpay', label: r.type === 'income' ? 'Not received yet' : r.type === 'transfer' ? 'Not moved yet' : 'Not paid yet', emoji: '↺' });
    }
    if (isOpen(r)) opts.push({ id: 'settle', label: r.type === 'iowe' ? 'Mark paid back' : 'Mark got it back', emoji: '✓' });
    if (r.type === 'transfer' && r.toAccountId) {
      const a = app.data.accounts[r.toAccountId] || {};
      const b = app.data.accounts[r.accountId] || {};
      opts.push({ id: 'flip', label: `Flip: ${a.name || '?'} → ${b.name || '?'}`, emoji: '⇄' });
    }
    opts.push({ id: 'copy', label: 'Duplicate', sub: 'Makes a copy dated today', emoji: '⧉' }, { id: 'edit', label: 'Edit', emoji: '✎' }, { id: 'delete', label: 'Delete', emoji: '🗑' });
    nav.openSheet('choice', {
      title: displayName(r, app.data),
      options: opts,
      onPick: (k) => {
        if (k === 'paid') app.markPaid(r.id);
        if (k === 'skip') app.skipPending(r.id);
        if (k === 'unpay') app.unpay(r.id);
        if (k === 'settle') nav.openSheet('settle', { id: r.id });
        if (k === 'flip') app.saveRecord({ ...r, accountId: r.toAccountId, toAccountId: r.accountId, toAmount: null });
        if (k === 'edit') nav.push('add', { id: r.id });
        if (k === 'copy') app.duplicateRecord(r.id);
        if (k === 'delete') remove(r);
      },
    });
  };
  return { remove, menu };
}

// A record row. Tap to open it; press and hold for Edit, Duplicate, Delete.
export function RecordRow({ record, onPress, showDate, first }) {
  const th = useTheme();
  const { data, money } = useApp();
  const { menu } = useRecordActions();
  const amt = recordAmount(record);
  const color = amt.muted ? th.faint : amt.kind === 'in' ? th.in : amt.kind === 'out' ? th.out : th.ink;
  const st = statusOf(record);
  const overdue = st === 'Overdue';
  const upcoming = isPending(record);
  const sub = [showDate ? fmtShort(record.date, { weekday: true }) : null, recordSub(record, data)].filter(Boolean).join(' · ');
  const name = displayName(record, data);
  const cat = data.categories[record.categoryId];
  return (
    <View>
      <Squish onPress={onPress} onLongPress={() => menu(record)} delayLongPress={350} accessibilityLabel={`${name}, ${money(amt.value, { currency: record.currency })}. Press and hold for more`} style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 8 }}>
        <Bubble emoji={recordEmoji(record, data.categories)} color={record.type === 'transfer' ? '#AFC6DE' : catColor(cat)} />
        <View style={{ flex: 1 }}>
          <T numberOfLines={1} color={upcoming ? th.muted : undefined}>{name}</T>
          {sub ? <T size={13} color={overdue || upcoming ? th.warn : th.faint} numberOfLines={1}>{sub}</T> : null}
        </View>
        <T weight="medium" color={color}>{money(amt.value, { currency: record.currency, plus: amt.kind === 'in' })}</T>
      </Squish>
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
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityLabel="Cash in and cash out chart">
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
      style={({ pressed }) => ({ position: 'absolute', right: 16, bottom: 16, width: 52, height: 52, borderRadius: 18, backgroundColor: th.accentFill, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1, elevation: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } })}
    >
      <Feather name="plus" size={24} color={th.onAccent} />
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
