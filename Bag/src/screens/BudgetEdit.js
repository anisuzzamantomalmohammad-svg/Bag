// Set or change a category's budget: a limit for each week or month.
import React, { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Button, Card, Chip, Chips, Field, IconBox, Seg, Screen, T, useTheme } from '../ui/kit';
import { live } from '../lib/ledger';
import { addMonths, today } from '../lib/dates';
import { parseAmount, round2 } from '../lib/money';

export default function BudgetEdit({ categoryId }) {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const { data, flows } = app;
  const [catId, setCatId] = useState(categoryId || null);
  const old = catId && data.budgets[catId] && !data.budgets[catId].deleted ? data.budgets[catId] : null;
  const [limit, setLimit] = useState(old ? String(old.limit) : '');
  const [period, setPeriod] = useState(old ? old.period || 'month' : 'month');
  const [err, setErr] = useState('');
  const cat = catId ? data.categories[catId] : null;
  const cats = live(data.categories).filter((c) => c.kind === 'expense').sort((a, b) => (a.order || 0) - (b.order || 0));

  // What this category usually costs: the last 3 full months.
  const usual = useMemo(() => {
    if (!catId) return null;
    const m0 = `${today().slice(0, 7)}-01`;
    const from = addMonths(m0, -3);
    let sum = 0;
    flows.forEach((f) => { if (f.categoryId === catId && f.count === 'expense' && f.date >= from && f.date < m0) sum -= f.home; });
    return sum > 0 ? round2(sum / 3) : null;
  }, [catId, flows]);

  const save = () => {
    if (!catId) { setErr('Pick a category'); return; }
    const n = parseAmount(limit);
    if (!(n > 0)) { setErr('Enter a limit above zero'); return; }
    app.saveBudget({ categoryId: catId, limit: n, period });
    app.showToast('Budget saved');
    nav.pop();
  };

  return (
    <Screen title={old ? 'Change budget' : 'Set a budget'} back="close" footer={<Button label="Save" onPress={save} />}>
      {categoryId && cat ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconBox emoji={cat.emoji} />
          <T weight="medium">{cat.name}</T>
        </Card>
      ) : (
        <View>
          <T size={13} color={th.muted} style={{ marginBottom: 8 }}>Category</T>
          <Chips>{cats.map((c) => <Chip key={c.id} label={`${c.emoji} ${c.name}`} on={catId === c.id} onPress={() => { setErr(''); setCatId(c.id); const b = data.budgets[c.id]; if (b && !b.deleted) { setLimit(String(b.limit)); setPeriod(b.period || 'month'); } }} />)}</Chips>
        </View>
      )}
      <Seg items={[{ id: 'month', label: 'Each month' }, { id: 'week', label: 'Each week' }]} value={period} onChange={setPeriod} />
      <Field label="Limit" value={limit} onChangeText={(t) => { setErr(''); setLimit(t); }} keyboardType="decimal-pad" placeholder="0.00" big autoFocus={!old} />
      {usual ? (
        <T size={13} color={th.faint} style={{ marginHorizontal: 4 }}>
          You usually spend about {app.money(usual)} a month here{period === 'week' ? `, about ${app.money(round2((usual * 12) / 52))} a week` : ''}.
        </T>
      ) : null}
      {data.budgetRollover ? <T size={13} color={th.faint} style={{ marginHorizontal: 4 }}>Roll over is on: what's left carries to the next {period}.</T> : null}
      {err ? <T size={13} color={th.danger}>{err}</T> : null}
      {old ? <Button label="Remove budget" kind="dangerText" onPress={() => Alert.alert('Remove this budget?', 'Your records stay.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => { app.deleteBudget(catId); nav.pop(); } }])} /> : null}
    </Screen>
  );
}
