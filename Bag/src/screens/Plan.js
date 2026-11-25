// Plan: budgets and savings goals. Repeats live in Upcoming.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Bar, Button, Card, Empty, Ring, Seg, Squish, T, useTheme } from '../ui/kit';
import { catColor } from '../lib/look';
import { TabTitle } from '../ui/parts';
import { accountBalance, budgetStatus, live } from '../lib/ledger';
import { daysBetween, fmtDate, today } from '../lib/dates';
import { round2 } from '../lib/money';

export function BudgetRow({ b, first }) {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const st = budgetStatus(app.data, b, { flows: app.flows });
  const cat = app.data.categories[b.categoryId] || {};
  const used = Math.min(100, st.pct * 100);
  const col = st.state === 'over' ? th.out : st.state === 'warn' ? th.warnBar : th.accent;
  const plannedPct = st.limit ? Math.min(100 - used, (st.planned / st.limit) * 100) : 0;
  const note = st.state === 'over' ? `${app.money(-st.left)} over` : `${app.money(st.left)} left${st.planned ? ` · ${app.money(st.planned)} upcoming` : ''}`;
  return (
    <Squish onPress={() => nav.push('category', { id: b.categoryId })} accessibilityLabel={`${cat.name} budget, ${note}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 22, backgroundColor: th.card, marginTop: first ? 0 : 10, borderWidth: st.state === 'over' ? 1 : 0, borderColor: th.dangerSoft }}>
      <Ring pct={st.pct} color={st.state === 'over' ? th.out : st.state === 'warn' ? th.warnBar : catColor(cat)} size={58} stroke={5}>
        <T size={12} weight="semi">{Math.round(st.pct * 100)}%</T>
      </Ring>
      <View style={{ flex: 1 }}>
        <T>{cat.emoji} {cat.name}</T>
        <T size={13} color={st.state === 'over' ? th.out : st.state === 'warn' ? th.warn : th.faint}>{app.money(st.spent)} of {app.money(st.limit)} · {note}</T>
        {plannedPct ? <Bar height={4} style={{ marginTop: 6 }} parts={[{ pct: used, color: col }, { pct: plannedPct, color: th.planned }]} /> : null}
      </View>
    </Squish>
  );
}

export function Budgets() {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const { data } = app;
  const budgets = live(data.budgets).filter((b) => data.categories[b.categoryId] && !data.categories[b.categoryId].deleted)
    .sort((a, b) => ((data.categories[a.categoryId].order || 0) - (data.categories[b.categoryId].order || 0)));
  const month = budgets.filter((b) => b.period !== 'week');
  const sum = useMemo(() => {
    let limit = 0; let spent = 0;
    month.forEach((b) => { const st = budgetStatus(data, b, { flows: app.flows }); limit += st.limit; spent += st.spent; });
    return { limit: round2(limit), spent: round2(spent) };
  }, [budgets, app.flows]);
  const free = live(data.categories).filter((c) => c.kind === 'expense' && !(data.budgets[c.id] && !data.budgets[c.id].deleted));
  const addBudget = () => nav.openSheet('choice', {
    title: 'Budget for', options: free.sort((a, b) => (a.order || 0) - (b.order || 0)).map((c) => ({ id: c.id, label: c.name, emoji: c.emoji })),
    onPick: (id) => nav.push('budget', { categoryId: id }),
  });
  if (!budgets.length) {
    return <Empty title="No budgets yet" text="Set a limit for a category, like groceries, and Bag shows how much is left. Upcoming bills show as a lighter bar." action="Set a budget" onAction={addBudget} />;
  }
  return (
    <>
      {month.length ? (
        <Card onPress={() => nav.setTab('Reports')} accessibilityLabel="Monthly budgets, see where it went">
          <T size={12} color={th.muted} style={{ letterSpacing: 0.8 }}>Monthly budgets</T>
          <T size={22} serif color={sum.spent > sum.limit ? th.out : th.ink}>{app.money(sum.spent)} <T size={15} color={th.muted}>of {app.money(sum.limit)}</T></T>
          <Bar parts={[{ pct: sum.limit ? Math.min(100, (sum.spent / sum.limit) * 100) : 0, color: sum.spent > sum.limit ? th.out : th.accent }]} style={{ marginTop: 10 }} />
          {data.budgetRollover ? <T size={13} color={th.faint} style={{ marginTop: 8 }}>What's left at the end of a month carries over to the next.</T> : null}
        </Card>
      ) : null}
      <View>
        {budgets.map((b, i) => <BudgetRow key={b.categoryId} b={b} first={i === 0} />)}
      </View>
      {free.length ? <Button label="Add a budget" kind="secondary" icon="plus" onPress={addBudget} /> : null}
    </>
  );
}

export function goalProgress(app, g) {
  const acc = g.accountId ? app.data.accounts[g.accountId] : null;
  const saved = acc && !acc.deleted ? Math.max(0, accountBalance(app.data, acc, { flows: app.flows, homePerUnit: app.homePerUnit }).home) : 0;
  const target = Number(g.target) || 0;
  const pct = target ? Math.min(1, saved / target) : 0;
  let perMonth = null;
  if (g.date && saved < target) {
    const days = daysBetween(today(), g.date);
    perMonth = days > 0 ? round2((target - saved) / Math.max(1, days / 30.44)) : null;
  }
  return { acc, saved: round2(saved), target, pct, left: round2(Math.max(0, target - saved)), perMonth, done: target > 0 && saved >= target };
}

// A jar that fills to pct with a slow moving wave.
export function Jar({ pct, color }) {
  const th = useTheme();
  const spin = useRef(new Animated.Value(0)).current;
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 7000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, []);
  useEffect(() => { Animated.timing(fill, { toValue: pct, duration: 1400, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }, [pct]);
  const H = 120;
  const W = 92;
  const ty = fill.interpolate({ inputRange: [0, 1], outputRange: [H + 4, -W * 0.25] });
  const rot = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <View style={{ width: W, height: H, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderBottomLeftRadius: 34, borderBottomRightRadius: 34, backgroundColor: th.soft, overflow: 'hidden', borderWidth: 2, borderColor: th.lineStrong }}>
      <Animated.View style={{ position: 'absolute', left: -W * 0.5, width: W * 2, height: W * 2, borderRadius: W * 0.84, backgroundColor: color || '#7FB2F0', opacity: 0.55, transform: [{ translateY: ty }, { rotate: rot }] }} />
      <Animated.View style={{ position: 'absolute', left: -W * 0.5, width: W * 2, height: W * 2, borderRadius: W * 0.8, backgroundColor: color || '#7FB2F0', transform: [{ translateY: Animated.add(ty, 6) }, { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['40deg', '-320deg'] }) }] }} />
    </View>
  );
}

export function Goals() {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const goals = live(app.data.goals).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  if (!goals.length) {
    return <Empty title="No goals yet" text="Save towards something. Link a goal to an account and Bag follows its balance." action="Start a goal" onAction={() => nav.push('goal', {})} />;
  }
  return (
    <>
      {goals.map((g) => {
        const p = goalProgress(app, g);
        return (
          <Card key={g.id} onPress={() => nav.push('goal', { id: g.id })} accessibilityLabel={`${g.name}, ${Math.round(p.pct * 100)} percent`} style={{ flexDirection: 'row', alignItems: 'center', gap: 18, padding: 20, marginBottom: 12 }}>
            <Jar pct={p.pct} color={p.done ? th.in : '#7FB2F0'} />
            <View style={{ flex: 1 }}>
              <T size={13} color={th.faint}>{g.emoji || '🎯'} {g.name}</T>
              <T serif size={28}>{app.money(p.saved)}</T>
              <T size={13} color={th.muted}>of {app.money(p.target)} · {Math.round(p.pct * 100)}%</T>
              <T size={12.5} color={p.done ? th.in : th.faint} style={{ marginTop: 6 }}>{p.done ? 'Reached' : g.date ? `By ${fmtDate(g.date)}${p.perMonth ? ` · ${app.money(p.perMonth)} a month gets you there` : ''}` : p.acc ? p.acc.name : 'No account linked'}</T>
            </View>
          </Card>
        );
      })}
      <Button label="Start a goal" kind="secondary" icon="plus" onPress={() => nav.push('goal', {})} />
    </>
  );
}

export default function Plan() {
  const th = useTheme();
  const insets = useSafeAreaInsets();
  const [seg, setSeg] = useState('budgets');
  return (
    <View style={{ flex: 1, backgroundColor: th.bg, paddingTop: insets.top }}>
      <TabTitle title="Plan" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 12 }}>
        <Seg items={[{ id: 'budgets', label: 'Budgets' }, { id: 'goals', label: 'Goals' }]} value={seg} onChange={setSeg} />
        {seg === 'budgets' ? <Budgets /> : <Goals />}
      </ScrollView>
    </View>
  );
}
