// Records: a month at a time (‹ November ›, or tap it for any months or
// dates), a heat map of the month behind the calendar icon, category chips,
// and the records down a timeline. Filter holds type and account; search
// looks through all time.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, FlatList, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Bubble, Card, Chip, Chips, Field, Icon, Squish, T, useTheme, Press as Pressable } from '../ui/kit';
import { IconButton, RecordRow, TabTint } from '../ui/parts';
import { effectiveDate, filterRecords, flowsOf, isPending, live } from '../lib/ledger';
import { groupOf } from '../lib/plan';
import { Appear, Backdrop, Count } from '../ui/live';
import { MONTHS_LONG, addMonths, fmtDate, lastDayOfMonth, parseYmd, periodOf, today } from '../lib/dates';
import { round2 } from '../lib/money';
import { accountColor, accountEmoji, alpha, catColor, tint } from '../lib/look';
import { rangeLabel } from './Sheets';

const TYPES = [['all', 'Everything'], ['expense', 'Cash out'], ['income', 'Cash in'], ['transfer', 'Move'], ['people', 'People'], ['upcoming', 'Upcoming']];

export default function Records({ nonce, counts: startCounts, from: startFrom, to: startTo, type: startType, accountId: startAccount, group: startGroup }) {
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
  // All / Bank / Cash / 🫙: every account in that group.
  const [group, setGroup] = useState('all');
  const accIds = useMemo(() => {
    if (accountId) return [accountId];
    if (group === 'all') return null;
    return live(data.accounts).filter((a) => groupOf(a) === group).map((a) => a.id);
  }, [accountId, group, data.accounts]);
  const accSet = accIds ? new Set(accIds) : null;
  const groupChips = ['bank', 'cash', 'savings'].filter((g) => live(data.accounts).some((a) => groupOf(a) === g));

  useEffect(() => {
    if (!nonce) return;
    if (startFrom !== undefined || startTo !== undefined) { setFrom(startFrom || null); setTo(startTo || null); }
    setCounts(startCounts || null);
    setType(startType || 'all');
    setAccountId(startAccount || null);
    setGroup(startGroup || 'all');
    setCategoryId(null);
    setQ('');
    setSearching(false);
  }, [nonce]);

  // Searching ignores the dates, so an old record is never missed.
  const query = q.trim();
  const useFrom = query ? null : from;
  const useTo = query ? null : to;

  const list = useMemo(() => {
    const all = filterRecords(data, { from: useFrom, to: useTo, type, q: query, categoryId, accountIds: accIds });
    if (!counts) return all;
    return all.filter((r) => flowsOf(r).some((f) => f.count === counts && (!useFrom || f.date >= useFrom) && (!useTo || f.date <= useTo)));
  }, [data.records, useFrom, useTo, type, query, categoryId, accIds, counts]);

  // Totals for what's shown, in the home currency.
  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    list.forEach((r) => flowsOf(r).forEach((f) => {
      if (accSet && !accSet.has(f.accountId)) return;
      if (useFrom && f.date < useFrom) return;
      if (useTo && f.date > useTo) return;
      if (f.count === 'income') income += f.home;
      if (f.count === 'expense') expense -= f.home;
    }));
    return { income: round2(income), expense: round2(expense) };
  }, [list, accIds, useFrom, useTo]);

  // Opening balances show as a row on their date. They aren't cash in.
  const openings = useMemo(() => {
    if (counts || categoryId || (type !== 'all')) return [];
    return live(data.accounts).filter((a) => {
      if (!Number(a.opening) || !a.openingDate) return false;
      if (accSet && !accSet.has(a.id)) return false;
      if ((useFrom && a.openingDate < useFrom) || (useTo && a.openingDate > useTo)) return false;
      return !query || `opening balance ${a.name}`.toLowerCase().includes(query.toLowerCase());
    });
  }, [data.accounts, counts, categoryId, type, accIds, useFrom, useTo, query]);

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
    options: [{ id: 'any', label: 'Any category' }, ...live(data.categories).sort((a, b) => (a.kind === b.kind ? (a.order || 0) - (b.order || 0) : a.kind === 'expense' ? -1 : 1)).map((c) => ({ id: c.id, label: c.name, emoji: c.emoji, sub: c.kind === 'income' ? 'Cash in' : undefined }))],
    onPick: (id) => setCategoryId(id === 'any' ? null : id),
  });
  const pickAccount = () => nav.openSheet('choice', {
    title: 'Account', value: accountId || 'any',
    options: [{ id: 'any', label: 'Any account' }, ...live(data.accounts).map((a) => ({ id: a.id, label: a.name }))],
    onPick: (id) => setAccountId(id === 'any' ? null : id),
  });
  const active = [type !== 'all', !!categoryId, !!accountId, !!counts].filter(Boolean).length;
  const clear = () => { setType('all'); setCategoryId(null); setAccountId(null); setGroup('all'); setCounts(null); };
  const net = round2(totals.income - totals.expense);
  const row = { minHeight: 50, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: th.line };

  // A whole calendar month? Then the title is the month and ‹ › step through.
  const wholeMonth = from && to && from.slice(8) === '01' && to === lastDayOfMonth(from.slice(0, 7));
  const stepMonth = (n) => { const f = addMonths(from, n, 1); setFrom(f); setTo(lastDayOfMonth(f.slice(0, 7))); setDayPick(null); };
  const [cal, setCal] = useState(false);
  const [more, setMore] = useState(false);
  // Select mode: hold a record, pick Select, tick others, change them together.
  const [picked, setPicked] = useState(null);
  const toggle = (id) => setPicked((cur) => { const n = { ...(cur || {}) }; if (n[id]) delete n[id]; else n[id] = true; return n; });
  const startSelect = (id) => setPicked({ [id]: true });
  const ids = picked ? Object.keys(picked) : [];
  const exitSelect = () => setPicked(null);
  const selTotal = useMemo(() => ids.reduce((t, id) => { const r = data.records[id]; if (!r || r.deleted) return t; const a = (Number(r.amount) || 0) * (Number(r.rate) || 1); return t + (r.type === 'income' ? a : r.type === 'expense' ? -a : 0); }, 0), [picked, data.records]);
  const accsAll = live(data.accounts).sort((a, b) => (a.order || 0) - (b.order || 0));
  const moveTo = (aid) => { app.patchRecords(ids, { accountId: aid }, (n) => `${n} moved to ${data.accounts[aid].name}`); exitSelect(); };
  const selMore = () => nav.openSheet('choice', {
    title: `${ids.length} picked`,
    options: [
      { id: 'cat', label: 'Change category', emoji: '🏷️' },
      { id: 'date', label: 'Move to a day', emoji: '🗓️' },
      ...(accsAll.length > 2 ? [{ id: 'acc', label: 'Move to an account', emoji: '🏦' }] : []),
      { id: 'del', label: 'Delete', emoji: '🗑' },
    ],
    onPick: (k) => setTimeout(() => {
      if (k === 'cat') {
        const first = data.records[ids[0]];
        nav.openSheet('category', { kind: first && first.type === 'income' ? 'income' : 'expense', onPick: (cid) => { app.patchRecords(ids, { categoryId: cid }, (n) => `${n} now in ${data.categories[cid].name}`); exitSelect(); } });
      }
      if (k === 'date') nav.openSheet('date', { value: today(), onPick: (d) => { app.patchRecords(ids, { date: d }, (n) => `${n} moved to ${fmtDate(d, { weekday: true, year: false })}`); exitSelect(); } });
      if (k === 'acc') nav.openSheet('account', { onPick: moveTo });
      if (k === 'del') { app.deleteRecords(ids); exitSelect(); }
    }, 250),
  });
  const [dayPick, setDayPick] = useState(null);
  const listRef = useRef(null);

  // Categories used in what's shown, biggest first, for the chips.
  const usedCats = useMemo(() => {
    const m = {};
    filterRecords(data, { from: useFrom, to: useTo, type, q: query, accountIds: accIds }).forEach((r) => { if (r.categoryId) m[r.categoryId] = (m[r.categoryId] || 0) + (Number(r.amount) || 0) * (Number(r.rate) || 1); });
    return Object.keys(m).filter((k) => data.categories[k] && !data.categories[k].deleted).sort((a, b) => m[b] - m[a]);
  }, [data.records, useFrom, useTo, type, query, accIds]);

  // The heat map: how much went out each day of the month.
  const heat = useMemo(() => {
    if (!wholeMonth) return null;
    const out = {};
    const inc = {};
    app.flows.forEach((f) => {
      if (f.date < from || f.date > to) return;
      if (accSet && !accSet.has(f.accountId)) return;
      if (f.count === 'expense') out[f.date] = (out[f.date] || 0) - f.home;
      if (f.count === 'income') inc[f.date] = true;
    });
    return { out, inc, max: Math.max(1, ...Object.values(out)) };
  }, [app.flows, from, to, accIds, wholeMonth]);
  const jumpTo = (d) => {
    setDayPick(d);
    const i = days.findIndex((x) => x.date === d);
    if (i >= 0 && listRef.current) listRef.current.scrollToIndex({ index: i, viewOffset: 12, animated: true });
  };

  const header = (
    <View style={{ gap: 12, paddingBottom: 6 }}>
      {searching ? <Field value={q} onChangeText={setQ} placeholder="Search names, notes, people, amounts" autoFocus autoCorrect={false} /> : null}
      {query ? (
        <T size={13} color={th.muted} style={{ marginHorizontal: 4 }}>Searching all dates</T>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 4 }}>
          {wholeMonth ? <IconButton name="chevron-left" label="Month before" onPress={() => stepMonth(-1)} /> : <View style={{ width: 44 }} />}
          <Pressable onPress={() => nav.openSheet('range', { from, to, onPick: (a, b) => { setFrom(a); setTo(b); setDayPick(null); } })} accessibilityRole="button" accessibilityLabel={`Dates: ${rangeLabel(from, to)}. Tap to pick months or dates`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 36, paddingHorizontal: 14, borderRadius: 12, backgroundColor: th.card }}>
            <T serif size={wholeMonth ? 18 : 15}>{wholeMonth ? `${MONTHS_LONG[parseYmd(from).getMonth()]} ${from.slice(0, 4)}` : rangeLabel(from, to)}</T>
            <Icon name="chevron-down" size={16} color={th.faint} />
          </Pressable>
          {wholeMonth && to < today() ? <IconButton name="chevron-right" label="Next month" onPress={() => stepMonth(1)} /> : <View style={{ width: 44 }} />}
        </View>
      )}
      {groupChips.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 6, flexGrow: 1, justifyContent: 'center' }}>
          <Chip label="All" on={group === 'all' && !accountId} onPress={() => { setAccountId(null); setGroup('all'); }} />
          {groupChips.map((g) => <Chip key={g} label={g === 'bank' ? '🏦 Bank' : g === 'cash' ? '💵 Cash' : '🫙 Savings'} on={group === g && !accountId} onPress={() => { setAccountId(null); setGroup(group === g ? 'all' : g); }} />)}
          {acc ? <Chip label={acc.name} on onPress={() => setAccountId(null)} /> : null}
        </ScrollView>
      ) : null}
      <Pressable onPress={() => setMore(!more)} accessibilityRole="button" accessibilityState={{ expanded: more }} accessibilityLabel={`Cash in ${totals.income}, cash out ${totals.expense}. Tap for more`} style={{ alignItems: 'center', paddingVertical: 2 }}>
        <T size={13}>
          <Count size={13} color={th.in} value={totals.income} fmt={(v) => `▲ ${app.money(v)}`} />
          <T size={13} color={th.faint}>   ·   </T>
          <Count size={13} color={th.out} value={totals.expense} fmt={(v) => `▼ ${app.money(v)}`} />
        </T>
        {!more ? <T size={10.5} color={th.faint} style={{ marginTop: 2 }}>{dayPick ? fmtDate(dayPick, { weekday: true, year: false }) : 'Tap for the split and categories'}</T> : null}
      </Pressable>
      {more ? (
        <View style={{ paddingHorizontal: 2, gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Pressable onPress={() => { setCounts(counts === 'income' ? null : 'income'); setType('all'); }} accessibilityRole="button" accessibilityLabel="Show cash in only" hitSlop={6}>
              <T size={12.5} color={th.in} weight={counts === 'income' ? 'semi' : 'regular'}>Cash in only</T>
            </Pressable>
            <T size={12.5} color={th.faint}>{net ? `Net ${app.money(net, { plus: net > 0 })}` : ''}</T>
            <Pressable onPress={() => { setCounts(counts === 'expense' ? null : 'expense'); setType('all'); }} accessibilityRole="button" accessibilityLabel="Show cash out only" hitSlop={6}>
              <T size={12.5} color={th.out} weight={counts === 'expense' ? 'semi' : 'regular'}>Cash out only</T>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', gap: 3 }}>
            <View style={{ flex: Math.max(totals.income, 0.001), backgroundColor: th.in }} />
            <View style={{ flex: Math.max(totals.expense, 0.001), backgroundColor: th.out }} />
          </View>
        </View>
      ) : null}
      {cal && heat ? <HeatMonth from={from} to={to} heat={heat} pick={dayPick} onPick={jumpTo} ws={data.weekStart === 0 ? 0 : data.weekStart || 1} /> : null}
      {usedCats.length > 1 && (more || categoryId) ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}>
          <CatChip label="All" on={!categoryId} onPress={() => setCategoryId(null)} />
          {usedCats.map((k) => { const c = data.categories[k]; return <CatChip key={k} label={c.name} color={catColor(c)} on={categoryId === k} onPress={() => setCategoryId(categoryId === k ? null : k)} />; })}
        </ScrollView>
      ) : null}
      {filterOpen ? (
        <Card pad={0} style={{ paddingHorizontal: 16, paddingTop: 14 }}>
          <Chips style={{ paddingBottom: 12 }}>
            {TYPES.map(([t, l]) => <Chip key={t} label={l} on={type === t} onPress={() => { setType(t); setCounts(null); }} />)}
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
          <Pressable onPress={() => nav.openSheet('export', { from, to })} accessibilityRole="button" style={row}>
            <T style={{ flex: 1 }}>Export these to Excel</T><Icon name="download" size={18} color={th.muted} />
          </Pressable>
          {active ? (
            <Pressable onPress={clear} accessibilityRole="button" style={[row, { minHeight: 46 }]}>
              <T size={14} weight="medium" color={th.chipOn}>Clear all</T>
            </Pressable>
          ) : null}
        </Card>
      ) : null}
      {more ? <T size={11.5} color={th.faint} center>{list.length} {list.length === 1 ? 'record' : 'records'}{list.some(isPending) ? " · Upcoming isn't counted until it's paid" : ''} · hold one to change it</T> : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: th.bg }}>
      <TabTint tab="Records" />
      <Backdrop />
      {picked ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: insets.top + 10, paddingBottom: 6, gap: 8 }}>
          <RoundIcon name="x" label="Stop selecting" onPress={exitSelect} />
          <T size={20} serif style={{ flex: 1, textAlign: 'center' }}>{ids.length ? `${ids.length} picked` : 'Tap to pick'}</T>
          <Squish onPress={() => setPicked(Object.fromEntries(list.map((r) => [r.id, true])))} accessibilityLabel="Pick all shown" style={{ height: 40, paddingHorizontal: 12, borderRadius: 14, backgroundColor: th.soft, justifyContent: 'center' }}><T size={13} weight="medium">All</T></Squish>
        </View>
      ) : (
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 10, paddingTop: insets.top + 10, paddingBottom: 6 }}>
        <T size={26} serif style={{ flex: 1 }}>Records</T>
        {wholeMonth ? <RoundIcon name="calendar" on={cal} label={cal ? 'Hide the month calendar' : 'Show the month calendar'} onPress={() => setCal(!cal)} /> : null}
        <RoundIcon name={searching ? 'x' : 'search'} label={searching ? 'Close search' : 'Search'} onPress={() => { setSearching(!searching); if (searching) setQ(''); }} />
        <RoundIcon name="sliders" on={filterOpen || !!active} label={active ? `Filter, ${active} on` : 'Filter'} onPress={() => setFilterOpen(!filterOpen)} />
      </View>
      )}
      <FlatList
        ref={listRef}
        data={days}
        keyExtractor={(d) => d.date}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 + insets.bottom }}
        initialNumToRender={10}
        windowSize={9}
        onScrollToIndexFailed={(e) => setTimeout(() => listRef.current && listRef.current.scrollToOffset({ offset: e.averageItemLength * e.index, animated: true }), 50)}
        ListEmptyComponent={
          <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
            <T weight="semi">{query || active ? 'Nothing matches' : 'No records in these dates'}</T>
            <T size={14} color={th.muted} center style={{ marginTop: 6 }}>{query ? 'Try another word.' : active ? 'Try other filters or dates.' : 'Pick other dates, or tap + to add one.'}</T>
          </Card>
        }
        renderItem={({ item, index }) => {
          let dayNet = 0;
          item.records.forEach((r) => flowsOf(r).forEach((f) => { if (f.count && f.date === item.date) dayNet += f.home; }));
          const hl = dayPick === item.date;
          return (
            <Appear delay={60 + Math.min(index, 7) * 55} off={index > 7} style={{ paddingLeft: 20 }}>
              <View style={{ position: 'absolute', left: 5, top: index === 0 ? 14 : 0, bottom: 0, width: 2, borderRadius: 1, backgroundColor: th.line }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, marginBottom: 2 }}>
                <View style={{ position: 'absolute', left: -19, top: 3, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: th.lineB, backgroundColor: hl ? th.lineB : th.bg }} />
                <T size={12.5} weight={hl ? 'semi' : 'regular'} color={hl ? th.ink : th.muted}>{fmtDate(item.date, { weekday: true, year: item.date.slice(0, 4) !== today().slice(0, 4) })}</T>
                {dayNet ? <T size={12.5} color={th.faint}>{dayNet > 0 ? '▲' : '▼'} {app.money(round2(dayNet), { plus: dayNet > 0 })}</T> : null}
              </View>
              {item.records.map((r, i) => <RecordRow key={r.id} record={r} first={i === 0} onPress={() => nav.push('record', { id: r.id })} select={picked ? { mode: true, on: !!picked[r.id], toggle } : null} onSelectStart={startSelect} />)}
              {item.openings.map((a) => (
                <Squish key={a.id} onPress={() => nav.push('account', { id: a.id })} accessibilityLabel={`Opening balance of ${a.name}`} style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 8 }}>
                  <Bubble emoji="🏁" color="#9AA7B6" />
                  <View style={{ flex: 1 }}>
                    <T numberOfLines={1}>Opening balance</T>
                    <T size={12.5} color={th.faint} numberOfLines={1}>{a.name} · not cash in</T>
                  </View>
                  <T weight="medium" color={Number(a.opening) < 0 ? th.out : th.ink}>{app.money(Number(a.opening), { currency: a.currency })}</T>
                </Squish>
              ))}
            </Appear>
          );
        }}
      />
      {picked ? (
        <View style={{ position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 86, backgroundColor: th.mode === 'dark' ? '#1E2733' : '#FFFFFF', borderRadius: 22, padding: 12, gap: 10, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 12, zIndex: 30 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T size={13} color={th.muted}><T size={13} weight="semi">{ids.length}</T> picked</T>
            <T size={13} weight="semi" color={selTotal < 0 ? th.out : th.in}>{app.money(selTotal, { plus: selTotal > 0 })}</T>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {accsAll.slice(0, 2).map((a) => (
              <Squish key={a.id} onPress={() => ids.length && moveTo(a.id)} accessibilityLabel={`Move picked to ${a.name}`} style={{ flex: 1, height: 44, borderRadius: 14, backgroundColor: alpha(accountColor(a), 0.18), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: ids.length ? 1 : 0.4 }}>
                <T size={15}>{accountEmoji(a)}</T><T size={13.5} weight="medium" color={tint(accountColor(a), th.mode === 'dark' ? 0.25 : -0.35)}>To {a.name}</T>
              </Squish>
            ))}
            <Squish onPress={() => ids.length && selMore()} accessibilityLabel="More for picked" style={{ width: 70, height: 44, borderRadius: 14, backgroundColor: th.soft, alignItems: 'center', justifyContent: 'center', opacity: ids.length ? 1 : 0.4 }}>
              <T size={13.5} weight="medium" color={th.muted}>More</T>
            </Squish>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function RoundIcon({ name, onPress, label, on }) {
  const th = useTheme();
  return (
    <Squish onPress={onPress} accessibilityLabel={label} style={{ width: 40, height: 40, borderRadius: 14, marginLeft: 8, backgroundColor: on ? th.chipOn : th.soft, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={18} color={on ? th.chipOnInk : th.muted} />
    </Squish>
  );
}

function CatChip({ label, color, on, onPress }) {
  const th = useTheme();
  return (
    <Squish onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ height: 34, paddingHorizontal: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: on ? th.chipOn : th.card }}>
      {color ? <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: color }} /> : null}
      <T size={13} weight="medium" color={on ? th.chipOnInk : th.muted}>{label}</T>
    </Squish>
  );
}

// The month as a grid. Darker red = more spent that day, a green dot =
// money came in. Days pop in one after another.
function HeatMonth({ from, to, heat, pick, onPick, ws }) {
  const th = useTheme();
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { a.setValue(0); Animated.timing(a, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }, [from]);
  const first = parseYmd(from);
  const lead = (first.getDay() - ws + 7) % 7;
  const n = Number(to.slice(8));
  const now = today();
  const names = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const cells = [];
  for (let i = 0; i < lead; i += 1) cells.push(null);
  for (let d = 1; d <= n; d += 1) cells.push(`${from.slice(0, 8)}${String(d).padStart(2, '0')}`);
  return (
    <Animated.View style={{ opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }}>
      <View style={{ flexDirection: 'row' }}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => <T key={i} size={10} color={th.faint} center style={{ width: `${100 / 7}%` }}>{names[(i + ws) % 7]}</T>)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
        {cells.map((d, i) => {
          if (!d) return <View key={`e${i}`} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
          const s = heat.out[d] || 0;
          const k = s ? 0.18 + 0.6 * Math.sqrt(s / heat.max) : 0;
          const future = d > now;
          return (
            <View key={d} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2.5 }}>
              <Pressable disabled={future} onPress={() => onPick(d)} accessibilityRole="button" accessibilityLabel={`${fmtDate(d, { weekday: true, year: false })}${s ? `, spent ${s.toFixed(2)}` : ''}`}
                style={{ flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: s ? alpha(th.out, k) : future ? 'transparent' : th.card,
                  borderWidth: d === now || d === pick ? 1.5 : 0, borderColor: d === pick ? th.ink : th.chipOn, transform: [{ scale: d === pick ? 1.08 : 1 }] }}>
                <T size={11.5} color={s ? '#FFFFFF' : future ? th.disabled : th.muted}>{Number(d.slice(8))}</T>
                {heat.inc[d] ? <View style={{ position: 'absolute', bottom: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: th.in }} /> : null}
              </Pressable>
            </View>
          );
        })}
      </View>
      <T size={11.5} color={th.faint} center style={{ marginTop: 6 }}>Darker = more spent · dot = money came in · tap a day</T>
    </Animated.View>
  );
}
