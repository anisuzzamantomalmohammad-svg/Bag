// One category: this period against its budget, the last six months as bars
// (tap one), and the records behind it.
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Bar, Button, Card, IconBox, Screen, T, useTheme } from '../ui/kit';
import { IconButton, RecordRow } from '../ui/parts';
import { budgetStatus, filterRecords } from '../lib/ledger';
import { addMonths, fmtShort, lastDayOfMonth, monthLabel, today } from '../lib/dates';
import { round2 } from '../lib/money';
import { rangeLabel } from './Sheets';

export default function CategoryDetail({ id, from: startFrom, to: startTo }) {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const { data, flows } = app;
  const c = data.categories[id];
  const income = c && c.kind === 'income';
  const now = today();
  const [pick, setPick] = useState(startFrom || startTo ? { from: startFrom, to: startTo } : null);

  const months = useMemo(() => {
    const out = [];
    for (let k = -5; k <= 0; k++) {
      const key = addMonths(`${now.slice(0, 7)}-01`, k).slice(0, 7);
      out.push({ key, from: `${key}-01`, to: lastDayOfMonth(key), total: 0 });
    }
    flows.forEach((f) => {
      if (f.categoryId !== id || f.count !== (income ? 'income' : 'expense')) return;
      const m = out.find((x) => f.date >= x.from && f.date <= x.to);
      if (m) m.total += income ? f.home : -f.home;
    });
    return out.map((m) => ({ ...m, total: round2(m.total) }));
  }, [flows, id]);
  const max = Math.max(1, ...months.map((m) => m.total));
  const full = months.slice(0, 5).filter((m) => m.total > 0);
  const avg = full.length ? round2(full.reduce((s, m) => s + m.total, 0) / full.length) : 0;

  const range = pick || { from: months[5].from, to: months[5].to };
  const recs = useMemo(() => filterRecords(data, { from: range.from, to: range.to, categoryId: id }), [data.records, range.from, range.to, id]);

  if (!c || c.deleted) return <Screen title="Category"><Card><T color={th.muted}>This category was deleted.</T></Card></Screen>;

  const budget = data.budgets[id] && !data.budgets[id].deleted ? data.budgets[id] : null;
  const st = budget ? budgetStatus(data, budget, { flows }) : null;
  const used = st ? Math.min(100, st.pct * 100) : 0;
  const col = st && st.state === 'over' ? th.out : st && st.state === 'warn' ? th.warnBar : th.accent;
  const thisMonth = months[5].total;

  return (
    <Screen title="" right={<IconButton name="edit-2" label="Edit category" onPress={() => nav.push('categories', { kind: c.kind, edit: c.id })} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconBox emoji={c.emoji} size={52} />
        <View style={{ flex: 1 }}>
          <T size={22} weight="semi">{c.name}</T>
          <T size={13} color={th.faint}>{income ? 'Income' : 'Spending'}{avg ? ` · about ${app.money(avg)} a month` : ''}</T>
        </View>
      </View>

      {!income ? (
        <Card>
          {st ? (
            <>
              <T size={13} color={th.muted}>{st.period === 'week' ? 'This week' : 'This month'}</T>
              <T size={22} weight="semi" color={st.state === 'over' ? th.out : th.ink}>{app.money(st.spent)} <T size={15} color={th.muted}>of {app.money(st.limit)}</T></T>
              <Bar parts={[{ pct: used, color: col }, { pct: st.limit ? Math.min(100 - used, (st.planned / st.limit) * 100) : 0, color: th.planned }]} style={{ marginTop: 10 }} />
              <T size={13} color={st.state === 'over' ? th.out : st.state === 'warn' ? th.warn : th.faint} style={{ marginTop: 8 }}>
                {st.state === 'over' ? `${app.money(-st.left)} over` : `${app.money(st.left)} left`}
                {st.planned ? ` · ${app.money(st.planned)} planned (${st.plannedCount})` : ''} · resets {fmtShort(st.to)}
              </T>
              <Button label="Change budget" kind="secondary" small style={{ marginTop: 12, alignSelf: 'flex-start' }} onPress={() => nav.push('budget', { categoryId: id })} />
            </>
          ) : (
            <>
              <T size={13} color={th.muted}>This month</T>
              <T size={22} weight="semi">{app.money(thisMonth)}</T>
              <Button label="Set a budget" kind="secondary" small style={{ marginTop: 12, alignSelf: 'flex-start' }} onPress={() => nav.push('budget', { categoryId: id })} />
            </>
          )}
        </Card>
      ) : null}

      <Card>
        <T size={16} weight="semi" style={{ marginBottom: 12 }}>Last 6 months</T>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 130, gap: 8 }}>
          {months.map((m) => {
            const on = range.from === m.from && range.to === m.to;
            return (
              <Pressable key={m.key} onPress={() => setPick(on ? null : { from: m.from, to: m.to })} accessibilityRole="button" accessibilityLabel={`${monthLabel(m.key, true)}, ${app.money(m.total)}`} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                <T size={10} color={th.faint2} numberOfLines={1}>{m.total ? (m.total >= 1000 ? `${round2(m.total / 1000).toFixed(1)}k` : Math.round(m.total)) : ''}</T>
                <View style={{ width: '70%', height: Math.max(2, (m.total / max) * 96), borderRadius: 6, backgroundColor: on ? (income ? th.in : th.out) : th.catBar, marginTop: 2 }} />
                <T size={12} weight={on ? 'semi' : 'regular'} color={on ? th.ink : th.faint} style={{ marginTop: 6 }}>{monthLabel(m.key)}</T>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card pad={0} style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 2 }}>
        <T size={13} weight="semi" color={th.muted}>{rangeLabel(range.from, range.to)} · {recs.length} {recs.length === 1 ? 'record' : 'records'}</T>
        {recs.length ? recs.map((r, i) => <RecordRow key={r.id} record={r} showDate first={i === 0} onPress={() => nav.push('record', { id: r.id })} />)
          : <T size={14} color={th.faint} style={{ paddingVertical: 12 }}>Nothing here in these dates</T>}
      </Card>
    </Screen>
  );
}
