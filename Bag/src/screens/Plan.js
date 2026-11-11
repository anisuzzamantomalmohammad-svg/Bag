// Plan: budgets, savings goals and repeats, one segment each.
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Amount, Bar, Button, Card, Empty, IconBox, Row, Seg, T, useTheme } from '../ui/kit';
import { TabTitle } from '../ui/parts';
import { accountBalance, budgetStatus, live } from '../lib/ledger';
import { describe, nextDate } from '../lib/repeats';
import { daysBetween, fmtDate, fmtShort, today } from '../lib/dates';
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
  const note = st.state === 'over' ? `${app.money(-st.left)} over` : `${app.money(st.left)} left${st.planned ? ` · ${app.money(st.planned)} planned` : ''}`;
  return (
    <Pressable onPress={() => nav.push('category', { id: b.categoryId })} accessibilityRole="button" accessibilityLabel={`${cat.name} budget, ${note}`} style={({ pressed }) => [{ paddingVertical: 12, gap: 8, borderTopWidth: first ? 0 : 1, borderTopColor: th.line }, pressed && { opacity: 0.7 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconBox emoji={cat.emoji} />
        <View style={{ flex: 1 }}>
          <T>{cat.name}</T>
          <T size={13} color={st.state === 'over' ? th.out : st.state === 'warn' ? th.warn : th.faint}>{note}</T>
        </View>
        <T size={14} color={th.muted}>{app.money(st.spent)} of {app.money(st.limit)}</T>
      </View>
      <Bar parts={[{ pct: used, color: col }, { pct: plannedPct, color: th.planned }]} />
    </Pressable>
  );
}

function Budgets() {
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
    return <Empty title="No budgets yet" text="Set a limit for a category, like groceries, and Bag shows how much is left. Planned bills show as a lighter bar." action="Set a budget" onAction={addBudget} />;
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
      <Card pad={0} style={{ paddingHorizontal: 16, paddingVertical: 2 }}>
        {budgets.map((b, i) => <BudgetRow key={b.categoryId} b={b} first={i === 0} />)}
      </Card>
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

function Goals() {
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
          <Card key={g.id} onPress={() => nav.push('goal', { id: g.id })} accessibilityLabel={`${g.name}, ${Math.round(p.pct * 100)} percent`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconBox emoji={g.emoji || '🎯'} />
              <View style={{ flex: 1 }}>
                <T weight="medium">{g.name}</T>
                <T size={13} color={th.faint}>{p.done ? 'Reached' : g.date ? `By ${fmtDate(g.date)}${p.perMonth ? ` · ${app.money(p.perMonth)} a month` : ''}` : p.acc ? p.acc.name : 'No account linked'}</T>
              </View>
              <T size={14} weight="medium" color={p.done ? th.in : th.muted}>{Math.round(p.pct * 100)}%</T>
            </View>
            <Bar parts={[{ pct: p.pct * 100, color: p.done ? th.in : th.accent }]} style={{ marginTop: 12 }} />
            <T size={13} color={th.muted} style={{ marginTop: 8 }}>{app.money(p.saved)} of {app.money(p.target)}</T>
          </Card>
        );
      })}
      <Button label="Start a goal" kind="secondary" icon="plus" onPress={() => nav.push('goal', {})} />
    </>
  );
}

function Repeats() {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const reps = live(app.data.repeats).map((r) => ({ r, next: r.paused ? null : nextDate(r, today()) || null }))
    .sort((a, b) => (a.r.paused !== b.r.paused ? (a.r.paused ? 1 : -1) : (a.next || '9') < (b.next || '9') ? -1 : 1));
  if (!reps.length) {
    return <Empty title="Nothing repeats yet" text="Rent, salary, the phone bill: add a record and set Repeats on it. Bag makes the next one for you." action="Add a record" onAction={() => nav.push('add', {})} />;
  }
  return (
    <>
      <Card pad={0} style={{ paddingHorizontal: 16, paddingVertical: 2 }}>
        {reps.map(({ r, next }, i) => {
          const t = r.template || {};
          const cat = app.data.categories[t.categoryId];
          return (
            <Row key={r.id} first={i === 0} minHeight={64} left={<IconBox emoji={t.type === 'transfer' ? '🔀' : cat && !cat.deleted ? cat.emoji : '🔁'} />}
              label={t.name || 'Repeat'}
              sub={<T size={13} color={th.faint} numberOfLines={1}>{r.paused ? 'Paused' : `${describe(r)}${next ? ` · next ${fmtShort(next)}` : ' · ended'}`}</T>}
              value={<Amount value={t.type === 'income' || t.type === 'owed' ? t.amount : -t.amount} kind={t.type === 'income' ? 'in' : t.type === 'transfer' || t.type === 'owed' ? 'neutral' : 'out'} currency={t.currency} muted={r.paused} />}
              onPress={() => nav.push('repeat', { id: r.id })} chevron={false} />
          );
        })}
      </Card>
      <T size={13} color={th.faint} style={{ marginHorizontal: 4 }}>To add a repeat, set Repeats when you add a record.</T>
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
        <Seg items={[{ id: 'budgets', label: 'Budgets' }, { id: 'goals', label: 'Goals' }, { id: 'repeats', label: 'Repeats' }]} value={seg} onChange={setSeg} />
        {seg === 'budgets' ? <Budgets /> : seg === 'goals' ? <Goals /> : <Repeats />}
      </ScrollView>
    </View>
  );
}
