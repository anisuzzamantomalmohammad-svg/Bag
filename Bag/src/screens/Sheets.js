// Every bottom sheet in Bag: pickers (date, account, category, currency,
// choice, text, date range), the pending "did it happen?" check, marking a
// debt paid, and the Excel export.
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Bubble, Button, Chip, Chips, Field, Icon, IconBox, Row, Seg, Sheet, Squish, T, Toggle, useTheme } from '../ui/kit';
import { accountColor, accountEmoji, alpha, catColor } from '../lib/look';
import { recordAmount, useRecordActions } from '../ui/parts';
import { Calendar } from '../ui/calendar';
import { accountBalance, displayName, isOpen, isPending, live } from '../lib/ledger';
import { MONTHS, addDays, addMonths, daysBetween, fmtDate, fmtShort, lastDayOfMonth, periodOf, today } from '../lib/dates';
import { parseAmount } from '../lib/money';
import { currencyName, sortedCurrencies } from '../data/currencies';
import { shareExcel } from '../lib/files';

/* ------------------------------ Pickers ------------------------------ */

function DateSheet({ p, done }) {
  const { data } = useApp();
  const [month, setMonth] = useState((p.value || today()).slice(0, 7));
  const pick = (d) => { p.onPick && p.onPick(d); done(); };
  const now = today();
  return (
    <>
      <Chips>
        <Chip label="Today" on={p.value === now} onPress={() => pick(now)} />
        <Chip label="Yesterday" on={p.value === addDays(now, -1)} onPress={() => pick(addDays(now, -1))} />
        {p.future !== false ? <Chip label="Tomorrow" on={p.value === addDays(now, 1)} onPress={() => pick(addDays(now, 1))} /> : null}
        {p.clearLabel ? <Chip label={p.clearLabel} on={!p.value} onPress={() => pick(null)} /> : null}
      </Chips>
      <Calendar month={month} onMonth={setMonth} value={p.value} onPick={pick} weekStart={data.weekStart === 0 ? 0 : data.weekStart || 1} />
    </>
  );
}

function AccountSheet({ p, done }) {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const list = live(app.data.accounts).filter((a) => !(p.exclude || []).includes(a.id)).sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
  return (
    <View>
      {list.map((a, i) => {
        const bal = accountBalance(app.data, a, { flows: app.flows, homePerUnit: app.homePerUnit });
        return (
          <Row key={a.id} first={i === 0} left={<Bubble emoji={accountEmoji(a)} color={accountColor(a)} size={36} />} label={a.name} sub={a.currency !== app.data.homeCurrency ? currencyName(a.currency) : undefined}
            value={app.money(bal.native, { currency: a.currency })} valueColor={bal.native < 0 ? th.out : th.muted}
            right={p.value === a.id ? <Icon name="check" size={18} color={th.accent} /> : null}
            onPress={() => { p.onPick && p.onPick(a.id); done(); }} chevron={false} />
        );
      })}
      <Row first={!list.length} label={<T color={th.accent} weight="medium">Add an account</T>} left={<Icon name="plus" size={18} color={th.accent} />} onPress={() => { done(); nav.push('account', {}); }} chevron={false} />
    </View>
  );
}

