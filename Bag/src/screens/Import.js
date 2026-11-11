// Import from Excel: pick a file, see what would be added, then add it.
// Reads Bag's own export and the old cash book layout (Date, Cash in, Cash out).
import React, { useState } from 'react';
import { View } from 'react-native';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Button, Card, Row, Screen, T, useTheme } from '../ui/kit';
import { pickExcel } from '../lib/files';
import { planImport } from '../lib/excel';
import { totalBalance } from '../lib/ledger';

export default function Import() {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  const [plan, setPlan] = useState(null);
  const [err, setErr] = useState('');

  const choose = async () => {
    setErr('');
    setBusy(true);
    try {
      const f = await pickExcel();
      if (!f) return;
      const p = planImport(app.data, { rows: f.rows, format: f.format });
      setFile(f);
      setPlan(p);
    } catch (e) {
      setErr(String(e.message) === 'not-records'
        ? "Bag couldn't find records in that file. It needs a Date column and either Type and Amount, or Cash in and Cash out."
        : "Couldn't open that file. Try saving it as .xlsx first.");
      setPlan(null);
    } finally {
      setBusy(false);
    }
  };

  const n = plan ? Object.keys(plan.records).length : 0;
  const c = plan ? plan.counts : {};
  const before = plan ? totalBalance(app.data, { flows: app.flows, homePerUnit: app.homePerUnit }) : 0;
  const after = plan ? totalBalance(plan.after, { homePerUnit: app.homePerUnit }) : 0;
  const lines = plan ? [
    ['Expenses', c.expense], ['Income', c.income], ['I owe', c.iowe], ['Owed to me', c.owed], ['Transfers', c.transfer], ['Opening balances', c.opening],
  ].filter(([, v]) => v) : [];

  return (
    <Screen title="Import from Excel" footer={plan && (n || c.opening) ? <Button label={`Import ${n} ${n === 1 ? 'record' : 'records'}`} onPress={() => { app.applyImport(plan); nav.pop(); }} /> : null}>
      {!plan ? (
        <Card>
          <T weight="semi">Bring records in from a spreadsheet</T>
          <T size={14} color={th.muted} style={{ marginTop: 6 }}>Bag reads its own Excel export, and simple cash books with Date, Cash in, Cash out and Notes columns. Names that match a category go there. New categories and accounts are made for the rest, and you can rename them after.</T>
          <T size={14} color={th.muted} style={{ marginTop: 6 }}>Nothing changes until you check the numbers and tap Import. Rows already in Bag are skipped.</T>
        </Card>
      ) : (
        <>
          <Card pad={0} style={{ paddingHorizontal: 16, paddingTop: 14 }}>
            <T size={13} color={th.muted}>{file.name} · {file.format === 'bag' ? 'Bag export' : 'Cash book'}</T>
            {lines.map(([l, v], i) => <Row key={l} first={i === 0} minHeight={46} label={l} value={String(v)} />)}
            {c.duplicates ? <Row minHeight={46} label="Already in Bag, skipped" value={String(c.duplicates)} /> : null}
            {c.skipped ? <Row minHeight={46} label="Rows Bag couldn't read" value={String(c.skipped)} valueColor={th.warn} /> : null}
          </Card>
          {plan.newAccounts.length || plan.newCategories.length ? (
            <Card pad={0} style={{ paddingHorizontal: 16 }}>
              {plan.newAccounts.length ? <Row first label="New accounts" sub={plan.newAccounts.join(', ')} /> : null}
              {plan.newCategories.length ? <Row first={!plan.newAccounts.length} label="New categories" sub={plan.newCategories.join(', ')} /> : null}
            </Card>
          ) : null}
          <Card>
            <T size={13} color={th.muted}>Balance after import</T>
            <T size={26} weight="semi" color={after < 0 ? th.out : th.ink}>{app.money(after)}</T>
            <T size={13} color={th.faint}>Now {app.money(before)}</T>
          </Card>
          {!n && !c.opening ? <T color={th.warn}>Nothing new to add from this file.</T> : null}
        </>
      )}
      {err ? <T color={th.danger}>{err}</T> : null}
      <View>
        <Button label={busy ? 'Opening…' : plan ? 'Choose another file' : 'Choose a file'} icon="upload" kind={plan ? 'secondary' : 'primary'} disabled={busy} onPress={choose} />
      </View>
    </Screen>
  );
}
