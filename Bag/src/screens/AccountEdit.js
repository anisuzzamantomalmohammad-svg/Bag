// Add or change an account: name, currency and the opening balance. An
// account with records can be deleted once they're moved to another one.
import React, { useMemo, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Bubble, Button, Card, Field, Row, Screen, Squish, T, Toggle, useTheme } from '../ui/kit';
import { accountKind } from '../lib/look';
import { ACCOUNT_KINDS } from '../data/defaults';
import { RecordRow } from '../ui/parts';
import { accountBalance, filterRecords, live } from '../lib/ledger';
import { fmtDate, today } from '../lib/dates';
import { parseAmount } from '../lib/money';
import { currencyName } from '../data/currencies';

export default function AccountEdit({ id, kind: startKind }) {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const { data } = app;
  const old = id && data.accounts[id] && !data.accounts[id].deleted ? data.accounts[id] : null;
  const [name, setName] = useState(old ? old.name : '');
  const [currency, setCurrency] = useState(old ? old.currency : data.homeCurrency);
  const [opening, setOpening] = useState(old && Number(old.opening) ? String(old.opening) : '');
  const [openingDate, setOpeningDate] = useState(old ? old.openingDate || null : today());
  const [kind, setKind] = useState(old ? accountKind(old) : startKind || 'bank');
  const [err, setErr] = useState('');
  // 2.2: jars say where the money really is, other kinds can sit on Home.
  const [inside, setInside] = useState(old ? !!old.inside : false);
  const [insideId, setInsideId] = useState(old ? old.insideId || null : null);
  const [jarOf, setJarOf] = useState(old ? old.jar || 'bank' : 'bank');
  const [onHome, setOnHome] = useState(old ? old.onHome !== false : true);
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
    app.saveAccount({ id: old ? old.id : undefined, name: n, kind, currency, opening: o, openingDate: openingDate || today(), ...(kind === 'savings' ? { jar: jarOf, inside, insideId: inside ? insideId : null } : {}), onHome, ...(changedCur || !old ? { openingRateManual: false } : {}) });
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
          <T size={32} serif color={bal.native < 0 ? th.out : th.ink}>{app.money(bal.native, { currency: old.currency })}</T>
          {old.currency !== data.homeCurrency ? <T size={13} color={th.faint}>≈ {app.money(bal.home)} {data.homeCurrency}</T> : null}
        </Card>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {Object.keys(ACCOUNT_KINDS).map((k) => {
          const K = ACCOUNT_KINDS[k];
          const on = kind === k;
          return (
            <Squish key={k} onPress={() => { dirty.current = true; setKind(k); }} accessibilityRole="radio" accessibilityLabel={K.label} style={{ width: '31.5%', flexGrow: 1, alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: 18, backgroundColor: on ? th.card : 'transparent', borderWidth: 1.5, borderColor: on ? K.color : 'transparent' }}>
              <Bubble emoji={K.emoji} color={K.color} size={40} />
              <T size={12.5} weight="medium" color={on ? th.ink : th.muted}>{K.label}</T>
            </Squish>
          );
        })}
      </View>
      <Field label="Name" value={name} onChangeText={touch(setName)} placeholder="Cash, ANZ, Savings" autoFocus={!old} autoCapitalize="words" />
      <Card pad={0} style={{ paddingHorizontal: 16 }}>
        <Row first label="Currency" value={`${currency} · ${currencyName(currency)}`} sub={old && recs.length ? 'Fixed once the account has records' : undefined} onPress={old && recs.length ? undefined : () => nav.openSheet('currency', { value: currency, onPick: touch(setCurrency) })} />
        <Row label="Opening balance" right={
          <Field value={opening} onChangeText={touch(setOpening)} keyboardType="numbers-and-punctuation" placeholder="0.00" inputStyle={{ minHeight: 40, minWidth: 120, textAlign: 'right', paddingHorizontal: 0, backgroundColor: 'transparent' }} accessibilityLabel="Opening balance" />
        } />
        <Row label="Balance on" value={openingDate ? fmtDate(openingDate) : 'Not set'} onPress={() => nav.openSheet('date', { value: openingDate, title: 'Opening balance on', onPick: touch(setOpeningDate) })} />
      </Card>
      <T size={13} color={th.faint} style={{ marginHorizontal: 4 }}>The opening balance is what was in the account before your first record. It isn't income.</T>
      {kind === 'savings' ? (
        <Card pad={0} style={{ paddingHorizontal: 16 }}>
          <Row first label="A jar for" value={jarOf === 'cash' ? '💵 Cash' : '🏦 Bank money'} onPress={() => { dirty.current = true; setJarOf(jarOf === 'cash' ? 'bank' : 'cash'); }} />
          <Row label={jarOf === 'cash' ? 'Kept in my wallet' : 'Inside my bank account'} sub={jarOf === 'cash' ? 'Off: kept apart. On: the wallet count includes it' : 'Off: a separate account. On: the bank check includes it'} right={<Toggle value={inside} onChange={(v) => { dirty.current = true; setInside(v); }} label="Kept inside" />} />
          {inside && jarOf === 'bank' ? (
            <Row label="Which bank" value={insideId && data.accounts[insideId] ? data.accounts[insideId].name : 'Your default bank'} onPress={() => nav.openSheet('which', { group: 'bank', title: 'Inside which bank?', onPick: touch(setInsideId) })} />
          ) : null}
        </Card>
      ) : null}
      {kind !== 'bank' && kind !== 'cash' && kind !== 'savings' ? (
        <Card pad={0} style={{ paddingHorizontal: 16 }}>
          <Row first label="Show on Home" sub="Its own pill, with its own records" right={<Toggle value={onHome} onChange={(v) => { dirty.current = true; setOnHome(v); }} label="Show on Home" />} />
        </Card>
      ) : null}
      {old && (kind === 'bank' || kind === 'cash') && live(data.accounts).filter((a) => accountKind(a) === kind).length > 1 ? (
        <Card pad={0} style={{ paddingHorizontal: 16 }}>
          <Row first label={kind === 'bank' ? 'Default bank' : 'Default cash'} sub="Picked for you when you choose Bank" right={<Toggle value={(data.defaultAccount || {})[kind] === old.id} onChange={(v) => app.update({ defaultAccount: { ...(data.defaultAccount || {}), [kind]: v ? old.id : null } })} label="Default" />} />
        </Card>
      ) : null}
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
