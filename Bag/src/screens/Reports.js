// Reports: weekly, monthly or cumulative. Two lines, green for income and
// red for spending. Tap a point for its numbers and where the money went.
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Amount, Balance, Bar, Card, IconBox, Row, Seg, T, useTheme } from '../ui/kit';
import { TabTitle, TwoLineChart } from '../ui/parts';
import { balanceAtMonthEnds, categoryTotals, liveRecords, monthlySeries, weeklySeries } from '../lib/ledger';
import { MONTHS, addMonths, fmtShort, lastDayOfMonth, monthLabel, parseYmd, today } from '../lib/dates';
import { fmtApprox, round2 } from '../lib/money';

const short = (s) => { const d = parseYmd(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };

export default function Reports() {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const insets = useSafeAreaInsets();
  const { data, flows } = app;
  const view = ['weekly', 'monthly', 'cumulative'].includes(data.reportsView) ? data.reportsView : 'monthly';
  const [sel, setSel] = useState(null);
  const [showIncome, setShowIncome] = useState(false);
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

  const totals = useMemo(() => {
    const inc = series.reduce((s, x) => s + (view === 'cumulative' ? 0 : x.income), 0);
    const exp = series.reduce((s, x) => s + (view === 'cumulative' ? 0 : x.expense), 0);
    const full = series.filter((x) => !x.partial && x.to >= first);
    const avgExp = full.length ? full.reduce((s, x) => s + x.expense, 0) / full.length : 0;
    return { inc: round2(inc), exp: round2(exp), avgExp: round2(avgExp), n: full.length };
  }, [series]);

  const cats = useMemo(() => categoryTotals(data, pFrom, pTo, showIncome ? 'income' : 'expense', flows), [pFrom, pTo, flows, showIncome]);
  const catMax = cats.length ? cats[0].total : 1;
  const catSum = cats.reduce((s, c) => s + c.total, 0) || 1;

  const balances = useMemo(() => (view === 'cumulative' ? balanceAtMonthEnds(data, `${(series[0] || { key: now.slice(0, 7) }).key}-01`, now, { flows, homePerUnit: app.homePerUnit }) : []), [view, series, flows]);

  const setView = (v) => { setSel(null); app.update({ reportsView: v }); };

  return (
    <View style={{ flex: 1, backgroundColor: th.bg, paddingTop: insets.top }}>
      <TabTitle title="Reports" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 12 }}>
        <Seg items={[{ id: 'weekly', label: 'Weekly' }, { id: 'monthly', label: 'Monthly' }, { id: 'cumulative', label: 'Cumulative' }]} value={view} onChange={setView} />
        <Card>
          <View style={{ flexDirection: 'row', gap: 16, marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: th.in }} /><T size={13} color={th.muted}>Income</T></View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: th.out }} /><T size={13} color={th.muted}>Spending</T></View>
          </View>
          <TwoLineChart series={series} selected={idx} onSelect={(i) => setSel(i === null ? null : i)} />
          {series.some((s) => s.partial) ? <T size={12} color={th.faint2} style={{ marginTop: 4 }}>Hollow dots: this {view === 'weekly' ? 'week' : 'month'} so far</T> : null}
        </Card>

        <Card>
          <T size={13} color={th.muted}>{point.title}{point.partial ? ' (so far)' : ''}</T>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
            <Pressable style={{ flex: 1 }} onPress={() => nav.setTab('Records', { counts: 'income', from: pFrom, to: pTo })} accessibilityRole="button"><T size={12} color={th.faint} style={{ letterSpacing: 0.8 }}>Cash in</T><Amount value={point.income} kind="in" size={18} serif /></Pressable>
            <Pressable style={{ flex: 1 }} onPress={() => nav.setTab('Records', { counts: 'expense', from: pFrom, to: pTo })} accessibilityRole="button"><T size={12} color={th.faint} style={{ letterSpacing: 0.8 }}>Cash out</T><Amount value={-point.expense} kind="out" size={18} serif /></Pressable>
            <Pressable style={{ flex: 1 }} onPress={() => nav.setTab('Records', { from: pFrom, to: pTo })} accessibilityRole="button"><T size={12} color={th.faint} style={{ letterSpacing: 0.8 }}>{net >= 0 ? 'Saved' : 'Overspent'}</T><Amount value={net} kind={net < 0 ? 'out' : 'neutral'} size={18} serif plus={false} /></Pressable>
          </View>
          {secNet ? <T size={12} color={th.faint} style={{ marginTop: 6 }}>Saved ≈ {fmtApprox(secNet.amount, secNet.currency)}</T> : null}
          {view === 'cumulative' && point.monthIncome !== undefined ? (
            <T size={13} color={th.faint} style={{ marginTop: 8 }}>That month alone: {app.money(point.monthIncome, { plus: true })} in, {app.money(-point.monthExpense)} out</T>
          ) : null}
          {view !== 'cumulative' && totals.n > 1 ? (
            <T size={13} color={th.faint} style={{ marginTop: 8 }}>Average spending: {app.money(totals.avgExp)} a {view === 'weekly' ? 'week' : 'month'} over {totals.n} full {view === 'weekly' ? 'weeks' : 'months'}</T>
          ) : null}
        </Card>

        <Card pad={0} style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <T size={16} weight="semi">{showIncome ? 'Where it came from' : 'Where it went'}</T>
            <Pressable onPress={() => setShowIncome(!showIncome)} accessibilityRole="button" hitSlop={8}>
              <T size={14} weight="medium" color={th.accent}>{showIncome ? 'Show spending' : 'Show income'}</T>
            </Pressable>
          </View>
          {cats.length ? cats.map((c, i) => {
            const cat = data.categories[c.categoryId];
            const name = cat && !cat.deleted ? cat.name : 'No category';
            return (
              <Pressable key={c.categoryId} onPress={() => cat && !cat.deleted && nav.push('category', { id: c.categoryId, from: pFrom, to: pTo })} accessibilityRole="button" accessibilityLabel={`${name}, ${app.money(c.total)}`} style={({ pressed }) => [{ paddingVertical: 10, gap: 6, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: th.line }, pressed && { opacity: 0.7 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <IconBox emoji={cat && !cat.deleted ? cat.emoji : '🏷️'} size={32} />
                  <T style={{ flex: 1 }} numberOfLines={1}>{name}</T>
                  <T size={13} color={th.faint}>{Math.round((c.total / catSum) * 100)}%</T>
                  <T weight="medium" style={{ minWidth: 80, textAlign: 'right' }}>{app.money(c.total)}</T>
                </View>
                <Bar height={6} parts={[{ pct: (c.total / catMax) * 100, color: showIncome ? th.in : th.catBar }]} />
              </Pressable>
            );
          }) : <T size={14} color={th.faint} style={{ paddingVertical: 12 }}>{showIncome ? 'No income' : 'No spending'} {view === 'cumulative' ? 'yet' : 'in this period'}</T>}
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
      </ScrollView>
    </View>
  );
}
