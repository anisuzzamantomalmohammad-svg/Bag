// The savings jar: one place with two jars inside, Bank savings and Cash
// savings. Put money in, take it out, or spend straight from a jar (that
// counts as spending). Each jar says where the money really sits.
import React from 'react';
import { View } from 'react-native';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Button, Card, Row, Screen, T, useTheme } from '../ui/kit';
import { RecordRow } from '../ui/parts';
import { accountBalance, filterRecords } from '../lib/ledger';
import { monthStartOf, today } from '../lib/dates';
import { defaultIn, jars, savedIn } from '../lib/plan';
import { Appear } from '../ui/live';

export default function Savings() {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const { data, flows, homePerUnit, money } = app;
  const list = jars(data);
  const now = today();
  const from = monthStartOf(now, data.monthStart || 1);
  const saved = savedIn(data, from, now, flows);
  const total = list.reduce((s, a) => s + accountBalance(data, a, { flows, homePerUnit }).home, 0);
  const recs = filterRecords(data, { accountIds: list.map((a) => a.id) }).slice(0, 40);

  const where = (a) => {
    if (!a.inside) return 'Kept apart';
    if (a.jar === 'cash') return 'Kept in your wallet';
    const b = a.insideId && data.accounts[a.insideId] ? data.accounts[a.insideId] : data.accounts[defaultIn(data, 'bank')];
    return `Inside ${b ? b.name : 'your bank'}`;
  };
  const source = (a) => defaultIn(data, a.jar === 'cash' ? 'cash' : 'bank');

  return (
    <Screen title="Savings">
      <Appear>
        <Card style={{ alignItems: 'center' }}>
          <T size={11} color={th.faint} style={{ letterSpacing: 1.3 }}>IN THE JARS</T>
          <T size={34} weight="semi" color={th.gold}>{money(total)}</T>
          <T size={13} color={th.muted}>
            Saved this month <T size={13} weight="semi" color={saved >= 0 ? th.in : th.out}>{money(saved, { plus: saved > 0 })}</T>
          </T>
          <T size={11.5} color={th.faint} center style={{ marginTop: 4 }}>Put in, less taken out, less spent from the jars</T>
        </Card>
      </Appear>

      {list.map((a, i) => {
        const b = accountBalance(data, a, { flows, homePerUnit }).native;
        return (
          <Appear key={a.id} delay={80 + i * 70}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <T size={26}>🫙</T>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <T size={16} weight="semi">{a.name}</T>
                  <T size={12.5} color={th.faint} onPress={() => nav.push('account', { id: a.id })}>{where(a)} · change</T>
                </View>
                <T size={20} weight="semi" color={b > 0 ? th.gold : th.muted}>{money(b, { currency: a.currency })}</T>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <Button small label="Put in" icon="plus" style={{ flex: 1 }} onPress={() => nav.push('add', { type: 'transfer', prefill: { accountId: source(a), toAccountId: a.id } })} />
                <Button small kind="ghost" label="Spend" style={{ flex: 1 }} disabled={!(b > 0)} onPress={() => nav.push('add', { type: 'expense', prefill: { accountId: a.id } })} />
                <Button small kind="ghost" label="Take out" style={{ flex: 1 }} disabled={!(b > 0)} onPress={() => nav.push('add', { type: 'transfer', prefill: { accountId: a.id, toAccountId: source(a) } })} />
              </View>
            </Card>
          </Appear>
        );
      })}

      {!list.length ? <T size={14} color={th.muted} center>The jars appear once you have an account.</T> : null}

      <T size={13} weight="semi" color={th.muted} style={{ marginHorizontal: 4, marginTop: 6 }}>History</T>
      {recs.length ? (
        <Card pad={0} style={{ paddingHorizontal: 12 }}>
          {recs.map((r, i) => <RecordRow key={r.id} record={r} first={i === 0} showDate onPress={() => nav.push('record', { id: r.id })} />)}
        </Card>
      ) : (
        <Card>
          <T size={14} color={th.muted}>Nothing in the jars yet. Tap Put in, or plan a monthly save from Add › Move with a repeat.</T>
        </Card>
      )}
      <Card pad={0} style={{ paddingHorizontal: 16 }}>
        <Row first label="Savings over time" sub="The gold curve in Reports" onPress={() => { nav.pop(); setTimeout(() => nav.setTab('Reports', { tab: 'savings' }), 250); }} />
      </Card>
    </Screen>
  );
}
