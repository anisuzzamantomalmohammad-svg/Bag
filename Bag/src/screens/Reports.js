// Reports: Spending, Budgets and Goals. Spending goes by week, month or the
// running total: soft bars of cash out (tap one), a donut of where it went
// (tap a slice), colour cards for the biggest categories, then the whole sum
// for the bar you picked: what you started with, cash in, cash out, what you
// have now, and what you'll have once Upcoming is paid.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Amount, Balance, Card, Chip, Row, Seg, Squish, T, useTheme } from '../ui/kit';
import { TabTint } from '../ui/parts';
import { Budgets, Goals } from './Plan';
import { alpha, catColor, tint } from '../lib/look';
import { balanceAtMonthEnds, categoryTotals, live, liveRecords, monthlySeries, openingHome, totalBalance, upcomingUntil, weeklySeries } from '../lib/ledger';
import { MONTHS, addDays, addMonths, fmtDate, fmtShort, lastDayOfMonth, monthLabel, parseYmd, periodOf, today } from '../lib/dates';
import { fmtApprox, round2 } from '../lib/money';

const short = (s) => { const d = parseYmd(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };

export default function Reports({ nonce, seg: startSeg }) {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const insets = useSafeAreaInsets();
  const { data, flows } = app;
  const view = ['weekly', 'monthly', 'cumulative'].includes(data.reportsView) ? data.reportsView : 'monthly';
  const [sel, setSel] = useState(null);
  const [showIncome, setShowIncome] = useState(false);
  const [tab, setTab] = useState(startSeg || 'spending');
  useEffect(() => { if (nonce && startSeg) setTab(startSeg); }, [nonce]);
  const now = today();
  const ws = data.weekStart === 0 ? 0 : data.weekStart || 1;

  const first = useMemo(() => {
    let min = now;
    liveRecords(data).forEach((r) => { if (r.date < min) min = r.date; });
    Object.values(data.accounts || {}).forEach((a) => { if (a && !a.deleted && a.openingDate && a.openingDate < min) min = a.openingDate; });
    return min;
  }, [data.records, data.accounts]);

  const series = useMemo(() => {
    if (view === 'weekly') {
      return weeklySeries(data, 8, { now, weekStart: ws, flows }).filter((w) => w.to >= first).map((w) => ({ ...w, key: w.from, label: short(w.from), title: `Week of ${fmtShort(w.from)}`, partial: w.current }));
    }
    const sixAgo = addMonths(`${now.slice(0, 7)}-01`, -5);
    const from = view === 'monthly' ? (sixAgo > first ? sixAgo : `${first.slice(0, 7)}-01`) : `${first.slice(0, 7)}-01`;
    const months = monthlySeries(data, from, now, flows).map((m) => ({ ...m, label: monthLabel(m.key), title: monthLabel(m.key, true) }));
    if (view === 'monthly') return months;
    let inc = 0;
    let exp = 0;
    const cum = months.map((m) => { inc += m.income; exp += m.expense; return { ...m, monthIncome: m.income, monthExpense: m.expense, income: round2(inc), expense: round2(exp), title: `Up to the end of ${monthLabel(m.key, true)}` }; });
    return cum.slice(-12);
  }, [view, flows, first, ws]);

  const idx = sel !== null && sel < series.length ? sel : series.length - 1;
  const point = series[idx] || { income: 0, expense: 0, from: now, to: now };
  const pFrom = view === 'cumulative' ? null : point.from;
  const pTo = point.to > now ? now : point.to;
  const net = round2(point.income - point.expense);
  const secNet = app.second(net, 'reports');

  // The whole sum for this point. Every line adds up to the next.
  const sum = useMemo(() => {
    const opts = { flows, homePerUnit: app.homePerUnit };
    const accs = live(data.accounts);
    const opensBy = (d) => round2(accs.reduce((t, a) => (!a.openingDate || a.openingDate <= d ? t + openingHome(a) : t), 0));
    const cum = view === 'cumulative';
    const start = cum ? opensBy(pTo) : round2(totalBalance(data, { ...opts, upTo: addDays(pFrom, -1) }));
    const openingIn = cum ? 0 : round2(accs.reduce((t, a) => (a.openingDate && a.openingDate >= pFrom && a.openingDate <= pTo ? t + openingHome(a) : t), 0));
    const end = round2(totalBalance(data, { ...opts, upTo: pTo }));
    const other = round2(end - start - openingIn - point.income + point.expense);
    const current = pTo >= now;
    let ahead = null;
    if (current) {
      const until = periodOf(now, view === 'weekly' ? 'week' : 'month', { weekStart: ws, monthStart: data.monthStartDay || 1 }).to;
      const up = upcomingUntil(data, until, now);
      ahead = { until, total: up.total, after: round2(end + up.total) };
    }
    return { start, openingIn, end, other, current, ahead };
  }, [view, pFrom, pTo, flows, data.records, data.repeats, data.accounts]);
  const firstMonth = MONTHS[parseYmd(first).getMonth()];
  const startLabel = view === 'cumulative' ? `Started with (${firstMonth} ${first.slice(0, 4)})` : view === 'weekly' ? (sum.current ? 'Started the week with' : `On ${fmtShort(pFrom)}`) : sum.current ? 'Started the month with' : `On ${fmtShort(pFrom)}`;
  const untilWord = sum.ahead ? (view === 'weekly' ? fmtDate(sum.ahead.until, { weekday: true, long: true, year: false }).split(' ')[0] : fmtShort(sum.ahead.until)) : '';

  const totals = useMemo(() => {
    const inc = series.reduce((s, x) => s + (view === 'cumulative' ? 0 : x.income), 0);
    const exp = series.reduce((s, x) => s + (view === 'cumulative' ? 0 : x.expense), 0);
    const full = series.filter((x) => !x.partial && x.to >= first);
    const avgExp = full.length ? full.reduce((s, x) => s + x.expense, 0) / full.length : 0;
    return { inc: round2(inc), exp: round2(exp), avgExp: round2(avgExp), n: full.length };
  }, [series]);

  const cats = useMemo(() => categoryTotals(data, pFrom, pTo, showIncome ? 'income' : 'expense', flows), [pFrom, pTo, flows, showIncome]);

  const balances = useMemo(() => (view === 'cumulative' ? balanceAtMonthEnds(data, `${(series[0] || { key: now.slice(0, 7) }).key}-01`, now, { flows, homePerUnit: app.homePerUnit }) : []), [view, series, flows]);

  const setView = (v) => { setSel(null); app.update({ reportsView: v }); };

  // Donut: the 5 biggest, then the rest as Other.
  const slices = useMemo(() => {
    const top = cats.slice(0, 5).map((c) => { const cat = data.categories[c.categoryId]; return { key: c.categoryId, name: cat && !cat.deleted ? cat.name : 'No category', emoji: cat && !cat.deleted ? cat.emoji : '🏷️', color: showIncome && !cat ? th.in : catColor(cat), total: c.total }; });
    const rest = cats.slice(5);
    if (rest.length) top.push({ key: 'other', name: `Other (${rest.length})`, emoji: '🏷️', color: th.faint2, total: round2(rest.reduce((t, c) => t + c.total, 0)), names: rest.map((c) => (data.categories[c.categoryId] || {}).name || 'No category').join(', ') });
    return top;
  }, [cats, showIncome, th, data.categories]);

  return (
    <View style={{ flex: 1, backgroundColor: th.bg }}>
      <TabTint tab="Reports" />
      <View style={{ paddingLeft: 20, paddingTop: insets.top + 10, paddingBottom: 6 }}><T size={28} serif>Reports</T></View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 + insets.bottom, gap: 14 }}>
        <Seg items={[{ id: 'spending', label: 'Spending' }, { id: 'budgets', label: 'Budgets' }, { id: 'goals', label: 'Goals' }]} value={tab} onChange={setTab} />
        {tab === 'budgets' ? <Budgets /> : tab === 'goals' ? <Goals /> : (
        <>
        <Seg small items={[{ id: 'weekly', label: 'Week' }, { id: 'monthly', label: 'Month' }, { id: 'cumulative', label: 'Total' }]} value={view} onChange={setView} />
        <Bars series={series} selected={idx} onSelect={(i) => setSel(i)} cumulative={view === 'cumulative'} />

        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Chip label="Cash out" on={!showIncome} onPress={() => setShowIncome(false)} />
          <Chip label="Cash in" on={showIncome} onPress={() => setShowIncome(true)} />
        </View>
        {slices.length ? <Donut slices={slices} label={showIncome ? 'CASH IN' : 'CASH OUT'} money={app.money} onOpen={(k) => k !== 'other' && k !== 'none' && nav.push('category', { id: k, from: pFrom, to: pTo })} />
          : <T size={14} color={th.faint}>{showIncome ? 'No cash in' : 'No cash out'} {view === 'cumulative' ? 'yet' : 'in this period'}</T>}

        {cats.length ? (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <T size={13} color={th.muted}>{showIncome ? 'Where most of it came from' : 'Where most of it went'}</T>
              <Pressable onPress={() => nav.setTab('Records', { counts: showIncome ? 'income' : 'expense', from: pFrom, to: pTo })} accessibilityRole="button" hitSlop={8}><T size={13} weight="medium" color={th.chipOn}>See records</T></Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
              {cats.map((c) => {
                const cat = data.categories[c.categoryId];
                const col = showIncome && !cat ? th.in : catColor(cat);
                return (
                  <Squish key={c.categoryId} onPress={() => cat && !cat.deleted && nav.push('category', { id: c.categoryId, from: pFrom, to: pTo })} accessibilityLabel={`${cat ? cat.name : 'No category'}, ${app.money(c.total)}`} style={{ width: 136, height: 150, borderRadius: 24, padding: 14, overflow: 'hidden', justifyContent: 'space-between' }}>
                    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
                      <Defs><LinearGradient id={`tc${c.categoryId}`} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={tint(col, 0.45)} /><Stop offset="1" stopColor={col} /></LinearGradient></Defs>
                      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#tc${c.categoryId})`} />
                      <Rect x="96" y="104" width="100" height="100" rx="38" fill="#FFFFFF" fillOpacity={0.22} />
                    </Svg>
                    <T size={30}>{cat && !cat.deleted ? cat.emoji : '🏷️'}</T>
                    <View>
                      <T size={13} color="#0E131A" style={{ opacity: 0.7 }} numberOfLines={1}>{cat && !cat.deleted ? cat.name : 'No category'}</T>
                      <T serif size={22} color="#0E131A">{app.money(c.total)}</T>
                      <T size={11.5} color="#0E131A" style={{ opacity: 0.7 }}>{c.count} {c.count === 1 ? 'payment' : 'payments'}</T>
                    </View>
                  </Squish>
                );
              })}
            </ScrollView>
          </>
        ) : null}

        <Card pad={0} style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 2 }}>
          <T size={13} color={th.muted} style={{ marginBottom: 2 }}>{point.title}{point.partial ? ' (so far)' : ''}</T>
          <Row first minHeight={46} label={startLabel} value={<Amount value={sum.start} kind={sum.start < 0 ? 'out' : 'neutral'} plus={false} />} chevron={false} />
          {sum.openingIn ? <Row minHeight={46} label="Opening balance" sub="Not cash in" value={<Amount value={sum.openingIn} kind={sum.openingIn < 0 ? 'out' : 'neutral'} plus={false} />} chevron={false} /> : null}
          <Row minHeight={46} label="Cash in" onPress={() => setShowIncome(true)} value={<Amount value={point.income} kind="in" />} chevron={false} accessibilityLabel="Cash in: show where it came from" />
          <Row minHeight={46} label="Cash out" onPress={() => setShowIncome(false)} value={<Amount value={-point.expense} kind="out" />} chevron={false} accessibilityLabel="Cash out: show where it went" />
          {sum.other ? <Row minHeight={46} label="Lent, borrowed, paid back" sub="Not cash in or out" onPress={() => nav.setTab('Records', { type: 'people', from: pFrom, to: pTo })} value={<Amount value={sum.other} kind="neutral" plus />} chevron={false} /> : null}
          <Row minHeight={46} label={<T weight="semi">{sum.current ? 'You have now' : `On ${fmtShort(pTo)}`}</T>} value={<Amount value={sum.end} kind={sum.end < 0 ? 'out' : 'neutral'} plus={false} />} chevron={false} onPress={() => nav.push('accounts')} />
          {sum.ahead ? (
            <>
              <Row minHeight={46} label={<T color={th.warn}>Upcoming by {untilWord}</T>} value={<Amount value={sum.ahead.total} kind={sum.ahead.total < 0 ? 'out' : sum.ahead.total > 0 ? 'in' : 'neutral'} plus />} chevron={false} onPress={() => nav.setTab('Upcoming')} />
              <Row minHeight={46} label={<T weight="semi">You'll have on {untilWord}</T>} value={<Amount value={sum.ahead.after} kind={sum.ahead.after < 0 ? 'out' : 'neutral'} plus={false} />} chevron={false} />
            </>
          ) : null}
          {secNet ? <T size={12} color={th.faint} style={{ marginBottom: 8 }}>Saved ≈ {fmtApprox(secNet.amount, secNet.currency)}</T> : null}
          {view !== 'cumulative' && totals.n > 1 ? (
            <T size={13} color={th.faint} style={{ marginBottom: 10 }}>Average cash out: {app.money(totals.avgExp)} a {view === 'weekly' ? 'week' : 'month'} over {totals.n} full {view === 'weekly' ? 'weeks' : 'months'}</T>
          ) : null}
        </Card>

        {view === 'cumulative' && balances.length ? (
          <Card pad={0} style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
            <T size={16} weight="semi" style={{ marginBottom: 4 }}>Balance at the end of each month</T>
            {balances.slice().reverse().map((b, i) => (
              <Row key={b.key} first={i === 0} minHeight={46} label={b.current ? `${monthLabel(b.key, true)} (today)` : monthLabel(b.key, true)} value={<Balance value={b.balance} size={15} />}
                onPress={() => nav.setTab('Records', { from: `${b.key}-01`, to: lastDayOfMonth(b.key) })} />
            ))}
          </Card>
        ) : null}
        </>
        )}
      </ScrollView>
    </View>
  );
}

