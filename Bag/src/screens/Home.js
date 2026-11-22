// Home: All / each account with what's left in it, the balance and its
// line (drag along it for any day), "Did you pay it?", cash in and out for
// the week, month or everything, and what's next with days left.
// More cards (budgets, goals, net worth, recent) can be switched on in Settings.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Balance, Bar, Bubble, Button, Card, DaysRing, F, Icon, Ring, Row, Seg, Squish, T, useTheme } from '../ui/kit';
import { RecordRow, TabTint, recordEmoji } from '../ui/parts';
import BalanceLine from '../ui/line';
import { balanceLine, budgetStatus, comingUp, daysUntil, displayName, dueToAsk, incomeExpense, itemEffect, itemRecord, live, liveRecords, netWorth, otherMoves, recentRecords, accountBalance } from '../lib/ledger';
import { DAY_NAMES, fmtDate, fmtShort, parseYmd, periodOf, today } from '../lib/dates';
import { fmtApprox } from '../lib/money';
import { accountColor, accountEmoji, accountKind, alpha, catColor, tint } from '../lib/look';

export function initials(name) {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return null;
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

export function comingRow(item, data) {
  const r = itemRecord(item);
  const now = today();
  const name = item.kind === 'owedToMe' && r.who ? `${r.who} owes you` : item.kind === 'due' && r.who ? `You owe ${r.who}` : displayName(r, data) || 'Repeat';
  let sub = item.date === now ? 'Today' : fmtShort(item.date, { weekday: true });
  let tone = null;
  if (item.kind === 'upcoming') {
    if (item.date < now) { sub = `Overdue since ${fmtShort(item.date, { weekday: true })}`; tone = 'warn'; } else if (item.date === now) tone = 'warn';
    if (r.repeatId) sub += ' · repeats';
  }
  if (item.kind === 'repeat') sub += ' · repeats';
  if (item.kind === 'due' || item.kind === 'owedToMe') {
    sub = r.dueDate ? `${r.dueDate < now ? 'Was due' : 'Due'} ${fmtShort(r.dueDate, { weekday: true })}` : 'No due date';
    if (r.dueDate && r.dueDate < now) tone = 'warn';
  }
  const a = Number(r.amount) || 0;
  const eff = itemEffect(item);
  const value = eff ? (eff > 0 ? a : -a) : a;
  const kind = eff > 0 ? 'in' : eff < 0 ? 'out' : 'neutral';
  return { name, sub, tone, value, kind, currency: r.currency };
}

// "Did you pay it?": one card for every Upcoming thing whose day has come.
// It stays until you answer. Yes draws a tick and folds the card away;
// Not yet hides it until tomorrow.
export function AskCard({ style }) {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const { data } = app;
  const now = today();
  const list = dueToAsk(data, now).filter((r) => (data.askLater || {})[r.id] !== now);
  const [done, setDone] = useState(null);
  const fold = useRef(new Animated.Value(1)).current;
  const r = list[0];
  useEffect(() => { fold.setValue(1); setDone(null); }, [r && r.id]);
  if (!r) return null;
  const income = r.type === 'income';
  const move = r.type === 'transfer';
  const cat = data.categories[r.categoryId];
  const acc = data.accounts[r.accountId];
  const when = r.date === now ? `Due today, ${fmtShort(r.date, { weekday: true })}` : `Was due ${fmtShort(r.date, { weekday: true })}`;
  const answer = (yes) => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(yes ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
    setDone(yes ? 'yes' : 'later');
    Animated.timing(fold, { toValue: 0, duration: 420, delay: 650, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start(() => {
      if (yes) app.markPaid(r.id);
      else { app.askLater(r.id); app.showToast(`${displayName(r, data)} will ask again tomorrow`); }
    });
  };
  return (
    <Animated.View style={[{ opacity: fold, maxHeight: fold.interpolate({ inputRange: [0, 1], outputRange: [0, 260] }), overflow: 'hidden' }, style]}>
      <View style={{ backgroundColor: th.warnSoft, borderWidth: 1, borderColor: th.warnBorder, borderRadius: 24, padding: 16, gap: 12 }}>
        {done ? (
          <View style={{ minHeight: 96, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 }}>
            <Icon name={done === 'yes' ? 'check-circle' : 'clock'} size={24} color={done === 'yes' ? th.in : th.muted} />
            <T weight="semi" color={done === 'yes' ? th.in : th.muted}>{done === 'yes' ? `${income ? 'Got it' : 'Paid'}. ${acc ? `${accountEmoji(acc)} ${acc.name} updated` : 'Counted'}` : 'Asking again tomorrow'}</T>
          </View>
        ) : (
          <>
            <Pressable onPress={() => nav.push('record', { id: r.id })} accessibilityRole="button" accessibilityLabel={`${displayName(r, data)}, ${app.money(r.amount, { currency: r.currency })}. Open it`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Bubble emoji={recordEmoji(r, data.categories)} color={catColor(cat)} />
              <View style={{ flex: 1 }}>
                <T numberOfLines={1}>{displayName(r, data)} · <T color={income ? th.in : move ? th.ink : th.out}>{app.money(r.amount, { currency: r.currency })}</T></T>
                <T size={12.5} color={th.warn}>{when}. {income ? 'Did it arrive?' : move ? 'Did you move it?' : 'Did you pay it?'}</T>
              </View>
              {list.length > 1 ? <T size={12} color={th.muted}>1 of {list.length}</T> : null}
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button label={income ? 'Yes, got it' : move ? 'Yes, moved' : 'Yes, paid'} kind="amber" small style={{ flex: 1, minHeight: 44 }} onPress={() => answer(true)} />
              <Button label="Not yet" kind="soft" small style={{ flex: 1, minHeight: 44 }} onPress={() => answer(false)} />
            </View>
            <Pressable onPress={() => nav.openSheet('confirm', { id: r.id })} accessibilityRole="button" hitSlop={6} style={{ alignSelf: 'center' }}>
              <T size={12.5} weight="medium" color={th.muted}>{income ? 'Got a different amount?' : 'Paid a different amount, or from another account?'}</T>
            </Pressable>
          </>
        )}
      </View>
    </Animated.View>
  );
}

// Sundays: "Is there X in your wallet?" Cash spending is easy to forget,
// so if the wallet says otherwise, the difference goes in as Untracked cash.
export function cashCheckDue(data, now) {
  const cash = live(data.accounts).find((a) => accountKind(a) === 'cash');
  if (!cash || data.cashCheck === false) return null;
  const last = data.cashCheckedOn || '';
  if (last && daysUntil(last, now) < 6) return null;
  if (parseYmd(now).getDay() !== 0 && last) return null;
  return cash;
}

function CashCheck({ style }) {
  const app = useApp();
  const th = useTheme();
  const { data, money, flows, homePerUnit } = app;
  const now = today();
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const cash = cashCheckDue(data, now);
  if (!cash) return null;
  const have = accountBalance(data, cash, { flows, homePerUnit }).native;
  const done = () => app.update({ cashCheckedOn: now });
  const fix = () => {
    const real = Number(String(text).replace(/[^0-9.-]/g, ''));
    if (Number.isNaN(real) || text.trim() === '') return;
    const gap = round(real - have);
    if (gap) {
      app.saveRecord({ type: gap < 0 ? 'expense' : 'income', amount: Math.abs(gap), name: 'Untracked cash', categoryId: gap < 0 ? 'other' : 'other-income', accountId: cash.id, currency: cash.currency, date: now, description: 'From the Sunday cash check' });
      app.showToast(`${money(Math.abs(gap))} added as Untracked cash`);
    }
    done();
  };
  return (
    <View style={[{ backgroundColor: alpha(th.in, 0.1), borderRadius: 20, padding: 14, gap: 10 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <T size={20}>💵</T>
        <T size={13.5} style={{ flex: 1 }}>Is there <T size={13.5} weight="semi">{money(have, { currency: cash.currency })}</T> in your wallet?</T>
      </View>
      {typing ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput value={text} onChangeText={setText} autoFocus keyboardType="decimal-pad" placeholder="What's there" placeholderTextColor={th.faint2} accessibilityLabel="Cash in your wallet"
            style={{ flex: 1, height: 40, borderRadius: 12, backgroundColor: th.soft, paddingHorizontal: 12, color: th.ink, fontFamily: F.regular, fontSize: 14 }} />
          <Button label="Save" small onPress={fix} style={{ minHeight: 40 }} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button label="Yes, it's right" kind="soft" small style={{ flex: 1, minHeight: 40 }} onPress={done} />
          <Button label="No, it's…" kind="soft" small style={{ flex: 1, minHeight: 40 }} onPress={() => setTyping(true)} />
        </View>
      )}
    </View>
  );
}

// The big number counts to its new value instead of jumping.
function useCount(target, ms = 600) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const a = from.current;
    if (a === target) return undefined;
    const t0 = Date.now();
    let raf;
    const tick = () => {
      const k = Math.min(1, (Date.now() - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      const cur = a + (target - a) * e;
      from.current = cur;
      setV(cur);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

function BigNumber({ value, color }) {
  const th = useTheme();
  const { money } = useApp();
  const s = money(value);
  const k = s.lastIndexOf('.');
  return (
    <T serif size={46} color={color || (value < 0 ? th.out : th.ink)} style={{ lineHeight: 54, letterSpacing: -1 }}>
      {k > 0 ? s.slice(0, k) : s}{k > 0 ? <T serif size={24} color={color || (value < 0 ? th.out : th.ink)}>{s.slice(k)}</T> : null}
    </T>
  );
}

function Tile({ label, value, kind, onPress, icon }) {
  const th = useTheme();
  const { money } = useApp();
  const c = kind === 'in' ? th.in : th.out;
  const shown = useCount(value);
  return (
    <Squish onPress={onPress} accessibilityLabel={`${label} ${money(value)}`} style={{ flex: 1, backgroundColor: alpha(c, 0.1), borderRadius: 18, paddingVertical: 11, paddingHorizontal: 10, alignItems: 'center', overflow: 'hidden' }}>
      <View style={{ position: 'absolute', right: -26, top: -26, width: 80, height: 80, borderRadius: 40, backgroundColor: alpha(c, 0.12) }} />
      <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: alpha(c, 0.2), alignItems: 'center', justifyContent: 'center', marginBottom: 5 }}>
        <Icon name={icon} size={13} color={c} />
      </View>
      <T size={11} color={th.muted}>{label}</T>
      <T serif size={19} color={c}>{money(shown, { plus: kind === 'in' && shown > 0 })}</T>
    </Squish>
  );
}

function Legend({ color, label }) {
  const th = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: color }} />
      <T size={11.5} color={th.muted}>{label}</T>
    </View>
  );
}

export function SumRow({ label, value, color, bold, tint }) {
  const th = useTheme();
  return (
    <View style={[{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 }, tint ? { backgroundColor: alpha(color, 0.1), marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 10 } : null]}>
      <T size={13} weight={bold || tint ? 'semi' : 'regular'} color={tint ? color : bold ? th.ink : th.muted}>{label}</T>
      <T size={13} weight={bold || tint ? 'semi' : 'regular'} color={color || th.ink}>{value}</T>
    </View>
  );
}

// Budgets as small rings under the tiles. With none set, one nudge for
// groceries (your biggest everyday spend), which you can dismiss.
function BudgetStrip() {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const { data, flows, money } = app;
  const list = live(data.budgets);
  if (!list.length) {
    if (data.budgetNudge === false || !data.categories.groceries || data.categories.groceries.deleted) return null;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, backgroundColor: alpha(catColor(data.categories.groceries), 0.1), borderRadius: 16, padding: 10 }}>
        <Pressable onPress={() => nav.push('budget', { categoryId: 'groceries' })} accessibilityRole="button" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Bubble emoji="🛒" color={catColor(data.categories.groceries)} size={32} />
          <T size={12.5} style={{ flex: 1 }}>Set a groceries budget, to see what's left before payday</T>
        </Pressable>
        <Pressable onPress={() => app.update({ budgetNudge: false })} hitSlop={10} accessibilityRole="button" accessibilityLabel="Not now"><Icon name="x" size={16} color={th.faint} /></Pressable>
      </View>
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12, marginHorizontal: -18 }} contentContainerStyle={{ paddingHorizontal: 18, gap: 8, flexGrow: 1, justifyContent: 'center' }}>
      {list.map((b) => {
        const st = budgetStatus(data, b, { flows });
        const cat = data.categories[b.categoryId] || {};
        const col = st.state === 'over' ? th.out : st.state === 'warn' ? th.warnBar : catColor(cat);
        const left = st.limit - st.spent;
        return (
          <Squish key={b.categoryId} onPress={() => nav.push('budget', { categoryId: b.categoryId })} accessibilityLabel={`${cat.name} budget, ${money(left)} left`} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: alpha(catColor(cat), 0.1), borderRadius: 16, paddingVertical: 8, paddingHorizontal: 10 }}>
            <Ring pct={Math.min(1, st.pct)} color={col} size={36} stroke={3.5}><T size={14}>{cat.emoji}</T></Ring>
            <View>
              <T size={11} color={th.muted}>{cat.name}</T>
              <T size={13} weight="semi" color={left < 0 ? th.out : th.ink}>{left < 0 ? `${money(-left)} over` : `${money(left)} left`}</T>
            </View>
          </Squish>
        );
      })}
    </ScrollView>
  );
}

