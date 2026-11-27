// 2.2's sheets: checking an account (wallet count, bank app), pinning a
// category or person to Home, the exchange rate, and which bank or jar.
import React, { useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useApp } from '../state/store';
import { Bubble, Button, F, Icon, Row, Seg, T, Toggle, useTheme, Press as Pressable } from '../ui/kit';
import { accountEmoji, alpha, catColor } from '../lib/look';
import { accountBalance, leftOf, live } from '../lib/ledger';
import { Calendar } from '../ui/calendar';
import { addDays, fmtShort, today } from '../lib/dates';
import { expectedFor, groupOf, sortAccounts } from '../lib/plan';
import { latestRate, savedRate } from '../lib/rates';
import { cleanNum, fmt, parseAmount, round2 } from '../lib/money';
import { feel } from '../lib/feel';
import { LOOKS } from '../ui/looks';

// The phone's own number keyboard.

export function AmountInput({ value, onChange, placeholder = '0', size = 44, autoFocus = true, label = 'Amount', prefix }) {
  const th = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      {prefix ? <T serif size={size} style={{ lineHeight: size * 1.22 }}>{prefix}</T> : null}
      <TextInput
        value={value}
        onChangeText={(t) => onChange(cleanNum(t))}
        autoFocus={autoFocus}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder={placeholder}
        placeholderTextColor={th.faint2}
        selectionColor={th.accent}
        accessibilityLabel={label}
        style={{ fontFamily: F.serif, fontSize: size, color: th.ink, textAlign: 'center', minWidth: 120, paddingVertical: 0, outlineStyle: 'none' }}
      />
    </View>
  );
}

/* ------------------------------ Check an account ------------------------------ */