// A grid of coloured bubbles. New at the end opens the category list.
function CategorySheet({ p, done }) {
  const { data } = useApp();
  const nav = useNav();
  const th = useTheme();
  const list = live(data.categories).filter((c) => !p.kind || c.kind === p.kind).sort((a, b) => (a.order || 0) - (b.order || 0));
  const cell = { alignItems: 'center', paddingVertical: 8, gap: 6 };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
      {list.map((c) => {
        const col = catColor(c);
        const on = p.value === c.id;
        return (
          <View key={c.id} style={{ width: '25%' }}>
            <Squish style={cell} onPress={() => { p.onPick && p.onPick(c.id); done(); }} accessibilityLabel={c.name}>
              <Bubble emoji={c.emoji} color={col} size={50} style={on ? { borderWidth: 2, borderColor: col } : null} />
              <T size={11.5} color={on ? th.ink : th.muted} center numberOfLines={1} style={{ paddingHorizontal: 2 }}>{c.name}</T>
            </Squish>
          </View>
        );
      })}
      <View style={{ width: '25%' }}><Squish style={cell} onPress={() => { done(); nav.push('categories', { kind: p.kind }); }} accessibilityLabel="Add or edit categories">
        <View style={{ width: 50, height: 50, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: th.lineStrong, alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={20} color={th.muted} /></View>
        <T size={11.5} color={th.muted} center>New / edit</T>
      </Squish></View>
    </View>
  );
}

function CurrencySheet({ p, done }) {
  const th = useTheme();
  const [q, setQ] = useState('');
  const all = useMemo(() => sortedCurrencies(), []);
  const query = q.trim().toLowerCase();
  const list = query ? all.filter(([c, n]) => c.toLowerCase().includes(query) || n.toLowerCase().includes(query)) : all;
  return (
    <>
      <Field value={q} onChangeText={setQ} placeholder="Search, like taka or USD" autoCorrect={false} inputStyle={{ backgroundColor: th.soft }} />
      <View>
        {p.noneLabel && !query ? <Row first label={p.noneLabel} right={!p.value ? <Icon name="check" size={18} color={th.accent} /> : null} onPress={() => { p.onPick && p.onPick(null); done(); }} chevron={false} /> : null}
        {list.slice(0, query ? 40 : 200).map(([c, n], i) => (
          <Row key={c} first={i === 0 && !(p.noneLabel && !query)} minHeight={50} label={c} sub={n}
            right={p.value === c ? <Icon name="check" size={18} color={th.accent} /> : null}
            onPress={() => { p.onPick && p.onPick(c); done(); }} chevron={false} />
        ))}
        {!list.length ? <T color={th.faint} style={{ paddingVertical: 12 }}>No currency matches “{q}”</T> : null}
      </View>
    </>
  );
}

function ChoiceSheet({ p, done }) {
  const th = useTheme();
  return (
    <View>
      {p.text ? <T size={14} color={th.muted} style={{ marginBottom: 6 }}>{p.text}</T> : null}
      {(p.options || []).map((o, i) => (
        <Row key={String(o.id)} first={i === 0} label={o.label} sub={o.sub} left={o.emoji ? <IconBox emoji={o.emoji} /> : null}
          right={p.value === o.id ? <Icon name="check" size={18} color={th.accent} /> : null}
          onPress={() => { p.onPick && p.onPick(o.id); done(); }} chevron={false} />
      ))}
    </View>
  );
}

function TextSheet({ p, done }) {
  const th = useTheme();
  const [v, setV] = useState(p.value !== undefined && p.value !== null ? String(p.value) : '');
  const [err, setErr] = useState('');
  const save = () => {
    if (p.number) {
      const n = parseAmount(v);
      if (!(n >= 0)) { setErr('Enter a number'); return; }
    }
    p.onPick && p.onPick(v.trim());
    done();
  };
  return (
    <>
      {p.text ? <T size={14} color={th.muted}>{p.text}</T> : null}
      <Field value={v} onChangeText={(t) => { setErr(''); setV(t); }} placeholder={p.placeholder} keyboardType={p.number ? 'decimal-pad' : 'default'} autoFocus inputStyle={{ backgroundColor: th.soft }} onSubmitEditing={save} />
      {err ? <T size={13} color={th.danger}>{err}</T> : null}
      <Button label={p.saveLabel || 'Save'} onPress={save} />
      {p.clearLabel ? <Button label={p.clearLabel} kind="ghost" onPress={() => { p.onPick && p.onPick(''); done(); }} /> : null}
    </>
  );
}

function RateSheet({ p, done }) {
  return (
    <TextSheet
      done={done}
      p={{
        value: p.value, number: true, placeholder: 'Rate',
        text: `How many ${p.home} is 1 ${p.currency}? Bag fills this in from the day's rate when it's online.`,
        clearLabel: 'Use the saved rate', onPick: p.onPick,
      }}
    />
  );
}

// Preset ranges plus "Custom" with two calendars.
export function rangePresets(data, now = today()) {
  const o = { weekStart: data.weekStart === 0 ? 0 : data.weekStart || 1, monthStart: data.monthStartDay || 1 };
  const month = periodOf(now, 'month', o);
  const last = periodOf(addDays(month.from, -1), 'month', o);
  const three = periodOf(addMonths(month.from, -2), 'month', o);
  const y = now.slice(0, 4);
  return [
    { id: 'week', label: 'This week', ...periodOf(now, 'week', o) },
    { id: 'month', label: 'This month', ...month },
    { id: 'last', label: 'Last month', ...last },
    { id: '3m', label: 'Last 3 months', from: three.from, to: month.to },
    { id: 'year', label: 'This year', from: `${y}-01-01`, to: `${y}-12-31` },
    { id: 'lastyear', label: 'Last year', from: `${Number(y) - 1}-01-01`, to: `${Number(y) - 1}-12-31` },
    { id: 'all', label: 'All time', from: null, to: null },
  ];
}

export function rangeLabel(from, to) {
  if (!from && !to) return 'All time';
  if (from && to) return `${fmtShort(from)} – ${fmtShort(to)}`;
  return from ? `From ${fmtShort(from)}` : `Up to ${fmtShort(to)}`;
}

// Dates: quick picks, then Months (tap one month, or two for everything in
// between) or Days (any date to any date).
function RangeSheet({ p, done }) {
  const { data } = useApp();
  const th = useTheme();
  const presets = rangePresets(data);
  const now = today();
  const [tab, setTab] = useState('months');
  const [from, setFrom] = useState(p.from || null);
  const [to, setTo] = useState(p.to || null);
  const [open, setOpen] = useState(null); // 'from' | 'to'
  const [month, setMonth] = useState((p.from || now).slice(0, 7));
  const [year, setYear] = useState(Number((p.from || now).slice(0, 4)));
  const [ma, setMa] = useState(null);
  const [mb, setMb] = useState(null);
  const ws = data.weekStart === 0 ? 0 : data.weekStart || 1;
  const pick = (r) => { p.onPick && p.onPick(r.from, r.to, r.id); done(); };
  const firstYear = Math.min(Number(now.slice(0, 4)) - 1, ...Object.values(data.records || {}).filter((r) => r && !r.deleted && r.date).map((r) => Number(r.date.slice(0, 4))));
  const key = (y, m) => y * 12 + m;
  const nowK = key(Number(now.slice(0, 4)), Number(now.slice(5, 7)) - 1);
  const tapMonth = (k) => {
    if (ma === null || mb !== null) { setMa(k); setMb(null); } else if (k !== ma) setMb(k);
  };
  const lo = ma === null ? null : mb === null ? ma : Math.min(ma, mb);
  const hi = ma === null ? null : mb === null ? ma : Math.max(ma, mb);
  const ymOf = (k) => `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`;
  const monthRange = lo === null ? null : { from: `${ymOf(lo)}-01`, to: lastDayOfMonth(ymOf(hi)) };
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -20 }}>
        <View style={{ width: 12 }} />
        {presets.map((r) => <Chip key={r.id} label={r.label} on={p.from === r.from && p.to === r.to} onPress={() => pick(r)} />)}
        <View style={{ width: 12 }} />
      </ScrollView>
      <Seg small items={[{ id: 'months', label: 'Months' }, { id: 'days', label: 'Days' }]} value={tab} onChange={setTab} style={{ marginTop: 4 }} />
      {tab === 'months' ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable onPress={() => setYear(Math.max(firstYear, year - 1))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Year before" style={{ padding: 8, opacity: year > firstYear ? 1 : 0.3 }}><Icon name="chevron-left" size={20} /></Pressable>
            <T serif size={20}>{year}</T>
            <Pressable onPress={() => setYear(Math.min(Number(now.slice(0, 4)), year + 1))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next year" style={{ padding: 8, opacity: year < Number(now.slice(0, 4)) ? 1 : 0.3 }}><Icon name="chevron-right" size={20} /></Pressable>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 }}>
            {MONTHS.map((m, i) => {
              const k = key(year, i);
              const future = k > nowK;
              const end = k === lo || k === hi;
              const mid = lo !== null && k > lo && k < hi;
              const radius = { borderTopLeftRadius: k === lo || !mid ? 999 : 0, borderBottomLeftRadius: k === lo || !mid ? 999 : 0, borderTopRightRadius: k === hi || !mid ? 999 : 0, borderBottomRightRadius: k === hi || !mid ? 999 : 0 };
              if (mid || (end && lo !== hi)) {
                radius.borderTopLeftRadius = k === lo ? 999 : 0; radius.borderBottomLeftRadius = k === lo ? 999 : 0;
                radius.borderTopRightRadius = k === hi ? 999 : 0; radius.borderBottomRightRadius = k === hi ? 999 : 0;
              }
              return (
                <Pressable key={m} disabled={future} onPress={() => tapMonth(k)} accessibilityRole="button" accessibilityState={{ selected: end || mid, disabled: future }} accessibilityLabel={`${m} ${year}`}
                  style={[{ width: '25%', height: 42, alignItems: 'center', justifyContent: 'center', opacity: future ? 0.3 : 1, backgroundColor: end ? th.chipOn : mid ? th.soft : 'transparent' }, radius]}>
                  <T size={14} weight="medium" color={end ? th.chipOnInk : th.ink}>{m}</T>
                </Pressable>
              );
            })}
          </View>
          <T size={13} color={th.muted}>{monthRange ? `${rangeLabel(monthRange.from, monthRange.to)}${hi > lo ? ` · ${hi - lo + 1} months` : '. Tap another month for a range.'}` : 'Tap a month. Tap a second one for everything in between.'}</T>
          <Button label="Show these" disabled={!monthRange} onPress={() => pick({ ...monthRange, id: 'custom' })} />
        </>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label={from ? `From ${fmtShort(from)}` : 'From'} on={open === 'from'} onPress={() => { setOpen(open === 'from' ? null : 'from'); if (from) setMonth(from.slice(0, 7)); }} style={{ flex: 1 }} />
            <Chip label={to ? `To ${fmtShort(to)}` : 'To'} on={open === 'to'} onPress={() => { setOpen(open === 'to' ? null : 'to'); if (to) setMonth(to.slice(0, 7)); }} style={{ flex: 1 }} />
          </View>
          {open ? (
            <Calendar month={month} onMonth={setMonth} value={open === 'from' ? from : to} weekStart={ws}
              onPick={(d) => {
                if (open === 'from') { setFrom(d); if (to && d > to) setTo(null); setOpen('to'); } else { setTo(d); if (from && d < from) setFrom(d); setOpen(null); }
              }} />
          ) : null}
          {from && to ? <T size={13} color={th.muted}>{rangeLabel(from, to)} · {daysBetween(from, to) + 1} days</T> : null}
          <Button label="Show these dates" disabled={!from && !to} onPress={() => pick({ from, to, id: 'custom' })} />
        </>
      )}
    </>
  );
}

