// Home: your pills (one per group: all banks share one Bank pill, all cash
// one Cash pill, the two jars one Savings pill), pinned categories and
// people, the balance and its line with the gold savings curve, what's free
// to spend a day until payday, Move · Save · Count · Bills, "Did you pay
// it?", payday, cash in, cash out and the total, debts, and what's next.
// Behind it all: the floating coins and drawings of today's look.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Balance, Bar, Bubble, Button, Card, DaysRing, EmojiLabel, F, Icon, Ring, Row, Seg, Squish, T, useTheme, Press as Pressable } from '../ui/kit';
import { RecordRow, TabTint, recordEmoji } from '../ui/parts';
import BalanceLine from '../ui/line';
import { Appear, Backdrop, Tilt, useCountUp } from '../ui/live';
import { balanceLine, budgetStatus, byNewest, comingUp, daysUntil, displayName, dueToAsk, homeOf, incomeExpense, isOpen, itemEffect, itemRecord, leftOf, live, liveRecords, netWorth, otherMoves, paidOf, rateOf, recentRecords, upcomingUntil, accountBalance } from '../lib/ledger';
import { DAY_NAMES, addDays, fmtDate, fmtShort, parseYmd, periodOf, today } from '../lib/dates';
import { fmtApprox, round2 } from '../lib/money';
import { accountEmoji, alpha, catColor, tint } from '../lib/look';
import { DOW, defaultIn, forecast, groupOf, homeGroups, isJar, jars, marginOf, parseQuick, paydaysToConfirm, perDay, savedLine, toSpend } from '../lib/plan';
import { describe } from '../lib/repeats';
import { feel } from '../lib/feel';

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

// The pop-up behind a Next up or Upcoming row: amount, date, account,
// repeats, and Paid / Skip (or Pay some back for a debt).
export function showComing(it, app, nav) {
  const { data, money } = app;
  const r = itemRecord(it);
  const row = comingRow(it, data);
  const cat = data.categories[r.categoryId];
  const acc = data.accounts[r.accountId];
  const rep = it.repeat || (r.repeatId && data.repeats[r.repeatId]);
  const debt = it.kind === 'due' || it.kind === 'owedToMe';
  nav.openSheet('info', {
    title: `${cat && !cat.deleted ? `${cat.emoji} ` : ''}${row.name}`,
    rows: [
      { label: 'Amount', value: money(row.value, { currency: row.currency, plus: row.kind === 'in' }), tone: row.kind === 'in' ? 'in' : row.kind === 'out' ? 'out' : null },
      { label: debt ? 'Due' : 'Date', value: debt && !r.dueDate ? 'No date' : fmtShort(debt ? r.dueDate : it.date, { weekday: true }) },
      acc ? { label: r.type === 'income' ? 'Into' : 'From', value: `${accountEmoji(acc)} ${acc.name}` } : null,
      rep ? { label: 'Repeats', value: describe(rep), tone: 'muted' } : null,
    ],
    buttons: debt ? [{ label: r.type === 'iowe' ? 'Pay some back' : 'Got some back', onPress: () => nav.openSheet('paydebt', { id: r.id }) }, { label: 'Open', kind: 'secondary', onPress: () => nav.push('record', { id: r.id }) }]
      : [
        { label: r.type === 'income' ? 'Got it' : 'Paid', onPress: () => (it.repeat ? app.answerRepeat(it.repeat.id, it.date, true) : app.markPaid(r.id)) },
        { label: 'Skip', kind: 'secondary', onPress: () => (it.repeat ? app.answerRepeat(it.repeat.id, it.date, false) : app.skipPending(r.id)) },
      ],
  });
}


