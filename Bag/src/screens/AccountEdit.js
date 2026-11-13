// Add or change an account: name, currency and the opening balance. An
// account with records can be deleted once they're moved to another one.
import React, { useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Button, Card, Field, Row, Screen, T, useTheme } from '../ui/kit';
import { RecordRow } from '../ui/parts';
import { accountBalance, filterRecords, live } from '../lib/ledger';
import { fmtDate, today } from '../lib/dates';
import { parseAmount } from '../lib/money';
import { currencyName } from '../data/currencies';

export default function AccountEdit({ id }) {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const { data } = app;
  const old = id && data.accounts[id] && !data.accounts[id].deleted ? data.accounts[id] : null;
  const [name, setName] = useState(old ? old.name : '');
  const [currency, setCurrency] = useState(old ? old.currency : data.homeCurrency);
  const [opening, setOpening] = useState(old && Number(old.opening) ? String(old.opening) : '');
  const [openingDate, setOpeningDate] = useState(old ? old.openingDate || null : today());
  const [err, setErr] = useState('');
  const dirty = useRef(false);
  const touch = (fn) => (v) => { dirty.current = true; setErr(''); fn(v); };
  const recs = useMemo(() => (old ? filterRecords(data, { accountId: old.id }) : []), [data.records, id]);
  const bal = old ? accountBalance(data, old, { flows: app.flows, homePerUnit: app.homePerUnit }) : null;
  const others = live(data.accounts).filter((a) => !old || a.id !== old.id);

  const save = () => {
    const n = name.trim();
    if (!n) { setErr('Give it a name, like Cash or ANZ'); return; }
    if (live(data.accounts).some((a) => a.name.trim().toLowerCase() === n.toLowerCase() && (!old || a.id !== old.id))) { setErr('You already have an account with that name'); return; }
    const o = opening.trim() ? parseAmount(opening) : 0;
    if (Number.isNaN(o)) { setErr('Opening balance should be a number'); return; }
    const changedCur = old && old.currency !== currency;
    app.saveAccount({ id: old ? old.id : undefined, name: n, currency, opening: o, openingDate: openingDate || today(), ...(changedCur || !old ? { openingRateManual: false } : {}) });
    app.showToast(old ? 'Saved' : `${n} added`);
    nav.pop();
  };

  const close = () => {
    if (!dirty.current) { nav.pop(); return; }
    Alert.alert('Discard changes?', '', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => nav.pop() }]);
  };

  const remove = () => {
    if (!others.length) { Alert.alert("This is your only account", 'Add another account first, then move the records there.'); return; }
    const go = (moveTo) => { nav.pop(); setTimeout(() => app.deleteAccount(old.id, moveTo), 220); };
    if (!recs.length) {
      Alert.alert(`Delete ${old.name}?`, '', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => go(null) }]);
      return;
    }
    nav.openSheet('choice', {
      title: `Move ${recs.length} records to`, text: `${old.name} has records. Pick where they go, then it's deleted.`,
      options: others.map((a) => ({ id: a.id, label: a.name, sub: a.currency !== old.currency ? `${a.currency}: amounts keep their own currency` : undefined })),
      onPick: (to) => go(to),
    });
  };

  return (
    <Screen title={old ? old.name : 'New account'} back="close" onBack={close} footer={<Button label="Save" onPress={save} />}>
      {old ? (
        <Card>
          <T size={13} color={th.muted}>Balance now</T>
          <T size={28} weight="semi" color={bal.native < 0 ? th.out : th.ink}>{app.money(bal.native, { currency: old.currency })}</T>
          {old.currency !== data.homeCurrency ? <T size={13} color={th.faint}>≈ {app.money(bal.home)} {data.homeCurrency}</T> : null}
        </Card>
      ) : null}
      <Field label="Name" value={name} onChangeText={touch(setName)} placeholder="Cash, ANZ, Savings" autoFocus={!old} autoCapitalize="words" />
      <Card pad={0} style={{ paddingHorizontal: 16 }}>
        <Row first label="Currency" value={`${currency} · ${currencyName(currency)}`} sub={old && recs.length ? 'Fixed once the account has records' : undefined} onPress={old && recs.length ? undefined : () => nav.openSheet('currency', { value: currency, onPick: touch(setCurrency) })} />
        <Row label="Opening balance" right={
          <Field value={opening} onChangeText={touch(setOpening)} keyboardType="numbers-and-punctuation" placeholder="0.00" inputStyle={{ minHeight: 40, minWidth: 120, textAlign: 'right', paddingHorizontal: 0, backgroundColor: 'transparent' }} accessibilityLabel="Opening balance" />
        } />
        <Row label="Balance on" value={openingDate ? fmtDate(openingDate) : 'Not set'} onPress={() => nav.openSheet('date', { value: openingDate, title: 'Opening balance on', onPick: touch(setOpeningDate) })} />
      </Card>
      <T size={13} color={th.faint} style={{ marginHorizontal: 4 }}>The opening balance is what was in the account before your first record. It isn't income.</T>
      {err ? <T size={13} color={th.danger}>{err}</T> : null}

      {old && recs.length ? (
        <Card pad={0} style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 2 }}>
          <T size={13} weight="semi" color={th.muted}>Latest records · {recs.length} in total</T>
          {recs.slice(0, 8).map((r, i) => <RecordRow key={r.id} record={r} showDate first={i === 0} onPress={() => nav.push('record', { id: r.id })} />)}
        </Card>
      ) : null}
      {old ? <Button label="Delete account" kind="dangerText" icon="trash-2" onPress={remove} /> : null}
    </Screen>
  );
}
