// Reports: Spending, Budgets and Goals. Spending goes by week, month or the
// running total: money in and money out as two climbing lines (‹ › for
// earlier weeks or months), a donut of where it went
// (tap a slice), colour cards for the biggest categories, then the whole sum
// for the bar you picked: what you started with, cash in, cash out, what you
// have now, and what you'll have once Upcoming is paid.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Amount, Balance, Card, Chip, F, Icon, Row, Seg, Squish, T, useTheme, Press as Pressable } from '../ui/kit';
import { TabTint } from '../ui/parts';
import { Budgets, Goals } from './Plan';
import { alpha, catColor, tint } from '../lib/look';
import { accountBalance, balanceAtMonthEnds, categoryTotals, live, liveRecords, moneyLines, monthlySeries, openingHome, totalBalance, upcomingUntil, weeklySeries } from '../lib/ledger';
import { MONTHS, addDays, addMonths, fmtDate, fmtShort, lastDayOfMonth, monthLabel, parseYmd, periodOf, today } from '../lib/dates';
import { fmtApprox, round2 } from '../lib/money';
import { jars, savedIn, savedLine } from '../lib/plan';
import { Appear, Backdrop, Tilt, useShown } from '../ui/live';

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
  // The same stretch before this one, for "▲ 62" on the top cards.
  const prevPoint = view !== 'cumulative' && idx > 0 ? series[idx - 1] : null;
  const prevCats = useMemo(() => {
    if (!prevPoint) return null;
    const m = {};
    categoryTotals(data, prevPoint.from, prevPoint.to, showIncome ? 'income' : 'expense', flows).forEach((c) => { m[c.categoryId] = c.total; });
    return m;
  }, [prevPoint && prevPoint.from, flows, showIncome]);
  const catSum = cats.reduce((t, c) => t + c.total, 0) || 1;
  // Tags on the records in this stretch.
  const tagList = useMemo(() => {
    const m = {};
    flows.forEach((f) => {
      if (!f.count || (pFrom && f.date < pFrom) || f.date > pTo) return;
      ((f.record && f.record.tags) || []).forEach((t) => {
        const x = m[t] || (m[t] = { tag: t, total: 0, ids: new Set() });
        x.total += f.home;
        x.ids.add(f.record.id);
      });
    });
    return Object.values(m).map((x) => ({ tag: x.tag, total: round2(x.total), count: x.ids.size })).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  }, [flows, pFrom, pTo]);

  const balances = useMemo(() => (view === 'cumulative' ? balanceAtMonthEnds(data, `${(series[0] || { key: now.slice(0, 7) }).key}-01`, now, { flows, homePerUnit: app.homePerUnit }) : []), [view, series, flows]);

  const setView = (v) => { setSel(null); app.update({ reportsView: v }); };
  // The gold savings curve under the two lines, only once the jars have been used.
  const savedPts = useMemo(() => {
    const ids = new Set(jars(data).map((a) => a.id));
    if (!ids.size || !flows.some((f) => ids.has(f.accountId))) return null;
    const from = view === 'cumulative' ? first : pFrom;
    const to = view === 'cumulative' ? now : pTo;
    const pts = savedLine(data, { from, now: to, flows });
    return { pts, saved: savedIn(data, from, to, flows), now: pts.length ? pts[pts.length - 1].v : 0 };
  }, [view, pFrom, pTo, flows, first]);
  const lines = useMemo(() => (view === 'cumulative'
    ? moneyLines(data, { flows, from: first, to: now, carried: 0 })
    : moneyLines(data, { flows, from: pFrom, to: pTo, carried: sum.start })), [view, pFrom, pTo, flows, sum.start, first, data.accounts]);

  // Donut: the 5 biggest, then the rest as Other.
  const slices = useMemo(() => {
    // Untracked always gets its own slice, so you can see how much slipped by.
    const unK = showIncome ? 'untracked-in' : 'untracked';
    const un = cats.findIndex((c) => c.categoryId === unK);
    const order = un >= 5 ? [...cats.slice(0, 4), cats[un], ...cats.slice(4).filter((c) => c.categoryId !== unK)] : cats;
    const top = order.slice(0, 5).map((c) => { const cat = data.categories[c.categoryId]; return { key: c.categoryId, name: cat && !cat.deleted ? cat.name : 'No category', emoji: cat && !cat.deleted ? cat.emoji : '🏷️', color: showIncome && !cat ? th.in : catColor(cat), total: c.total }; });
    const rest = order.slice(5);
    if (rest.length) top.push({ key: 'other', name: `Other (${rest.length})`, emoji: '🏷️', color: th.faint2, total: round2(rest.reduce((t, c) => t + c.total, 0)), names: rest.map((c) => (data.categories[c.categoryId] || {}).name || 'No category').join(', ') });
    return top;
  }, [cats, showIncome, th, data.categories]);

  return (
    <View style={{ flex: 1, backgroundColor: th.bg }}>
      <TabTint tab="Reports" />
      <Backdrop />
      <View style={{ paddingLeft: 20, paddingTop: insets.top + 10, paddingBottom: 6 }}><T size={28} serif>Reports</T></View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 + insets.bottom, gap: 14 }}>
        <Seg items={[{ id: 'spending', label: 'Spending' }, { id: 'budgets', label: 'Budgets' }, { id: 'savings', label: 'Savings' }]} value={tab === 'goals' ? 'savings' : tab} onChange={setTab} />
        {tab === 'budgets' ? <Budgets /> : tab === 'goals' || tab === 'savings' ? <><SavingsReport /><Goals /></> : (
        <>
        <Seg small style={{ alignSelf: 'center', width: 240 }} items={[{ id: 'weekly', label: 'Week' }, { id: 'monthly', label: 'Month' }, { id: 'cumulative', label: 'Total' }]} value={view} onChange={setView} />
        {view !== 'cumulative' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: -4 }}>
            <StepBtn icon="chevron-left" label="Earlier" disabled={idx <= 0} onPress={() => setSel(idx - 1)} />
            <T size={13} weight="medium" style={{ minWidth: 150, textAlign: 'center' }}>{point.title}{point.partial ? ' (so far)' : ''}</T>
            <StepBtn icon="chevron-right" label="Later" disabled={idx >= series.length - 1} onPress={() => setSel(idx + 1)} />
          </View>
        ) : null}
        <Appear delay={60}><Tilt depth={0.6}><MoneyGraph saved={savedPts} lines={lines} word={view === 'weekly' ? 'this week' : view === 'monthly' ? 'this month' : `since ${fmtShort(first)}`} total={view === 'cumulative'} money={app.money} motion={!data.reduceMotion} /></Tilt></Appear>

        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Chip label="Cash out" on={!showIncome} onPress={() => setShowIncome(false)} />
          <Chip label="Cash in" on={showIncome} onPress={() => setShowIncome(true)} />
        </View>
        {slices.length ? <Appear delay={160}><Donut slices={slices} label={showIncome ? 'CASH IN' : 'CASH OUT'} money={app.money} onOpen={(k) => k !== 'other' && k !== 'none' && nav.push('category', { id: k, from: pFrom, to: pTo })} /></Appear>
          : <T size={14} color={th.faint}>{showIncome ? 'No cash in' : 'No cash out'} {view === 'cumulative' ? 'yet' : 'in this period'}</T>}

        {cats.length ? (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <T size={13} color={th.muted}>{showIncome ? 'Top cash in' : 'Top spending'}</T>
              <Pressable onPress={() => nav.push('breakdown', { kind: showIncome ? 'income' : 'expense', from: pFrom, to: pTo, title: view === 'cumulative' ? `Since ${fmtShort(first)}` : point.title })} accessibilityRole="button" hitSlop={8}><T size={13} weight="medium" color={th.chipOn}>All categories ›</T></Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
              {cats.slice(0, 8).map((c) => {
                const cat = data.categories[c.categoryId];
                const col = showIncome && !cat ? th.in : catColor(cat);
                const pct = Math.round((c.total / catSum) * 100);
                const before = prevCats ? prevCats[c.categoryId] : undefined;
                const diff = before === undefined ? null : round2(c.total - before);
                const prevName = prevPoint ? (view === 'weekly' ? 'last week' : monthLabel(prevPoint.key)) : '';
                return (
                  <Squish key={c.categoryId} onPress={() => cat && !cat.deleted && nav.push('category', { id: c.categoryId, from: pFrom, to: pTo })} accessibilityLabel={`${cat ? cat.name : 'No category'}, ${app.money(c.total)}, ${pct}%`}
                    style={{ width: 142, borderRadius: 20, padding: 13, gap: 6, backgroundColor: alpha(col, 0.12), borderWidth: 1, borderColor: alpha(col, 0.3) }}>
                    <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: alpha(col, 0.22), alignItems: 'center', justifyContent: 'center' }}><T size={19}>{cat && !cat.deleted ? cat.emoji : '🏷️'}</T></View>
                    <T size={13} color={th.muted} numberOfLines={1}>{cat && !cat.deleted ? cat.name : 'No category'}</T>
                    <T serif size={22}>{app.money(c.total, { decimals: 0 })}</T>
                    <View style={{ height: 4, borderRadius: 2, backgroundColor: alpha(col, 0.18), overflow: 'hidden' }}><View style={{ width: `${pct}%`, height: '100%', backgroundColor: col }} /></View>
                    <T size={11.5} color={th.faint} numberOfLines={1}>{pct}%{prevCats ? ' · ' : ''}{!prevCats ? '' : diff === null ? 'new' : Math.abs(diff) < 1 ? `same as ${prevName}` : <T size={11.5} color={(diff > 0) !== showIncome ? th.out : th.in}>{diff > 0 ? '▲' : '▼'} {app.money(Math.abs(diff), { decimals: 0 })}</T>}</T>
                  </Squish>
                );
              })}
            </ScrollView>
          </>
        ) : null}

        {tagList.length ? (
          <>
            <T size={13} color={th.muted}>Tags</T>
            <Card pad={0} style={{ paddingHorizontal: 16 }}>
              {tagList.slice(0, 6).map((x, i) => (
                <Row key={x.tag} first={i === 0} left={<View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: th.soft, alignItems: 'center', justifyContent: 'center' }}><T size={15} color={th.muted}>#</T></View>}
                  label={x.tag} sub={`${x.count} ${x.count === 1 ? 'record' : 'records'}`} value={<Amount value={x.total} kind={x.total < 0 ? 'out' : 'in'} size={14} />} chevron={false}
                  onPress={() => nav.setTab('Records', { q: `#${x.tag}`, from: pFrom, to: pTo })} />
              ))}
            </Card>
          </>
        ) : null}

        <Card onPress={() => nav.openSheet('info', {
          title: `${point.title}${point.partial ? ' (so far)' : ''}`,
          rows: [
            { label: startLabel, value: app.money(sum.start) },
            sum.openingIn ? { label: 'Opening balance (not cash in)', value: app.money(sum.openingIn), tone: 'muted' } : null,
            { label: 'Cash in', value: app.money(point.income, { plus: true }), tone: 'in' },
            { label: 'Cash out', value: app.money(-point.expense), tone: 'out' },
            sum.other ? { label: 'Lent, borrowed, paid back (not counted)', value: app.money(sum.other, { plus: sum.other > 0 }), tone: 'muted' } : null,
            { label: sum.current ? 'You have now' : `On ${fmtShort(pTo)}`, value: app.money(sum.end), bold: true },
            sum.ahead ? { label: `Upcoming by ${untilWord}`, value: app.money(sum.ahead.total, { plus: sum.ahead.total > 0 }), tone: 'warn' } : null,
            sum.ahead ? { label: `You'll have on ${untilWord}`, value: app.money(sum.ahead.after), bold: true } : null,
            view !== 'cumulative' && totals.n > 1 ? { label: 'Average cash out', value: `${app.money(totals.avgExp)} a ${view === 'weekly' ? 'week' : 'month'}`, tone: 'muted' } : null,
            secNet ? { label: `Saved in ${secNet.currency}`, value: `≈ ${fmtApprox(secNet.amount, secNet.currency)}`, tone: 'muted' } : null,
          ],
        })} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T size={13} color={th.muted}>{view === 'cumulative' ? fmtShort(first) : fmtShort(pFrom)}</T>
            <T size={14} weight="semi">{app.money(sum.start)}</T>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14 }}>
            <T size={13} color={th.in}>{app.money(point.income, { plus: true })} in</T>
            <T size={13} color={th.out}>{app.money(-point.expense)} out</T>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T size={13} color={th.muted}>{sum.current ? 'Now' : fmtShort(pTo)}</T>
            <T size={14} weight="semi">{app.money(sum.end)}</T>
          </View>
          <View style={{ alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: alpha(net >= 0 ? th.in : th.out, 0.12), marginTop: 2 }}>
            <T size={12.5} weight="semi" color={net >= 0 ? th.in : th.out}>{net >= 0 ? 'Saved' : 'Overspent'} {app.money(net, { plus: net > 0 })}</T>
          </View>
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