// "What's in your wallet?" / "What does your bank app say?". The gap shows
// as + or − while you type. Bag picks Cash out (less) or Cash in (more) and
// you can flip it. Change: name part (or all) of it; the rest is Untracked.
export function CheckSheet({ p, done }) {
  const app = useApp();
  const th = useTheme();
  const { data, flows, homePerUnit, money } = app;
  const acc = data.accounts[p.accountId];
  const expected = useMemo(() => (acc ? expectedFor(data, acc.id, { flows, homePerUnit }) : 0), [acc && acc.id, flows]);
  const [v, setV] = useState('');
  const [dir, setDir] = useState(null);
  const [open, setOpen] = useState(false);
  const [parts, setParts] = useState([]);
  const [cur, setCur] = useState({ amount: '', name: '', categoryId: null, description: '' });
  if (!acc) return null;
  const cash = groupOf(acc) === 'cash';
  const minusOk = !cash;
  const real = v === '' || v === '-' ? null : Number(v);
  const gap = real === null || Number.isNaN(real) ? 0 : round2(real - expected);
  const way = dir || (gap < 0 ? 'out' : 'in');
  const used = parts.reduce((t, x) => t + (Number(x.amount) || 0), 0) + (Number(cur.amount) || 0);
  const left = round2(Math.abs(gap) - used);
  const catKind = way === 'in' ? 'income' : 'expense';
  const cats = live(data.categories).filter((c) => (c.kind || 'expense') === catKind).sort((a, b) => (a.id === (catKind === 'income' ? 'untracked-in' : 'untracked') ? -1 : 0) || (a.order || 0) - (b.order || 0)).slice(0, 8);
  const catName = (id) => (data.categories[id] || {}).name;
  const curName = cur.name || (cur.categoryId && !String(cur.categoryId).startsWith('untracked') ? catName(cur.categoryId) : cash ? 'Untracked cash' : 'Untracked');
  const summary = (Number(cur.amount) > 0 || parts.length)
    ? [...parts.map((x) => `${x.name || catName(x.categoryId)} ${fmt(Number(x.amount))}`), Number(cur.amount) > 0 ? `${curName} ${fmt(Number(cur.amount))}` : null, left > 0 ? `Untracked ${fmt(left)}` : null].filter(Boolean).join(' + ')
    : curName;
  const addPart = () => {
    if (!(Number(cur.amount) > 0) || left < 0) { feel.warn(); return; }
    setParts([...parts, { ...cur, name: curName }]);
    setCur({ amount: '', name: '', categoryId: null, description: '' });
  };
  const save = () => {
    if (real === null) { feel.warn(); return; }
    if (left < -0.001) { feel.warn(); return; }
    const list = [...parts];
    if (Number(cur.amount) > 0) list.push({ ...cur, name: curName });
    else if (cur.name || cur.categoryId || cur.description) list.push({ ...cur, amount: 0, name: cur.name || (cur.categoryId && !String(cur.categoryId).startsWith('untracked') ? catName(cur.categoryId) : '') });
    app.saveCheck(acc.id, { gap, dir: way, parts: list });
    feel.done();
    done();
  };
  return (
    <View style={{ gap: 10 }}>
      <T size={13.5} color={th.muted} center>Bag thinks <T size={13.5} weight="semi">{money(expected, { currency: acc.currency })}</T>{p.jarNote ? ` (with ${p.jarNote})` : ''}</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <AmountInput value={v.replace('-', '')} onChange={(t) => setV((x) => (x.startsWith('-') ? '-' : '') + t)} prefix={v.startsWith('-') ? '−' : null} label={cash ? 'What you have' : 'What the app says'} />
        {minusOk ? (
          <Pressable onPress={() => setV(v.startsWith('-') ? v.slice(1) : `-${v}`)} accessibilityRole="button" accessibilityLabel={v.startsWith('-') ? 'Make it positive' : 'Make it negative (overdrawn)'} hitSlop={8}
            style={{ height: 32, paddingHorizontal: 10, borderRadius: 10, backgroundColor: v.startsWith('-') ? alpha(th.out, 0.18) : th.soft, justifyContent: 'center' }}>
            <T size={14} weight="semi" color={v.startsWith('-') ? th.out : th.muted}>{v.startsWith('-') ? '− overdrawn' : '+/−'}</T>
          </Pressable>
        ) : null}
      </View>
      {real !== null && gap !== 0 ? (
        <View style={{ borderRadius: 14, padding: 10, backgroundColor: alpha(gap < 0 ? th.out : th.in, 0.1), gap: 8 }}>
          <T size={13} center>Gap <T size={15} weight="semi" color={gap < 0 ? th.out : th.in}>{gap > 0 ? '+' : '−'}{fmt(Math.abs(gap))}</T> ({gap < 0 ? 'less' : 'more'} than Bag thinks)</T>
          <Seg small items={[{ id: 'out', label: '▼ Cash out' }, { id: 'in', label: '▲ Cash in' }]} value={way} onChange={(x) => { setDir(x); setCur({ ...cur, categoryId: null }); setParts([]); }} />
          <Pressable onPress={() => { feel.tap(); setOpen(!open); }} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T size={13} color={th.muted} style={{ flex: 1 }} numberOfLines={2}>📝 <T size={13} weight="semi">{summary}</T></T>
            <T size={13} weight="semi" color={th.accent}>{open ? 'Done' : 'Change'}</T>
          </Pressable>
          {open ? (
            <View style={{ gap: 8 }}>
              {parts.map((x, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: th.soft, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 }}>
                  <T size={13} style={{ flex: 1 }} numberOfLines={1}>{(data.categories[x.categoryId] || {}).emoji || '❔'} {x.name}{x.description ? ` · ${x.description}` : ''}</T>
                  <T size={13} weight="semi">{fmt(Number(x.amount))}</T>
                  <Pressable onPress={() => setParts(parts.filter((_, k) => k !== i))} hitSlop={8} accessibilityLabel="Remove"><Icon name="x" size={15} color={th.faint} /></Pressable>
                </View>
              ))}
              <Inp value={cur.amount} onChangeText={(t) => setCur({ ...cur, amount: cleanNum(t) })} placeholder={`Amount (blank = all ${fmt(Math.max(0, round2(Math.abs(gap) - parts.reduce((t, x) => t + Number(x.amount), 0))))})`} keyboardType="decimal-pad" />
              <Inp value={cur.name} onChangeText={(t) => setCur({ ...cur, name: t })} placeholder={cash ? 'Untracked cash' : 'Untracked'} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {cats.map((c) => (
                  <Pressable key={c.id} onPress={() => { feel.pick(); setCur({ ...cur, categoryId: c.id }); }} style={{ height: 30, paddingHorizontal: 9, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: (cur.categoryId || (catKind === 'income' ? 'untracked-in' : 'untracked')) === c.id ? alpha(catColor(c), 0.25) : th.soft }}>
                    <T size={12.5}>{c.emoji} {c.name}</T>
                  </Pressable>
                ))}
              </View>
              <Inp value={cur.description} onChangeText={(t) => setCur({ ...cur, description: t })} placeholder="Note (optional), like 'forgot the bus fare'" />
              <Pressable onPress={addPart} accessibilityRole="button" style={{ height: 36, borderRadius: 11, borderWidth: 1, borderStyle: 'dashed', borderColor: th.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
                <T size={12.5} weight="medium" color={th.accent}>+ Split another part</T>
              </Pressable>
              <T size={12} color={left < 0 ? th.out : th.muted} center>{left < 0 ? "That's more than the gap" : (Number(cur.amount) > 0 || parts.length) ? (left > 0 ? `The rest, ${fmt(left)}, saves as Untracked` : 'Nothing left over') : `Leave the amount blank and all ${fmt(Math.abs(gap))} uses this name`}</T>
            </View>
          ) : null}
        </View>
      ) : real !== null ? <T size={13.5} color={th.in} weight="semi" center>✓ Spot on</T> : null}
      <Button label={real === null ? (cash ? 'Type what you have' : 'Type what it says') : gap === 0 ? "Yes, that's right" : 'Confirm and record'} onPress={save} disabled={real === null} />
    </View>
  );
}

