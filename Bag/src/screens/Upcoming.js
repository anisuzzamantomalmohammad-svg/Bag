// Upcoming: everything not paid yet, in one list. Overdue first, then this
// week, then later, then People (lent and borrowed). At the top: what you'll
// have at the end of the month once it's all paid. Repeats live here too,
// and a calendar sits behind the icon at the top.
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Amount, Bubble, Card, Chip, DaysRing, Empty, Icon, Row, Squish, T, useTheme, Press as Pressable } from '../ui/kit';
import { TabTint } from '../ui/parts';
import { Calendar } from '../ui/calendar';
import { Section, comingRow } from './Home';
import { accountBalance, comingUp, daysUntil, displayName, isOpen, isPending, itemEffect, itemRecord, live, upcomingUntil, upcomingWords } from '../lib/ledger';
import { describe, nextDate } from '../lib/repeats';
import { DAY_NAMES, addDays, fmtDate, fmtShort, lastDayOfMonth, parseYmd, periodOf, today } from '../lib/dates';
import { accountEmoji, alpha, catColor } from '../lib/look';

const FILTERS = [['all', 'All'], ['out', 'Cash out'], ['in', 'Cash in'], ['people', 'People'], ['repeats', 'Repeats']];

function Repeats() {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const reps = live(app.data.repeats).map((r) => ({ r, next: r.paused ? null : nextDate(r, addDays(today(), -1)) || null }))
    .sort((a, b) => (a.r.paused !== b.r.paused ? (a.r.paused ? 1 : -1) : (a.next || '9') < (b.next || '9') ? -1 : 1));
  if (!reps.length) {
    return <Empty title="Nothing repeats yet" text="Rent, salary, the phone bill: add a record and set Repeats under More options. Each one waits here until you mark it paid." action="Add a record" onAction={() => nav.push('add', {})} />;
  }
  return (
    <>
      <Card pad={0} style={{ paddingHorizontal: 16, paddingVertical: 2 }}>
        {reps.map(({ r, next }, i) => {
          const t = r.template || {};
          const cat = app.data.categories[t.categoryId];
          return (
            <Row key={r.id} first={i === 0} minHeight={64} left={<Bubble emoji={t.type === 'transfer' ? '🔀' : cat && !cat.deleted ? cat.emoji : '🔁'} color={catColor(cat)} />}
              label={displayName(t, app.data) || 'Repeat'}
              sub={<T size={13} color={th.faint} numberOfLines={1}>{r.paused ? 'Paused' : `${describe(r)}${next ? ` · next ${fmtShort(next)}${daysUntil(today(), next) > 0 ? `, in ${daysUntil(today(), next)} ${daysUntil(today(), next) === 1 ? 'day' : 'days'}` : ''}` : ' · ended'}`}</T>}
              value={<Amount value={t.type === 'income' || t.type === 'owed' ? t.amount : -t.amount} kind={t.type === 'income' ? 'in' : t.type === 'transfer' || t.type === 'owed' || t.type === 'iowe' ? 'neutral' : 'out'} currency={t.currency} muted={r.paused} />}
              onPress={() => nav.push('repeat', { id: r.id })} chevron={false} />
          );
        })}
      </Card>
      <T size={13} color={th.faint} style={{ marginHorizontal: 4 }}>To add a repeat, add a record and set Repeats under More options.</T>
    </>
  );
}

