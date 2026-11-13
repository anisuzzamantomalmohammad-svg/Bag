// Every bottom sheet in Bag: pickers (date, account, category, currency,
// choice, text, date range), the pending "did it happen?" check, marking a
// debt paid, and the Excel export.
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Button, Chip, Chips, Field, Icon, IconBox, Row, Seg, Sheet, T, Toggle, useTheme } from '../ui/kit';
import { Calendar } from '../ui/calendar';
import { accountBalance, displayName, live } from '../lib/ledger';
import { addDays, addMonths, fmtDate, fmtShort, periodOf, today } from '../lib/dates';
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
          <Row key={a.id} first={i === 0} label={a.name} sub={a.currency !== app.data.homeCurrency ? currencyName(a.currency) : undefined}
            value={app.money(bal.native, { currency: a.currency })} valueColor={bal.native < 0 ? th.out : th.muted}
            right={p.value === a.id ? <Icon name="check" size={18} color={th.accent} /> : null}
            onPress={() => { p.onPick && p.onPick(a.id); done(); }} chevron={false} />
        );
      })}
      <Row first={!list.length} label={<T color={th.accent} weight="medium">Add an account</T>} left={<Icon name="plus" size={18} color={th.accent} />} onPress={() => { done(); nav.push('account', {}); }} chevron={false} />
    </View>
  );
}