function Inp(props) {
  const th = useTheme();
  return <TextInput placeholderTextColor={th.faint2} {...props} style={{ height: 42, borderRadius: 12, borderWidth: 1, borderColor: th.lineStrong, backgroundColor: th.soft, color: th.ink, paddingHorizontal: 12, fontFamily: F.regular, fontSize: 14 }} />;
}

/* ------------------------------ Pin to Home ------------------------------ */

export function PinSheet({ done }) {
  const app = useApp();
  const th = useTheme();
  const { data } = app;
  const [tab, setTab] = useState('cat');
  const pins = data.pins || [];
  const has = (type, id) => pins.some((x) => x.type === type && x.id === id);
  const add = (type, id) => { feel.firm(); app.update({ pins: [...pins, { type, id }] }); done(); };
  const people = useMemo(() => {
    const m = {};
    live(data.records).forEach((r) => { if ((r.type === 'iowe' || r.type === 'owed') && r.who) m[r.who.trim()] = (m[r.who.trim()] || 0) + 1; });
    return Object.keys(m).sort((a, b) => m[b] - m[a]);
  }, [data.records]);
  const cats = live(data.categories).sort((a, b) => (a.kind === b.kind ? (a.order || 0) - (b.order || 0) : a.kind === 'income' ? 1 : -1));
  return (
    <View style={{ gap: 10 }}>
      <Seg small items={[{ id: 'cat', label: 'Categories' }, { id: 'person', label: 'People' }]} value={tab} onChange={setTab} />
      {tab === 'cat' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {cats.map((c) => (
            <Pressable key={c.id} disabled={has('cat', c.id)} onPress={() => add('cat', c.id)} accessibilityRole="button"
              style={{ width: '31.8%', minHeight: 62, borderRadius: 14, backgroundColor: th.soft, alignItems: 'center', justifyContent: 'center', gap: 2, opacity: has('cat', c.id) ? 0.35 : 1, paddingHorizontal: 4 }}>
              <T size={20}>{c.emoji}</T>
              <T size={11.5} center numberOfLines={1}>{c.name}</T>
            </Pressable>
          ))}
        </View>
      ) : people.length ? people.map((n, i) => (
        <Row key={n} first={i === 0} label={n} left={<Bubble emoji="👤" color="#8FB8E8" size={36} />} value={has('person', n) ? 'Pinned' : null} onPress={has('person', n) ? undefined : () => add('person', n)} />
      )) : <T size={13.5} color={th.muted}>Nobody yet. Add a record under People (I lent or I borrowed) and they'll show here.</T>}
    </View>
  );
}

/* ------------------------------ Exchange rate ------------------------------ */