export default function Upcoming({ nonce, filter: startFilter }) {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const insets = useSafeAreaInsets();
  const { data, flows, homePerUnit } = app;
  const now = today();
  const [view, setView] = useState('list');
  const [filter, setFilter] = useState(startFilter || 'all');
  const [month, setMonth] = useState(now.slice(0, 7));
  const [day, setDay] = useState(now);
  useEffect(() => { if (nonce) { setFilter(startFilter || 'all'); setView('list'); } }, [nonce]);

  const balance = useMemo(() => live(data.accounts).reduce((s, a) => s + accountBalance(data, a, { flows, homePerUnit }).home, 0), [data.accounts, flows, homePerUnit]);
  const monthEnd = periodOf(now, 'month', { monthStart: data.monthStartDay || 1 }).to;
  const ahead = useMemo(() => upcomingUntil(data, monthEnd, now), [data.records, data.repeats, monthEnd]);
  const weekEnd = periodOf(now, 'week', { weekStart: data.weekStart === 0 ? 0 : data.weekStart || 1 }).to;

  // Everything for the next 5 weeks, plus People with no due date.
  const items = useMemo(() => comingUp(data, { days: 35, now }), [data.records, data.repeats]);
  const shown = items.filter((it) => {
    if (filter === 'all') return true;
    if (filter === 'people') return it.kind === 'due' || it.kind === 'owedToMe';
    const e = itemEffect(it);
    return filter === 'out' ? e < 0 : filter === 'in' ? e > 0 : true;
  });
  const groups = [
    ['Overdue', shown.filter((it) => (it.kind === 'upcoming' || it.kind === 'repeat') && it.date < now)],
    ['Today', shown.filter((it) => (it.kind === 'upcoming' || it.kind === 'repeat') && it.date === now)],
    ['This week', shown.filter((it) => (it.kind === 'upcoming' || it.kind === 'repeat') && it.date > now && it.date <= weekEnd)],
    ['Later', shown.filter((it) => (it.kind === 'upcoming' || it.kind === 'repeat') && it.date > weekEnd)],
    ['People', shown.filter((it) => it.kind === 'due' || it.kind === 'owedToMe')],
  ].filter(([, list]) => list.length);

  const open = (it) => {
    if (it.record) nav.push('record', { id: it.record.id });
    else if (it.repeat) nav.push('repeat', { id: it.repeat.id });
  };
  // A row: ring with days left, name, amount. Tap for Paid / Skip and the
  // details; hold to change it.
  const [openKey, setOpenKey] = useState(null);
  const rowFor = (it) => {
    const row = comingRow(it, data);
    const r = itemRecord(it);
    const cat = data.categories[r.categoryId];
    const due = it.kind === 'due' || it.kind === 'owedToMe' ? r.dueDate : it.date;
    const days = due ? daysUntil(now, due) : null;
    const toJar = r.type === 'transfer' && data.accounts[r.toAccountId] && data.accounts[r.toAccountId].kind === 'savings';
    const emoji = toJar ? '🫙' : r.type === 'transfer' ? '🔀' : cat && !cat.deleted ? cat.emoji : it.kind === 'owedToMe' || it.kind === 'due' ? '🤝' : '🏷️';
    const isOpenRow = openKey === it.key;
    const rec = it.record;
    const acc = data.accounts[r.accountId];
    const rep = r.repeatId ? data.repeats[r.repeatId] : it.repeat;
    const tags = [fmtShort(due || it.date, { weekday: true }), rep && !rep.deleted ? `🔁 ${describe(rep)}` : null, acc ? `${accountEmoji(acc)} ${acc.name}` : null, cat && !cat.deleted ? `${cat.emoji} ${cat.name}` : null].filter(Boolean);
    const hold = () => { if (rec) nav.openSheet('change', { id: rec.id }); else if (it.repeat) nav.push('repeat', { id: it.repeat.id }); };
    const btn = (label, go, strong) => (
      <Pressable key={label} onPress={go} accessibilityRole="button" style={{ flex: 1, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: strong ? th.warnBtn : th.soft }}>
        <T size={13} weight={strong ? 'semi' : 'medium'} color={strong ? th.warnBtnInk : th.muted}>{label}</T>
      </Pressable>
    );
    const acts = [];
    if (rec && isPending(rec)) {
      acts.push(btn(rec.type === 'income' ? 'Got it' : toJar ? 'Saved it' : rec.type === 'transfer' ? 'Moved' : 'Paid', () => { setOpenKey(null); app.markPaid(rec.id); }, true));
      if (rec.repeatId) acts.push(btn('Skip this one', () => { setOpenKey(null); app.skipPending(rec.id); }));
    }
    if (rec && isOpen(rec)) acts.push(btn(rec.type === 'iowe' ? 'Paid back' : 'Got it back', () => nav.openSheet('settle', { id: rec.id }), true));
    acts.push(btn('Open', () => open(it)));
    return (
      <View key={it.key} style={{ borderRadius: 16, marginTop: 6, backgroundColor: isOpenRow ? th.card : alpha(toJar ? th.gold : catColor(cat), 0.06) }}>
        <Squish onPress={() => setOpenKey(isOpenRow ? null : it.key)} onLongPress={hold} delayLongPress={350} accessibilityLabel={`${row.name}, ${app.money(row.value)}, ${row.sub}. Tap for Paid, hold to change`} style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9, paddingHorizontal: 10 }}>
          <Bubble emoji={emoji} color={toJar ? th.gold : catColor(cat)} size={36} />
          <View style={{ flex: 1 }}>
            <T size={14.5} numberOfLines={1}>{row.name}</T>
            <T size={11.5} color={row.tone === 'warn' ? th.warn : th.faint} numberOfLines={1}>{days !== null && days < 0 ? `${-days} ${days === -1 ? 'day' : 'days'} late` : fmtShort(due || it.date, { weekday: true })}</T>
          </View>
          {toJar ? <T size={14} weight="medium" color={th.gold}>{app.money(row.value, { currency: row.currency, plus: true })}</T> : <Amount value={row.value} kind={row.kind} currency={row.currency} size={14} />}
          {days !== null && days > 0 ? <DaysRing days={days} color={toJar ? th.gold : catColor(cat)} /> : null}
        </Squish>
        {isOpenRow ? (
          <View style={{ paddingHorizontal: 10, paddingBottom: 10, gap: 8 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 47 }}>
              {tags.map((t) => <View key={t} style={{ backgroundColor: th.soft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}><T size={11.5} color={th.muted}>{t}</T></View>)}
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>{acts}</View>
          </View>
        ) : null}
      </View>
    );
  };

  // Calendar: each day marked in the colour of what's due.
  const marks = useMemo(() => {
    const m = {};
    const from = `${month}-01`;
    const to = lastDayOfMonth(month);
    const all = comingUp(data, { days: Math.max(60, Math.round((Date.parse(to) - Date.parse(now)) / 86400000)), now });
    all.forEach((it) => {
      const d = it.kind === 'due' || it.kind === 'owedToMe' ? itemRecord(it).dueDate : it.date;
      if (!d || d < from || d > to) return;
      const e = itemEffect(it);
      const c = e > 0 ? th.in : e < 0 ? catColor(data.categories[itemRecord(it).categoryId]) : th.ink;
      (m[d] = m[d] || []).includes(c) || m[d].push(c);
    });
    return m;
  }, [data.records, data.repeats, month, th]);
  const dayItems = useMemo(() => comingUp(data, { days: Math.max(0, Math.round((Date.parse(day) - Date.parse(now)) / 86400000)), now })
    .filter((it) => (it.kind === 'due' || it.kind === 'owedToMe' ? itemRecord(it).dueDate === day : it.date === day)), [data.records, data.repeats, day]);

  // The strip: the next 3 weeks, a dot on each day something's due.
  const strip = useMemo(() => {
    const dots = {};
    comingUp(data, { days: 21, now, people: false }).forEach((it) => {
      const d = it.date < now ? now : it.date;
      if (!dots[d]) dots[d] = catColor(data.categories[itemRecord(it).categoryId]);
    });
    return Array.from({ length: 21 }, (_, i) => { const d = addDays(now, i); return { d, dot: dots[d] }; });
  }, [data.records, data.repeats]);
  const [stripDay, setStripDay] = useState(null);
  const [cardOpen, setCardOpen] = useState(false);
  const stripItems = stripDay ? comingUp(data, { days: Math.max(0, daysUntil(now, stripDay)), now, people: false }).filter((it) => (it.date < now ? now : it.date) === stripDay) : [];

  const after = balance + ahead.total;
  const toPay = ahead.items.filter((it) => itemEffect(it) < 0);

  return (
    <View style={{ flex: 1, backgroundColor: th.bg }}>
      <TabTint tab="Upcoming" />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 12, paddingTop: insets.top + 10, paddingBottom: 6 }}>
        <T size={28} serif style={{ flex: 1 }}>Upcoming</T>
        <Squish onPress={() => setView(view === 'calendar' ? 'list' : 'calendar')} accessibilityLabel={view === 'calendar' ? 'Show the list' : 'Show the calendar'} style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: view === 'calendar' ? th.chipOn : th.soft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="calendar" size={18} color={view === 'calendar' ? th.chipOnInk : th.muted} />
        </Squish>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 + insets.bottom }}>
        <View style={{ borderRadius: 24, padding: 16, marginTop: 8, overflow: 'hidden', borderWidth: 1, borderColor: th.roseBorder }}>
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
            <Defs><LinearGradient id="rose" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={th.roseA} /><Stop offset="1" stopColor={th.roseB} /></LinearGradient></Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#rose)" />
          </Svg>
          <Pressable onPress={() => setCardOpen(!cardOpen)} accessibilityRole="button" accessibilityState={{ expanded: cardOpen }} accessibilityLabel={`By ${fmtShort(monthEnd)} you'll have ${app.money(after)}. Tap for the next 3 weeks`} style={{ alignItems: 'center' }}>
            <T size={10.5} color={th.muted} style={{ letterSpacing: 1.2 }}>BY {fmtShort(monthEnd).toUpperCase()} YOU'LL HAVE</T>
            <T size={36} serif color={after < 0 ? th.out : th.ink} style={{ lineHeight: 44 }}>{app.money(after)}</T>
            {cardOpen ? <T size={12.5} color={th.muted} center>{app.money(balance)} now{ahead.count ? `, after ${upcomingWords(ahead, data, app.money)}` : ', nothing else due this month'}</T>
              : <T size={11} color={th.faint}>Tap for the next 3 weeks</T>}
          </Pressable>
          {cardOpen ? (
          <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14, marginHorizontal: -6 }} contentContainerStyle={{ gap: 4, paddingHorizontal: 6 }}>
            {strip.map(({ d, dot }) => {
              const sel = stripDay ? stripDay === d : d === now;
              return (
                <Pressable key={d} onPress={() => setStripDay(stripDay === d ? null : d)} accessibilityRole="button" accessibilityLabel={`${fmtDate(d, { weekday: true, year: false })}${dot ? ', something due' : ''}`}
                  style={{ width: 36, paddingVertical: 6, borderRadius: 12, alignItems: 'center', gap: 3, backgroundColor: sel ? (th.mode === 'dark' ? 'rgba(214,227,240,0.12)' : 'rgba(14,19,26,0.06)') : 'transparent' }}>
                  <T size={10} color={th.faint}>{DAY_NAMES[parseYmd(d).getDay()][0]}</T>
                  <T size={12.5} weight={sel ? 'semi' : 'regular'}>{parseYmd(d).getDate()}</T>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot || 'transparent' }} />
                </Pressable>
              );
            })}
          </ScrollView>
          {stripDay ? (
            <View style={{ marginTop: 8 }}>
              {stripItems.length ? stripItems.map((it) => { const rw = comingRow(it, data); return <T key={it.key} size={13} color={th.muted}>{rw.name} <T size={13} color={rw.kind === 'in' ? th.in : th.out}>{app.money(rw.value, { plus: rw.kind === 'in' })}</T></T>; })
                : <T size={13} color={th.faint}>Nothing due {fmtDate(stripDay, { weekday: true, year: false })}</T>}
            </View>
          ) : null}
        {toPay.length ? (
          <View style={{ marginTop: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T size={13} color={th.muted}>Still to pay this month</T><T size={13} color={th.muted}>{app.money(ahead.out)}</T></View>
            <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 3, marginTop: 8 }}>
              {toPay.map((it) => { const rec = itemRecord(it); return <View key={it.key} style={{ flex: Math.abs(itemEffect(it)), backgroundColor: catColor(data.categories[rec.categoryId]), opacity: it.date < now ? 1 : 0.6, borderRadius: 3 }} />; })}
            </View>
          </View>
        ) : null}
          </>
          ) : null}
        </View>

        {view === 'list' ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 18, marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 6 }}>
              {FILTERS.map(([f, l]) => <Chip key={f} label={l} on={filter === f} onPress={() => setFilter(f)} />)}
            </ScrollView>
            {filter === 'repeats' ? <View style={{ marginTop: 12, gap: 10 }}><Repeats /></View> : groups.length ? groups.map(([title, list]) => (
              <View key={title}>
                <Section title={title === 'Overdue' ? `⚠ ${title}` : title} />
                {list.map(rowFor)}
              </View>
            )) : (
              <Empty
                style={{ marginTop: 12 }}
                title="Nothing upcoming"
                text={filter === 'people' ? 'Nobody owes you, and you don\'t owe anyone. Add it with + and People.' : 'Add a record with a later date, or set it to repeat, and it waits here until you mark it paid.'}
                action="Add a record"
                onAction={() => nav.push('add', filter === 'people' ? { type: 'owed' } : { upcoming: true })}
              />
            )}
            {filter === 'people' ? (
              <Pressable onPress={() => nav.setTab('Records', { type: 'people' })} accessibilityRole="button" style={{ alignSelf: 'center', padding: 8 }}>
                <T size={14} weight="medium" color={th.chipOn}>See paid back</T>
              </Pressable>
            ) : null}
          </>
        ) : (
          <View style={{ gap: 12, marginTop: 16 }}>
            <Card>
              <Calendar month={month} onMonth={setMonth} value={day} onPick={setDay} marks={marks} weekStart={data.weekStart === 0 ? 0 : data.weekStart || 1} />
            </Card>
            <View>
              <T size={13} weight="semi" color={th.muted}>{fmtDate(day, { weekday: true, year: false })}</T>
              {dayItems.length ? dayItems.map(rowFor) : <T size={14} color={th.faint} style={{ paddingVertical: 12 }}>{day < now ? 'Nothing left from that day' : 'Nothing due'}</T>}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
