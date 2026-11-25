// 2.2's sheets: checking an account (wallet count, bank app), pinning a
// category or person to Home, the exchange rate, and which bank or jar.
import React, { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useApp } from '../state/store';
import { Bubble, Button, F, Icon, Row, Seg, T, Toggle, useTheme, Press as Pressable } from '../ui/kit';
import { accountEmoji, alpha, catColor } from '../lib/look';
import { accountBalance, live } from '../lib/ledger';
import { expectedFor, groupOf, sortAccounts } from '../lib/plan';
import { latestRate, savedRate } from '../lib/rates';
import { fmt, parseAmount, round2 } from '../lib/money';
import { feel } from '../lib/feel';
import { LOOKS } from '../ui/looks';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];

function Pad({ onKey, minus }) {
  const th = useTheme();
  const keys = minus ? [...KEYS.slice(0, 9), '−', '0', 'del'] : KEYS;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {keys.map((k) => (
        <Pressable key={k} onPress={() => { feel.tap(); onKey(k); }} accessibilityRole="button" accessibilityLabel={k === 'del' ? 'Delete' : k}
          style={({ pressed }) => ({ width: '31.8%', height: 46, borderRadius: 14, backgroundColor: th.soft, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
          {k === 'del' ? <Icon name="delete" size={20} color={th.ink} /> : <T size={20}>{k}</T>}
        </Pressable>
      ))}
    </View>
  );
}

const typeKey = (v, k) => {
  if (k === 'del') return v.slice(0, -1);
  if (k === '−') return v.startsWith('-') ? v.slice(1) : `-${v}`;
  if (k === '.' && v.includes('.')) return v;
  if (v.includes('.') && v.split('.')[1].length >= 2) return v;
  if (v.replace(/[-.]/g, '').length >= 10) return v;
  return v === '0' && k !== '.' ? k : v + k;
};

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
      <T serif size={44} center style={{ lineHeight: 54 }}>{v === '' ? <T serif size={44} color={th.faint2}>0</T> : v.replace('-', '−')}</T>
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
              <Inp value={cur.amount} onChangeText={(t) => setCur({ ...cur, amount: t.replace(/[^0-9.]/g, '') })} placeholder={`Amount (blank = all ${fmt(Math.max(0, round2(Math.abs(gap) - parts.reduce((t, x) => t + Number(x.amount), 0))))})`} keyboardType="decimal-pad" />
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
      <Pad minus={!cash} onKey={(k) => setV((x) => typeKey(x, k))} />
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

export const KINDS2 = {
  looks: { title: () => 'Background', C: LooksSheet },
  check: { title: (p, data) => { const a = data.accounts[p.accountId]; return a && groupOf(a) === 'cash' ? "What's in your wallet?" : a && a.kind === 'savings' ? `How much is in ${a.name}?` : `What does ${a ? a.name : 'the'} app say?`; }, C: CheckSheet },
  pin: { title: () => 'Pin to Home', C: PinSheet },
  rate2: { title: () => 'Exchange rate', C: RateSheet2 },
  which: { title: (p) => p.title || 'Which one?', C: WhichSheet },
};

