// Upcoming: a calendar on top with your bank's balance at the end of each
// day (tap a day for the sum behind it), then what's due that month, with
// anything that needs an answer first. Subscriptions and repeats at the end.
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Appear, Backdrop } from '../ui/live';
import { Amount, Bubble, Button, Card, DaysRing, Empty, Icon, Row, Squish, T, useTheme, Press as Pressable } from '../ui/kit';
import { TabTint } from '../ui/parts';
import { Section, comingRow, showComing } from './Home';
import { comingUp, daysUntil, displayName, dueToAsk, itemEffect, itemRecord, live } from '../lib/ledger';
import { forecast, isJar, marginOf } from '../lib/plan';
import { feel } from '../lib/feel';
import { describe, nextDate, nextDates } from '../lib/repeats';
import { DAY_NAMES, MONTHS_LONG, addDays, addMonths, fmtShort, lastDayOfMonth, parseYmd, today, ymd } from '../lib/dates';
import { alpha, catColor } from '../lib/look';

export function Repeats() {
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

export default function Upcoming({ nonce, day: startDay, filter: startFilter }) {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const insets = useSafeAreaInsets();
  const { data, flows, homePerUnit, money } = app;
  const now = today();
  const [month, setMonth] = useState((startDay || now).slice(0, 7));
  const [seeAll, setSeeAll] = useState(startFilter === 'people');
  const [subsOpen, setSubsOpen] = useState(false);
  const [repsOpen, setRepsOpen] = useState(false);
  useEffect(() => { if (nonce) { setMonth((startDay || now).slice(0, 7)); setSeeAll(startFilter === 'people'); } }, [nonce]);
  const ws = data.weekStart === 0 ? 0 : data.weekStart || 1;

  // Your bank, day by day, to the end of the month you're looking at.
  const monthEnd = lastDayOfMonth(month);
  const horizon = Math.max(45, daysUntil(now, monthEnd));
  const fc = useMemo(() => forecast(data, { flows, homePerUnit, now, days: horizon }), [flows, data.records, data.repeats, data.paydays, data.margin, homePerUnit, horizon]);
  const warnDays = (data.lowWarn && Number(data.lowWarn.days)) || 3;
  const margin = marginOf(data);
  const dayCalc = (d) => {
    if (!fc) return;
    const x = fc.days[d];
    if (!x) return;
    const nm = fc.account.name;
    const rows = [];
    if (x.today) rows.push({ label: "Today, after what you've spent so far", value: money(x.end), bold: true });
    else {
      rows.push({ label: `End of ${fmtShort(addDays(d, -1), { weekday: true })}`, value: money(x.start) });
      x.items.forEach((it) => rows.push({ label: `${it.emoji} ${it.name}`, value: money(it.amount, { plus: it.amount > 0 }), tone: it.kind === 'gold' ? 'gold' : it.amount > 0 ? 'in' : 'out' }));
      rows.push({ label: 'Everyday spending, your average', value: money(-fc.everyday), tone: 'out' });
      rows.push({ label: 'End of the day', value: money(x.end), bold: true, tone: x.end < 0 ? 'out' : null });
    }
    let note = null;
    let noteTone = null;
    if (!x.today && x.end < 0 && fc.firstNeg) {
      const warnOn = addDays(fc.firstNeg, -warnDays);
      note = fc.firstNeg <= now ? `Below 0. ${nm} is below 0 already.` : warnOn > now ? `Below 0. Bag warns you on ${fmtShort(warnOn, { weekday: true })}.` : 'Below 0. Bag has warned you.';
      noteTone = 'out';
    }
    const tail = `Everyday spending: your average a day from ${nm} over the last 4 weeks, not counting repeats.${margin.on && margin.accountId === fc.account.id ? ` 🛡 The ${money(margin.amount, { decimals: 0 })} margin is inside ${nm}, so it's counted here.` : ''}`;
    nav.openSheet('info', { title: `${fmtShort(d, { weekday: true })} · ${nm}`, rows, note: note ? `${note}\n${tail}` : tail, noteTone });
  };

  // The grid for this month.
  const [y, m] = month.split('-').map(Number);
  const lead = (new Date(y, m - 1, 1).getDay() - ws + 7) % 7;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= new Date(y, m, 0).getDate(); d++) cells.push(ymd(new Date(y, m - 1, d)));
  while (cells.length % 7) cells.push(null);
  const names = [0, 1, 2, 3, 4, 5, 6].map((i) => DAY_NAMES[(i + ws) % 7][0]);
  const dotColor = (k) => (k === 'gold' ? th.gold : k === 'in' ? th.in : th.out);
  const canBack = month > now.slice(0, 7);
  const canNext = month < addMonths(`${now.slice(0, 7)}-01`, 12).slice(0, 7);

  // The list: this month's (or everything coming up), each bill once a day.
  const asks = dueToAsk(data, now).filter((r) => (data.askLater || {})[r.id] !== now);
  const items = useMemo(() => comingUp(data, { days: seeAll ? 120 : Math.max(0, daysUntil(now, monthEnd)), now }), [data.records, data.repeats, seeAll, monthEnd]);
  const listed = items.filter((it) => {
    if (it.kind === 'upcoming' && it.date <= now) return false;
    const d = it.kind === 'due' || it.kind === 'owedToMe' ? itemRecord(it).dueDate : it.date;
    if (seeAll) return true;
    return !!d && d.slice(0, 7) === month;
  });
  const total = listed.reduce((t, it) => t + itemEffect(it), 0);

  const rowFor = (it, i) => {
    const row = comingRow(it, data);
    const r = itemRecord(it);
    const cat = data.categories[r.categoryId];
    const debt = it.kind === 'due' || it.kind === 'owedToMe';
    const due = debt ? r.dueDate : it.date;
    const days = due ? daysUntil(now, due) : null;
    const toJar = r.type === 'transfer' && isJar(data.accounts[r.toAccountId]);
    const emoji = toJar ? '🫙' : r.type === 'transfer' ? '🔀' : cat && !cat.deleted ? cat.emoji : debt ? '🤝' : '🏷️';
    const acc = data.accounts[r.accountId];
    const color = toJar ? th.gold : catColor(cat);
    return (
      <Appear key={it.key} delay={60 + Math.min(i, 8) * 40}>
        <Squish onPress={() => showComing(it, app, nav)} onLongPress={() => (it.record ? nav.push('record', { id: it.record.id }) : it.repeat ? nav.push('repeat', { id: it.repeat.id }) : null)} delayLongPress={350}
          accessibilityLabel={`${row.name}, ${money(row.value)}, ${row.sub}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 16, marginTop: 6, backgroundColor: alpha(color, 0.06) }}>
          <Bubble emoji={emoji} color={color} size={36} />
          <View style={{ flex: 1 }}>
            <T size={14.5} numberOfLines={1}>{row.name}</T>
            <T size={11.5} color={th.faint} numberOfLines={1}>{due ? fmtShort(due, { weekday: true }) : 'No date'}{acc ? ` · ${acc.name}` : ''}</T>
          </View>
          {toJar ? <T size={14} weight="medium" color={th.gold}>{money(row.value, { currency: row.currency })}</T> : <Amount value={row.value} kind={row.kind} currency={row.currency} size={14} />}
          {days !== null && days > 0 ? <DaysRing days={days} color={color} /> : null}
        </Squish>
      </Appear>
    );
  };

  // Subscriptions: repeats in Subscriptions or Phone, and what they cost a year.
  const subs = useMemo(() => live(data.repeats).filter((rep) => !rep.paused && rep.template && rep.template.type === 'expense' && ['subscriptions', 'phone'].includes(rep.template.categoryId)).map((rep) => {
    const n = nextDates(rep, now, addDays(now, 364)).length;
    const t = rep.template;
    return { rep, t, year: n * (Number(t.amount) || 0) };
  }).sort((a, b) => b.year - a.year), [data.repeats]);
  const subsYear = subs.reduce((t, x) => t + x.year, 0);
  const repCount = live(data.repeats).length;

  return (
    <View style={{ flex: 1, backgroundColor: th.bg }}>
      <TabTint tab="Upcoming" />
      <Backdrop />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 12, paddingTop: insets.top + 10, paddingBottom: 6 }}>
        <T size={28} serif style={{ flex: 1 }}>Upcoming</T>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 + insets.bottom }}>
        <Card pad={12} style={{ marginTop: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Pressable onPress={() => { if (canBack) { feel.tap(); setMonth(addMonths(`${month}-01`, -1).slice(0, 7)); } }} accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={6} style={{ width: 44, height: 40, alignItems: 'center', justifyContent: 'center', opacity: canBack ? 1 : 0.3 }}>
              <Icon name="chevron-left" size={22} color={th.muted} />
            </Pressable>
            <T size={16} weight="semi" center style={{ flex: 1 }}>{MONTHS_LONG[m - 1]} {y}</T>
            <Pressable onPress={() => { if (canNext) { feel.tap(); setMonth(addMonths(`${month}-01`, 1).slice(0, 7)); } }} accessibilityRole="button" accessibilityLabel="Next month" hitSlop={6} style={{ width: 44, height: 40, alignItems: 'center', justifyContent: 'center', opacity: canNext ? 1 : 0.3 }}>
              <Icon name="chevron-right" size={22} color={th.muted} />
            </Pressable>
          </View>
          {fc ? <T size={11.5} color={th.faint} center style={{ marginBottom: 6 }}>{fc.account.name} at the end of each day · tap a day</T> : null}
          <View style={{ flexDirection: 'row' }}>
            {names.map((n, i) => <T key={i} size={11} color={th.faint} center style={{ flex: 1 }}>{n}</T>)}
          </View>
          {Array.from({ length: cells.length / 7 }, (_, w) => (
            <View key={w} style={{ flexDirection: 'row', marginTop: 3 }}>
              {cells.slice(w * 7, w * 7 + 7).map((d, i) => {
                if (!d) return <View key={i} style={{ flex: 1 }} />;
                const x = fc && fc.days[d];
                const neg = x && x.end < 0;
                const isToday = d === now;
                const kinds = x ? [...new Set(x.items.map((it) => it.kind))].slice(0, 3) : [];
                return (
                  <Pressable key={d} onPress={() => { if (x) { feel.tap(); dayCalc(d); } }} accessibilityRole="button" accessibilityLabel={`${fmtShort(d, { weekday: true })}${x ? `, ${money(x.end)} at the end of the day` : ''}`}
                    style={{ flex: 1, alignItems: 'center', paddingTop: 5, paddingBottom: 4, borderRadius: 10, gap: 1, borderWidth: isToday ? 1.5 : 0, borderColor: th.chipOn, backgroundColor: neg ? alpha(th.out, 0.12) : 'transparent', opacity: d < now ? 0.35 : 1 }}>
                    <T size={13} weight={isToday ? 'semi' : 'regular'}>{parseYmd(d).getDate()}</T>
                    <T size={9.5} weight={neg ? 'semi' : 'regular'} color={neg ? th.out : th.faint} numberOfLines={1}>{x ? Math.round(x.end).toLocaleString('en-NZ') : ' '}</T>
                    <View style={{ flexDirection: 'row', gap: 2, height: 4 }}>
                      {kinds.map((k) => <View key={k} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: dotColor(k) }} />)}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 8 }}>
            {[['out', 'bill'], ['in', 'pay'], ['gold', 'save']].map(([k, l]) => (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dotColor(k) }} />
                <T size={11} color={th.faint}>{l}</T>
              </View>
            ))}
          </View>
          {!fc ? <T size={12.5} color={th.faint} center style={{ marginTop: 6 }}>Add a bank account and each day shows what it'll have.</T> : null}
        </Card>

        {asks.length ? (
          <>
            <Section title="Needs an answer" />
            {asks.slice(0, 5).map((r) => {
              const cat = data.categories[r.categoryId];
              const income = r.type === 'income';
              return (
                <View key={r.id} style={{ borderRadius: 16, marginTop: 6, padding: 10, gap: 8, backgroundColor: th.warnSoft, borderWidth: 1, borderColor: th.warnBorder }}>
                  <Pressable onPress={() => nav.push('record', { id: r.id })} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                    <Bubble emoji={cat && !cat.deleted ? cat.emoji : '🏷️'} color={catColor(cat)} size={36} />
                    <View style={{ flex: 1 }}>
                      <T size={14.5} numberOfLines={1}>{displayName(r, data)}</T>
                      <T size={11.5} color={th.warn} numberOfLines={1}>{r.date === now ? 'Due today' : `Was due ${fmtShort(r.date, { weekday: true })}`} · {income ? 'Did it arrive?' : 'Did you pay?'}</T>
                    </View>
                    <Amount value={income ? r.amount : -r.amount} kind={income ? 'in' : 'out'} currency={r.currency} size={14} />
                  </Pressable>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button label={income ? 'Got it' : 'Paid'} kind="amber" small style={{ flex: 1, minHeight: 40 }} onPress={() => { feel.done(); app.markPaid(r.id); }} />
                    <Button label="Not yet" kind="soft" small style={{ flex: 1, minHeight: 40 }} onPress={() => { feel.tap(); app.askLater(r.id); }} />
                  </View>
                </View>
              );
            })}
          </>
        ) : null}

        <Section title={seeAll ? 'Everything coming up' : `Due in ${MONTHS_LONG[m - 1]}`} action={seeAll ? 'This month only' : 'See all'} onAction={() => setSeeAll(!seeAll)} />
        {listed.length ? (
          <>
            {listed.map(rowFor)}
            <T size={12.5} color={th.faint} style={{ textAlign: 'right', marginTop: 6, marginHorizontal: 4 }}>{listed.length} {listed.length === 1 ? 'item' : 'items'} · {money(total, { plus: total > 0 })}</T>
          </>
        ) : (
          <Empty style={{ marginTop: 8 }} title="Nothing due" text="Add a record with a later date, or set it to repeat, and it waits here until you mark it paid." action="Add a record" onAction={() => nav.push('add', { upcoming: true })} />
        )}

        {subs.length ? (
          <Card pad={0} style={{ paddingHorizontal: 16, marginTop: 16 }}>
            <Row first left={<T size={20}>🔁</T>} label="Subscriptions" sub={`${subs.length} running · ${money(subsYear)} a year`} onPress={() => setSubsOpen(!subsOpen)} right={<Icon name={subsOpen ? 'chevron-up' : 'chevron-down'} size={18} color={th.faint} />} chevron={false} />
            {subsOpen ? subs.map(({ rep, t, year }) => {
              const cat = data.categories[t.categoryId];
              return <Row key={rep.id} label={`${cat && !cat.deleted ? `${cat.emoji} ` : ''}${displayName(t, data) || 'Repeat'}`} sub={`${money(t.amount, { currency: t.currency })} · ${describe(rep).toLowerCase()}`} value={`${money(year)} a year`} onPress={() => nav.push('repeat', { id: rep.id })} chevron={false} />;
            }) : null}
          </Card>
        ) : null}
        {repCount ? (
          <Card pad={0} style={{ paddingHorizontal: 16, marginTop: 10 }}>
            <Row first left={<T size={20}>🗓</T>} label="All repeats" sub={`${repCount} set up`} onPress={() => setRepsOpen(!repsOpen)} right={<Icon name={repsOpen ? 'chevron-up' : 'chevron-down'} size={18} color={th.faint} />} chevron={false} />
          </Card>
        ) : null}
        {repsOpen ? <View style={{ marginTop: 8, gap: 10 }}><Repeats /></View> : null}
      </ScrollView>
    </View>
  );
}
