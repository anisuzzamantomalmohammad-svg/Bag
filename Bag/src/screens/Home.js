// Home: All / each account with what's left in it, the balance and its
// line (drag along it for any day), "Did you pay it?", cash in and out for
// the week, month or everything, and what's next with days left.
// More cards (budgets, goals, net worth, recent) can be switched on in Settings.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Balance, Bar, Bubble, Button, Card, DaysRing, Icon, Row, Seg, Squish, T, useTheme } from '../ui/kit';
import { RecordRow, TabTint, recordEmoji } from '../ui/parts';
import BalanceLine from '../ui/line';
import { balanceLine, budgetStatus, comingUp, daysUntil, displayName, dueToAsk, incomeExpense, itemEffect, itemRecord, live, liveRecords, netWorth, otherMoves, recentRecords, accountBalance } from '../lib/ledger';
import { DAY_NAMES, MONTHS, addMonths, fmtDate, fmtShort, parseYmd, periodOf, today } from '../lib/dates';
import { fmtApprox } from '../lib/money';
import { accountEmoji, alpha, catColor } from '../lib/look';

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
    <T serif size={58} color={color || (value < 0 ? th.out : th.ink)} style={{ lineHeight: 66, letterSpacing: -1 }}>
      {k > 0 ? s.slice(0, k) : s}{k > 0 ? <T serif size={31} color={color || (value < 0 ? th.out : th.ink)}>{s.slice(k)}</T> : null}
    </T>
  );
}