// A card that folds away after you answer it.
function useFold() {
  const fold = useRef(new Animated.Value(1)).current;
  const go = (after) => Animated.timing(fold, { toValue: 0, duration: 420, delay: 650, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start(after);
  const style = { opacity: fold, maxHeight: fold.interpolate({ inputRange: [0, 1], outputRange: [0, 320] }), overflow: 'hidden' };
  return { fold, go, style };
}

// "Did you pay it?": one card for every Upcoming thing whose day has come.
export function AskCard({ style }) {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const { data } = app;
  const now = today();
  const list = dueToAsk(data, now).filter((r) => (data.askLater || {})[r.id] !== now);
  const [done, setDone] = useState(null);
  const f = useFold();
  const r = list[0];
  useEffect(() => { f.fold.setValue(1); setDone(null); }, [r && r.id]);
  if (!r) return null;
  const income = r.type === 'income';
  const move = r.type === 'transfer';
  const cat = data.categories[r.categoryId];
  const acc = data.accounts[r.accountId];
  const when = r.date === now ? `Due today, ${fmtShort(r.date, { weekday: true })}` : `Was due ${fmtShort(r.date, { weekday: true })}`;
  const answer = (yes) => {
    (yes ? feel.done : feel.warn)();
    setDone(yes ? 'yes' : 'later');
    f.go(() => {
      if (yes) app.markPaid(r.id);
      else { app.askLater(r.id); app.showToast(`${displayName(r, data)} will ask again tomorrow`); }
    });
  };
  return (
    <Animated.View style={[f.style, style]}>
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

// Payday: "How much did you get?" with your rough amount filled in (or what
// you got last time). Got it saves Cash in to the account it lands in.
function PaydayCard({ style }) {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const { data, money } = app;
  const now = today();
  const list = paydaysToConfirm(data, now);
  const x = list[0];
  const lastGot = useMemo(() => {
    if (!x) return null;
    const keys = Object.entries(data.paydayDone || {}).filter(([k, v]) => k.startsWith(`${x.item.id}_`) && v && v !== 'skip').sort((a, b) => (a[0] < b[0] ? 1 : -1));
    const rec = keys.length ? data.records[keys[0][1]] : null;
    return rec && !rec.deleted ? Number(rec.amount) : null;
  }, [x && x.key, data.paydayDone]);
  const guess = x ? (lastGot || Number(x.item.amount) || 0) : 0;
  const [amt, setAmt] = useState(guess);
  const [acc, setAcc] = useState(null);
  const [done, setDone] = useState(null);
  const f = useFold();
  useEffect(() => { setAmt(guess); setAcc(null); setDone(null); f.fold.setValue(1); }, [x && x.key, guess]);
  if (!x) return null;
  const accountId = acc || (x.item.accountId && data.accounts[x.item.accountId] && !data.accounts[x.item.accountId].deleted ? x.item.accountId : defaultIn(data, 'bank') || defaultIn(data, 'cash'));
  const a = data.accounts[accountId];
  const when = x.date === now ? 'Today' : fmtShort(x.date, { weekday: true });
  const steps = guess ? [-20, -10, 0, 10, 20].map((d) => round2(guess + d)).filter((v) => v > 0) : [];
  const got = () => {
    if (!(amt > 0) || !a) { nav.openSheet('text', { title: 'How much did you get?', number: true, value: amt ? String(amt) : '', onPick: (v) => setAmt(Number(v) || 0) }); return; }
    feel.done();
    setDone('yes');
    f.go(() => app.confirmPayday(x.key, { amount: amt, accountId, name: x.item.name || 'Pay', date: x.date }));
  };
  const later = () => { feel.tap(); setDone('later'); f.go(() => app.paydayLater(x.key)); };
  return (
    <Animated.View style={[f.style, style]}>
      <View style={{ backgroundColor: alpha(th.in, 0.1), borderWidth: 1, borderColor: alpha(th.in, 0.25), borderRadius: 24, padding: 16, gap: 10 }}>
        {done ? (
          <View style={{ minHeight: 90, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 }}>
            <Icon name={done === 'yes' ? 'check-circle' : 'clock'} size={24} color={done === 'yes' ? th.in : th.muted} />
            <T weight="semi" color={done === 'yes' ? th.in : th.muted}>{done === 'yes' ? `+${money(amt)} into ${a ? a.name : ''}` : 'Asking again tomorrow'}</T>
          </View>
        ) : (
          <>
            <T size={10.5} color={th.faint} center style={{ letterSpacing: 1.4 }}>💼 PAYDAY · {when.toUpperCase()}{x.item.name ? ` · ${x.item.name.toUpperCase()}` : ''}</T>
            <T serif size={19} center>{x.item.unsure || !guess ? 'How much did you get?' : 'Got paid?'}</T>
            <Pressable onPress={() => nav.openSheet('text', { title: 'How much did you get?', number: true, value: amt ? String(amt) : '', onPick: (v) => setAmt(Number(v) || 0) })} accessibilityRole="button">
              <T serif size={38} color={th.in} center style={{ lineHeight: 46 }}>{amt ? money(amt) : '—'}</T>
            </Pressable>
            <Pressable onPress={() => { const g = a ? groupOf(a) : 'bank'; nav.openSheet('which', { group: g, title: 'Where did it land?', onPick: setAcc }); }} accessibilityRole="button">
              <T size={12.5} color={th.muted} center>into {a ? `${accountEmoji(a)} ${a.name}` : 'an account'} ▾{lastGot ? ` · last time ${money(lastGot)}` : x.item.amount ? ` · you guessed ~${money(Number(x.item.amount))}` : ''}</T>
            </Pressable>
            {x.item.unsure && steps.length ? (
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                {steps.map((v) => (
                  <Pressable key={v} onPress={() => { feel.pick(); setAmt(v); }} style={{ height: 30, paddingHorizontal: 10, borderRadius: 10, justifyContent: 'center', backgroundColor: v === amt ? alpha(th.in, 0.22) : th.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(14,19,26,0.05)' }}>
                    <T size={12.5} weight={v === amt ? 'semi' : 'regular'} color={v === amt ? th.in : th.ink}>{money(v, { decimals: 0 })}</T>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button label="Got it" small style={{ flex: 1, minHeight: 44 }} onPress={got} />
              <Button label="Not paid yet" kind="soft" small style={{ flex: 1, minHeight: 44 }} onPress={later} />
            </View>
            <Pressable onPress={() => { feel.tap(); app.paydaySkip(x.key); }} hitSlop={6} style={{ alignSelf: 'center' }} accessibilityRole="button">
              <T size={12} color={th.faint}>No pay this time{list.length > 1 ? ` · 1 of ${list.length}` : ''}</T>
            </Pressable>
          </>
        )}
      </View>
    </Animated.View>
  );
}

// Sundays, if you haven't counted your wallet that week: a nudge. You can
// count any day with Count.
function SundayCount({ style, onCount }) {
  const app = useApp();
  const th = useTheme();
  const { data, money, flows, homePerUnit } = app;
  const now = today();
  const cashId = defaultIn(data, 'cash');
  const cash = cashId ? data.accounts[cashId] : null;
  if (!cash || data.cashCheck === false || parseYmd(now).getDay() !== 0) return null;
  const last = (data.checkedOn || {})[cash.id] || data.cashCheckedOn || '';
  if (last && daysUntil(last, now) < 6) return null;
  const have = accountBalance(data, cash, { flows, homePerUnit }).native;
  return (
    <View style={[{ backgroundColor: alpha(th.in, 0.1), borderRadius: 20, padding: 14, gap: 10 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <T size={20}>💵</T>
        <T size={13.5} style={{ flex: 1 }}>Sunday count: is there <T size={13.5} weight="semi">{money(have, { currency: cash.currency })}</T> in your wallet?</T>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label="Yes, it's right" kind="soft" small style={{ flex: 1, minHeight: 40 }} onPress={() => { feel.done(); app.update({ checkedOn: { ...(data.checkedOn || {}), [cash.id]: now } }); }} />
        <Button label="No, count it" kind="soft" small style={{ flex: 1, minHeight: 40 }} onPress={() => onCount(cash.id)} />
      </View>
    </View>
  );
}

// The big number counts up from 0 when Home comes into view, and slides to
// its new value when it changes.
const useCount = (target, ms = 700) => useCountUp(target, ms);

function BigNumber({ value, color, text }) {
  const th = useTheme();
  const { money } = useApp();
  const s = text || money(value);
  const k = s.lastIndexOf('.');
  const c = color || (value < 0 ? th.out : th.ink);
  return (
    <T serif size={46} color={c} style={{ lineHeight: 54, letterSpacing: -1 }}>
      {k > 0 ? s.slice(0, k) : s}{k > 0 ? <T serif size={24} color={c}>{s.slice(k)}</T> : null}
    </T>
  );
}

function Tile({ label, value, kind, onPress, icon, plus }) {
  const th = useTheme();
  const { money } = useApp();
  const c = kind === 'in' ? th.in : kind === 'out' ? th.out : value < 0 ? th.out : th.in;
  const shown = useCount(value);
  return (
    <Tilt style={{ flex: 1 }} depth={1.2}>
      <Squish onPress={onPress} accessibilityLabel={`${label} ${money(value)}`} style={{ flex: 1, backgroundColor: kind === 'total' ? (th.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(14,19,26,0.04)') : alpha(c, 0.1), borderRadius: 18, paddingVertical: 11, paddingHorizontal: 6, alignItems: 'center', overflow: 'hidden' }}>
        <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: kind === 'total' ? alpha(th.ink, 0.1) : alpha(c, 0.2), alignItems: 'center', justifyContent: 'center', marginBottom: 5 }}>
          {kind === 'total' ? <T size={13} weight="semi">=</T> : <Icon name={icon} size={13} color={c} />}
        </View>
        <T size={11} color={th.muted}>{label}</T>
        <T serif size={17} color={c} numberOfLines={1} adjustsFontSizeToFit>{money(shown, { plus: (plus || kind === 'in') && shown > 0 })}</T>
      </Squish>
    </Tilt>
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

export function SumRow({ label, value, color, bold, tint: tintIt }) {
  const th = useTheme();
  return (
    <View style={[{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 }, tintIt ? { backgroundColor: alpha(color, 0.1), marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 10 } : null]}>
      <T size={13} weight={bold || tintIt ? 'semi' : 'regular'} color={tintIt ? color : bold ? th.ink : th.muted}>{label}</T>
      <T size={13} weight={bold || tintIt ? 'semi' : 'regular'} color={color || th.ink}>{value}</T>
    </View>
  );
}

// Budgets as small rings under the tiles (only once you've set one).
function BudgetStrip() {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const { data, flows, money } = app;
  const list = live(data.budgets);
  if (!list.length) return null;
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

// What you owe and what you're owed: what's left, a bar of how much is paid
// back, and the date. Tap for the details and Pay some back.
function DebtCard() {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const { data, money } = app;
  const open = liveRecords(data).filter(isOpen);
  if (!open.length) return null;
  const sumOf = (type) => {
    const list = open.filter((r) => r.type === type);
    const curs = [...new Set(list.map((r) => r.currency))];
    const one = curs.length === 1;
    const left = one ? list.reduce((t, r) => t + leftOf(r), 0) : list.reduce((t, r) => t + leftOf(r) * rateOf(r), 0);
    const all = one ? list.reduce((t, r) => t + (Number(r.amount) || 0), 0) : list.reduce((t, r) => t + (Number(r.amount) || 0) * rateOf(r), 0);
    const due = list.map((r) => r.dueDate).filter(Boolean).sort()[0];
    return { list, left: round2(left), all, share: all > 0 ? Math.max(0, Math.min(1, 1 - left / all)) : 0, cur: one ? curs[0] : data.homeCurrency, due };
  };
  const box = (type) => {
    const s = sumOf(type);
    if (!s.list.length) return null;
    const owe = type === 'iowe';
    const single = s.list.length === 1 ? s.list[0] : null;
    const pop = () => {
      if (!single) { nav.setTab('Upcoming', { filter: 'people' }); return; }
      const r = single;
      nav.openSheet('info', {
        title: `🤝 ${owe ? 'I owe' : 'Owed to me'}${r.who ? ` · ${r.who}` : ''}`,
        rows: [
          { label: 'Left', value: money(leftOf(r), { currency: r.currency, decimals: leftOf(r) >= 10000 ? 0 : undefined }), bold: true },
          r.currency !== data.homeCurrency ? { label: `In ${data.homeCurrency}`, value: `≈ ${money(leftOf(r) * rateOf(r), { decimals: 0 })}`, tone: 'muted' } : null,
          { label: owe ? 'Paid so far' : 'Back so far', value: money(paidOf(r), { currency: r.currency, decimals: paidOf(r) >= 10000 ? 0 : undefined }), tone: 'in' },
          { label: owe ? 'Pay back by' : 'Back by', value: r.dueDate ? fmtDate(r.dueDate, { year: true }).replace(/^\d+ /, '') : 'No date', tone: 'muted' },
        ],
        buttons: [{ label: owe ? 'Pay some back' : 'Got some back', onPress: () => nav.openSheet('paydebt', { id: r.id }) }, { label: 'Open', kind: 'secondary', onPress: () => nav.push('record', { id: r.id }) }],
      });
    };
    return (
      <Card key={type} onPress={pop} pad={13} style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <T size={14}>{owe ? 'I owe' : 'Owed to me'}{single && single.who ? <T size={14} color={th.faint}> · {single.who}</T> : s.list.length > 1 ? <T size={14} color={th.faint}> · {s.list.length}</T> : null}</T>
          <T serif size={19} color={owe ? th.ink : th.in}>{money(s.left, { currency: s.cur, decimals: s.left >= 10000 ? 0 : undefined })}</T>
        </View>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: th.soft, overflow: 'hidden' }}>
          <View style={{ width: `${Math.round(s.share * 1000) / 10}%`, height: '100%', borderRadius: 3, backgroundColor: th.in }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T size={12} color={th.faint}>{Math.round(s.share * 100)}% {owe ? 'paid' : 'back'}</T>
          {s.due ? <T size={12} color={s.due < today() ? th.warn : th.faint}>{fmtDate(s.due, { year: true }).replace(/^\d+ /, '')}</T> : null}
        </View>
      </Card>
    );
  };
  const firstOpen = open.length === 1 ? open[0] : null;
  return (
    <View>
      <Section title="Debt" action="Open" onAction={() => (firstOpen ? nav.push('record', { id: firstOpen.id }) : nav.setTab('Upcoming', { filter: 'people' }))} />
      <View style={{ gap: 8, marginTop: 4 }}>
        {box('iowe')}
        {box('owed')}
      </View>
    </View>
  );
}

// One quick action under the line.
function Quick({ icon, label, onPress }) {
  const th = useTheme();
  return (
    <Squish onPress={onPress} accessibilityLabel={label} style={{ width: 66, height: 62, borderRadius: 20, backgroundColor: th.card, alignItems: 'center', justifyContent: 'center', gap: 3, borderWidth: 1, borderColor: th.line }}>
      <T size={19}>{icon}</T>
      <T size={11} weight="medium" color={th.muted}>{label}</T>
    </Squish>
  );
}

// Home for one pinned category or person.
function PinnedView({ focus }) {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const { data, flows, money } = app;
  const now = today();
  const ws = data.weekStart === 0 ? 0 : data.weekStart || 1;
  const month = periodOf(now, 'month', { weekStart: ws, monthStart: data.monthStartDay || 1 });
  const lastM = periodOf(addDays(month.from, -1), 'month', { weekStart: ws, monthStart: data.monthStartDay || 1 });
  if (focus.type === 'cat') {
    const cat = data.categories[focus.id];
    if (!cat || cat.deleted) return null;
    const income = cat.kind === 'income';
    const sum = (a, b) => round2(flows.reduce((t, f) => (f.categoryId === cat.id && f.count === (income ? 'income' : 'expense') && f.date >= a && f.date <= b ? t + Math.abs(f.home) : t), 0));
    const lastSameDay = addDays(lastM.from, daysUntil(month.from, now));
    const thisM = sum(month.from, now);
    const prev = sum(lastM.from, lastSameDay < lastM.to ? lastSameDay : lastM.to);
    const diff = round2(thisM - prev);
    const recs = liveRecords(data).filter((r) => r.categoryId === cat.id && r.status !== 'skipped').sort(byNewest).slice(0, 25);
    return (
      <View>
        <View style={{ alignItems: 'center', marginTop: 14 }}>
          <T size={10.5} color={th.faint} style={{ letterSpacing: 1.4 }}>{cat.emoji} {cat.name.toUpperCase()} · {fmtDate(now, { long: true, year: false }).split(' ').slice(-1)[0].toUpperCase()}</T>
          <BigNumber value={thisM} color={income ? th.in : th.ink} />
          <T size={12.5} color={th.muted}>{prev || thisM ? `${diff >= 0 ? '▲' : '▼'} ${money(Math.abs(diff))} vs this time last month` : 'Nothing yet this month'}</T>
        </View>
        <Section title={`All ${cat.name}`} action="Report" onAction={() => nav.push('category', { id: cat.id })} />
        {recs.length ? recs.map((r, i) => <RecordRow key={r.id} record={r} first={i === 0} showDate onPress={() => nav.push('record', { id: r.id })} />)
          : <T size={14} color={th.faint} style={{ paddingVertical: 12 }}>No records in {cat.name} yet.</T>}
      </View>
    );
  }
  const name = focus.id;
  const recs = liveRecords(data).filter((r) => (r.type === 'iowe' || r.type === 'owed') && (r.who || '').trim() === name).sort(byNewest);
  const openOwe = recs.filter((r) => isOpen(r) && r.type === 'iowe');
  const openOwed = recs.filter((r) => isOpen(r) && r.type === 'owed');
  const oweHome = round2(openOwe.reduce((t, r) => t + homeOf(r), 0));
  const owedHome = round2(openOwed.reduce((t, r) => t + homeOf(r), 0));
  const one = openOwe.length === 1 ? openOwe[0] : openOwed.length === 1 && !openOwe.length ? openOwed[0] : null;
  const foreign = one && one.currency !== data.homeCurrency;
  return (
    <View>
      <View style={{ alignItems: 'center', marginTop: 14 }}>
        <T size={10.5} color={th.faint} style={{ letterSpacing: 1.4 }}>👤 {name.toUpperCase()} · {oweHome ? 'I OWE' : owedHome ? 'OWES ME' : 'ALL SETTLED'}</T>
        {foreign && data.showAmounts !== 'home'
          ? <BigNumber value={1} text={money(one.amount, { currency: one.currency })} color={oweHome ? th.out : th.in} />
          : <BigNumber value={oweHome || owedHome} color={oweHome ? th.out : owedHome ? th.in : th.ink} />}
        <T size={12.5} color={th.muted}>{[foreign && data.showAmounts === 'both' ? `≈ ${money(homeOf(one), { decimals: 0 })} ${data.homeCurrency}` : null, one && one.dueDate ? `pay back by ${fmtShort(one.dueDate)}` : null].filter(Boolean).join(' · ') || `${recs.length} record${recs.length === 1 ? '' : 's'}`}</T>
      </View>
      <Section title={`Everything with ${name}`} />
      {recs.map((r, i) => <RecordRow key={r.id} record={r} first={i === 0} showDate onPress={() => nav.push('record', { id: r.id })} />)}
    </View>
  );
}

export default function Home() {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const insets = useSafeAreaInsets();
  const { data, flows, money, second, homePerUnit } = app;
  const now = today();
  const motion = !data.reduceMotion;
  const accounts = live(data.accounts);
  const groups = useMemo(() => homeGroups(data, { flows, homePerUnit }), [data.accounts, flows, homePerUnit]);

  // What Home is looking at: everything, a group (all banks), one account,
  // or a pinned category or person.
  const raw = data.homeFocus || (data.homeAccount ? `acc:${data.homeAccount}` : 'all');
  const [ftype, ...rest] = String(raw).split(':');
  const fid = rest.join(':');
  let focus = { type: 'all' };
  if (ftype === 'group' && groups.some((g) => g.id === fid)) focus = { type: 'group', id: fid };
  else if (ftype === 'acc' && data.accounts[fid] && !data.accounts[fid].deleted) focus = { type: 'acc', id: fid };
  else if (ftype === 'cat' && data.categories[fid] && !data.categories[fid].deleted) focus = { type: 'cat', id: fid };
  else if (ftype === 'person' && fid) focus = { type: 'person', id: fid };
  const setFocus = (f) => { feel.pick(); app.update({ homeFocus: f, homeAccount: null }); };
  const group = focus.type === 'group' ? groups.find((g) => g.id === focus.id) : focus.type === 'acc' ? groups.find((g) => g.accounts.some((a) => a.id === focus.id)) : null;
  const ids = focus.type === 'group' ? group.accounts.map((a) => a.id) : focus.type === 'acc' ? [focus.id] : null;
  const bal = (a) => accountBalance(data, a, { flows, homePerUnit }).home;
  const total = useMemo(() => accounts.reduce((s, a) => s + bal(a), 0), [data.accounts, flows, homePerUnit]);

  const period = ['week', 'month', 'total'].includes(data.homePeriod) ? data.homePeriod : 'month';
  const ws = data.weekStart === 0 ? 0 : data.weekStart || 1;
  const pr = (k) => periodOf(now, k, { weekStart: ws, monthStart: data.monthStartDay || 1 });
  const first = useMemo(() => {
    let m = liveRecords(data).reduce((x, r) => (r.date < x ? r.date : x), now);
    accounts.forEach((a) => { if (a.openingDate && a.openingDate < m) m = a.openingDate; });
    return m;
  }, [data.records, data.accounts]);
  const lineFrom = period === 'total' ? first : pr(period).from;
  const until = period === 'week' ? pr('week').to : pr('month').to;
  const idsKey = ids ? ids.join(',') : '';
  const line = useMemo(() => balanceLine(data, { flows, from: lineFrom, now, until, accountIds: ids }), [flows, data.records, data.repeats, data.accounts, lineFrom, until, idsKey]);
  const jarList = jars(data);
  const showGold = (focus.type === 'all' || (focus.type === 'group' && focus.id === 'savings')) && jarList.length;
  const gold = useMemo(() => {
    if (!showGold) return null;
    const pts = savedLine(data, { from: lineFrom, now, flows });
    return pts.some((p) => p.v > 0) ? pts : null;
  }, [showGold, flows, lineFrom, data.accounts]);
  const ticks = period === 'week'
    ? [[lineFrom, `${DAY_NAMES[parseYmd(lineFrom).getDay()]} ${parseYmd(lineFrom).getDate()}`], [now, 'Today']]
    : period === 'month' ? [[lineFrom, fmtShort(lineFrom)], [now, 'Today'], [until, String(parseYmd(until).getDate())]]
      : [[lineFrom, fmtShort(lineFrom)], [now, 'Today']];

  const rangeFrom = period === 'total' ? '0000-01-01' : pr(period).from;
  const accFlows = useMemo(() => (ids ? flows.filter((f) => ids.includes(f.accountId)) : flows), [flows, idsKey]);
  const ie = useMemo(() => incomeExpense(data, rangeFrom, now, accFlows), [accFlows, rangeFrom, now]);
  // Looking at the jars: what went in and out of them, not cash in and out.
  const jarView = focus.type === 'group' && focus.id === 'savings';
  const jarMoves = useMemo(() => {
    let put = 0;
    let out = 0;
    if (!jarView) return { put, out };
    const want = new Set(ids || []);
    flows.forEach((f) => {
      if (!want.has(f.accountId) || f.date > now || (period !== 'total' && f.date < rangeFrom)) return;
      if (f.home > 0) put += f.home; else out -= f.home;
    });
    return { put: Math.round(put * 100) / 100, out: Math.round(out * 100) / 100 };
  }, [jarView, flows, ids && ids.join(), rangeFrom, now, period]);
  // Tiles open Records showing the same accounts and dates.
  const openRecs = (counts) => () => nav.setTab('Records', {
    counts: counts || null, from: period === 'total' ? null : rangeFrom, to: now,
    group: focus.type === 'group' ? focus.id : null, accountId: focus.type === 'acc' ? focus.id : null,
  });
  const other = useMemo(() => otherMoves(period === 'total' ? null : rangeFrom, now, accFlows), [accFlows, rangeFrom, now]);
  const shownNow = ids ? round2(ids.reduce((t, id) => t + bal(data.accounts[id]), 0)) : total;

  const [scrub, setScrub] = useState(null);
  const counted = useCount(shownNow, 700);
  const big = scrub ? scrub.v : counted;
  const endWord = period === 'week' ? fmtDate(until, { weekday: true, long: true, year: false }).split(' ')[0] : fmtShort(until);
  const [details, setDetails] = useState(false);
  const toggleDetails = () => { feel.pick(); setDetails((d) => !d); };
  const focusName = focus.type === 'group' ? `${group.label}${group.accounts.length > 1 ? ' · all' : ''}` : focus.type === 'acc' ? data.accounts[focus.id].name : null;
  const label = scrub ? (scrub.pin ? `After ${scrub.name}, ${fmtShort(scrub.due, { weekday: true })}` : fmtDate(scrub.date, { weekday: true, year: false })) : focusName ? `${focusName} now` : 'Balance now';

  const margin = marginOf(data);
  const spend = useMemo(() => toSpend(data, { flows, homePerUnit }), [flows, data.accounts, data.margin, homePerUnit]);
  const pd = useMemo(() => perDay(data, { flows, homePerUnit, now }), [flows, data.paydays, data.paydayDone, data.records, data.repeats, data.margin]);
  const hasPaydays = (data.paydays && data.paydays.how === 'varies') || ((data.paydays && data.paydays.items) || []).length > 0;
  const marginAcc = data.accounts[margin.accountId || defaultIn(data, 'bank')];
  const marginHere = margin.on && (!ids || (margin.accountId ? ids.includes(margin.accountId) : group && group.id === 'bank'));

  const recent = useMemo(() => recentRecords(data, 4), [data.records]);
  const sec = second(shownNow, 'home');
  const cardOn = (id) => { const c = (data.homeCards || []).find((x) => x.id === id); return !c || !c.hidden; };
  const cards = (data.homeCards || []).filter((c) => !c.hidden && !['month', 'coming', 'budgets', 'debts'].includes(c.id));
  const who = initials(data.google && data.google.name) || initials(data.ownerName);
  const pins = (data.pins || []).filter((p) => (p.type === 'cat' ? data.categories[p.id] && !data.categories[p.id].deleted : !!p.id));


  // Count: the account you're looking at, else your wallet, else your bank.
  const count = (aid) => {
    const id = aid || (focus.type === 'acc' ? focus.id : focus.type === 'group' ? defaultIn(data, focus.id) : defaultIn(data, 'cash') || defaultIn(data, 'bank'));
    if (!id) { nav.push('account', {}); return; }
    nav.openSheet('check', { accountId: id });
  };
  // Save: from your default bank into the Bank jar (or cash into the Cash jar
  // when you're looking at cash).
  const saveMoney = () => {
    const fromCash = group && group.id === 'cash';
    const td = data.typeDefaults || {};
    const ok = (id) => (id && data.accounts[id] && !data.accounts[id].deleted ? id : null);
    const from = (!group && ok(td.saveFrom)) || (fromCash ? defaultIn(data, 'cash') : defaultIn(data, 'bank') || defaultIn(data, 'cash'));
    const jar = (ok(td.saveTo) && data.accounts[td.saveTo]) || jarList.find((j) => j.jar === (groupOf(data.accounts[from] || {}) === 'cash' ? 'cash' : 'bank')) || jarList[0];
    nav.push('add', { type: 'transfer', prefill: { accountId: from, toAccountId: jar ? jar.id : null } });
  };
  const pinMenu = (p, i) => {
    feel.firm();
    nav.openSheet('choice', {
      title: p.type === 'cat' ? (data.categories[p.id] || {}).name : p.id,
      options: [{ id: 'left', label: 'Move left' }, { id: 'right', label: 'Move right' }, { id: 'off', label: 'Unpin from Home' }],
      onPick: (k) => {
        const list = [...(data.pins || [])];
        const at = list.findIndex((x) => x.type === p.type && x.id === p.id);
        if (k === 'off') { list.splice(at, 1); if (raw === `${p.type}:${p.id}`) app.update({ homeFocus: 'all' }); }
        if (k === 'left' && at > 0) [list[at - 1], list[at]] = [list[at], list[at - 1]];
        if (k === 'right' && at < list.length - 1) [list[at + 1], list[at]] = [list[at], list[at + 1]];
        app.update({ pins: list });
      },
    });
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
                <Bar parts={[{ pct, color: th.gold }]} />
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
  const net = round2(ie.income - ie.expense);
  const savedWord = period === 'week' ? 'this week' : period === 'month' ? 'this month' : 'since you started';
  const pinned = focus.type === 'cat' || focus.type === 'person';

  // Under the balance, one line: what's free to spend (and the margin).
  // Tap it for the sum behind it.
  const spendInfo = () => {
    const rows = [{ label: 'Balance', sub: 'outside the jars', value: money(spend + margin.amount) }];
    if (margin.on) rows.push({ label: `🛡 Kept aside in ${marginAcc ? marginAcc.name : 'Bank'}`, value: money(-margin.amount), tone: 'out' });
    rows.push({ label: 'To spend', value: money(spend), bold: true });
    if (pd) {
      const due = upcomingUntil(data, addDays(pd.next.date, -1), now).items;
      due.forEach((it) => {
        const r = itemRecord(it);
        const cat = data.categories[r.categoryId];
        rows.push({ label: `${cat && !cat.deleted ? `${cat.emoji} ` : ''}${displayName(r, data) || 'Bill'}, ${DOW[parseYmd(it.date).getDay()]}`, value: money(itemEffect(it), { plus: itemEffect(it) > 0 }), tone: itemEffect(it) > 0 ? 'in' : 'out' });
      });
      rows.push({ label: `Left till payday ${DOW[parseYmd(pd.next.date).getDay()]}`, value: money(pd.left) });
      rows.push({ label: `A day · ${money(pd.left)} ÷ ${pd.days} ${pd.days === 1 ? 'day' : 'days'}`, value: `≈ ${money(pd.each, { decimals: 0 })}`, bold: true });
    }
    nav.openSheet('info', {
      title: 'To spend', rows,
      note: !hasPaydays ? 'Tell Bag your payday and this shows how much you have a day till then.' : null,
      buttons: !hasPaydays ? [{ label: 'Set your payday', kind: 'secondary', onPress: () => nav.push('paydays') }] : null,
    });
  };
  const spendLine = () => {
    if (scrub || pinned) return null;
    if (ids) {
      return (
        <View style={{ alignItems: 'center', minHeight: 30, paddingTop: 2 }}>
          {marginHere ? <T size={13} color="#8FB8E8">🛡 {money(margin.amount, { decimals: 0 })} kept aside</T> : null}
        </View>
      );
    }
    return (
      <Pressable onPress={() => { feel.tap(); spendInfo(); }} accessibilityRole="button" accessibilityLabel={`${money(spend)} to spend. Tap for how it's worked out`} hitSlop={6} style={{ alignItems: 'center', minHeight: 30, paddingTop: 2, paddingHorizontal: 10 }}>
        <T size={13.5} color={th.muted}>
          <T size={13.5} weight="semi">{money(spend)}</T> to spend{margin.on ? <T size={13.5} color="#8FB8E8"> · 🛡 {money(margin.amount, { decimals: 0 })}</T> : null}
        </T>
      </Pressable>
    );
  };

  // The breakdown card (shown after you tap the line) and its pop-up.
  const spendDays = useMemo(() => {
    const from = period === 'total' ? addDays(now, -29) : rangeFrom;
    const spent = new Set();
    accFlows.forEach((f) => { if (f.count === 'expense' && f.date >= from && f.date <= now) spent.add(f.date); });
    let free = 0;
    for (let d = from; d <= now; d = addDays(d, 1)) if (!spent.has(d)) free += 1;
    let run = 0;
    for (let d = now; d >= from && !spent.has(d); d = addDays(d, -1)) run += 1;
    return { free, run };
  }, [accFlows, rangeFrom, now, period]);
  const lineInfo = () => {
    const days = {};
    let big = null;
    accFlows.forEach((f) => {
      if (!f.count || f.date > now || (period !== 'total' && f.date < rangeFrom)) return;
      days[f.date] = (days[f.date] || 0) + f.home;
      if (f.count === 'expense' && (!big || f.home < big.home)) big = f;
    });
    const best = Object.entries(days).sort((x, y) => y[1] - x[1])[0];
    nav.openSheet('info', {
      title: period === 'week' ? 'This week' : period === 'month' ? 'This month' : 'Since you started',
      rows: [
        best && best[1] > 0 ? { label: 'Best day', value: `${fmtShort(best[0], { weekday: true })} · ${money(best[1], { plus: true })}`, tone: 'in' } : null,
        big ? { label: 'Biggest spend', value: `${displayName(big.record, data)} · ${money(big.home)}`, tone: 'out' } : null,
        period !== 'total' ? { label: `By ${endWord}`, value: money(line.end), tone: line.end < 0 ? 'out' : null } : null,
        !ids && pd && pd.days > 1 ? { label: `≈ a day till payday ${DOW[parseYmd(pd.next.date).getDay()]}`, value: money(pd.each, { decimals: 0 }) } : null,
        sec ? { label: `In ${sec.currency}`, value: `≈ ${fmtApprox(sec.amount, sec.currency)}`, tone: 'muted' } : null,
      ],
    });
  };

  // A tile's pop-up: what's in it, by category.
  const tileInfo = (which) => {
    if (which === 'total') {
      nav.openSheet('info', {
        title: period === 'week' ? 'This week' : period === 'month' ? 'This month' : 'Since you started',
        rows: [
          { label: 'Cash in', value: money(ie.income, { plus: true }), tone: 'in' },
          { label: 'Cash out', value: money(-ie.expense), tone: 'out' },
          { label: net >= 0 ? 'Kept' : 'Overspent', value: money(net, { plus: net > 0 }), tone: net >= 0 ? 'in' : 'out', bold: true },
          other ? { label: 'People and moves (not counted)', value: money(other, { plus: other > 0 }), tone: 'muted' } : null,
        ],
      });
      return;
    }
    const by = {};
    accFlows.forEach((f) => {
      if (f.count !== which || f.date > now || (period !== 'total' && f.date < rangeFrom)) return;
      const k = f.categoryId || 'other';
      by[k] = (by[k] || 0) + Math.abs(f.home);
    });
    const rows = Object.entries(by).sort((x, y) => y[1] - x[1]).map(([cid, v]) => {
      const c = data.categories[cid];
      return { label: `${c ? `${c.emoji} ${c.name}` : 'Other'}`, value: money(which === 'income' ? v : -v, { plus: which === 'income' }), tone: which === 'income' ? 'in' : 'out', onPress: () => nav.push('category', { id: cid }) };
    });
    nav.openSheet('info', {
      title: `${which === 'income' ? 'Cash in' : 'Cash out'} · ${period === 'week' ? 'this week' : period === 'month' ? 'this month' : 'all time'}`,
      rows: rows.length ? rows : [{ label: 'Nothing yet', dim: true }],
      buttons: [{ label: 'See the records', kind: 'secondary', onPress: openRecs(which) }],
    });
  };

  // Quick add: "lunch 15 cash".
  const [qa, setQa] = useState('');
  const qaRef = useRef(null);
  const quick = qa.trim() ? parseQuick(data, qa) : null;
  const quickSave = () => {
    if (!quick || !(quick.amount > 0)) { feel.warn(); return; }
    const acc = data.accounts[quick.accountId];
    if (!acc) { nav.push('account', {}); return; }
    app.saveRecord({ type: 'expense', amount: quick.amount, name: quick.name ? quick.name[0].toUpperCase() + quick.name.slice(1) : '', categoryId: quick.categoryId || 'other', accountId: acc.id, currency: acc.currency, date: now });
    feel.done();
    setQa('');
  };

  // Low balance: the first day the watched account goes below 0.
  const fc = useMemo(() => (data.lowWarn && data.lowWarn.on === false ? null : forecast(data, { flows, homePerUnit, now, days: 45 })), [flows, data.repeats, data.records, data.paydays, data.margin, data.lowWarn, homePerUnit]);

  // Next up: each bill once (its next date), the soonest 3, within N days.
  const upDays = Number(data.nextUpDays) || 7;
  const next3 = useMemo(() => {
    const seen = new Set();
    return comingUp(data, { days: upDays }).filter((it) => {
      if (it.kind === 'upcoming' && it.date <= now) return false;
      if ((it.kind === 'due' || it.kind === 'owedToMe') && (!it.record.dueDate || it.record.dueDate > addDays(now, upDays))) return false;
      const r = itemRecord(it);
      const k = (it.repeat && it.repeat.id) || r.repeatId || it.key;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 3);
  }, [data.records, data.repeats, upDays]);
  const comingInfo = (it) => showComing(it, app, nav);

  return (
    <View style={{ flex: 1, backgroundColor: th.bg }}>
      <TabTint tab="Home" />
      <Backdrop />
      <ScrollView scrollEnabled={!scrub} contentContainerStyle={{ paddingTop: insets.top + 10, paddingHorizontal: 18, paddingBottom: 110 + insets.bottom }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 }}>
          <T size={13} weight="medium" color={th.muted}>{fmtDate(now, { weekday: true, long: true, year: false })}</T>
          <Squish onPress={() => nav.push('settings')} accessibilityLabel="Settings" style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: '#9AB6EE', alignItems: 'center', justifyContent: 'center' }}>
            {who ? <T size={13} weight="semi" color="#0E131A">{who}</T> : <Icon name="settings" size={17} color="#0E131A" />}
          </Squish>
        </View>

        <Appear delay={60}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, marginHorizontal: -18 }} contentContainerStyle={{ paddingHorizontal: 18, gap: 6, flexGrow: 1, justifyContent: 'center' }}>
            {groups.length > 1 ? <Pill label="All" on={focus.type === 'all'} onPress={() => setFocus('all')} /> : null}
            {groups.map((g) => {
              const on = (focus.type === 'group' && focus.id === g.id) || (focus.type === 'acc' && g.accounts.some((a) => a.id === focus.id));
              return <Pill key={g.id} label={`${g.emoji || accountEmoji(g.accounts[0])} ${money(g.home)}`} sub={g.label} color={g.color || '#C9D3DF'} on={on} onPress={() => setFocus(g.single ? `acc:${g.accounts[0].id}` : `group:${g.id}`)} />;
            })}
            <Pill dashed label="+" sub="Add an account" onPress={() => nav.push('account', {})} />
          </ScrollView>
        </Appear>

        {group && !group.single && group.accounts.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6, marginHorizontal: -18 }} contentContainerStyle={{ paddingHorizontal: 18, gap: 6, flexGrow: 1, justifyContent: 'center' }}>
            {group.accounts.map((a) => (
              <Pill key={a.id} small label={`${a.name} ${money(bal(a), { decimals: 0 })}${(data.defaultAccount || {})[group.id] === a.id ? ' ★' : ''}`} sub={a.name} on={focus.type === 'acc' && focus.id === a.id} onPress={() => setFocus(focus.type === 'acc' && focus.id === a.id ? `group:${group.id}` : `acc:${a.id}`)} />
            ))}
            {group.id !== 'savings' ? <Pill small dashed label={`+ ${group.id === 'bank' ? 'Bank' : 'Cash'}`} sub="Add another" onPress={() => nav.push('account', { kind: group.id })} /> : <Pill small dashed label="🫙 Open jars" sub="Put in, take out, spend" onPress={() => nav.push('savings')} />}
          </ScrollView>
        ) : null}

        {pins.length || focus.type === 'all' ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6, marginHorizontal: -18 }} contentContainerStyle={{ paddingHorizontal: 18, gap: 6, flexGrow: 1, justifyContent: 'center' }}>
            {pins.map((p, i) => {
              const c = p.type === 'cat' ? data.categories[p.id] : null;
              const key = `${p.type}:${p.id}`;
              return <Pill key={key} small round label={c ? `${c.emoji} ${c.name}` : `👤 ${p.id}`} on={raw === key} onPress={() => setFocus(raw === key ? 'all' : key)} onLongPress={() => pinMenu(p, i)} />;
            })}
            <Pill small round dashed label="+ Pin" sub="Pin a category or person" onPress={() => nav.openSheet('pin', {})} />
          </ScrollView>
        ) : null}

        {pinned ? <PinnedView focus={focus} /> : (
          <>
            <View style={{ marginTop: 12, alignItems: 'center' }}>
              <T size={10.5} color={th.faint} style={{ letterSpacing: 1.4 }}>{label.toUpperCase()}</T>
              <BigNumber value={big} color={scrub && scrub.pin ? (scrub.v < 0 ? th.out : th.muted) : null} />
              {scrub ? (
                <T size={12} color={th.muted} numberOfLines={1} center style={{ minHeight: 40, paddingTop: 4 }}>
                  {(scrub.pin ? [{ emoji: scrub.pin, name: scrub.name, amount: scrub.amount }] : scrub.ev).length
                    ? (scrub.pin ? [{ emoji: scrub.pin, name: scrub.name, amount: scrub.amount }] : scrub.ev).map((e, i) => (
                      <T key={i} size={12} color={th.muted}>{i ? ' · ' : ''}{e.emoji} {e.name} <T size={12} color={e.amount > 0 ? th.in : th.out}>{money(e.amount, { plus: e.amount > 0 })}</T></T>))
                    : 'Nothing in or out that day'}
                </T>
              ) : spendLine()}
            </View>

            <View style={{ marginHorizontal: -18, marginTop: 2 }}>
              <BalanceLine line={line} ticks={ticks} money={money} motion={motion} onScrub={setScrub} period={two} details={details} onTap={toggleDetails} height={160} gold={gold} />
            </View>
            {two || gold ? (
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
                {two ? <Legend color={th.lineB} label="With carried in" /> : null}
                {two ? <Legend color={th.lineP} label={`This ${period} only`} /> : null}
                {gold ? <Legend color={th.gold} label="Saved" /> : null}
              </View>
            ) : null}
            {details ? (
              <Pressable onPress={() => { feel.tap(); lineInfo(); }} accessibilityRole="button" accessibilityLabel="Breakdown. Tap for more" style={{ backgroundColor: th.card, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 6, marginTop: 8 }}>
                <SumRow label={period === 'total' ? `Opening (${fmtShort(lineFrom)})` : 'Carried in'} value={money(line.start)} />
                <SumRow label="+ Cash in" value={money(ie.income, { plus: true })} color={th.in} />
                <SumRow label="− Cash out" value={money(-ie.expense)} color={th.out} />
                {other ? <SumRow label="People and moves" value={money(other, { plus: other > 0 })} /> : null}
                <SumRow label={net >= 0 ? `Kept ${savedWord}` : `Overspent ${savedWord}`} value={money(net, { plus: net > 0 })} color={net >= 0 ? th.in : th.out} tint />
                <SumRow label="You have now" value={money(line.now)} bold />
                <SumRow label="No-spend days" value={`${spendDays.free}${spendDays.run > 1 ? ` · 🔥 ${spendDays.run} in a row` : ''}`} />
              </Pressable>
            ) : null}

            <Seg small style={{ marginTop: 10, alignSelf: 'center', width: 240 }} items={[{ id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }, { id: 'total', label: 'Total' }]} value={period} onChange={(v) => app.update({ homePeriod: v })} />

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: th.card, borderRadius: 16, borderWidth: 1, borderColor: th.line, paddingLeft: 14, paddingRight: 6, minHeight: 48 }}>
              <TextInput ref={qaRef} value={qa} onChangeText={setQa} onSubmitEditing={quickSave} returnKeyType="done" blurOnSubmit={false} placeholder="Quick add: lunch 15 cash" placeholderTextColor={th.faint2} accessibilityLabel="Quick add"
                style={{ flex: 1, fontFamily: F.regular, fontSize: 15 * (th.textScale || 1), color: th.ink, paddingVertical: 10, outlineStyle: 'none' }} />
              {quick && quick.amount > 0 ? (
                <Pressable onPress={quickSave} accessibilityRole="button" accessibilityLabel="Save" style={{ height: 36, paddingHorizontal: 12, borderRadius: 11, backgroundColor: th.chipOn, justifyContent: 'center' }}><T size={13} weight="semi" color={th.chipOnInk}>Save</T></Pressable>
              ) : (
                <Pressable onPress={() => { feel.tap(); if (qaRef.current) qaRef.current.focus(); app.showToast("Tap the mic on your keyboard and say it, like 'lunch 15 cash'"); }} accessibilityRole="button" accessibilityLabel="Say it" style={{ width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }}><T size={17}>🎙</T></Pressable>
              )}
            </View>
            {quick ? (() => {
              const c = data.categories[quick.categoryId];
              const a = data.accounts[quick.accountId];
              return (
                <T size={12.5} color={th.muted} style={{ marginTop: 6, marginHorizontal: 4 }} numberOfLines={2}>
                  {quick.amount > 0 ? <T size={12.5} weight="semi" color={th.out}>{money(-quick.amount)}</T> : 'Add an amount, like "lunch 15 cash"'}
                  {quick.amount > 0 ? ` · ${quick.name || 'no name'} · ${c ? `${c.emoji} ${c.name}` : '🏷️ Other'} · ${a ? `${accountEmoji(a)} ${a.name}` : 'no account'}` : ''}
                </T>
              );
            })() : null}

            <Appear delay={180}>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 14 }}>
                <Quick icon="⇄" label="Move" onPress={() => nav.push('add', { type: 'transfer' })} />
                <Quick icon="🫙" label="Save" onPress={saveMoney} />
                <Quick icon="💵" label="Count" onPress={() => count()} />
                <Quick icon="🧾" label="Bills" onPress={() => nav.push('add', { type: 'expense', prefill: { categoryId: 'bills' }, repeatPreset: 'monthly' })} />
              </View>
            </Appear>

            <AskCard style={{ marginTop: 12 }} />
            <PaydayCard style={{ marginTop: 12 }} />
            <SundayCount style={{ marginTop: 12 }} onCount={count} />

            {cardOn('month') ? (
              <Appear delay={260}>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
                  {jarView ? (
                    <>
                      <Tile label="Put in" value={jarMoves.put} kind="in" icon="arrow-up" onPress={openRecs()} />
                      <Tile label="Taken out" value={-jarMoves.out} kind="out" icon="arrow-down" onPress={openRecs()} />
                      <Tile label="Saved" value={jarMoves.put - jarMoves.out} kind="total" plus onPress={() => nav.push('savings')} />
                    </>
                  ) : (
                    <>
                      <Tile label="Cash in" value={ie.income} kind="in" icon="arrow-up" onPress={() => tileInfo('income')} />
                      <Tile label="Cash out" value={-ie.expense} kind="out" icon="arrow-down" onPress={() => tileInfo('expense')} />
                      <Tile label="Total" value={net} kind="total" plus onPress={() => tileInfo('total')} />
                    </>
                  )}
                </View>
              </Appear>
            ) : null}
            {fc && fc.firstNeg && !pinned && (!ids || ids.includes(fc.account.id)) ? (
              <Pressable onPress={() => { feel.tap(); nav.setTab('Upcoming', { day: fc.firstNeg }); }} accessibilityRole="button" accessibilityLabel={`${fc.account.name} goes below 0 on ${fmtShort(fc.firstNeg, { weekday: true })}. Open Upcoming`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, minHeight: 46, paddingHorizontal: 14, borderRadius: 16, backgroundColor: alpha(th.out, 0.1), borderWidth: 1, borderColor: alpha(th.out, 0.3) }}>
                <T size={15}>⚠️</T>
                <T size={13.5} style={{ flex: 1 }} numberOfLines={1}><T size={13.5} weight="semi">{fc.account.name} below 0</T> · {fc.firstNeg === now ? 'now' : fmtShort(fc.firstNeg, { weekday: true })}</T>
                <T size={16} color={th.faint}>›</T>
              </Pressable>
            ) : null}

            <BudgetStrip />
            {cardOn('debts') ? <Appear delay={320}><DebtCard /></Appear> : null}

            {cardOn('coming') ? (
              <>
                <Section title={`Next up · ${upDays === 1 ? 'today and tomorrow' : `${upDays} days`}`} action="See all" onAction={() => nav.setTab('Upcoming')} />
                {next3.length ? next3.map((it) => {
                  const row = comingRow(it, data);
                  const rec = itemRecord(it);
                  const cat = data.categories[rec.categoryId];
                  const toJar = rec.type === 'transfer' && isJar(data.accounts[rec.toAccountId]);
                  const days = daysUntil(now, it.kind === 'due' || it.kind === 'owedToMe' ? (rec.dueDate || it.date) : it.date);
                  return (
                    <Squish key={it.key} onPress={() => comingInfo(it)} accessibilityLabel={`${row.name}, ${money(row.value)}, ${row.sub}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 9 }}>
                      <Bubble emoji={toJar ? '🫙' : rec.type === 'transfer' ? '🔀' : cat && !cat.deleted ? cat.emoji : '🤝'} color={toJar ? th.gold : catColor(cat)} />
                      <View style={{ flex: 1 }}>
                        <T numberOfLines={1}>{row.name}</T>
                        <T size={12.5} color={th.faint}>{fmtShort(it.kind === 'due' || it.kind === 'owedToMe' ? rec.dueDate : it.date, { weekday: true })}</T>
                      </View>
                      <T size={14.5} color={toJar ? th.gold : row.kind === 'in' ? th.in : row.kind === 'out' ? th.out : th.muted}>{money(row.value, { plus: row.kind === 'in', currency: row.currency })}</T>
                      <DaysRing days={days} color={toJar ? th.gold : catColor(cat)} />
                    </Squish>
                  );
                }) : <T size={14} color={th.faint} style={{ paddingVertical: 10 }}>Nothing due in the next {upDays} {upDays === 1 ? 'day' : 'days'}</T>}
              </>
            ) : null}

            {cards.map((c) => <View key={c.id} style={{ marginTop: 8 }}>{renderCard(c)}</View>)}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// A pill: account groups, banks inside a group, pinned things, and the
// dashed + buttons (small, so the big + stays the one for new records).
function Pill({ label, sub, on, onPress, onLongPress, color, dashed, small, round }) {
  const th = useTheme();
  return (
    <Squish onPress={onPress} onLongPress={onLongPress} accessibilityRole="tab" accessibilityLabel={sub ? `${sub}: ${label}` : label}
      style={{
        height: small ? 28 : 32, minWidth: dashed && !small ? 32 : undefined, paddingHorizontal: dashed && !small ? 0 : small ? 10 : 11, borderRadius: round ? 14 : small ? 9 : 11,
        backgroundColor: on ? th.chipOn : dashed ? 'transparent' : color ? alpha(color, 0.14) : th.card,
        borderWidth: dashed || (small && !on && !color) ? 1.2 : 0, borderStyle: dashed ? 'dashed' : 'solid', borderColor: th.lineStrong,
        alignItems: 'center', justifyContent: 'center',
      }}>
      <EmojiLabel text={label} size={small ? 11.5 : 12.5} weight={on ? 'semi' : 'medium'} color={on ? th.chipOnInk : dashed ? th.faint : color ? tint(color, th.mode === 'dark' ? 0.25 : -0.35) : th.muted} />
    </Squish>
  );
}

export function Section({ title, action, onAction }) {
  const th = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, marginBottom: 2, marginHorizontal: 2 }}>
      <T size={12} color={th.muted}>{title}</T>
      {action ? <Pressable onPress={() => { feel.tap(); onAction(); }} hitSlop={10} accessibilityRole="button"><T size={13} weight="medium" color={th.chipOn}>{action}</T></Pressable> : null}
    </View>
  );
}