// Today's rate, the rate on the record's date (it never changes after), or
// your own, typed either way round.
export function RateSheet2({ p, done }) {
  const th = useTheme();
  const today = latestRate(p.currency, p.home);
  const onDate = p.date ? savedRate(p.date, p.currency, p.home) : null;
  const [mine, setMine] = useState(p.value || '');
  const [flip, setFlip] = useState(p.value && Number(p.value) ? String(round2(1 / Number(p.value))) : '');
  const amt = Number(p.amount) || 0;
  const pick = (v) => { p.onPick && p.onPick(v); done(); };
  const opt = (label, sub, press) => (
    <Pressable onPress={() => { feel.pick(); press(); }} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: th.soft }}>
      <View style={{ flex: 1 }}><T size={14.5}>{label}</T><T size={12} color={th.muted}>{sub}</T></View>
      <Icon name="chevron-right" size={16} color={th.faint} />
    </Pressable>
  );
  const r = parseAmount(mine);
  return (
    <View style={{ gap: 8 }}>
      {onDate ? opt(`Rate on ${p.dateLabel || 'its date'}`, `1 ${p.currency} = ${fmt(onDate, { decimals: 4 })} ${p.home} · fixed, never changes`, () => pick('')) : null}
      {today ? opt("Today's rate", `1 ${p.currency} = ${fmt(today, { decimals: 4 })} ${p.home}${amt ? ` · ≈ ${fmt(amt * today)} ${p.home}` : ''}`, () => pick(String(today))) : null}
      {!onDate && !today ? <T size={13} color={th.warn}>No rate saved yet. Type yours, or Bag fills it in once it's online (it won't count until then).</T> : null}
      <T size={12} color={th.faint} style={{ marginTop: 6, letterSpacing: 1 }}>MY OWN RATE</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <T size={13} color={th.muted}>1 {p.currency} =</T>
        <View style={{ flex: 1 }}><Inp value={mine} keyboardType="decimal-pad" placeholder="0.0000" onChangeText={(t) => { setMine(t); const n = parseAmount(t); setFlip(n > 0 ? String(round2(1 / n)) : ''); }} /></View>
        <T size={13} color={th.muted}>{p.home}</T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <T size={13} color={th.muted}>or 1 {p.home} =</T>
        <View style={{ flex: 1 }}><Inp value={flip} keyboardType="decimal-pad" placeholder="0.00" onChangeText={(t) => { setFlip(t); const n = parseAmount(t); setMine(n > 0 ? String(Math.round((1 / n) * 1e6) / 1e6) : ''); }} /></View>
        <T size={13} color={th.muted}>{p.currency}</T>
      </View>
      {r > 0 && amt ? <T size={13} center color={th.muted}>≈ <T size={14} weight="semi">{fmt(amt * r)} {p.home}</T></T> : null}
      <Button label="Use my rate" disabled={!(r > 0)} onPress={() => pick(String(r))} />
    </View>
  );
}

/* ------------------------------ Which bank ------------------------------ */

