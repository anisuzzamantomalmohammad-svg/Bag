// Home: balance, this month, what's coming up, recent records. More cards
// (budgets, goals, net worth) can be switched on in Customise.
import React, { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Amount, Balance, Bar, Card, Icon, Row, Seg, T, useTheme } from '../ui/kit';
import { Fab, RecordRow } from '../ui/parts';
import { budgetStatus, comingUp, incomeExpense, live, liveRecords, netWorth, recentRecords, accountBalance } from '../lib/ledger';
import { MONTHS, fmtShort, parseYmd, periodOf, today } from '../lib/dates';
import { fmtApprox } from '../lib/money';

export function initials(name) {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return null;
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

export function useSwipeAction() {
  const app = useApp();
  const nav = useNav();
  return (dir, r) => {
    const act = (app.data.swipe || {})[dir];
    if (act === 'delete') app.deleteRecord(r.id);
    else if (act === 'edit') nav.push('add', { id: r.id });
    else if (act === 'duplicate') app.duplicateRecord(r.id);
  };
}

export function comingRow(item, data) {
  const r = item.record || (item.repeat && item.repeat.template) || {};
  const name = r.name || 'Repeat';
  let sub = fmtShort(item.date, { weekday: true });
  let tone = null;
  if (item.kind === 'pending') { sub += ' · Pending'; tone = 'warn'; }
  if (item.kind === 'due') {
    const overdue = item.date < today();
    sub = `${overdue ? 'Overdue since' : 'Due'} ${fmtShort(item.date, { weekday: true })}`;
    tone = overdue ? 'out' : null;
  }
  if (item.kind === 'owedToMe') sub = `${r.who ? `${r.who} · ` : ''}due ${fmtShort(item.date, { weekday: true })}`;
  if (item.kind === 'repeat') sub += ' · repeats';
  const a = Number(r.amount) || 0;
  const value = r.type === 'income' || item.kind === 'owedToMe' ? a : -a;
  const kind = r.type === 'income' ? 'in' : item.kind === 'owedToMe' ? 'neutral' : 'out';
  return { name, sub, tone, value, kind, currency: r.currency };
}

export default function Home() {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const insets = useSafeAreaInsets();
  const { data, flows, money, second, homePerUnit } = app;
  const swipe = useSwipeAction();
  const now = today();

  const total = useMemo(() => live(data.accounts).reduce((s, a) => s + accountBalance(data, a, { flows, homePerUnit }).home, 0), [data.accounts, flows, homePerUnit]);
  // Cash in and out for the week, the month, or everything.
  const period = ['week', 'month', 'total'].includes(data.homePeriod) ? data.homePeriod : 'month';
  const first = useMemo(() => liveRecords(data).reduce((m, r) => (r.date < m ? r.date : m), now), [data.records]);
  const range = period === 'total' ? { from: null, to: now } : { from: periodOf(now, period, { weekStart: data.weekStart === 0 ? 0 : data.weekStart || 1, monthStart: data.monthStartDay || 1 }).from, to: now };
  const ie = useMemo(() => incomeExpense(data, range.from || '0000-01-01', now, flows), [flows, range.from, now]);
  const rangeLabel = period === 'total' ? `Since ${MONTHS[parseYmd(first).getMonth()]} ${first.slice(0, 4)}` : period === 'week' ? `${fmtShort(range.from)} to today` : `${fmtShort(range.from)} to today`;
  const openCounts = (counts) => nav.setTab('Records', { counts, from: range.from, to: now });
  const coming = useMemo(() => comingUp(data, { days: 14 }).slice(0, 4), [data.records, data.repeats]);
  const recent = useMemo(() => recentRecords(data, 4), [data.records]);
  const sec = second(total, 'home');
  const cards = (data.homeCards || []).filter((c) => !c.hidden);
  const who = initials(data.google && data.google.name) || initials(data.ownerName);

  const openComing = (item) => {
    if (item.kind === 'pending') nav.openSheet('confirm', { id: item.record.id });
    else if (item.record) nav.push('record', { id: item.record.id });
    else if (item.repeat) nav.push('repeat', { id: item.repeat.id });
  };

  const renderCard = (c) => {
    if (c.id === 'month') {
      const tile = (counts, label, value, kind) => {
        const s2 = second(Math.abs(value), 'tiles');
        return (
          <Card key={counts} onPress={() => openCounts(counts)} accessibilityLabel={`${label} ${money(value)}`} style={{ flex: 1 }} pad={14}>
            <T size={12} color={th.muted} style={{ letterSpacing: 0.8 }}>{label}</T>
            <Amount value={value} kind={kind} size={20} serif />
            {s2 ? <T size={11} color={th.faint}>{fmtApprox(s2.amount, s2.currency)}</T> : null}
          </Card>
        );
      };
      return (
        <View key="month" style={{ gap: 10 }}>
          <Seg small items={[{ id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }, { id: 'total', label: 'Total' }]} value={period} onChange={(v) => app.update({ homePeriod: v })} />
          <T size={12} color={th.faint} style={{ marginHorizontal: 4, letterSpacing: 0.8 }}>{rangeLabel}</T>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {tile('income', 'Cash in', ie.income, 'in')}
            {tile('expense', 'Cash out', -ie.expense, 'out')}
          </View>
        </View>
      );
    }
    if (c.id === 'coming') {
      return (
        <Card key="coming" pad={16} style={{ paddingBottom: 6 }}>
          <T size={12} color={th.muted} style={{ marginBottom: 2, letterSpacing: 1 }}>Coming up</T>
          {coming.length ? coming.map((it, i) => {
            const row = comingRow(it, data);
            return (
              <Row key={it.key} first={i === 0} onPress={() => openComing(it)} chevron={false} minHeight={56}
                label={row.name}
                sub={<T size={13} color={row.tone === 'warn' ? th.warn : row.tone === 'out' ? th.out : th.faint}>{row.sub}</T>}
                value={<Amount value={row.value} kind={row.kind} currency={row.currency} />}
              />
            );
          }) : <T size={14} color={th.faint} style={{ paddingVertical: 12 }}>Nothing due in the next 14 days</T>}
        </Card>
      );
    }
    if (c.id === 'recent') {
      return (
        <Card key="recent" style={{ paddingBottom: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <T size={12} color={th.muted} style={{ letterSpacing: 1 }}>Recent</T>
            <Pressable onPress={() => nav.setTab('Records')} hitSlop={10} accessibilityRole="button"><T size={14} weight="medium" color={th.accent}>See all</T></Pressable>
          </View>
          {recent.length ? recent.map((r, i) => <RecordRow key={r.id} record={r} first={i === 0} showDate onPress={() => nav.push('record', { id: r.id })} onSwipe={swipe} />)
            : <T size={14} color={th.faint} style={{ paddingVertical: 12 }}>No records yet. Tap + to add your first one.</T>}
        </Card>
      );
    }
    if (c.id === 'budgets') {
      const list = live(data.budgets).slice(0, 3);
      return (
        <Card key="budgets">
          <T size={12} color={th.muted} style={{ marginBottom: 8, letterSpacing: 1 }}>Budgets</T>
          {list.length ? list.map((b) => {
            const st = budgetStatus(data, b, { flows });
            const cat = data.categories[b.categoryId] || {};
            const col = st.state === 'over' ? th.out : st.state === 'warn' ? th.warnBar : th.accent;
            return (
              <Pressable key={b.categoryId} onPress={() => nav.push('category', { id: b.categoryId })} style={{ paddingVertical: 8, gap: 6 }} accessibilityRole="button">
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <T>{cat.emoji} {cat.name}</T>
                  <T size={14} color={st.state === 'ok' ? th.muted : st.state === 'warn' ? th.warn : th.out}>{money(st.spent)} of {money(st.limit)}</T>
                </View>
                <Bar parts={[{ pct: Math.min(100, st.pct * 100), color: col }, { pct: st.limit ? Math.min(100 - Math.min(100, st.pct * 100), (st.planned / st.limit) * 100) : 0, color: th.planned }]} />
              </Pressable>
            );
          }) : <Row first label="Set a budget" onPress={() => nav.setTab('Plan')} />}
        </Card>
      );
    }
    if (c.id === 'goals') {
      const list = live(data.goals).slice(0, 2);
      return (
        <Card key="goals">
          <T size={12} color={th.muted} style={{ marginBottom: 8, letterSpacing: 1 }}>Goals</T>
          {list.length ? list.map((g) => {
            const acc = data.accounts[g.accountId];
            const saved = acc && !acc.deleted ? Math.max(0, accountBalance(data, acc, { flows, homePerUnit }).home) : 0;
            const pct = g.target ? Math.min(100, (saved / g.target) * 100) : 0;
            return (
              <Pressable key={g.id} onPress={() => nav.push('goal', { id: g.id })} style={{ paddingVertical: 8, gap: 6 }} accessibilityRole="button">
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T>{g.name}</T><T size={14} color={th.muted}>{money(saved)} of {money(g.target)}</T></View>
                <Bar parts={[{ pct, color: th.accent }]} />
              </Pressable>
            );
          }) : <Row first label="Start a goal" onPress={() => nav.push('goal', {})} />}
        </Card>
      );
    }
    if (c.id === 'networth') {
      const nw = netWorth(data, { flows, homePerUnit });
      return (
        <Card key="networth" onPress={() => nav.push('accounts')}>
          <T size={13} color={th.muted}>Net worth</T>
          <Balance value={nw.total} size={22} />
          <T size={13} color={th.faint}>Accounts {money(nw.accounts)} · owed to you {money(nw.owedToMe)} · you owe {money(nw.iOwe)}</T>
        </Card>
      );
    }
    return null;
  };

  return (
    <View style={{ flex: 1, backgroundColor: th.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 16, paddingVertical: 10 }}>
        <T size={26} serif>Bag</T>
        <Pressable onPress={() => nav.push('settings')} accessibilityRole="button" accessibilityLabel="Account and settings" style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: th.accent, alignItems: 'center', justifyContent: 'center', backgroundColor: th.card }}>
          {who ? <T size={14} weight="semi" color={th.accent}>{who}</T> : <Icon name="user" size={18} color={th.accent} />}
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100, gap: 12 }}>
        <Pressable onPress={() => nav.push('accounts')} accessibilityRole="button" accessibilityLabel={`Balance ${money(total)}`}
          style={({ pressed }) => ({ backgroundColor: th.arch, borderTopLeftRadius: 160, borderTopRightRadius: 160, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, paddingTop: 34, paddingBottom: 20, paddingHorizontal: 16, alignItems: 'center', opacity: pressed ? 0.9 : 1 })}>
          <T size={12} color={th.archSub} style={{ letterSpacing: 1 }}>Balance</T>
          <Balance value={total} size={40} color={th.archInk} style={total < 0 ? { color: th.mode === 'dark' ? '#B42318' : '#FFB4AB' } : null} />
          {sec ? <T size={12} color={th.archSub}>{fmtApprox(sec.amount, sec.currency)}</T> : null}
        </Pressable>
        {cards.map(renderCard)}
      </ScrollView>
      <Fab onPress={() => nav.push('add', {})} />
    </View>
  );
}