/* ------------------------------ Money actions ------------------------------ */

function AccountChips({ value, onChange }) {
  const { data } = useApp();
  const list = live(data.accounts);
  if (list.length < 2) return null;
  return <Chips>{list.map((a) => <Chip key={a.id} label={`${accountEmoji(a)} ${a.name}`} on={value === a.id} onPress={() => onChange(a.id)} />)}</Chips>;
}

// Something Upcoming: did you pay it? Change the amount or account first if
// it was different.
function ConfirmSheet({ p, done }) {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const r = app.data.records[p.id];
  const [amount, setAmount] = useState(r ? String(r.amount) : '');
  const [accountId, setAccountId] = useState(r ? r.accountId : null);
  if (!r || r.deleted) return <T color={th.faint}>This one's already been dealt with.</T>;
  if (r.status !== 'pending' && r.status !== 'scheduled') return <T color={th.faint}>Already {r.status === 'skipped' ? 'skipped' : r.type === 'income' ? 'marked received' : 'marked paid'}.</T>;
  const income = r.type === 'income';
  const now = today();
  return (
    <>
      <T size={14} color={th.muted}>{r.date < now ? 'Was due' : r.date === now ? 'Due today,' : 'Due'} {fmtDate(r.date, { weekday: true, year: false })}{r.repeatId ? ' · repeats' : ''}</T>
      <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" big inputStyle={{ backgroundColor: th.soft }} />
      <AccountChips value={accountId} onChange={setAccountId} />
      <Button label={income ? 'Yes, got it' : r.type === 'transfer' ? 'Yes, moved' : 'Yes, paid'} onPress={() => {
        const n = parseAmount(amount);
        app.confirmPending(r.id, { amount: n > 0 ? n : r.amount, accountId });
        done();
      }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label="Not yet" kind="secondary" style={{ flex: 1 }} onPress={() => { app.askLater(r.id); done(); }} />
        {r.repeatId ? <Button label="Skip this one" kind="secondary" style={{ flex: 1 }} onPress={() => { app.skipPending(r.id); done(); }} /> : null}
        <Button label="Open" kind="secondary" style={{ flex: 1 }} onPress={() => { done(); nav.push('record', { id: r.id }); }} />
      </View>
    </>
  );
}

// People: mark borrowed money paid back, or lent money back with you.
function SettleSheet({ p, done }) {
  const app = useApp();
  const th = useTheme();
  const r = app.data.records[p.id];
  const now = today();
  const [date, setDate] = useState(now);
  const [cal, setCal] = useState(false);
  const [month, setMonth] = useState(now.slice(0, 7));
  const [accountId, setAccountId] = useState(r ? r.settledAccountId || r.accountId : null);
  if (!r || r.deleted) return null;
  const owe = r.type === 'iowe';
  return (
    <>
      <T size={14} color={th.muted}>{app.money(r.amount, { currency: r.currency })}{r.who ? ` · ${r.who}` : ''}</T>
      <T size={13} weight="semi" color={th.muted}>{owe ? 'Paid back on' : 'Got it back on'}</T>
      <Chips>
        <Chip label="Today" on={date === now && !cal} onPress={() => { setDate(now); setCal(false); }} />
        <Chip label="Yesterday" on={date === addDays(now, -1) && !cal} onPress={() => { setDate(addDays(now, -1)); setCal(false); }} />
        {r.dueDate && r.dueDate !== now && r.dueDate < now ? <Chip label={`Due date, ${fmtShort(r.dueDate)}`} on={date === r.dueDate && !cal} onPress={() => { setDate(r.dueDate); setCal(false); }} /> : null}
        <Chip label={cal || ![now, addDays(now, -1), r.dueDate].includes(date) ? fmtShort(date) : 'Other date'} on={cal} onPress={() => setCal(!cal)} />
      </Chips>
      {cal ? <Calendar month={month} onMonth={setMonth} value={date} onPick={(d) => { setDate(d); setCal(false); }} weekStart={app.data.weekStart === 0 ? 0 : app.data.weekStart || 1} /> : null}
      {live(app.data.accounts).length > 1 ? <T size={13} weight="semi" color={th.muted}>{owe ? 'From' : 'Into'}</T> : null}
      <AccountChips value={accountId} onChange={setAccountId} />
      <Button label={owe ? 'Mark paid back' : 'Mark got it back'} onPress={() => { app.settleRecord(r.id, { date, accountId }); done(); }} />
    </>
  );
}

function ExportSheet({ p, done }) {
  const app = useApp();
  const th = useTheme();
  const has = !!(p.from || p.to);
  const [which, setWhich] = useState(has ? 'range' : 'all');
  const [summary, setSummary] = useState(true);
  const [running, setRunning] = useState(true);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      await shareExcel(app.data, { from: which === 'range' ? p.from : null, to: which === 'range' ? p.to : null, summary, running });
      done();
    } catch (e) {
      app.showToast("Couldn't make the file. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {has ? <Seg items={[{ id: 'range', label: rangeLabel(p.from, p.to) }, { id: 'all', label: 'Everything' }]} value={which} onChange={setWhich} /> : null}
      <View>
        <Row first label="Summary sheet" sub="Cash in and cash out by month, worked out with formulas" right={<Toggle value={summary} onChange={setSummary} label="Summary sheet" />} />
        <Row label="Running balance" sub="Balance after every record" right={<Toggle value={running} onChange={setRunning} label="Running balance" />} />
      </View>
      <T size={13} color={th.faint}>The file opens in Excel, Google Sheets or Numbers. You can import it back into Bag too.</T>
      <Button label={busy ? 'Making the file…' : 'Make Excel file'} icon="download" disabled={busy} onPress={go} />
    </>
  );
}

/* ------------------------------ Hold a record: change it here ------------------------------ */

// Holding a record opens this: which account, which category, which day,
// and the quick actions for what it is. Changes apply straight away, with Undo.
function ChangeSheet({ p, done }) {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const { data, money } = app;
  const r = data.records[p.id];
  const { remove } = useRecordActions();
  if (!r || r.deleted) return <T color={th.muted}>This record is gone.</T>;
  const isMoney = r.type === 'expense' || r.type === 'income' || r.type === 'transfer';
  const pending = isPending(r);
  const accs = live(data.accounts).sort((a, b) => (a.order || 0) - (b.order || 0));
  const cat = data.categories[r.categoryId];
  const kind = r.type === 'income' ? 'income' : 'expense';
  const cats = live(data.categories).filter((c) => (c.kind || 'expense') === kind).sort((a, b) => (a.id === r.categoryId ? -1 : b.id === r.categoryId ? 1 : (a.order || 0) - (b.order || 0)));
  const amt = recordAmount(r);
  const setAcc = (id) => { if (id !== r.accountId) app.patchRecords([r.id], { accountId: id }, () => `Moved to ${data.accounts[id].name}`); };
  const setCat = (id) => { if (id !== r.categoryId) app.patchRecords([r.id], { categoryId: id }, () => `Now in ${data.categories[id].name}`); };
  const setDate = (d) => { if (d && d !== r.date) { app.saveRecord({ ...r, date: d }); app.showToast(`Moved to ${fmtShort(d, { weekday: true })}`); } };
  const quick = [];
  if (pending) {
    quick.push({ k: 'paid', label: r.type === 'income' ? '✓ Got it' : r.type === 'transfer' ? '✓ Moved' : '✓ Paid', go: () => { app.markPaid(r.id); done(); } });
    if (r.repeatId) quick.push({ k: 'skip', label: '⏭ Skip this one', go: () => { app.skipPending(r.id); done(); } });
  } else if (isMoney && r.status !== 'skipped') {
    quick.push({ k: 'unpay', label: r.type === 'income' ? '↺ Not arrived yet' : r.type === 'transfer' ? '↺ Not moved yet' : '↺ Not paid yet', go: () => { app.unpay(r.id); done(); } });
  }
  if (isOpen(r)) quick.push({ k: 'settle', label: r.type === 'iowe' ? '✓ Paid back' : '✓ Got it back', go: () => { done(); setTimeout(() => nav.openSheet('settle', { id: r.id }), 250); } });
  if (r.type === 'transfer' && r.toAccountId) quick.push({ k: 'flip', label: '⇄ Flip direction', go: () => app.saveRecord({ ...r, accountId: r.toAccountId, toAccountId: r.accountId, toAmount: null }) });
  const lbl = (t) => <T size={11.5} color={th.faint} style={{ marginTop: 14, marginBottom: 6, marginLeft: 2 }}>{t}</T>;
  const pill = (on) => ({ height: 36, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: on ? th.chipOn : th.soft });
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Bubble emoji={r.type === 'transfer' ? '🔀' : cat && !cat.deleted ? cat.emoji : '🏷️'} color={r.type === 'transfer' ? '#AFC6DE' : catColor(cat)} size={40} />
        <View style={{ flex: 1 }}>
          <T size={12.5} color={th.muted}>{fmtDate(r.date, { weekday: true, year: false })}{pending ? ' · Upcoming' : ''}</T>
        </View>
        <T serif size={22} color={amt.kind === 'in' ? th.in : amt.kind === 'out' ? th.out : th.ink}>{money(amt.value, { currency: r.currency, plus: amt.kind === 'in' })}</T>
      </View>

      {quick.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>{quick.map((q) => <Pressable key={q.k} onPress={q.go} accessibilityRole="button" style={[pill(false), { backgroundColor: q.k === 'paid' ? th.warnBtn : th.soft }]}><T size={13} weight="medium" color={q.k === 'paid' ? th.warnBtnInk : th.ink}>{q.label}</T></Pressable>)}</View> : null}

      {r.type !== 'transfer' && accs.length > 1 ? (
        <>
          {lbl(r.type === 'income' || r.type === 'iowe' ? 'Into' : 'Paid from')}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {accs.slice(0, 3).map((a) => {
              const on = a.id === r.accountId;
              return (
                <Pressable key={a.id} onPress={() => setAcc(a.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={a.name}
                  style={{ flex: 1, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: on ? alpha(accountColor(a), 0.16) : th.soft, borderWidth: 1.5, borderColor: on ? accountColor(a) : 'transparent' }}>
                  <T size={15}>{accountEmoji(a)}</T><T size={13.5} weight={on ? 'semi' : 'regular'} color={on ? th.ink : th.muted} numberOfLines={1}>{a.name}</T>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {r.type !== 'transfer' ? (
        <>
          {lbl('Category')}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {cats.map((c) => <Pressable key={c.id} onPress={() => setCat(c.id)} accessibilityRole="radio" accessibilityState={{ selected: c.id === r.categoryId }} style={pill(c.id === r.categoryId)}><T size={14}>{c.emoji}</T><T size={12.5} color={c.id === r.categoryId ? th.chipOnInk : th.muted}>{c.name}</T></Pressable>)}
          </ScrollView>
        </>
      ) : null}

      {lbl('Day')}
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        <View style={pill(true)}><T size={12.5} color={th.chipOnInk}>{fmtShort(r.date, { weekday: true })}</T></View>
        <Pressable onPress={() => setDate(addDays(r.date, -1))} accessibilityRole="button" style={pill(false)}><T size={12.5} color={th.muted}>Day before</T></Pressable>
        <Pressable onPress={() => setDate(addDays(r.date, 1))} accessibilityRole="button" style={pill(false)}><T size={12.5} color={th.muted}>Day after</T></Pressable>
        <Pressable onPress={() => { done(); setTimeout(() => nav.openSheet('date', { value: r.date, onPick: setDate }), 250); }} accessibilityRole="button" style={pill(false)}><T size={12.5} color={th.muted}>Pick…</T></Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: 6, marginTop: 16 }}>
        {[
          { k: 'edit', icon: 'edit-2', label: 'Edit all', go: () => { done(); nav.push('add', { id: r.id }); } },
          { k: 'copy', icon: 'copy', label: 'Copy', go: () => { app.duplicateRecord(r.id); done(); } },
          p.onSelect ? { k: 'select', icon: 'check-square', label: 'Select', go: () => { done(); p.onSelect(r.id); } } : null,
          { k: 'delete', icon: 'trash-2', label: 'Delete', go: () => remove(r, done), danger: true },
        ].filter(Boolean).map((a) => (
          <Pressable key={a.k} onPress={a.go} accessibilityRole="button" accessibilityLabel={a.label} style={{ flex: 1, height: 52, borderRadius: 14, backgroundColor: th.soft, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
            <Icon name={a.icon} size={16} color={a.danger ? th.out : th.ink} />
            <T size={11.5} color={a.danger ? th.out : th.muted}>{a.label}</T>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/* ------------------------------ The sheet host ------------------------------ */

const KINDS = {
  date: { title: (p) => p.title || 'Date', C: DateSheet },
  account: { title: (p) => p.title || 'Account', C: AccountSheet },
  category: { title: (p) => p.title || 'Category', C: CategorySheet },
  currency: { title: (p) => p.title || 'Currency', C: CurrencySheet },
  choice: { title: (p) => p.title, C: ChoiceSheet },
  text: { title: (p) => p.title, C: TextSheet },
  rate: { title: () => 'Exchange rate', C: RateSheet },
  range: { title: () => 'Dates', C: RangeSheet },
  confirm: { title: (p, data) => { const r = data.records[p.id]; return r ? `${displayName(r, data)}: ${r.type === 'income' ? 'did it arrive?' : r.type === 'transfer' ? 'did you move it?' : 'did you pay it?'}` : 'Check'; }, C: ConfirmSheet },
  settle: { title: (p, data) => { const r = data.records[p.id]; return r && r.type === 'owed' ? 'Got it back' : 'Paid it back'; }, C: SettleSheet },
  export: { title: () => 'Export to Excel', C: ExportSheet },
  change: { title: (p, data) => { const r = data.records[p.id]; return r ? displayName(r, data) : 'Record'; }, C: ChangeSheet },
};

export default function Sheets({ sheet, onClose }) {
  const { data } = useApp();
  if (!sheet) return null;
  const k = KINDS[sheet.type];
  if (!k) return null;
  const { C } = k;
  return (
    <Sheet visible={!!sheet.open} onClose={onClose} title={k.title(sheet.params || {}, data)}>
      <C key={sheet.key} p={sheet.params || {}} done={onClose} />
    </Sheet>
  );
}
