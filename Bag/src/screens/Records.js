// Records: everything between two dates, grouped by day, with type chips,
// search, and More for category and account. Export sits in the header.
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Amount, Card, Chip, Field, Icon, T, useTheme } from '../ui/kit';
import { Fab, IconButton, RecordRow, TabTitle } from '../ui/parts';
import { effectiveDate, filterRecords, flowsOf, live } from '../lib/ledger';
import { fmtDate, periodOf, today } from '../lib/dates';
import { round2 } from '../lib/money';
import { rangeLabel } from './Sheets';
import { useSwipeAction } from './Home';

const TYPE_CHIPS = [['all', 'All'], ['expense', 'Expenses'], ['income', 'Income'], ['iowe', 'I owe'], ['owed', 'Owed to me'], ['transfer', 'Transfers']];

export default function Records({ nonce, counts: startCounts, from: startFrom, to: startTo, type: startType, accountId: startAccount }) {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const insets = useSafeAreaInsets();
  const { data } = app;
  const swipe = useSwipeAction();
  const month = periodOf(today(), 'month', { monthStart: data.monthStartDay || 1 });
  const [from, setFrom] = useState(month.from);
  const [to, setTo] = useState(month.to);
  const [type, setType] = useState('all');
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [more, setMore] = useState(false);
  const [categoryId, setCategoryId] = useState(null);
  const [accountId, setAccountId] = useState(null);
  // Cash in / cash out only, when opened from a total.
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    if (!nonce) return;
    if (startFrom !== undefined || startTo !== undefined) { setFrom(startFrom || null); setTo(startTo || null); }
    setCounts(startCounts || null);
    setType(startType || 'all');
    setAccountId(startAccount || null);
  }, [nonce]);

  const list = useMemo(() => {
    const all = filterRecords(data, { from, to, type, q, categoryId, accountId });
    if (!counts) return all;
    return all.filter((r) => flowsOf(r).some((f) => f.count === counts && (!from || f.date >= from) && (!to || f.date <= to)));
  }, [data.records, from, to, type, q, categoryId, accountId, counts]);

  // Totals for what's shown: income and spending in the home currency.
  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    list.forEach((r) => flowsOf(r).forEach((f) => {
      if (accountId && f.accountId !== accountId) return;
      if (from && f.date < from) return;
      if (to && f.date > to) return;
      if (f.count === 'income') income += f.home;
      if (f.count === 'expense') expense -= f.home;
    }));
    return { income: round2(income), expense: round2(expense) };
  }, [list, accountId, from, to]);

  const days = useMemo(() => {
    const map = new Map();
    list.forEach((r) => {
      const d = effectiveDate(r);
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(r);
    });
    return [...map.entries()].map(([date, records]) => ({ date, records }));
  }, [list]);

  const cat = categoryId ? data.categories[categoryId] : null;
  const acc = accountId ? data.accounts[accountId] : null;
  const pickCategory = () => nav.openSheet('choice', {
    title: 'Category', value: categoryId || 'any',
    options: [{ id: 'any', label: 'Any category' }, ...live(data.categories).sort((a, b) => (a.kind === b.kind ? (a.order || 0) - (b.order || 0) : a.kind === 'expense' ? -1 : 1)).map((c) => ({ id: c.id, label: c.name, emoji: c.emoji, sub: c.kind === 'income' ? 'Income' : undefined }))],
    onPick: (id) => setCategoryId(id === 'any' ? null : id),
  });
  const pickAccount = () => nav.openSheet('choice', {
    title: 'Account', value: accountId || 'any',
    options: [{ id: 'any', label: 'Any account' }, ...live(data.accounts).map((a) => ({ id: a.id, label: a.name }))],
    onPick: (id) => setAccountId(id === 'any' ? null : id),
  });
  const filtersOn = !!(categoryId || accountId);

  const header = (
    <View style={{ gap: 12, paddingBottom: 12 }}>
      <Pressable onPress={() => nav.openSheet('range', { from, to, onPick: (a, b) => { setFrom(a); setTo(b); } })} accessibilityRole="button" accessibilityLabel={`Dates: ${rangeLabel(from, to)}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', minHeight: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: th.card, borderWidth: 1, borderColor: th.lineStrong }}>
        <Icon name="calendar" size={16} color={th.muted} />
        <T size={14} weight="medium">{rangeLabel(from, to)}</T>
        <Icon name="chevron-down" size={16} color={th.muted} />
      </Pressable>
      {searching ? <Field value={q} onChangeText={setQ} placeholder="Search names, notes, people, amounts" autoFocus autoCorrect={false} /> : null}
      {counts ? (
        <Chip label={counts === 'income' ? 'Cash in only  ✕' : 'Cash out only  ✕'} on onPress={() => setCounts(null)} style={{ alignSelf: 'flex-start' }} />
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {TYPE_CHIPS.map(([t, l]) => <Chip key={t} label={l} on={type === t} onPress={() => setType(t)} />)}
        <Chip label={filtersOn ? 'More · on' : 'More'} icon="sliders" on={more || filtersOn} onPress={() => setMore(!more)} />
      </View>
      {more ? (
        <Card pad={0} style={{ paddingHorizontal: 16 }}>
          <Pressable onPress={pickCategory} accessibilityRole="button" style={{ minHeight: 50, flexDirection: 'row', alignItems: 'center' }}>
            <T style={{ flex: 1 }}>Category</T><T size={14} color={th.muted}>{cat ? `${cat.emoji} ${cat.name}` : 'Any'}</T><Icon name="chevron-right" size={18} color={th.faint2} />
          </Pressable>
          <Pressable onPress={pickAccount} accessibilityRole="button" style={{ minHeight: 50, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: th.line }}>
            <T style={{ flex: 1 }}>Account</T><T size={14} color={th.muted}>{acc ? acc.name : 'Any'}</T><Icon name="chevron-right" size={18} color={th.faint2} />
          </Pressable>
          {filtersOn ? (
            <Pressable onPress={() => { setCategoryId(null); setAccountId(null); }} accessibilityRole="button" style={{ minHeight: 46, justifyContent: 'center', borderTopWidth: 1, borderTopColor: th.line }}>
              <T size={14} weight="medium" color={th.accent}>Clear filters</T>
            </Pressable>
          ) : null}
        </Card>
      ) : null}
      <Card style={{ flexDirection: 'row', gap: 12 }}>
        <Pressable style={{ flex: 1 }} onPress={() => setCounts(counts === 'income' ? null : 'income')} accessibilityRole="button" accessibilityLabel="Show cash in only">
          <T size={12} color={th.muted} style={{ letterSpacing: 0.8 }}>Cash in</T><Amount value={totals.income} kind="in" size={18} serif />
        </Pressable>
        <Pressable style={{ flex: 1 }} onPress={() => setCounts(counts === 'expense' ? null : 'expense')} accessibilityRole="button" accessibilityLabel="Show cash out only">
          <T size={12} color={th.muted} style={{ letterSpacing: 0.8 }}>Cash out</T><Amount value={-totals.expense} kind="out" size={18} serif />
        </Pressable>
        <View style={{ flex: 1 }}><T size={12} color={th.muted} style={{ letterSpacing: 0.8 }}>{list.length} {list.length === 1 ? 'record' : 'records'}</T><Amount value={round2(totals.income - totals.expense)} size={18} serif kind={totals.income - totals.expense < 0 ? 'out' : 'neutral'} /></View>
      </Card>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: th.bg, paddingTop: insets.top }}>
      <TabTitle title="Records">
        <IconButton name={searching ? 'x' : 'search'} label={searching ? 'Close search' : 'Search'} onPress={() => { setSearching(!searching); if (searching) setQ(''); }} />
        <IconButton name="download" label="Export to Excel" onPress={() => nav.openSheet('export', { from, to })} />
      </TabTitle>
      <FlatList
        data={days}
        keyExtractor={(d) => d.date}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
        initialNumToRender={8}
        windowSize={7}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListEmptyComponent={
          <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
            <T weight="semi">{q || filtersOn || counts || type !== 'all' ? 'Nothing matches' : 'No records in these dates'}</T>
            <T size={14} color={th.muted} center style={{ marginTop: 6 }}>{q || filtersOn || type !== 'all' ? 'Try other filters or dates.' : 'Pick other dates, or tap + to add one.'}</T>
          </Card>
        }
        renderItem={({ item }) => {
          let net = 0;
          item.records.forEach((r) => flowsOf(r).forEach((f) => { if (f.count && f.date === item.date) net += f.home; }));
          return (
            <Card pad={0} style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 2 }}>
                <T size={13} weight="semi" color={th.muted}>{fmtDate(item.date, { weekday: true, year: item.date.slice(0, 4) !== today().slice(0, 4) })}</T>
                {net ? <T size={13} color={th.faint}>{app.money(round2(net), { plus: net > 0 })}</T> : null}
              </View>
              {item.records.map((r, i) => <RecordRow key={r.id} record={r} first={i === 0} onPress={() => nav.push('record', { id: r.id })} onSwipe={swipe} />)}
            </Card>
          );
        }}
      />
      <Fab onPress={() => nav.push('add', {})} />
    </View>
  );
}
