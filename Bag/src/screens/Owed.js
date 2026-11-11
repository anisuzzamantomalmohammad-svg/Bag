// Owed: one list of what you owe and what's owed to you, with filter chips,
// and a calendar of bills and repeats.
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Amount, Card, Chip, Chips, Empty, Row, Seg, T, useTheme } from '../ui/kit';
import { Fab, RecordRow, TabTitle } from '../ui/parts';
import { Calendar } from '../ui/calendar';
import { homeOf, isOpen, liveRecords, live, effectiveDate } from '../lib/ledger';
import { nextDates } from '../lib/repeats';
import { addDays, fmtDate, lastDayOfMonth, today } from '../lib/dates';
import { round2 } from '../lib/money';
import { useSwipeAction } from './Home';

const FILTERS = [['all', 'All open'], ['owed', 'Owed to me'], ['iowe', 'I owe'], ['overdue', 'Overdue'], ['settled', 'Settled']];

export default function Owed() {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const insets = useSafeAreaInsets();
  const { data } = app;
  const swipe = useSwipeAction();
  const now = today();
  const [view, setView] = useState('list');
  const [filter, setFilter] = useState('all');
  const [month, setMonth] = useState(now.slice(0, 7));
  const [day, setDay] = useState(now);

  const debts = useMemo(() => liveRecords(data).filter((r) => r.type === 'iowe' || r.type === 'owed'), [data.records]);
  const open = debts.filter(isOpen);
  const totals = useMemo(() => {
    const t = { owed: 0, iowe: 0, owedPeople: new Set(), overdue: 0 };
    open.forEach((r) => {
      t[r.type] += homeOf(r);
      if (r.type === 'owed' && r.who) t.owedPeople.add(r.who.trim().toLowerCase());
      if ((r.dueDate || r.date) < now) t.overdue += 1;
    });
    return { ...t, owed: round2(t.owed), iowe: round2(t.iowe) };
  }, [debts]);

  const list = useMemo(() => {
    if (filter === 'settled') return debts.filter((r) => r.status === 'settled').sort((a, b) => (effectiveDate(a) < effectiveDate(b) ? 1 : -1));
    return open
      .filter((r) => (filter === 'all' ? true : filter === 'overdue' ? (r.dueDate || r.date) < now : r.type === filter))
      .sort((a, b) => ((a.dueDate || a.date) < (b.dueDate || b.date) ? -1 : 1));
  }, [debts, filter]);

  // Calendar marks: bills you owe in red, money owed to you in ink, repeats in the accent.
  const marks = useMemo(() => {
    const m = {};
    const add = (d, c) => { (m[d] = m[d] || []).includes(c) || m[d].push(c); };
    const from = `${month}-01`;
    const to = lastDayOfMonth(month);
    open.forEach((r) => { const d = r.dueDate || r.date; if (d >= from && d <= to) add(d, r.type === 'iowe' ? th.out : th.ink); });
    live(data.repeats).forEach((rep) => {
      if (rep.paused) return;
      nextDates(rep, from < now ? now : from, to).forEach((d) => { if (!data.records[`rep_${rep.id}_${d}`]) add(d, th.accent); });
    });
    return m;
  }, [debts, data.repeats, month, th]);

  const dayItems = useMemo(() => {
    const items = open.filter((r) => (r.dueDate || r.date) === day).map((r) => ({ key: r.id, record: r }));
    live(data.repeats).forEach((rep) => {
      if (rep.paused || day < now) return;
      if (nextDates(rep, day, day).length && !data.records[`rep_${rep.id}_${day}`]) items.push({ key: `v_${rep.id}`, repeat: rep });
    });
    return items;
  }, [debts, data.repeats, day]);

  const addType = filter === 'owed' ? 'owed' : 'iowe';

  return (
    <View style={{ flex: 1, backgroundColor: th.bg, paddingTop: insets.top }}>
      <TabTitle title="Owed" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100, gap: 12 }}>
        <Card style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable style={{ flex: 1 }} onPress={() => { setView('list'); setFilter(filter === 'owed' ? 'all' : 'owed'); }} accessibilityRole="button" accessibilityLabel="Show money owed to me">
            <T size={12} color={th.muted} style={{ letterSpacing: 0.8 }}>Owed to me</T>
            <Amount value={totals.owed} kind="neutral" size={20} serif plus={false} />
            <T size={13} color={th.faint}>{totals.owedPeople.size} {totals.owedPeople.size === 1 ? 'person' : 'people'}</T>
          </Pressable>
          <Pressable style={{ flex: 1 }} onPress={() => { setView('list'); setFilter(totals.overdue ? 'overdue' : filter === 'iowe' ? 'all' : 'iowe'); }} accessibilityRole="button" accessibilityLabel="Show what I owe">
            <T size={12} color={th.muted} style={{ letterSpacing: 0.8 }}>I owe</T>
            <Amount value={totals.iowe} kind="neutral" size={20} serif plus={false} />
            <T size={13} color={totals.overdue ? th.out : th.faint}>{totals.overdue ? `${totals.overdue} overdue` : 'Nothing overdue'}</T>
          </Pressable>
        </Card>
        <Seg items={[{ id: 'list', label: 'List' }, { id: 'calendar', label: 'Calendar' }]} value={view} onChange={setView} />

        {view === 'list' ? (
          <>
            <Chips>{FILTERS.map(([f, l]) => <Chip key={f} label={l} on={filter === f} onPress={() => setFilter(f)} />)}</Chips>
            {list.length ? (
              <Card pad={0} style={{ paddingHorizontal: 16, paddingVertical: 2 }}>
                {list.map((r, i) => <RecordRow key={r.id} record={r} first={i === 0} onPress={() => nav.push('record', { id: r.id })} onSwipe={swipe} />)}
              </Card>
            ) : (
              <Empty
                title={filter === 'settled' ? 'Nothing settled yet' : filter === 'overdue' ? 'Nothing overdue' : 'All clear'}
                text={filter === 'settled' ? 'Debts you mark paid or received show here.' : 'Add a bill you need to pay, or money someone owes you.'}
                action={filter === 'settled' || filter === 'overdue' ? undefined : filter === 'owed' ? 'Add money owed to me' : 'Add something I owe'}
                onAction={() => nav.push('add', { type: addType })}
              />
            )}
          </>
        ) : (
          <>
            <Card>
              <Calendar month={month} onMonth={setMonth} value={day} onPick={setDay} marks={marks} weekStart={data.weekStart === 0 ? 0 : data.weekStart || 1} />
              <View style={{ flexDirection: 'row', gap: 14, justifyContent: 'center', marginTop: 8 }}>
                {[[th.out, 'I owe'], [th.ink, 'Owed to me'], [th.accent, 'Repeats']].map(([c, l]) => (
                  <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} /><T size={12} color={th.muted}>{l}</T></View>
                ))}
              </View>
            </Card>
            <Card pad={0} style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 2 }}>
              <T size={13} weight="semi" color={th.muted}>{fmtDate(day, { weekday: true, year: false })}</T>
              {dayItems.length ? dayItems.map((it, i) => (it.record
                ? <RecordRow key={it.key} record={it.record} first={i === 0} onPress={() => nav.push('record', { id: it.record.id })} />
                : <Row key={it.key} first={i === 0} minHeight={60} label={it.repeat.template.name || 'Repeat'} sub="Repeats" onPress={() => nav.push('repeat', { id: it.repeat.id })} chevron={false}
                  value={<Amount value={it.repeat.template.type === 'income' ? it.repeat.template.amount : -it.repeat.template.amount} currency={it.repeat.template.currency} />} />))
                : <T size={14} color={th.faint} style={{ paddingVertical: 12 }}>{day < now ? 'Nothing was due' : 'Nothing due'}</T>}
            </Card>
          </>
        )}
      </ScrollView>
      <Fab onPress={() => nav.push('add', view === 'calendar' ? { type: 'iowe', prefill: { dueDate: day >= now ? day : addDays(now, 7) } } : { type: addType })} label="Add" />
    </View>
  );
}