function Tile({ label, value, kind, onPress, icon }) {
  const th = useTheme();
  const { money } = useApp();
  const c = kind === 'in' ? th.in : th.out;
  const shown = useCount(value);
  return (
    <Squish onPress={onPress} accessibilityLabel={`${label} ${money(value)}`} style={{ flex: 1, backgroundColor: th.card, borderRadius: 22, padding: 14, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', right: -22, top: -22, width: 80, height: 80, borderRadius: 40, backgroundColor: alpha(c, 0.16) }} />
      <View style={{ width: 28, height: 28, borderRadius: 10, backgroundColor: alpha(c, 0.16), alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
        <Icon name={icon} size={16} color={c} />
      </View>
      <T size={12} color={th.faint} style={{ letterSpacing: 0.6 }}>{label}</T>
      <T serif size={22} color={c}>{money(shown, { plus: kind === 'in' && shown > 0 })}</T>
    </Squish>
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
  const first = useMemo(() => liveRecords(data).reduce((m, r) => (r.date < m ? r.date : m), now), [data.records]);
  // The line: this week, this month, or the last 3 months for Total.
  const lineFrom = period === 'total' ? (addMonths(now, -3) > first ? addMonths(now, -3) : first) : pr(period).from;
  const until = period === 'week' ? pr('week').to : pr('month').to;
  const line = useMemo(() => balanceLine(data, { flows, from: lineFrom, now, until, accountId: acct }), [flows, data.records, data.repeats, data.accounts, lineFrom, until, acct]);
  const ticks = period === 'week'
    ? [[lineFrom, `${DAY_NAMES[parseYmd(lineFrom).getDay()]} ${parseYmd(lineFrom).getDate()}`], [now, 'Today']]
    : period === 'month' ? [[lineFrom, fmtShort(lineFrom)], [now, 'Today'], [until, String(parseYmd(until).getDate())]]
      : [[lineFrom, MONTHS[parseYmd(lineFrom).getMonth()]], [now, 'Today']];

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
  const span = period === 'week' ? 'this week' : period === 'month' ? 'this month' : `since ${MONTHS[parseYmd(lineFrom).getMonth()]}`;
  const label = scrub ? (scrub.pin ? `After ${scrub.name}, ${fmtShort(scrub.due, { weekday: true })}` : fmtDate(scrub.date, { weekday: true, year: false })) : acct ? `In ${data.accounts[acct].name} now` : 'Balance now';

  const coming = useMemo(() => comingUp(data, { days: 21 }).filter((it) => !(it.kind === 'upcoming' && it.date <= now)).slice(0, 3), [data.records, data.repeats]);
  const recent = useMemo(() => recentRecords(data, 4), [data.records]);
  const sec = second(shownNow, 'home');
  const cards = (data.homeCards || []).filter((c) => !c.hidden && !['month', 'coming'].includes(c.id));
  const who = initials(data.google && data.google.name) || initials(data.ownerName);
  const firstName = String((data.google && data.google.name) || data.ownerName || '').trim().split(/\s+/)[0];
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

  return (
    <View style={{ flex: 1, backgroundColor: th.bg }}>
      <TabTint tab="Home" />
      <ScrollView scrollEnabled={!scrub} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 120 + insets.bottom }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <T size={13} color={th.faint}>{fmtDate(now, { weekday: true, long: true, year: false })}</T>
            <T serif size={26}>{firstName ? `Kia ora, ${firstName}` : 'Kia ora'}</T>
          </View>
          <Squish onPress={() => nav.push('settings')} accessibilityLabel="Settings" style={{ width: 42, height: 42, borderRadius: 15, backgroundColor: '#9AB6EE', alignItems: 'center', justifyContent: 'center' }}>
            {who ? <T size={15} weight="semi" color="#0E131A">{who}</T> : <Icon name="settings" size={18} color="#0E131A" />}
          </Squish>
        </View>

        {accounts.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 16, marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 6 }}>
            <AcctPill label="All" on={!acct} onPress={() => setAcct(null)} />
            {accounts.map((a) => <AcctPill key={a.id} label={`${accountEmoji(a)} ${money(bal(a))}`} sub={a.name} on={acct === a.id} onPress={() => setAcct(a.id)} />)}
          </ScrollView>
        ) : null}

        <View style={{ marginTop: 14 }}>
          <T size={12} color={th.faint} style={{ letterSpacing: 0.8 }}>{label.toUpperCase()}</T>
          <BigNumber value={big} color={scrub && scrub.pin ? (scrub.v < 0 ? th.out : th.muted) : null} />
          {scrub ? (
            <T size={12.5} color={th.muted} numberOfLines={1} style={{ minHeight: 30, paddingTop: 6 }}>
              {(scrub.pin ? [{ emoji: scrub.pin, name: scrub.name, amount: scrub.amount }] : scrub.ev).length
                ? (scrub.pin ? [{ emoji: scrub.pin, name: scrub.name, amount: scrub.amount }] : scrub.ev).map((e, i) => (
                  <T key={i} size={12.5} color={th.muted}>{i ? ' · ' : ''}{e.emoji} {e.name} <T size={12.5} color={e.amount > 0 ? th.in : th.out}>{money(e.amount, { plus: e.amount > 0 })}</T></T>))
                : 'Nothing in or out that day'}
            </T>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, minHeight: 30, flexWrap: 'wrap' }}>
              <Chip>By {endWord} <T size={12.5} weight="semi" color={line.end < 0 ? th.out : th.ink}>{money(line.end)}</T></Chip>
              {diff ? <Chip color={diff > 0 ? th.in : th.out}>{diff > 0 ? '▲' : '▼'} {money(Math.abs(diff))} {span}</Chip> : null}
              {sec ? <Chip>≈ {fmtApprox(sec.amount, sec.currency)}</Chip> : null}
            </View>
          )}
        </View>

        <View style={{ marginHorizontal: -20, marginTop: 6 }}>
          <BalanceLine line={line} ticks={ticks} money={money} motion={motion} onScrub={setScrub} />
        </View>

        <Seg small style={{ marginTop: 6 }} items={[{ id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }, { id: 'total', label: 'Total' }]} value={period} onChange={(v) => app.update({ homePeriod: v })} />

        <AskCard style={{ marginTop: 14 }} />

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <Tile label="Cash in" value={ie.income} kind="in" icon="arrow-up" onPress={() => nav.setTab('Records', { counts: 'income', from: period === 'total' ? null : rangeFrom, to: now })} />
          <Tile label="Cash out" value={-ie.expense} kind="out" icon="arrow-down" onPress={() => nav.setTab('Records', { counts: 'expense', from: period === 'total' ? null : rangeFrom, to: now })} />
        </View>
        {other ? (
          <Pressable onPress={() => nav.setTab('Upcoming', { filter: 'people' })} accessibilityRole="button" hitSlop={6}>
            <T size={12} color={th.faint} style={{ marginHorizontal: 4, marginTop: 8 }}>
              {other < 0 ? `Plus ${money(-other)} lent or paid back, not counted as cash out` : `Plus ${money(other)} borrowed or returned to you, not counted as cash in`}
            </T>
          </Pressable>
        ) : null}

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

function Chip({ children, color }) {
  const th = useTheme();
  return (
    <View style={{ paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: th.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(14,19,26,0.05)' }}>
      <T size={12.5} color={color || th.muted}>{children}</T>
    </View>
  );
}

function AcctPill({ label, sub, on, onPress }) {
  const th = useTheme();
  return (
    <Squish onPress={onPress} accessibilityRole="tab" accessibilityLabel={sub ? `${sub}: ${label}` : label} style={{ height: 34, paddingHorizontal: 13, borderRadius: 12, backgroundColor: on ? th.chipOn : th.card, alignItems: 'center', justifyContent: 'center' }}>
      <T size={13} weight="medium" color={on ? th.chipOnInk : th.muted}>{label}</T>
    </Squish>
  );
}

export function Section({ title, action, onAction }) {
  const th = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 4, marginHorizontal: 2 }}>
      <T size={13} color={th.muted}>{title}</T>
      {action ? <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button"><T size={13} weight="medium" color={th.chipOn}>{action}</T></Pressable> : null}
    </View>
  );
}
