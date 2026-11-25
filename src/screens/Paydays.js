// When money comes in. Weekly (any number of days), fortnightly, monthly or
// "it varies". Each payday has a name, a rough amount (or "not sure"), and
// where it lands. On the day Bag asks how much actually came in.
import React, { useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Button, Card, Field, Row, Screen, Seg, T, Toggle, useTheme, Press as Pressable } from '../ui/kit';
import { live } from '../lib/ledger';
import { newId } from '../lib/ids';
import { parseAmount } from '../lib/money';
import { today } from '../lib/dates';
import { DOW, defaultIn, groupOf, nextPayday } from '../lib/plan';
import { feel } from '../lib/feel';

const HOW = [
  { id: 'weekly', label: 'Weekly' },
  { id: 'fortnightly', label: 'Fortnight' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'varies', label: 'It varies' },
];
const ORDER = [1, 2, 3, 4, 5, 6, 0];

const mkId = () => newId('p');

export default function Paydays() {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const { data } = app;
  const start = data.paydays || { how: 'weekly', items: [] };
  const [how, setHow] = useState(start.how || 'weekly');
  const [items, setItems] = useState((start.items || []).map((it) => ({ ...it, amount: it.amount ? String(it.amount) : '' })));
  const dirty = useRef(false);
  const touch = () => { dirty.current = true; };

  const bank = data.accounts[defaultIn(data, 'bank')] || null;
  const cash = data.accounts[defaultIn(data, 'cash')] || null;
  const accName = (id) => (id && data.accounts[id] ? data.accounts[id].name : 'Bank');

  const setItem = (id, patch) => { touch(); setItems((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x))); };
  const toggleDay = (dow) => {
    touch();
    setItems((l) => {
      if (l.some((x) => Number(x.dow) === dow)) return l.filter((x) => Number(x.dow) !== dow);
      const like = l[0];
      return [...l, { id: mkId(), dow, name: like ? like.name : 'Pay', amount: like ? like.amount : '', unsure: like ? !!like.unsure : false, accountId: like ? like.accountId : bank ? bank.id : null }];
    });
  };
  const addMonthly = () => { touch(); setItems((l) => [...l, { id: mkId(), dom: 1, name: 'Pay', amount: '', unsure: false, accountId: bank ? bank.id : null }]); };

  const switchHow = (h) => {
    touch();
    setHow(h);
    if (h === 'monthly') setItems((l) => l.map((x) => ({ ...x, dom: x.dom || 1 })));
    if (h === 'fortnightly') setItems((l) => (l.length > 1 ? l.slice(0, 1) : l));
  };

  const shown = how === 'monthly' ? items.filter((x) => x.dom) : items.filter((x) => x.dow !== undefined && x.dow !== null);

  const save = () => {
    const clean = shown.map((x) => ({
      id: x.id,
      ...(how === 'monthly' ? { dom: Math.max(1, Math.min(31, Number(x.dom) || 1)) } : { dow: Number(x.dow) }),
      name: (x.name || '').trim() || 'Pay',
      amount: parseAmount(x.amount) || 0,
      unsure: !!x.unsure || !(parseAmount(x.amount) > 0),
      accountId: x.accountId || (bank ? bank.id : null),
    }));
    app.update({ paydays: { how, items: how === 'varies' ? [] : clean, anchor: how === 'fortnightly' ? start.anchor || today() : start.anchor || null, since: start.since || today() } });
    feel.done();
    app.showToast(how === 'varies' ? 'Paydays: it varies' : `${clean.length} payday${clean.length === 1 ? '' : 's'} saved`);
    nav.pop();
  };
  const close = () => {
    if (!dirty.current) { nav.pop(); return; }
    Alert.alert('Leave without saving?', '', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Leave', style: 'destructive', onPress: () => nav.pop() }]);
  };

  const next = nextPayday({ ...data, paydays: { how, items: shown.map((x) => ({ ...x, amount: parseAmount(x.amount) || 0 })), anchor: start.anchor || today() } });
  const others = live(data.accounts).filter((a) => groupOf(a) === 'bank' || groupOf(a) === 'cash');

  const dayBox = (dow) => {
    const on = items.some((x) => Number(x.dow) === dow);
    return (
      <Pressable key={dow} onPress={() => toggleDay(dow)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={DOW[dow]}
        style={{ flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? th.accentFill : th.soft }}>
        <T size={13.5} weight="semi" color={on ? th.onAccent : th.ink}>{DOW[dow].slice(0, 2)}</T>
      </Pressable>
    );
  };

  return (
    <Screen title="Paydays" back="close" onBack={close} footer={<Button label="Save" onPress={save} />}>
      <Seg items={HOW} value={how} onChange={switchHow} />
      {how === 'varies' ? (
        <T size={14} color={th.muted} style={{ marginHorizontal: 4 }}>Bag uses your next planned income instead, and "a day" counts to the end of the month when there's none.</T>
      ) : null}

      {how === 'weekly' || how === 'fortnightly' ? (
        <View>
          <T size={13} color={th.muted} style={{ marginHorizontal: 4, marginBottom: 8 }}>{how === 'weekly' ? 'Tap every day you get paid. Three days a week is fine.' : 'Which day, every second week?'}</T>
          <View style={{ flexDirection: 'row', gap: 5 }}>{ORDER.map((d) => (how === 'fortnightly' && items.length && Number(items[0].dow) !== d ? (
            <Pressable key={d} onPress={() => { touch(); setItems((l) => (l.length ? [{ ...l[0], dow: d }] : l)); }} style={{ flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: th.soft }}>
              <T size={13.5} weight="semi" color={th.ink}>{DOW[d].slice(0, 2)}</T>
            </Pressable>
          ) : dayBox(d)))}</View>
        </View>
      ) : null}

      {how !== 'varies' ? shown.map((x) => (
        <Card key={x.id} pad={0} style={{ paddingHorizontal: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 12 }}>
            <T size={15} weight="semi" style={{ flex: 1 }}>{how === 'monthly' ? `Day ${x.dom} of the month` : how === 'fortnightly' ? `Every second ${DOW[x.dow]}` : `Every ${DOW[x.dow]}`}</T>
            {how === 'monthly' ? (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Button small kind="ghost" label="−" onPress={() => setItem(x.id, { dom: Math.max(1, (Number(x.dom) || 1) - 1) })} />
                <Button small kind="ghost" label="+" onPress={() => setItem(x.id, { dom: Math.min(31, (Number(x.dom) || 1) + 1) })} />
              </View>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Field label="Name" value={x.name} onChangeText={(v) => setItem(x.id, { name: v })} placeholder="Pay, Cafe shift" autoCapitalize="words" style={{ flex: 1.3 }} />
            <Field label={x.unsure ? 'About' : 'Amount'} value={x.amount} onChangeText={(v) => setItem(x.id, { amount: v })} keyboardType="decimal-pad" placeholder="0.00" style={{ flex: 1 }} />
          </View>
          <Row label="Not sure of the amount" sub="Bag asks on the day how much came in" right={<Toggle value={!!x.unsure} onChange={(v) => setItem(x.id, { unsure: v })} label="Not sure" />} />
          <Row label="Lands in" value={accName(x.accountId)} onPress={() => {
            const keep = new Set(others.map((a) => a.id));
            nav.openSheet('account', { title: 'Lands in', value: x.accountId, exclude: live(data.accounts).filter((a) => !keep.has(a.id)).map((a) => a.id), onPick: (id) => setItem(x.id, { accountId: id }) });
          }} />
          <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 12 }}>
            {bank ? <Button small kind={x.accountId === bank.id ? 'primary' : 'ghost'} label="🏦 Bank" onPress={() => setItem(x.id, { accountId: bank.id })} /> : null}
            {cash ? <Button small kind={x.accountId === cash.id ? 'primary' : 'ghost'} label="💵 Cash" onPress={() => setItem(x.id, { accountId: cash.id })} /> : null}
            {how === 'monthly' ? <Button small kind="ghost" label="Remove" onPress={() => { touch(); setItems((l) => l.filter((y) => y.id !== x.id)); }} /> : null}
          </View>
        </Card>
      )) : null}

      {how === 'monthly' ? <Button kind="ghost" icon="plus" label="Add a monthly payday" onPress={addMonthly} /> : null}
      {(how === 'weekly' || how === 'fortnightly') && !shown.length ? (
        <T size={13} color={th.faint} center>Pick a day above to add a payday.</T>
      ) : null}

      {next ? <T size={13} color={th.faint} center>Next: {next.name || 'Pay'} {next.days === 0 ? 'today' : next.days === 1 ? 'tomorrow' : `in ${next.days} days`}</T> : null}
    </Screen>
  );
}
