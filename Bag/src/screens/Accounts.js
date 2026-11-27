// Accounts: what's in each one, the total, net worth, and how the balance
// moved month to month.
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Balance, Bubble, Button, Card, Row, Screen, Squish, T, useTheme, Press as Pressable } from '../ui/kit';
import { accountColor, accountEmoji, accountKind } from '../lib/look';
import { ACCOUNT_KINDS } from '../data/defaults';
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
  // Share of the money you actually have: an overdrawn bank doesn't push others over 100%.
  const pos = (() => { try { return live(app.data.accounts).reduce((t, a) => { const h = accountBalance(app.data, a, { flows: app.flows, homePerUnit: app.homePerUnit }).home; return t + (h > 0 ? h : 0); }, 0); } catch (e) { return 0; } })();
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
            <Row minHeight={44} label="Owed to me" value={`+ ${app.money(nw.owedToMe)}`} onPress={() => nav.setTab('Upcoming', { filter: 'people' })} />
            <Row minHeight={44} label="I borrowed" value={`${app.money(-nw.iOwe)}`} onPress={() => nav.setTab('Upcoming', { filter: 'people' })} />
            <Row minHeight={48} label={<T weight="semi">Net worth</T>} value={<Balance value={nw.total} size={16} />} />
          </View>
        ) : null}
      </Card>

      {rows.length ? rows.map(({ a, bal }) => {
        const foreign = a.currency && a.currency !== home;
        const col = accountColor(a);
        const share = pos > 0 && bal.home > 0 ? bal.home / pos : 0;
        return (
          <Squish key={a.id} onPress={() => nav.push('account', { id: a.id })} accessibilityLabel={`${a.name}, ${app.money(bal.native, { currency: a.currency })}`} style={{ borderRadius: 24, overflow: 'hidden', backgroundColor: th.card, padding: 18 }}>
            <Svg style={{ position: 'absolute', top: 0, left: 0 }} width="100%" height="100%" pointerEvents="none">
              <Defs><LinearGradient id={`ac${a.id}`} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={col} stopOpacity={0.24} /><Stop offset="1" stopColor={col} stopOpacity={0.03} /></LinearGradient></Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill={`url(#ac${a.id})`} />
            </Svg>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Bubble emoji={accountEmoji(a)} color={col} size={44} />
              <View style={{ flex: 1 }}>
                <T size={16} weight="semi">{a.name}</T>
                {ACCOUNT_KINDS[accountKind(a)].label !== a.name || foreign ? <T size={12.5} color={th.faint}>{[ACCOUNT_KINDS[accountKind(a)].label !== a.name ? ACCOUNT_KINDS[accountKind(a)].label : null, foreign ? currencyName(a.currency) : null].filter(Boolean).join(' · ')}</T> : null}
              </View>
            </View>
            <T serif size={32} color={bal.native < 0 ? th.out : th.ink} style={{ marginTop: 14 }}>{app.money(bal.native, { currency: a.currency })}</T>
            {foreign ? <T size={13} color={th.faint}>≈ {app.money(bal.home)} {home}</T> : null}
            <View style={{ height: 5, borderRadius: 3, backgroundColor: th.soft, marginTop: 12, overflow: 'hidden' }}>
              <View style={{ width: `${Math.round(share * 100)}%`, height: 5, borderRadius: 3, backgroundColor: col }} />
            </View>
            <T size={11.5} color={th.faint} style={{ marginTop: 5 }}>{Math.round(share * 100)}% of all your money</T>
          </Squish>
        );
      }) : (
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