function CategorySheet({ p, done }) {
  const { data } = useApp();
  const nav = useNav();
  const th = useTheme();
  const list = live(data.categories).filter((c) => !p.kind || c.kind === p.kind).sort((a, b) => (a.order || 0) - (b.order || 0));
  return (
    <View>
      {list.map((c, i) => (
        <Row key={c.id} first={i === 0} left={<IconBox emoji={c.emoji} />} label={c.name}
          right={p.value === c.id ? <Icon name="check" size={18} color={th.accent} /> : null}
          onPress={() => { p.onPick && p.onPick(c.id); done(); }} chevron={false} />
      ))}
      <Row label={<T color={th.accent} weight="medium">Add or edit categories</T>} left={<Icon name="edit-2" size={17} color={th.accent} />} onPress={() => { done(); nav.push('categories', { kind: p.kind }); }} chevron={false} />
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

function RangeSheet({ p, done }) {
  const { data } = useApp();
  const th = useTheme();
  const presets = rangePresets(data);
  const [from, setFrom] = useState(p.from || null);
  const [to, setTo] = useState(p.to || null);
  const [open, setOpen] = useState(null); // 'from' | 'to'
  const [month, setMonth] = useState((p.from || today()).slice(0, 7));
  const ws = data.weekStart === 0 ? 0 : data.weekStart || 1;
  const pick = (r) => { p.onPick && p.onPick(r.from, r.to, r.id); done(); };
  return (
    <>
      <View>
        {presets.map((r, i) => (
          <Row key={r.id} first={i === 0} minHeight={48} label={r.label} value={r.from ? rangeLabel(r.from, r.to) : ''}
            right={p.from === r.from && p.to === r.to ? <Icon name="check" size={18} color={th.accent} /> : null}
            onPress={() => pick(r)} chevron={false} />
        ))}
      </View>
      <T size={13} weight="semi" color={th.muted} style={{ marginTop: 6 }}>Pick your own dates</T>
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
      <Button label="Show these dates" disabled={!from && !to} onPress={() => pick({ from, to, id: 'custom' })} />
    </>
  );
}

/* ------------------------------ Money actions ------------------------------ */

function AccountChips({ value, onChange }) {
  const { data } = useApp();
  const list = live(data.accounts);
  if (list.length < 2) return null;
  return <Chips>{list.map((a) => <Chip key={a.id} label={a.name} on={value === a.id} onPress={() => onChange(a.id)} />)}</Chips>;
}

// A repeat made this record and wants to know: did it happen?
function ConfirmSheet({ p, done }) {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const r = app.data.records[p.id];
  const [amount, setAmount] = useState(r ? String(r.amount) : '');
  const [accountId, setAccountId] = useState(r ? r.accountId : null);
  if (!r || r.deleted) return <T color={th.faint}>This one's already been dealt with.</T>;
  if (r.status !== 'pending') return <T color={th.faint}>Already {r.status === 'skipped' ? 'skipped' : r.type === 'income' ? 'marked received' : 'marked paid'}.</T>;
  const income = r.type === 'income';
  return (
    <>
      <T size={14} color={th.muted}>{fmtDate(r.date, { weekday: true })}{r.repeatId ? ' · from a repeat' : ''}</T>
      <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" big inputStyle={{ backgroundColor: th.soft }} />
      <AccountChips value={accountId} onChange={setAccountId} />
      <Button label={income ? 'Yes, it arrived' : 'Yes, I paid it'} onPress={() => {
        const n = parseAmount(amount);
        app.confirmPending(r.id, { amount: n > 0 ? n : r.amount, accountId });
        done();
      }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label="Skip this time" kind="secondary" style={{ flex: 1 }} onPress={() => { app.skipPending(r.id); done(); }} />
        <Button label="Open" kind="secondary" style={{ flex: 1 }} onPress={() => { done(); nav.push('record', { id: r.id }); }} />
      </View>
    </>
  );
}

// Mark a debt paid (I owe) or received (owed to me).
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
      <T size={13} weight="semi" color={th.muted}>{owe ? 'Paid on' : 'Got it on'}</T>
      <Chips>
        <Chip label="Today" on={date === now && !cal} onPress={() => { setDate(now); setCal(false); }} />
        <Chip label="Yesterday" on={date === addDays(now, -1) && !cal} onPress={() => { setDate(addDays(now, -1)); setCal(false); }} />
        {r.dueDate && r.dueDate !== now && r.dueDate < now ? <Chip label={`Due date, ${fmtShort(r.dueDate)}`} on={date === r.dueDate && !cal} onPress={() => { setDate(r.dueDate); setCal(false); }} /> : null}
        <Chip label={cal || ![now, addDays(now, -1), r.dueDate].includes(date) ? fmtShort(date) : 'Other date'} on={cal} onPress={() => setCal(!cal)} />
      </Chips>
      {cal ? <Calendar month={month} onMonth={setMonth} value={date} onPick={(d) => { setDate(d); setCal(false); }} weekStart={app.data.weekStart === 0 ? 0 : app.data.weekStart || 1} /> : null}
      {live(app.data.accounts).length > 1 ? <T size={13} weight="semi" color={th.muted}>{owe ? 'From' : 'Into'}</T> : null}
      <AccountChips value={accountId} onChange={setAccountId} />
      <Button label={owe ? 'Mark paid' : 'Mark received'} onPress={() => { app.settleRecord(r.id, { date, accountId }); done(); }} />
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
        <Row first label="Summary sheet" sub="Income and spending by month, worked out with formulas" right={<Toggle value={summary} onChange={setSummary} label="Summary sheet" />} />
        <Row label="Running balance" sub="Balance after every record" right={<Toggle value={running} onChange={setRunning} label="Running balance" />} />
      </View>
      <T size={13} color={th.faint}>The file opens in Excel, Google Sheets or Numbers. You can import it back into Bag too.</T>
      <Button label={busy ? 'Making the file…' : 'Make Excel file'} icon="download" disabled={busy} onPress={go} />
    </>
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
  confirm: { title: (p, data) => { const r = data.records[p.id]; return r ? `${displayName(r, data)}: did it ${r.type === 'income' ? 'arrive' : 'go out'}?` : 'Check'; }, C: ConfirmSheet },
  settle: { title: (p, data) => { const r = data.records[p.id]; return r && r.type === 'owed' ? 'Mark received' : 'Mark paid'; }, C: SettleSheet },
  export: { title: () => 'Export to Excel', C: ExportSheet },
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
