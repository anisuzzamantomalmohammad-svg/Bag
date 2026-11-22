// "See records" from Reports: the same stretch, grouped by category, biggest
// first, each with its share. Tap a category to open its records; tap a
// record to open it.
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Bubble, Icon, T, useTheme } from '../ui/kit';
import { alpha, accountEmoji, catColor } from '../lib/look';
import { displayName } from '../lib/ledger';
import { fmtShort } from '../lib/dates';
import { round2 } from '../lib/money';

export function groupByCategory(flows, { kind = 'expense', from, to }) {
  const map = {};
  flows.forEach((f) => {
    if (f.count !== kind) return;
    if ((from && f.date < from) || (to && f.date > to)) return;
    const k = f.categoryId || 'none';
    const g = map[k] || (map[k] = { categoryId: k, total: 0, items: [] });
    const v = kind === 'expense' ? -f.home : f.home;
    g.total += v;
    g.items.push({ id: f.record.id, date: f.date, value: v, record: f.record, accountId: f.accountId });
  });
  const groups = Object.values(map).map((g) => ({ ...g, total: round2(g.total), items: g.items.sort((a, b) => (a.date < b.date ? 1 : -1)) })).sort((a, b) => b.total - a.total);
  return { groups, total: round2(groups.reduce((t, g) => t + g.total, 0)), count: groups.reduce((t, g) => t + g.items.length, 0) };
}

export default function Breakdown({ kind = 'expense', from, to, title }) {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const insets = useSafeAreaInsets();
  const { data, flows, money } = app;
  const income = kind === 'income';
  const { groups, total, count } = useMemo(() => groupByCategory(flows, { kind, from, to }), [flows, kind, from, to]);
  const [open, setOpen] = useState(() => (groups[0] ? { [groups[0].categoryId]: true } : {}));
  const top = groups.length ? groups[0].total : 1;
  const hue = income ? th.in : th.out;
  const cat = (id) => data.categories[id];
  return (
    <View style={{ flex: 1, backgroundColor: th.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 40 + insets.bottom }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 }}>
          <Pressable onPress={() => nav.pop()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: th.soft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="chevron-left" size={18} color={th.muted} />
          </Pressable>
          <T size={13} color={th.muted}>{title || ''} · {income ? 'Cash in' : 'Cash out'}</T>
          <View style={{ width: 36 }} />
        </View>

        <View style={{ marginTop: 10, borderRadius: 24, overflow: 'hidden', padding: 16, alignItems: 'center' }}>
          <Svg style={{ position: 'absolute', top: 0, left: 0 }} width="100%" height="100%">
            <Defs><LinearGradient id="bkg" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={hue} stopOpacity={0.22} /><Stop offset="1" stopColor={hue} stopOpacity={0.03} /></LinearGradient></Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#bkg)" />
          </Svg>
          <T size={10.5} color={th.muted} style={{ letterSpacing: 1.2 }}>{income ? 'CAME IN' : 'SPENT'}</T>
          <T serif size={34}>{money(total)}</T>
          <T size={12} color={th.muted}>{count} {count === 1 ? 'record' : 'records'} · {groups.length} {groups.length === 1 ? 'category' : 'categories'}</T>
          <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2, marginTop: 12, alignSelf: 'stretch' }}>
            {groups.map((g) => <View key={g.categoryId} style={{ flex: Math.max(0.001, g.total), backgroundColor: catColor(cat(g.categoryId)) }} />)}
          </View>
        </View>

        {!groups.length ? <T size={14} color={th.faint} center style={{ marginTop: 24 }}>Nothing here for this stretch</T> : null}
        {groups.map((g) => {
          const c = cat(g.categoryId);
          const col = catColor(c);
          const on = !!open[g.categoryId];
          return (
            <View key={g.categoryId} style={{ marginTop: 10, borderRadius: 18, backgroundColor: th.card, overflow: 'hidden' }}>
              <Pressable onPress={() => setOpen({ ...open, [g.categoryId]: !on })} onLongPress={() => c && !c.deleted && nav.push('category', { id: g.categoryId, from, to })} accessibilityRole="button" accessibilityState={{ expanded: on }}
                accessibilityLabel={`${c && !c.deleted ? c.name : 'No category'}, ${money(g.total)}, ${g.items.length} records`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}>
                <Bubble emoji={c && !c.deleted ? c.emoji : '🏷️'} color={col} size={34} />
                <View style={{ flex: 1 }}>
                  <T size={14}>{c && !c.deleted ? c.name : 'No category'}</T>
                  <T size={11.5} color={th.faint}>{g.items.length} {g.items.length === 1 ? 'record' : 'records'} · {total ? Math.round((g.total / total) * 100) : 0}%</T>
                </View>
                <T size={14} weight="semi">{money(g.total)}</T>
                <Icon name={on ? 'chevron-up' : 'chevron-down'} size={16} color={th.faint} />
              </Pressable>
              <View style={{ height: 3, marginHorizontal: 12, borderRadius: 2, backgroundColor: th.soft, overflow: 'hidden', marginBottom: on ? 4 : 10 }}>
                <View style={{ width: `${Math.round((g.total / top) * 100)}%`, height: 3, backgroundColor: col }} />
              </View>
              {on ? g.items.map((it) => {
                const acc = data.accounts[it.accountId];
                return (
                  <Pressable key={it.id + it.date} onPress={() => nav.push('record', { id: it.id })} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingLeft: 56, paddingRight: 14, gap: 8, backgroundColor: alpha(col, 0.03) }}>
                    <T size={12.5} color={th.muted} style={{ flex: 1 }} numberOfLines={1}>{fmtShort(it.date)} · {displayName(it.record, data)}{acc ? ` · ${accountEmoji(acc)}` : ''}</T>
                    <T size={12.5}>{money(it.value)}</T>
                  </Pressable>
                );
              }) : null}
              {on ? <View style={{ height: 6 }} /> : null}
            </View>
          );
        })}
        {groups.length ? <T size={11} color={th.faint} center style={{ marginTop: 12 }}>Tap a category to open it · hold it for its own page</T> : null}
      </ScrollView>
    </View>
  );
}
