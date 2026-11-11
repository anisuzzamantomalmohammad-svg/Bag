// A savings goal: a target, an optional date, and the account the money sits
// in. Progress follows that account's balance; "Add money" is a transfer.
import React, { useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Bar, Button, Card, Field, Row, Screen, T, useTheme } from '../ui/kit';
import { live } from '../lib/ledger';
import { fmtDate, addMonths, today } from '../lib/dates';
import { parseAmount } from '../lib/money';
import { goalProgress } from './Plan';

export default function GoalEdit({ id }) {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const { data } = app;
  const old = id && data.goals[id] && !data.goals[id].deleted ? data.goals[id] : null;
  const [name, setName] = useState(old ? old.name : '');
  const [emoji] = useState(old ? old.emoji || '🎯' : '🎯');
  const [target, setTarget] = useState(old ? String(old.target) : '');
  const [date, setDate] = useState(old ? old.date || null : null);
  const [accountId, setAccountId] = useState(old ? old.accountId || null : null);
  const [newAcc, setNewAcc] = useState(!old);
  const [err, setErr] = useState('');
  const dirty = useRef(false);
  const touch = (fn) => (v) => { dirty.current = true; setErr(''); fn(v); };
  const acc = accountId ? data.accounts[accountId] : null;
  const p = old ? goalProgress(app, old) : null;
  const accounts = live(data.accounts);

  const save = () => {
    const n = name.trim();
    const t = parseAmount(target);
    if (!n) { setErr('Name the goal, like Trip home or New laptop'); return; }
    if (!(t > 0)) { setErr('Enter how much you want to save'); return; }
    let aid = accountId;
    if (!aid && newAcc) aid = app.saveAccount({ name: `${n} savings`, currency: data.homeCurrency, opening: 0, openingDate: today() });
    app.saveGoal({ id: old ? old.id : undefined, name: n, emoji, target: t, date, accountId: aid || null });
    app.showToast(old ? 'Goal saved' : 'Goal started');
    nav.pop();
  };

  const close = () => {
    if (!dirty.current) { nav.pop(); return; }
    Alert.alert('Discard changes?', '', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => nav.pop() }]);
  };

  return (
    <Screen title={old ? old.name : 'New goal'} back="close" onBack={close} footer={<Button label="Save" onPress={save} />}>
      {p ? (
        <Card>
          <T size={13} color={th.muted}>{p.done ? 'Reached' : 'Saved so far'}</T>
          <T size={26} weight="semi" color={p.done ? th.in : th.ink}>{app.money(p.saved)} <T size={15} color={th.muted}>of {app.money(p.target)}</T></T>
          <Bar parts={[{ pct: p.pct * 100, color: p.done ? th.in : th.accent }]} style={{ marginTop: 10 }} />
          <T size={13} color={th.faint} style={{ marginTop: 8 }}>
            {p.done ? 'Nice one.' : `${app.money(p.left)} to go${p.perMonth ? `: about ${app.money(p.perMonth)} a month to make ${fmtDate(old.date)}` : ''}`}
          </T>
          {p.acc && !p.done ? <Button label="Add money" icon="plus" small style={{ marginTop: 12, alignSelf: 'flex-start' }} onPress={() => nav.push('add', { type: 'transfer', prefill: { toAccountId: p.acc.id, name: `To ${old.name}` } })} /> : null}
        </Card>
      ) : null}
      <Field label="Goal" value={name} onChangeText={touch(setName)} placeholder="Trip home" autoFocus={!old} autoCapitalize="sentences" />
      <Field label="Target" value={target} onChangeText={touch(setTarget)} keyboardType="decimal-pad" placeholder="0.00" />
      <Card pad={0} style={{ paddingHorizontal: 16 }}>
        <Row first label="By" value={date ? fmtDate(date) : 'No date'} onPress={() => nav.openSheet('date', { value: date || addMonths(today(), 6), title: 'Reach it by', clearLabel: 'No date', onPick: touch(setDate) })} />
        <Row label="Saved in" value={acc && !acc.deleted ? acc.name : newAcc ? `New account: ${name.trim() || 'goal'} savings` : 'Choose'}
          onPress={() => nav.openSheet('choice', {
            title: 'Where is the money kept?', value: accountId || (newAcc ? 'new' : null),
            options: [...(old ? [] : [{ id: 'new', label: 'Make a new savings account', sub: 'Starts at zero. Move money in with Add money.' }]), ...accounts.map((a) => ({ id: a.id, label: a.name, sub: 'Progress counts the whole balance' }))],
            onPick: (v) => { dirty.current = true; if (v === 'new') { setNewAcc(true); setAccountId(null); } else { setNewAcc(false); setAccountId(v); } },
          })} />
      </Card>
      {err ? <T size={13} color={th.danger}>{err}</T> : null}
      {old ? (
        <View>
          <Button label="Delete goal" kind="dangerText" icon="trash-2" onPress={() => Alert.alert('Delete this goal?', 'The account and its money stay.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { app.deleteGoal(old.id); nav.pop(); } }])} />
        </View>
      ) : null}
    </Screen>
  );
}