// Pick one account inside a group (which bank, which jar). ★ marks the
// default; tap the star to make another one the default.
export function WhichSheet({ p, done }) {
  const app = useApp();
  const th = useTheme();
  const { data, flows, homePerUnit, money } = app;
  const list = sortAccounts(live(data.accounts)).filter((a) => groupOf(a) === p.group);
  const def = (data.defaultAccount || {})[p.group];
  return (
    <View>
      {list.map((a, i) => (
        <Row key={a.id} first={i === 0} label={a.name} left={<T size={22}>{accountEmoji(a)}</T>}
          sub={money(accountBalance(data, a, { flows, homePerUnit }).native, { currency: a.currency })}
          right={(
            <Pressable onPress={() => { app.update({ defaultAccount: { ...(data.defaultAccount || {}), [p.group]: a.id } }); }} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Make ${a.name} the default`}>
              <T size={20} color={th.gold || '#F5C35B'}>{def === a.id ? '★' : '☆'}</T>
            </Pressable>
          )}
          onPress={() => { p.onPick && p.onPick(a.id); done(); }} chevron={false} />
      ))}
      {p.addLabel ? <Button label={p.addLabel} kind="ghost" icon="plus" onPress={() => { done(); setTimeout(() => p.onAdd && p.onAdd(), 250); }} /> : null}
      <T size={12} color={th.faint} center style={{ marginTop: 6 }}>★ is the one Bag picks for you</T>
    </View>
  );
}

// Settings › Background: pick one or several looks and how often they change.
export function LooksSheet() {
  const app = useApp();
  const th = useTheme();
  const { data } = app;
  const lk = data.looks || { pick: ['bag'], mode: 'each' };
  const picked = lk.pick && lk.pick.length ? lk.pick : ['bag'];
  const on = data.backdrop !== false;
  const flip = (id) => {
    const has = picked.includes(id);
    const next = has ? picked.filter((x) => x !== id) : [...picked, id];
    if (!next.length) return;
    app.update({ looks: { ...lk, pick: next }, ...(has && data.lookNow === id ? { lookNow: next[0] } : {}), ...(!has && next.length === 1 ? { lookNow: id } : {}) });
  };
  return (
    <View style={{ gap: 10 }}>
      <Row first label="Floating coins and drawings" right={<Toggle value={on} onChange={(v) => app.update({ backdrop: v })} label="Background" />} />
      {on ? (
        <>
          <Seg small items={[{ id: 'each', label: 'Each open' }, { id: 'daily', label: 'Once a day' }, { id: 'keep', label: 'Keep one' }]} value={lk.mode || 'each'} onChange={(v) => app.update({ looks: { ...lk, mode: v } })} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {LOOKS.map((l) => {
              const sel = picked.includes(l.id);
              return (
                <Pressable key={l.id} onPress={() => flip(l.id)} onLongPress={() => { feel.firm(); app.update({ lookNow: l.id }); app.showToast(`Now: ${l.name}`); }} accessibilityRole="checkbox" accessibilityState={{ checked: sel }} accessibilityLabel={l.name}
                  style={{ width: '31.5%', flexGrow: 1, height: 76, borderRadius: 16, padding: 8, overflow: 'hidden', borderWidth: 1.5, borderColor: sel ? th.accent : 'transparent', backgroundColor: th.soft }}>
                  <View style={{ position: 'absolute', right: -16, top: -16, width: 60, height: 60, borderRadius: 30, backgroundColor: l.glow[0], opacity: 0.22 }} />
                  <View style={{ position: 'absolute', left: -14, bottom: -18, width: 50, height: 50, borderRadius: 25, backgroundColor: l.glow[1], opacity: 0.18 }} />
                  <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: th.gold, alignItems: 'center', justifyContent: 'center' }}><T size={12} weight="semi" color={th.gold}>{l.sym}</T></View>
                  <T size={12.5} weight={sel ? 'semi' : 'regular'} style={{ marginTop: 'auto' }} numberOfLines={1}>{sel ? '✓ ' : ''}{l.name}</T>
                </Pressable>
              );
            })}
          </View>
          <T size={12} color={th.faint} center>Pick as many as you like. Hold one to see it now.</T>
        </>
      ) : null}
    </View>
  );
}

/* ------------------------------ Pay some back ------------------------------ */

// Any amount, from any account (or split across a few), any day. Each part
// is a Cash out from that account; the debt goes down by what it's worth.
export function PayDebtSheet({ p, done }) {
  const app = useApp();
  const th = useTheme();
  const { data } = app;
  const r = data.records[p.id];
  const home = data.homeCurrency;
  const accs = sortAccounts ? sortAccounts(live(data.accounts)) : live(data.accounts);
  const now = today();
  const [amount, setAmount] = useState('');
  const [split, setSplit] = useState(false);
  const [accountId, setAccountId] = useState(() => (accs.find((a) => a.currency === home) || accs[0] || {}).id || null);
  const [parts, setParts] = useState({});
  const [date, setDate] = useState(now);
  const [cal, setCal] = useState(false);
  const [month, setMonth] = useState(now.slice(0, 7));
  const acc = data.accounts[accountId];
  const [currency, setCurrency] = useState(acc ? acc.currency : home);
  if (!r || r.deleted) return <T color={th.faint}>This one's gone.</T>;
  const owe = r.type === 'iowe';
  const left = leftOf(r);
  const curs = [...new Set([currency, home, r.currency].filter(Boolean))];
  const rateTo = (cur) => (cur === home ? 1 : savedRate(date, cur, home) || latestRate(cur, home) || 0);
  const debtRate = r.currency === home ? 1 : Number(r.rate) || rateTo(r.currency) || 1;
  const worth = (n, cur) => (cur === r.currency ? n : round2((n * rateTo(cur)) / debtRate));
  const total = split ? Object.values(parts).reduce((t, v) => t + (parseAmount(v) || 0), 0) : parseAmount(amount) || 0;
  const off = round2(worth(total, currency));
  const ok = total > 0 && (split ? Object.values(parts).some((v) => parseAmount(v) > 0) : true);
  const pay = () => {
    if (!ok) { feel.warn(); return; }
    const list = split
      ? Object.entries(parts).filter(([, v]) => parseAmount(v) > 0).map(([aid, v]) => ({ date, accountId: aid, amount: parseAmount(v), currency }))
      : [{ date, accountId, amount: total, currency }];
    app.payDebt(r.id, list);
    feel.done();
    done();
  };
  const chip = (on) => ({ height: 40, paddingHorizontal: 12, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: on ? th.soft : 'transparent', borderWidth: 1.5, borderColor: on ? th.chipOn : th.line });
  const dateChip = (label, on, onPress) => (
    <Pressable key={label} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ flex: 1, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? th.chipOn : th.soft }}>
      <T size={12.5} weight="medium" color={on ? th.chipOnInk : th.muted}>{label}</T>
    </Pressable>
  );
  return (
    <View style={{ gap: 10 }}>
      <T size={13} color={th.muted} center>{app.money(left, { currency: r.currency })} left{r.who ? ` · ${r.who}` : ''}</T>
      {!split ? <AmountInput value={amount} onChange={setAmount} label="Amount to pay" /> : <T serif size={34} center>{fmt(total)}</T>}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
        {curs.map((c) => (
          <Pressable key={c} onPress={() => setCurrency(c)} accessibilityRole="button" accessibilityState={{ selected: c === currency }} style={{ height: 28, paddingHorizontal: 10, borderRadius: 999, justifyContent: 'center', backgroundColor: c === currency ? th.soft : 'transparent', borderWidth: 1, borderColor: c === currency ? th.lineStrong : 'transparent' }}>
            <T size={12} weight="medium" color={c === currency ? th.ink : th.faint}>{c}</T>
          </Pressable>
        ))}
      </View>
      {total > 0 && currency !== r.currency ? <T size={12.5} color={th.faint} center>≈ {app.money(off, { currency: r.currency })} off the debt</T> : null}
      {off > left + 0.004 ? <T size={12.5} color={th.warn} center>That's more than what's left</T> : null}
      <T size={12} color={th.faint}>{owe ? 'From' : 'Into'}</T>
      <ScrollRow>
        {accs.map((a) => (
          <Pressable key={a.id} onPress={() => { feel.pick(); if (split) return; setAccountId(a.id); setCurrency(a.currency); }} accessibilityRole="button" style={chip(!split && a.id === accountId)}>
            <T size={13.5}>{accountEmoji(a)}</T><T size={13.5}>{a.name}</T>
          </Pressable>
        ))}
        <Pressable onPress={() => { feel.pick(); setSplit(!split); }} accessibilityRole="button" accessibilityState={{ selected: split }} style={[chip(split), split ? null : { borderStyle: 'dashed' }]}>
          <T size={13.5} color={split ? th.ink : th.muted}>Split</T>
        </Pressable>
      </ScrollRow>
      {split ? (
        <View style={{ gap: 6 }}>
          {accs.map((a) => (
            <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T size={14} style={{ flex: 1 }} numberOfLines={1}>{accountEmoji(a)} {a.name}</T>
              <TextInput value={parts[a.id] || ''} onChangeText={(t) => setParts({ ...parts, [a.id]: cleanNum(t) })} keyboardType="decimal-pad" inputMode="decimal" placeholder="0" placeholderTextColor={th.faint2} accessibilityLabel={`From ${a.name}`}
                style={{ width: 120, height: 40, borderRadius: 11, borderWidth: 1, borderColor: th.lineStrong, backgroundColor: th.soft, color: th.ink, paddingHorizontal: 10, textAlign: 'right', fontFamily: F.regular, fontSize: 15 }} />
            </View>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {dateChip('Today', date === now && !cal, () => { setDate(now); setCal(false); })}
        {dateChip('Yesterday', date === addDays(now, -1) && !cal, () => { setDate(addDays(now, -1)); setCal(false); })}
        {dateChip(cal || ![now, addDays(now, -1)].includes(date) ? fmtShort(date) : 'Pick date', cal || ![now, addDays(now, -1)].includes(date), () => setCal(!cal))}
      </View>
      {cal ? <Calendar month={month} onMonth={setMonth} value={date} onPick={(d) => { if (d <= now) { setDate(d); setCal(false); } }} weekStart={data.weekStart === 0 ? 0 : data.weekStart || 1} /> : null}
      <Button label={ok ? `Pay ${fmt(total)} ${currency}${split ? '' : acc ? ` from ${acc.name}` : ''}` : 'Type an amount'} disabled={!ok} onPress={pay} />
    </View>
  );
}

function ScrollRow({ children }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6 }}>{children}</ScrollView>;
}

/* ------------------------------ Details pop-up ------------------------------ */

// The small pop-up behind anything you tap on Home, Records and Upcoming:
// a few rows, maybe a note, and a button or two.
// p: { title, rows: [{ label, value, tone: 'in'|'out'|'gold'|'muted'|'warn', bold, tint, onPress }], note, buttons: [{ label, kind, onPress }] }
export function InfoSheet({ p, done }) {
  const th = useTheme();
  const toneOf = (t) => ({ in: th.in, out: th.out, gold: th.gold, muted: th.muted, warn: th.warn, faint: th.faint }[t] || th.ink);
  const rows = (p.rows || []).filter(Boolean);
  return (
    <View style={{ gap: 4 }}>
      {p.sub ? <T size={13} color={th.muted} style={{ marginBottom: 4 }}>{p.sub}</T> : null}
      {rows.map((r, i) => {
        const inner = (
          <View style={[{ flexDirection: 'row', alignItems: 'center', minHeight: 40, gap: 10, borderTopWidth: i && !r.tint ? 1 : 0, borderTopColor: th.line }, r.tint ? { backgroundColor: alpha(toneOf(r.tone), 0.12), borderRadius: 10, paddingHorizontal: 8, marginHorizontal: -8 } : null]}>
            <T size={14} weight={r.bold ? 'semi' : 'regular'} color={r.tint ? toneOf(r.tone) : r.dim ? th.muted : th.ink} style={{ flex: 1 }} numberOfLines={2}>{r.label}</T>
            {r.value !== undefined && r.value !== null ? <T size={14} weight={r.bold ? 'semi' : 'regular'} color={toneOf(r.tone)}>{r.value}</T> : null}
            {r.onPress ? <Icon name="chevron-right" size={16} color={th.faint} /> : null}
          </View>
        );
        return r.onPress ? <Pressable key={i} onPress={() => { done(); setTimeout(r.onPress, 220); }} accessibilityRole="button">{inner}</Pressable> : <View key={i}>{inner}</View>;
      })}
      {p.note ? <T size={12.5} color={p.noteTone === 'out' ? th.out : th.faint} style={{ marginTop: 6 }}>{p.note}</T> : null}
      {(p.buttons || []).length ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          {p.buttons.map((b) => <Button key={b.label} label={b.label} kind={b.kind || 'primary'} style={{ flex: 1 }} onPress={() => { done(); setTimeout(b.onPress, 220); }} />)}
        </View>
      ) : null}
    </View>
  );
}

export const KINDS2 = {
  info: { title: (p) => p.title || '', C: InfoSheet },
  paydebt: { title: (p, data) => (data.records[p.id] && data.records[p.id].type === 'owed' ? 'Got some back' : 'Pay some back'), C: PayDebtSheet },
  looks: { title: () => 'Background', C: LooksSheet },
  check: { title: (p, data) => { const a = data.accounts[p.accountId]; return a && groupOf(a) === 'cash' ? "What's in your wallet?" : a && a.kind === 'savings' ? `How much is in ${a.name}?` : `What does ${a ? a.name : 'the'} app say?`; }, C: CheckSheet },
  pin: { title: () => 'Pin to Home', C: PinSheet },
  rate2: { title: () => 'Exchange rate', C: RateSheet2 },
  which: { title: (p) => p.title || 'Which one?', C: WhichSheet },
};

