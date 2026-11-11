// Accounts: what's in each one, the total, net worth, and how the balance
// moved month to month.
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Balance, Button, Card, Row, Screen, T, useTheme } from '../ui/kit';
import { IconButton } from '../ui/parts';
import { accountBalance, balanceAtMonthEnds, live, netWorth } from '../lib/ledger';
import { addMonths, lastDayOfMonth, monthLabel, today } from '../lib/dates';
import { fmtApprox } from '../lib/money';
import { currencyName } from '../data/currencies';

export default function Accounts() {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const { data, flows, homePerUnit } = app;
  const [showWorth, setShowWorth] = useState(false);
  const [history, setHistory] = useState(false);
  const home = data.homeCurrency;
  const list = live(data.accounts).sort((a, b) => (a.order || 0) - (b.order || 0) || (a.createdAt || 0) - (b.createdAt || 0));
  const rows = useMemo(() => list.map((a) => ({ a, bal: accountBalance(data, a, { flows, homePerUnit }) })), [data.accounts, flows, homePerUnit]);
  const total = rows.reduce((s, x) => s + x.bal.home, 0);
  const nw = useMemo(() => netWorth(data, { flows, homePerUnit }), [data.accounts, flows, homePerUnit]);
  const months = useMemo(() => (history ? balanceAtMonthEnds(data, addMonths(`${today().slice(0, 7)}-01`, -5), today(), { flows, homePerUnit }).reverse() : []), [history, flows]);
  const sec = app.second(total, 'accounts');

  return (
    <Screen title="Accounts" right={<IconButton name="plus" label="Add account" onPress={() => nav.push('account', {})} />}>
      <Card>
        <T size={13} color={th.muted}>All accounts</T>
        <Balance value={total} />
        {sec ? <T size={13} color={th.faint}>{fmtApprox(sec.amount, sec.currency)}</T> : null}
        <Pressable onPress={() => setShowWorth(!showWorth)} accessibilityRole="button" hitSlop={6} style={{ marginTop: 10 }}>
          <T size={14} weight="medium" color={th.accent}>{showWorth ? 'Hide net worth' : 'Show net worth'}</T>
        </Pressable>
        {showWorth ? (
          <View style={{ marginTop: 8 }}>
            <Row first minHeight={44} label="Accounts" value={app.money(nw.accounts)} />
            <Row minHeight={44} label="Owed to me" value={`+ ${app.money(nw.owedToMe)}`} onPress={() => nav.setTab('Owed')} />
            <Row minHeight={44} label="I owe" value={`${app.money(-nw.iOwe)}`} onPress={() => nav.setTab('Owed')} />
            <Row minHeight={48} label={<T weight="semi">Net worth</T>} value={<Balance value={nw.total} size={16} />} />
          </View>
        ) : null}
      </Card>

      {rows.length ? (
        <Card pad={0} style={{ paddingHorizontal: 16 }}>
          {rows.map(({ a, bal }, i) => {
            const foreign = a.currency && a.currency !== home;
            return (
              <Row key={a.id} first={i === 0} minHeight={62} label={a.name}
                sub={foreign ? `${currencyName(a.currency)} · ≈ ${app.money(bal.home)} ${home}` : undefined}
                value={<T weight="medium" color={bal.native < 0 ? th.out : th.ink}>{app.money(bal.native, { currency: a.currency })}</T>}
                onPress={() => nav.push('account', { id: a.id })} />
            );
          })}
        </Card>
      ) : (
        <Card><T color={th.muted}>No accounts yet. Add one for cash, your bank, or savings.</T></Card>
      )}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label="Move money" icon="shuffle" kind="secondary" style={{ flex: 1 }} disabled={rows.length < 2} onPress={() => nav.push('add', { type: 'transfer' })} />
        <Button label="Add account" icon="plus" kind="secondary" style={{ flex: 1 }} onPress={() => nav.push('account', {})} />
      </View>

      <Card pad={0} style={{ paddingHorizontal: 16 }}>
        <Pressable onPress={() => setHistory(!history)} accessibilityRole="button" style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center' }}>
          <T style={{ flex: 1 }}>Balance month by month</T>
          <T size={14} weight="medium" color={th.accent}>{history ? 'Hide' : 'Show'}</T>
        </Pressable>
        {months.map((m) => <Row key={m.key} minHeight={44} label={m.current ? `${monthLabel(m.key, true)} (today)` : `End of ${monthLabel(m.key, true)}`} value={<Balance value={m.balance} size={15} />}
          onPress={() => nav.setTab('Records', { from: `${m.key}-01`, to: lastDayOfMonth(m.key) })} />)}
      </Card>
    </Screen>
  );
}