function StepBtn({ icon, label, disabled, onPress }) {
  const th = useTheme();
  return (
    <Pressable onPress={disabled ? undefined : onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} hitSlop={8} style={{ width: 32, height: 32, borderRadius: 11, backgroundColor: th.soft, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 }}>
      <Icon name={icon} size={16} color={th.muted} />
    </Pressable>
  );
}

// Money in and money out, both climbing. The gap between them is what you
// have. Tap the graph for the gap and the day spending caught up, if it did.
function MoneyGraph({ lines, word, total, money, motion, saved }) {
  const th = useTheme();
  const [w, setW] = useState(0);
  const [open, setOpen] = useState(false);
  const draw = useRef(new Animated.Value(0)).current;
  const H = 160;
  const g = useMemo(() => {
    if (!w || !lines.pts.length) return null;
    const pl = 10, pr = 10, top = 22, bot = 22;
    const n = Math.max(1, lines.pts.length - 1);
    const hi = Math.max(1, ...lines.pts.map((p) => Math.max(p.in, p.out))) * 1.08;
    const x = (i) => pl + (i / n) * (w - pl - pr);
    const y = (v) => top + ((hi - v) / hi) * (H - top - bot);
    // Steps: money moves on a day, then stays flat until the next one.
    const path = (k) => lines.pts.map((p, i) => (i ? `L${x(i).toFixed(1)} ${y(lines.pts[i - 1][k]).toFixed(1)} L${x(i).toFixed(1)} ${y(p[k]).toFixed(1)}` : `M${x(0).toFixed(1)} ${y(p[k]).toFixed(1)}`)).join(' ');
    const area = (k) => `${path(k)} L${x(n).toFixed(1)} ${y(0).toFixed(1)} L${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;
    const crossI = lines.cross ? lines.pts.findIndex((p) => p.date === lines.cross) : -1;
    // Gold: the jars over the same days, smooth, on their own scale in the
    // lower part of the graph so they never fight the two lines.
    let gold = null;
    if (saved && saved.pts.length > 1) {
      const sp = saved.pts;
      const lo = Math.min(0, ...sp.map((p) => p.v));
      const ghi = Math.max(1, ...sp.map((p) => p.v));
      const gx = (i) => pl + (i / (sp.length - 1)) * (w - pl - pr);
      const gy = (v) => H - bot - ((v - lo) / (ghi - lo || 1)) * (H - top - bot) * 0.42;
      let d = `M${gx(0).toFixed(1)} ${gy(sp[0].v).toFixed(1)}`;
      for (let i = 1; i < sp.length; i++) {
        const mx = (gx(i - 1) + gx(i)) / 2;
        d += ` C${mx.toFixed(1)} ${gy(sp[i - 1].v).toFixed(1)} ${mx.toFixed(1)} ${gy(sp[i].v).toFixed(1)} ${gx(i).toFixed(1)} ${gy(sp[i].v).toFixed(1)}`;
      }
      gold = { d, area: `${d} L${gx(sp.length - 1).toFixed(1)} ${(H - bot).toFixed(1)} L${gx(0).toFixed(1)} ${(H - bot).toFixed(1)} Z`, ex: gx(sp.length - 1), ey: gy(sp[sp.length - 1].v) };
    }
    return { x, y, n, path, area, crossI, gold };
  }, [w, lines, saved]);
  const shown = useShown();
  useEffect(() => {
    if (shown === 0) return;
    draw.setValue(motion ? 0 : 1);
    if (motion) Animated.timing(draw, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [lines.in, lines.out, lines.pts.length, motion, shown]);
  const last = lines.pts[lines.pts.length - 1] || { in: 0, out: 0 };
  const first = lines.pts[0] || { date: '' };
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <KeyCard color={th.lineIn} label={lines.carried ? `Money in (${money(lines.carried)} carried)` : total ? 'Money in, with opening' : `Money in ${word}`} value={money(lines.in)} />
        <KeyCard color={th.out} label={`Spent ${word}`} value={money(lines.out)} />
        {saved ? <KeyCard color={th.gold} label={`Saved ${word}`} value={money(saved.saved, { plus: saved.saved > 0 })} /> : null}
      </View>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityLabel={`Money in ${money(lines.in)} and money out ${money(lines.out)}. The gap, ${money(lines.gap)}, is what you have. Tap for details.`} onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: H, marginTop: 6 }}>
        {g ? (
          <Svg width={w} height={H}>
            <Defs>
              <LinearGradient id="mgA" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={th.lineIn} stopOpacity={0.24} /><Stop offset="1" stopColor={th.lineIn} stopOpacity={0} /></LinearGradient>
              <LinearGradient id="mgB" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={th.out} stopOpacity={0.2} /><Stop offset="1" stopColor={th.out} stopOpacity={0} /></LinearGradient>
              <LinearGradient id="mgG" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={th.gold} stopOpacity={0.22} /><Stop offset="1" stopColor={th.gold} stopOpacity={0} /></LinearGradient>
            </Defs>
            {g.gold ? <Path d={g.gold.area} fill="url(#mgG)" /> : null}
            {g.gold ? <AnimatedPath d={g.gold.d} stroke={th.gold} strokeWidth={2} fill="none" opacity={draw} /> : null}
            {g.gold ? <Circle cx={g.gold.ex} cy={g.gold.ey} r={3.5} fill={th.gold} /> : null}
            <Path d={g.area('in')} fill="url(#mgA)" />
            <Path d={g.area('out')} fill="url(#mgB)" />
            <AnimatedPath d={g.path('out')} stroke={th.out} strokeWidth={2.2} fill="none" strokeLinejoin="round" opacity={draw} />
            <AnimatedPath d={g.path('in')} stroke={th.lineIn} strokeWidth={2.4} fill="none" strokeLinejoin="round" opacity={draw} />
            <Circle cx={g.x(g.n)} cy={g.y(last.in)} r={4.5} fill={th.dot} stroke={th.dotRing} strokeWidth={2.5} />
            <Circle cx={g.x(g.n)} cy={g.y(last.out)} r={4} fill={th.out} stroke={th.dotRing} strokeWidth={2} />
            {open ? (
              <G>
                <Line x1={g.x(g.n) - 6} x2={g.x(g.n) - 6} y1={g.y(last.in)} y2={g.y(last.out)} stroke={th.ink} strokeOpacity={0.5} />
                <SvgText x={g.x(g.n) - 10} y={Math.min(g.y(last.in), g.y(last.out)) - 8} fontSize={10.5} fontFamily={F.semi} textAnchor="end" fill={th.ink}>{`Gap ${money(lines.gap)}: what you have`}</SvgText>
                {g.crossI >= 0 ? (
                  <G>
                    <Line x1={g.x(g.crossI)} x2={g.x(g.crossI)} y1={14} y2={H - 22} stroke={th.warn} strokeOpacity={0.6} strokeDasharray="2 3" />
                    <SvgText x={g.x(g.crossI) + (g.x(g.crossI) < w / 2 ? 4 : -4)} y={H - 26} fontSize={10} fontFamily={F.regular} textAnchor={g.x(g.crossI) < w / 2 ? 'start' : 'end'} fill={th.warn}>{`${fmtShort(lines.cross)}: spending caught up`}</SvgText>
                  </G>
                ) : null}
              </G>
            ) : null}
            <SvgText x={g.x(0)} y={H - 4} fontSize={10} fill={th.faint} fontFamily={F.regular}>{first.date ? fmtShort(first.date) : ''}</SvgText>
            <SvgText x={g.x(g.n)} y={H - 4} fontSize={10} fill={th.faint} fontFamily={F.regular} textAnchor="end">{last.date ? fmtShort(last.date) : ''}</SvgText>
          </Svg>
        ) : null}
      </Pressable>
      {!open ? <T size={11} color={th.faint} center>Tap the graph for details</T> : (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: th.lineIn }} /><T size={11.5} color={th.muted}>Money in</T></View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: th.out }} /><T size={11.5} color={th.muted}>Money out</T></View>
          {g && g.gold ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: th.gold }} /><T size={11.5} color={th.muted}>In the jars {money(saved.now)}</T></View> : null}
        </View>
      )}
    </View>
  );
}

function KeyCard({ color, label, value }) {
  const th = useTheme();
  return (
    <View style={{ flex: 1, borderRadius: 16, paddingVertical: 9, paddingHorizontal: 8, alignItems: 'center', backgroundColor: alpha(color, 0.12) }}>
      <View style={{ width: 16, height: 3, borderRadius: 2, backgroundColor: color, marginBottom: 5 }} />
      <T size={10.5} color={th.muted} center numberOfLines={1}>{label}</T>
      <T serif size={18} color={tint(color, th.mode === 'dark' ? 0.3 : -0.3)}>{value}</T>
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
  const shownD = useShown();
  useEffect(() => { if (shownD === 0) return; setSel(-1); sweep.setValue(0); Animated.timing(sweep, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(); }, [total, slices.length, shownD]);
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
            <T serif size={18}>{money(s ? s.total : total, { decimals: 0 })}</T>
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

// Reports › Savings: the jars month by month. A gold curve of what's in them,
// then each month's put in, taken out and spent.
function SavingsReport() {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const { data, flows, money } = app;
  const list = jars(data);
  const ids = new Set(list.map((a) => a.id));
  const now = today();
  const months = useMemo(() => {
    const out = [];
    for (let k = 5; k >= 0; k--) {
      const from = addMonths(`${now.slice(0, 7)}-01`, -k);
      const to = k === 0 ? now : lastDayOfMonth(from.slice(0, 7));
      let put = 0;
      let took = 0;
      let spent = 0;
      flows.forEach((f) => {
        if (!ids.has(f.accountId) || f.date < from || f.date > to) return;
        if (f.count === 'expense') spent -= f.home;
        else if (f.home > 0) put += f.home;
        else took -= f.home;
      });
      out.push({ key: from.slice(0, 7), put: round2(put), took: round2(took), spent: round2(spent), net: round2(put - took - spent) });
    }
    return out;
  }, [flows, data.accounts]);
  const from6 = `${months[0].key}-01`;
  const pts = useMemo(() => savedLine(data, { from: from6, now, flows }), [flows, from6]);
  const [w, setW] = useState(0);
  const H = 120;
  const total = pts.length ? pts[pts.length - 1].v : 0;
  let d = null;
  if (w && pts.length > 1) {
    const lo = Math.min(0, ...pts.map((p) => p.v));
    const hi = Math.max(1, ...pts.map((p) => p.v)) * 1.1;
    const gx = (i) => 8 + (i / (pts.length - 1)) * (w - 16);
    const gy = (v) => H - 14 - ((v - lo) / (hi - lo || 1)) * (H - 30);
    d = `M${gx(0)} ${gy(pts[0].v)}`;
    for (let i = 1; i < pts.length; i++) { const mx = (gx(i - 1) + gx(i)) / 2; d += ` C${mx} ${gy(pts[i - 1].v)} ${mx} ${gy(pts[i].v)} ${gx(i)} ${gy(pts[i].v)}`; }
    d = { line: d, area: `${d} L${gx(pts.length - 1)} ${H - 14} L${gx(0)} ${H - 14} Z` };
  }
  if (!list.length) return null;
  return (
    <>
      <Appear>
        <Card>
          <T size={11} color={th.faint} style={{ letterSpacing: 1.3 }}>IN THE JARS</T>
          <T serif size={28} color={th.gold}>{money(total)}</T>
          <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: H, marginTop: 6 }}>
            {d ? (
              <Svg width={w} height={H}>
                <Defs><LinearGradient id="srG" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={th.gold} stopOpacity={0.28} /><Stop offset="1" stopColor={th.gold} stopOpacity={0} /></LinearGradient></Defs>
                <Path d={d.area} fill="url(#srG)" />
                <Path d={d.line} stroke={th.gold} strokeWidth={2.4} fill="none" />
                <SvgText x={8} y={H - 1} fontSize={10} fill={th.faint} fontFamily={F.regular}>{monthLabel(months[0].key)}</SvgText>
                <SvgText x={w - 8} y={H - 1} fontSize={10} fill={th.faint} fontFamily={F.regular} textAnchor="end">Today</SvgText>
              </Svg>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            {list.map((a) => (
              <Squish key={a.id} onPress={() => nav.push('savings')} style={{ flex: 1, padding: 10, borderRadius: 14, backgroundColor: th.goldSoft }}>
                <T size={12} color={th.muted} numberOfLines={1}>{a.name}</T>
                <T size={16} weight="semi">{money(accountBalanceOf(app, a))}</T>
              </Squish>
            ))}
          </View>
        </Card>
      </Appear>
      <Card pad={0} style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
        <T size={13} color={th.muted} style={{ marginBottom: 2 }}>Saved each month</T>
        {months.slice().reverse().map((m, i) => (
          <Row key={m.key} first={i === 0} minHeight={50} label={monthLabel(m.key, true)}
            sub={m.put || m.took || m.spent ? [m.put ? `in ${money(m.put, { decimals: 0 })}` : null, m.took ? `out ${money(m.took, { decimals: 0 })}` : null, m.spent ? `spent ${money(m.spent, { decimals: 0 })}` : null].filter(Boolean).join(' · ') : 'Nothing moved'}
            value={<Amount value={m.net} kind={m.net > 0 ? 'in' : m.net < 0 ? 'out' : 'neutral'} plus />} chevron={false} />
        ))}
      </Card>
    </>
  );
}

const accountBalanceOf = (app, a) => accountBalance(app.data, a, { flows: app.flows, homePerUnit: app.homePerUnit }).home;
