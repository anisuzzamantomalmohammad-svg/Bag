// Records: everything between two dates, grouped by day. One Filter button
// holds type, category and account. Search looks through all time.
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Amount, Card, Chip, Chips, Field, Icon, IconBox, T, useTheme } from '../ui/kit';
import { Fab, IconButton, RecordRow, TabTitle } from '../ui/parts';
import { effectiveDate, filterRecords, flowsOf, live } from '../lib/ledger';
import { fmtDate, periodOf, today } from '../lib/dates';
import { round2 } from '../lib/money';
import { rangeLabel } from './Sheets';

const TYPES = [['all', 'Everything'], ['expense', 'Expenses'], ['income', 'Income'], ['iowe', 'I owe'], ['owed', 'Owed to me'], ['transfer', 'Transfers']];

export default function Records({ nonce, counts: startCounts, from: startFrom, to: startTo, type: startType, accountId: startAccount }) {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const insets = useSafeAreaInsets();
  const { data } = app;
  const month = periodOf(today(), 'month', { monthStart: data.monthStartDay || 1 });
  const [from, setFrom] = useState(month.from);
  const [to, setTo] = useState(month.to);
  const [type, setType] = useState('all');
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
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
    setCategoryId(null);
    setQ('');
    setSearching(false);
  }, [nonce]);

  // Searching ignores the dates, so an old record is never missed.
  const query = q.trim();
  const useFrom = query ? null : from;
  const useTo = query ? null : to;

  const list = useMemo(() => {
    const all = filterRecords(data, { from: useFrom, to: useTo, type, q: query, categoryId, accountId });
    if (!counts) return all;
    return all.filter((r) => flowsOf(r).some((f) => f.count === counts && (!useFrom || f.date >= useFrom) && (!useTo || f.date <= useTo)));
  }, [data.records, useFrom, useTo, type, query, categoryId, accountId, counts]);

  // Totals for what's shown, in the home currency.
  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    list.forEach((r) => flowsOf(r).forEach((f) => {
      if (accountId && f.accountId !== accountId) return;
      if (useFrom && f.date < useFrom) return;
      if (useTo && f.date > useTo) return;
      if (f.count === 'income') income += f.home;
      if (f.count === 'expense') expense -= f.home;
    }));
    return { income: round2(income), expense: round2(expense) };
  }, [list, accountId, useFrom, useTo]);

  // Opening balances show as a row on their date. They aren't cash in.
  const openings = useMemo(() => {
    if (counts || categoryId || (type !== 'all')) return [];
    return live(data.accounts).filter((a) => {
      if (!Number(a.opening) || !a.openingDate) return false;
      if (accountId && a.id !== accountId) return false;
      if ((useFrom && a.openingDate < useFrom) || (useTo && a.openingDate > useTo)) return false;
      return !query || `opening balance ${a.name}`.toLowerCase().includes(query.toLowerCase());
    });
  }, [data.accounts, counts, categoryId, type, accountId, useFrom, useTo, query]);

  const days = useMemo(() => {
    const map = new Map();
    const at = (d) => { if (!map.has(d)) map.set(d, { date: d, records: [], openings: [] }); return map.get(d); };
    list.forEach((r) => at(effectiveDate(r)).records.push(r));
    openings.forEach((a) => at(a.openingDate).openings.push(a));
    return [...map.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [list, openings]);

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
  const active = [type !== 'all', !!categoryId, !!accountId, !!counts].filter(Boolean).length;
  const clear = () => { setType('all'); setCategoryId(null); setAccountId(null); setCounts(null); };
  const net = round2(totals.income - totals.expense);
  const pill = { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: th.card, borderWidth: 1, borderColor: th.lineStrong };
  const row = { minHeight: 50, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: th.line };

  const header = (
    <View style={{ gap: 12, paddingBottom: 12 }}>
      {searching ? <Field value={q} onChangeText={setQ} placeholder="Search names, notes, people, amounts" autoFocus autoCorrect={false} /> : null}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {query ? (
          <View style={[pill, { borderColor: th.line }]}><T size={14} color={th.muted}>Searching all dates</T></View>
        ) : (
          <Pressable onPress={() => nav.openSheet('range', { from, to, onPick: (a, b) => { setFrom(a); setTo(b); } })} accessibilityRole="button" accessibilityLabel={`Dates: ${rangeLabel(from, to)}`} style={pill}>
            <Icon name="calendar" size={16} color={th.muted} />
            <T size={14} weight="medium">{rangeLabel(from, to)}</T>
            <Icon name="chevron-down" size={16} color={th.muted} />
          </Pressable>
        )}
        <Pressable onPress={() => setFilterOpen(!filterOpen)} accessibilityRole="button" accessibilityLabel={active ? `Filter, ${active} on` : 'Filter'} accessibilityState={{ expanded: filterOpen }} style={[pill, active ? { backgroundColor: th.chipOn, borderColor: th.chipOn } : null]}>
          <Icon name="sliders" size={16} color={active ? th.chipOnInk : th.muted} />
          <T size={14} weight="medium" color={active ? th.chipOnInk : th.ink}>{active ? `Filter · ${active}` : 'Filter'}</T>
        </Pressable>
      </View>
      {filterOpen ? (
        <Card pad={0} style={{ paddingHorizontal: 16, paddingTop: 14 }}>
          <Chips style={{ paddingBottom: 12 }}>
            {TYPES.map(([t, l]) => <Chip key={t} label={l} on={type === t} onPress={() => setType(t)} />)}
          </Chips>
          <Pressable onPress={pickCategory} accessibilityRole="button" style={row}>
            <T style={{ flex: 1 }}>Category</T><T size={14} color={th.muted}>{cat ? `${cat.emoji} ${cat.name}` : 'Any'}</T><Icon name="chevron-right" size={18} color={th.faint2} />
          </Pressable>
          <Pressable onPress={pickAccount} accessibilityRole="button" style={row}>
            <T style={{ flex: 1 }}>Account</T><T size={14} color={th.muted}>{acc ? acc.name : 'Any'}</T><Icon name="chevron-right" size={18} color={th.faint2} />
          </Pressable>
          {counts ? (
            <Pressable onPress={() => setCounts(null)} accessibilityRole="button" style={row}>
              <T style={{ flex: 1 }}>{counts === 'income' ? 'Cash in only' : 'Cash out only'}</T><Icon name="x" size={18} color={th.muted} />
            </Pressable>
          ) : null}
          {active ? (
            <Pressable onPress={clear} accessibilityRole="button" style={[row, { minHeight: 46 }]}>
              <T size={14} weight="medium" color={th.accent}>Clear all</T>
            </Pressable>
          ) : null}
        </Card>
      ) : null}
      <Card style={{ flexDirection: 'row', gap: 12 }}>
        <Pressable style={{ flex: 1 }} onPress={() => setCounts(counts === 'income' ? null : 'income')} accessibilityRole="button" accessibilityLabel="Show cash in only">
          <T size={12} color={counts === 'income' ? th.ink : th.muted} style={{ letterSpacing: 0.8 }}>Cash in</T><Amount value={totals.income} kind="in" size={18} serif />
        </Pressable>
        <Pressable style={{ flex: 1 }} onPress={() => setCounts(counts === 'expense' ? null : 'expense')} accessibilityRole="button" accessibilityLabel="Show cash out only">
          <T size={12} color={counts === 'expense' ? th.ink : th.muted} style={{ letterSpacing: 0.8 }}>Cash out</T><Amount value={-totals.expense} kind="out" size={18} serif />
        </Pressable>
        <View style={{ flex: 1 }}>
          <T size={12} color={th.muted} style={{ letterSpacing: 0.8 }}>Net</T><Amount value={net} size={18} serif kind={net < 0 ? 'out' : 'neutral'} plus={false} />
        </View>
      </Card>
      <T size={12} color={th.faint} style={{ marginHorizontal: 4, letterSpacing: 0.8 }}>{list.length} {list.length === 1 ? 'record' : 'records'}</T>
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
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 96 }}
        initialNumToRender={8}
        windowSize={7}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListEmptyComponent={
          <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
            <T weight="semi">{query || active ? 'Nothing matches' : 'No records in these dates'}</T>
            <T size={14} color={th.muted} center style={{ marginTop: 6 }}>{query ? 'Try another word.' : active ? 'Try other filters or dates.' : 'Pick other dates, or tap + to add one.'}</T>
          </Card>
        }
        renderItem={({ item }) => {
          let dayNet = 0;
          item.records.forEach((r) => flowsOf(r).forEach((f) => { if (f.count && f.date === item.date) dayNet += f.home; }));
          return (
            <Card pad={0} style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 2 }}>
                <T size={13} weight="semi" color={th.muted}>{fmtDate(item.date, { weekday: true, year: item.date.slice(0, 4) !== today().slice(0, 4) })}</T>
                {dayNet ? <T size={13} color={th.faint}>{app.money(round2(dayNet), { plus: dayNet > 0 })}</T> : null}
              </View>
              {item.records.map((r, i) => <RecordRow key={r.id} record={r} first={i === 0} onPress={() => nav.push('record', { id: r.id })} />)}
              {item.openings.map((a, i) => (
                <Pressable key={a.id} onPress={() => nav.push('account', { id: a.id })} accessibilityRole="button" accessibilityLabel={`Opening balance of ${a.name}`} style={({ pressed }) => [{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderTopWidth: i === 0 && !item.records.length ? 0 : 1, borderTopColor: th.line }, pressed && { opacity: 0.7 }]}>
                  <IconBox emoji="🏁" />
                  <View style={{ flex: 1 }}>
                    <T numberOfLines={1}>Opening balance</T>
                    <T size={13} color={th.faint} numberOfLines={1}>{a.name} · not cash in</T>
                  </View>
                  <T weight="medium" color={Number(a.opening) < 0 ? th.out : th.ink}>{app.money(Number(a.opening), { currency: a.currency })}</T>
                </Pressable>
              ))}
            </Card>
          );
        }}
      />
      <Fab onPress={() => nav.push('add', {})} />
    </View>
  );
}