export default function Home() {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const insets = useSafeAreaInsets();
  const { data, flows, money, second, homePerUnit } = app;
  const now = today();
  const motion = data.animations !== false;
  const accounts = live(data.accounts);
  const acct = data.homeAccount && data.accounts[data.homeAccount] && !data.accounts[data.homeAccount].deleted ? data.homeAccount : null;
  const bal = (a) => accountBalance(data, a, { flows, homePerUnit }).home;
  const total = useMemo(() => accounts.reduce((s, a) => s + bal(a), 0), [data.accounts, flows, homePerUnit]);

  const period = ['week', 'month', 'total'].includes(data.homePeriod) ? data.homePeriod : 'month';
  const ws = data.weekStart === 0 ? 0 : data.weekStart || 1;
  const pr = (k) => periodOf(now, k, { weekStart: ws, monthStart: data.monthStartDay || 1 });
  // Total starts where your money starts: the first opening balance or record.
  const first = useMemo(() => {
    let m = liveRecords(data).reduce((x, r) => (r.date < x ? r.date : x), now);
    accounts.forEach((a) => { if (a.openingDate && a.openingDate < m) m = a.openingDate; });
    return m;
  }, [data.records, data.accounts]);
  const lineFrom = period === 'total' ? first : pr(period).from;
  const until = period === 'week' ? pr('week').to : pr('month').to;
  const line = useMemo(() => balanceLine(data, { flows, from: lineFrom, now, until, accountId: acct }), [flows, data.records, data.repeats, data.accounts, lineFrom, until, acct]);
  const ticks = period === 'week'
    ? [[lineFrom, `${DAY_NAMES[parseYmd(lineFrom).getDay()]} ${parseYmd(lineFrom).getDate()}`], [now, 'Today']]
    : period === 'month' ? [[lineFrom, fmtShort(lineFrom)], [now, 'Today'], [until, String(parseYmd(until).getDate())]]
      : [[lineFrom, fmtShort(lineFrom)], [now, 'Today']];

  // Cash in and out for the same stretch (Total is everything, ever).
  const rangeFrom = period === 'total' ? '0000-01-01' : pr(period).from;
  const accFlows = useMemo(() => (acct ? flows.filter((f) => f.accountId === acct) : flows), [flows, acct]);
  const ie = useMemo(() => incomeExpense(data, rangeFrom, now, accFlows), [accFlows, rangeFrom, now]);
  const other = useMemo(() => otherMoves(period === 'total' ? null : rangeFrom, now, accFlows), [accFlows, rangeFrom, now]);
  const shownNow = acct ? bal(data.accounts[acct]) : total;

  const [scrub, setScrub] = useState(null);
  const counted = useCount(shownNow, 700);
  const big = scrub ? scrub.v : counted;
  const endWord = period === 'week' ? fmtDate(until, { weekday: true, long: true, year: false }).split(' ')[0] : fmtShort(until);
  const diff = round(line.now - line.start);
  const span = period === 'week' ? 'this week' : period === 'month' ? 'this month' : 'since you started';
  const [details, setDetails] = useState(false);
  const toggleDetails = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); setDetails((d) => !d); };
  const label = scrub ? (scrub.pin ? `After ${scrub.name}, ${fmtShort(scrub.due, { weekday: true })}` : fmtDate(scrub.date, { weekday: true, year: false })) : acct ? `In ${data.accounts[acct].name} now` : 'Balance now';

  const coming = useMemo(() => comingUp(data, { days: 21 }).filter((it) => !(it.kind === 'upcoming' && it.date <= now)).slice(0, 3), [data.records, data.repeats]);
  const recent = useMemo(() => recentRecords(data, 4), [data.records]);
  const sec = second(shownNow, 'home');
  const cards = (data.homeCards || []).filter((c) => !c.hidden && !['month', 'coming', 'budgets'].includes(c.id));
  const who = initials(data.google && data.google.name) || initials(data.ownerName);
  const setAcct = (id) => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); app.update({ homeAccount: id }); };

  const openComing = (item) => {
    if (item.record) nav.push('record', { id: item.record.id });
    else if (item.repeat) nav.push('repeat', { id: item.repeat.id });
  };

  const renderCard = (c) => {
    if (c.id === 'recent') {
      return (
        <View key="recent">
          <Section title="Recent" action="See all" onAction={() => nav.setTab('Records')} />
          {recent.length ? recent.map((r, i) => <RecordRow key={r.id} record={r} first={i === 0} showDate onPress={() => nav.push('record', { id: r.id })} />)
            : <T size={14} color={th.faint} style={{ paddingVertical: 12 }}>No records yet. Tap + to add your first one.</T>}
        </View>
      );
    }
    if (c.id === 'budgets') {
      const list = live(data.budgets).slice(0, 3);
      return (
        <View key="budgets">
          <Section title="Budgets" action="All" onAction={() => nav.setTab('Reports', { seg: 'budgets' })} />
          {list.length ? list.map((b) => {
            const st = budgetStatus(data, b, { flows });
            const cat = data.categories[b.categoryId] || {};
            const col = st.state === 'over' ? th.out : st.state === 'warn' ? th.warnBar : catColor(cat);
            return (
              <Pressable key={b.categoryId} onPress={() => nav.push('category', { id: b.categoryId })} style={{ paddingVertical: 8, gap: 6 }} accessibilityRole="button">
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <T>{cat.emoji} {cat.name}</T>
                  <T size={14} color={st.state === 'ok' ? th.muted : st.state === 'warn' ? th.warn : th.out}>{money(st.spent)} of {money(st.limit)}</T>
                </View>
                <Bar parts={[{ pct: Math.min(100, st.pct * 100), color: col }, { pct: st.limit ? Math.min(100 - Math.min(100, st.pct * 100), (st.planned / st.limit) * 100) : 0, color: th.planned }]} />
              </Pressable>
            );
          }) : <Row first label="Set a budget" onPress={() => nav.setTab('Reports', { seg: 'budgets' })} />}
        </View>
      );
    }
    if (c.id === 'goals') {
      const list = live(data.goals).slice(0, 2);
      return (
        <View key="goals">
          <Section title="Goals" action="All" onAction={() => nav.setTab('Reports', { seg: 'goals' })} />
          {list.length ? list.map((gl) => {
            const acc = data.accounts[gl.accountId];
            const saved = acc && !acc.deleted ? Math.max(0, bal(acc)) : 0;
            const pct = gl.target ? Math.min(100, (saved / gl.target) * 100) : 0;
            return (
              <Pressable key={gl.id} onPress={() => nav.push('goal', { id: gl.id })} style={{ paddingVertical: 8, gap: 6 }} accessibilityRole="button">
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T>{gl.name}</T><T size={14} color={th.muted}>{money(saved)} of {money(gl.target)}</T></View>
                <Bar parts={[{ pct, color: th.chipOn }]} />
              </Pressable>
            );
          }) : <Row first label="Start a goal" onPress={() => nav.push('goal', {})} />}
        </View>
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

  const two = period !== 'total';
  const saved = round(ie.income - ie.expense);
  const startWord = period === 'week' ? 'Carried in from last week' : period === 'month' ? 'Carried in from last month' : `Opening balance (${fmtShort(lineFrom)})`;
  const savedWord = period === 'week' ? 'this week' : period === 'month' ? 'this month' : 'since you started';

  return (
    <View style={{ flex: 1, backgroundColor: th.bg }}>
      <TabTint tab="Home" />
      <ScrollView scrollEnabled={!scrub} contentContainerStyle={{ paddingTop: insets.top + 10, paddingHorizontal: 18, paddingBottom: 110 + insets.bottom }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 }}>
          <T size={13} weight="medium" color={th.muted}>{fmtDate(now, { weekday: true, long: true, year: false })}</T>
          <Squish onPress={() => nav.push('settings')} accessibilityLabel="Settings" style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: '#9AB6EE', alignItems: 'center', justifyContent: 'center' }}>
            {who ? <T size={13} weight="semi" color="#0E131A">{who}</T> : <Icon name="settings" size={17} color="#0E131A" />}
          </Squish>
        </View>

        {accounts.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, marginHorizontal: -18 }} contentContainerStyle={{ paddingHorizontal: 18, gap: 6, flexGrow: 1, justifyContent: 'center' }}>
            <AcctPill label="All" on={!acct} onPress={() => setAcct(null)} />
            {accounts.map((a) => <AcctPill key={a.id} label={`${accountEmoji(a)} ${money(bal(a))}`} sub={a.name} color={accountColor(a)} on={acct === a.id} onPress={() => setAcct(a.id)} />)}
          </ScrollView>
        ) : null}

        <View style={{ marginTop: 14, alignItems: 'center' }}>
          <T size={10.5} color={th.faint} style={{ letterSpacing: 1.4 }}>{label.toUpperCase()}</T>
          <BigNumber value={big} color={scrub && scrub.pin ? (scrub.v < 0 ? th.out : th.muted) : null} />
          {scrub ? (
            <T size={12} color={th.muted} numberOfLines={1} center style={{ minHeight: 26, paddingTop: 4 }}>
              {(scrub.pin ? [{ emoji: scrub.pin, name: scrub.name, amount: scrub.amount }] : scrub.ev).length
                ? (scrub.pin ? [{ emoji: scrub.pin, name: scrub.name, amount: scrub.amount }] : scrub.ev).map((e, i) => (
                  <T key={i} size={12} color={th.muted}>{i ? ' · ' : ''}{e.emoji} {e.name} <T size={12} color={e.amount > 0 ? th.in : th.out}>{money(e.amount, { plus: e.amount > 0 })}</T></T>))
                : 'Nothing in or out that day'}
            </T>
          ) : (
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, minHeight: 26, flexWrap: 'wrap', justifyContent: 'center' }}>
              {diff ? <Chip color={diff > 0 ? th.in : th.out} tint={diff > 0 ? th.in : th.out}>{diff > 0 ? '▲' : '▼'} {money(Math.abs(diff))} {span}</Chip> : null}
              {details ? <Chip>By {endWord} <T size={12} weight="semi" color={line.end < 0 ? th.out : th.ink}>{money(line.end)}</T></Chip> : null}
              {details && sec ? <Chip>≈ {fmtApprox(sec.amount, sec.currency)}</Chip> : null}
            </View>
          )}
        </View>

        <View style={{ marginHorizontal: -18, marginTop: 4 }}>
          <BalanceLine line={line} ticks={ticks} money={money} motion={motion} onScrub={setScrub} period={two} details={details} onTap={toggleDetails} height={160} />
        </View>
        {!details ? <T size={11} color={th.faint} center>Tap the line for details</T> : (
          <View style={{ gap: 8 }}>
            {two ? (
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14 }}>
                <Legend color={th.lineB} label="With what you carried in" />
                <Legend color={th.lineP} label={`This ${period} only`} />
              </View>
            ) : null}
            <View style={{ backgroundColor: th.card, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 6 }}>
              <SumRow label={startWord} value={money(line.start)} />
              <SumRow label="+ Cash in" value={money(ie.income, { plus: true })} color={th.in} />
              <SumRow label="− Cash out" value={money(-ie.expense)} color={th.out} />
              {other ? <SumRow label="People and moves" value={money(other, { plus: other > 0 })} /> : null}
              <SumRow label={saved >= 0 ? `Saved ${savedWord}` : `Overspent ${savedWord}`} value={money(saved, { plus: saved > 0 })} color={saved >= 0 ? th.in : th.out} tint />
              <SumRow label="You have now" value={money(line.now)} bold />
            </View>
          </View>
        )}

        <Seg small style={{ marginTop: 10, alignSelf: 'center', width: 240 }} items={[{ id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }, { id: 'total', label: 'Total' }]} value={period} onChange={(v) => app.update({ homePeriod: v })} />

        <AskCard style={{ marginTop: 12 }} />
        <CashCheck style={{ marginTop: 12 }} />

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <Tile label="Cash in" value={ie.income} kind="in" icon="arrow-up" onPress={() => nav.setTab('Records', { counts: 'income', from: period === 'total' ? null : rangeFrom, to: now })} />
          <Tile label="Cash out" value={-ie.expense} kind="out" icon="arrow-down" onPress={() => nav.setTab('Records', { counts: 'expense', from: period === 'total' ? null : rangeFrom, to: now })} />
        </View>
        {other ? (
          <Pressable onPress={() => nav.setTab('Upcoming', { filter: 'people' })} accessibilityRole="button" hitSlop={6}>
            <T size={11.5} color={th.faint} center style={{ marginHorizontal: 4, marginTop: 8 }}>
              {other < 0 ? `Plus ${money(-other)} lent or paid back, not counted as cash out` : `Plus ${money(other)} borrowed or returned to you, not counted as cash in`}
            </T>
          </Pressable>
        ) : null}

        <BudgetStrip />

        <Section title="Next up" action="See all" onAction={() => nav.setTab('Upcoming')} />
        {coming.length ? coming.map((it) => {
          const row = comingRow(it, data);
          const rec = itemRecord(it);
          const cat = data.categories[rec.categoryId];
          const days = daysUntil(now, it.kind === 'due' || it.kind === 'owedToMe' ? (rec.dueDate || it.date) : it.date);
          return (
            <Squish key={it.key} onPress={() => openComing(it)} accessibilityLabel={`${row.name}, ${money(row.value)}, ${row.sub}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 9 }}>
              <Bubble emoji={rec.type === 'transfer' ? '🔀' : cat && !cat.deleted ? cat.emoji : '🤝'} color={catColor(cat)} />
              <View style={{ flex: 1 }}>
                <T numberOfLines={1}>{row.name}</T>
                <T size={12.5} color={th.faint}>{fmtShort(it.date, { weekday: true })} · <T size={12.5} color={row.kind === 'in' ? th.in : row.kind === 'out' ? th.out : th.muted}>{money(row.value, { plus: row.kind === 'in' })}</T></T>
              </View>
              <DaysRing days={days} color={catColor(cat)} />
            </Squish>
          );
        }) : <T size={14} color={th.faint} style={{ paddingVertical: 10 }}>Nothing due in the next 3 weeks</T>}

        {cards.map((c) => <View key={c.id} style={{ marginTop: 8 }}>{renderCard(c)}</View>)}
      </ScrollView>
    </View>
  );
}

const round = (n) => Math.round(n * 100) / 100;

function Chip({ children, color, tint }) {
  const th = useTheme();
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9, backgroundColor: tint ? alpha(tint, 0.13) : th.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(14,19,26,0.05)' }}>
      <T size={12} color={color || th.muted}>{children}</T>
    </View>
  );
}

function AcctPill({ label, sub, on, onPress, color }) {
  const th = useTheme();
  return (
    <Squish onPress={onPress} accessibilityRole="tab" accessibilityLabel={sub ? `${sub}: ${label}` : label} style={{ height: 30, paddingHorizontal: 11, borderRadius: 10, backgroundColor: on ? th.chipOn : color ? alpha(color, 0.14) : th.card, alignItems: 'center', justifyContent: 'center' }}>
      <T size={12} weight={on ? 'semi' : 'medium'} color={on ? th.chipOnInk : color ? tint(color, th.mode === 'dark' ? 0.25 : -0.35) : th.muted}>{label}</T>
    </Squish>
  );
}

export function Section({ title, action, onAction }) {
  const th = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, marginBottom: 2, marginHorizontal: 2 }}>
      <T size={12} color={th.muted}>{title}</T>
      {action ? <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button"><T size={13} weight="medium" color={th.chipOn}>{action}</T></Pressable> : null}
    </View>
  );
}