// Soft bars of cash out (or the running total), one per week or month. Tap a
// bar to see its numbers below. They grow in one after another.
function Bars({ series, selected, onSelect, cumulative }) {
  const th = useTheme();
  const max = Math.max(1, ...series.map((x) => x.expense));
  const grow = useRef(new Animated.Value(0)).current;
  useEffect(() => { grow.setValue(0); Animated.timing(grow, { toValue: 1, duration: 800, easing: Easing.out(Easing.back(1.2)), useNativeDriver: false }).start(); }, [series.length, cumulative, max]);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 130 }}>
        {series.map((x, i) => {
          const on = i === selected;
          const h = Math.max(4, (x.expense / max) * 118);
          return (
            <Pressable key={x.key || i} onPress={() => onSelect(i)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${x.title}: cash out ${x.expense}`} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
              <Animated.View style={{ height: grow.interpolate({ inputRange: [0, 1], outputRange: [0, h] }), borderTopLeftRadius: 10, borderTopRightRadius: 10, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, overflow: 'hidden' }}>
                <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
                  <Defs><LinearGradient id={`b${i}${on ? 'on' : ''}`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={on ? th.barOnA : th.barA} /><Stop offset="1" stopColor={on ? th.barOnB : th.barB} /></LinearGradient></Defs>
                  <Rect x="0" y="0" width="100%" height="100%" fill={`url(#b${i}${on ? 'on' : ''})`} />
                </Svg>
                {x.partial ? <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: th.warn, opacity: 0.6 }} /> : null}
              </Animated.View>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
        {series.map((x, i) => <T key={x.key || i} size={10.5} center color={i === selected ? th.chipOn : th.faint} style={{ flex: 1 }} numberOfLines={1}>{x.label}</T>)}
      </View>
      <T size={11.5} color={th.faint} style={{ marginTop: 4 }}>{cumulative ? 'Cash out added up, month by month' : 'Cash out'} · tap a bar</T>
    </View>
  );
}

// Where it went, as a ring. Tap a slice or a name: it pops out and the middle
// shows that category.
function Donut({ slices, label, money, onOpen }) {
  const th = useTheme();
  const [sel, setSel] = useState(-1);
  const sweep = useRef(new Animated.Value(0)).current;
  const total = slices.reduce((t, s) => t + s.total, 0) || 1;
  useEffect(() => { setSel(-1); sweep.setValue(0); Animated.timing(sweep, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(); }, [total, slices.length]);
  const R = 50;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const s = sel >= 0 ? slices[sel] : null;
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 132, height: 132 }}>
          <Svg width={132} height={132} viewBox="0 0 132 132" style={{ transform: [{ rotate: '-90deg' }] }}>
            {slices.map((x, i) => {
              const len = (x.total / total) * C;
              const off = acc;
              acc += len;
              return (
                <AnimatedCircle key={x.key} cx={66} cy={66} r={R} fill="none" stroke={x.color} strokeWidth={sel === i ? 22 : 16} opacity={sel < 0 || sel === i ? 1 : 0.35}
                  strokeDasharray={sweep.interpolate({ inputRange: [0, 1], outputRange: [`0 ${C}`, `${Math.max(0.5, len - 2)} ${C}`] })} strokeDashoffset={-off}
                  onPress={() => setSel(sel === i ? -1 : i)} />
              );
            })}
          </Svg>
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
            <T size={10} color={th.faint} numberOfLines={1} style={{ maxWidth: 90 }}>{s ? `${s.emoji} ${s.name.replace(/ \(.*\)/, '')}`.toUpperCase() : label}</T>
            <T serif size={18}>{money(s ? s.total : total)}</T>
            {s ? <T size={10} color={th.faint}>{Math.round((s.total / total) * 100)}%</T> : null}
          </View>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          {slices.map((x, i) => (
            <Pressable key={x.key} onPress={() => setSel(sel === i ? -1 : i)} onLongPress={() => onOpen(x.key)} accessibilityRole="button" accessibilityState={{ selected: sel === i }} accessibilityLabel={`${x.name}, ${money(x.total)}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 10, backgroundColor: sel === i ? alpha(x.color, 0.16) : 'transparent' }}>
              <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: x.color }} />
              <T size={13} style={{ flex: 1 }} numberOfLines={1}>{x.name}</T>
              <T size={12.5} color={th.faint}>{Math.round((x.total / total) * 100)}%</T>
            </Pressable>
          ))}
        </View>
      </View>
      {s && s.names ? <T size={12} color={th.faint} center style={{ marginTop: 8 }}>{s.names}</T> : null}
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
