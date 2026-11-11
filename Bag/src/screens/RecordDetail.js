// One record: the amount, what it did to your money, and every detail. Edit,
// copy, delete, or mark a debt paid from here.
import React, { useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, View } from 'react-native';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Button, Card, IconBox, Row, Screen, T, useTheme } from '../ui/kit';
import { IconButton, RecordRow, recordAmount, recordEmoji } from '../ui/parts';
import { KIND_LABEL, TYPE_LABEL, flowsOf, homeOf, isOpen, kindOf, liveRecords, statusOf, byNewest } from '../lib/ledger';
import { describe } from '../lib/repeats';
import { fmtDate } from '../lib/dates';
import { fmt, fmtApprox } from '../lib/money';
import { pickPhoto } from '../lib/photos';

function countsAs(r) {
  const f = flowsOf({ ...r, status: r.status === 'pending' ? 'paid' : r.status });
  const k = kindOf(r);
  if (r.type === 'transfer') return 'Neither: money moved between your accounts';
  if (r.type === 'iowe' && k === 'borrowed') return 'Neither: borrowed money is not income';
  if (r.type === 'owed' && k === 'lent') return 'Neither: lent money is not spending';
  if (r.type === 'iowe') return isOpen(r) ? 'Spending, once you mark it paid' : 'Spending, on the day you paid';
  if (r.type === 'owed') return isOpen(r) ? 'Income, once it arrives' : 'Income, on the day it arrived';
  if (r.status === 'pending') return `${r.type === 'income' ? 'Income' : 'Spending'}, once you confirm it`;
  return f.some((x) => x.count === 'income') ? 'Income' : 'Spending';
}

export default function RecordDetail({ id }) {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const { data } = app;
  const r = data.records[id];
  const [more, setMore] = useState(false);
  const [viewing, setViewing] = useState(null);
  const same = useMemo(() => {
    if (!r || !r.name) return [];
    const k = r.name.trim().toLowerCase();
    return liveRecords(data).filter((x) => x.id !== r.id && x.status !== 'skipped' && (x.name || '').trim().toLowerCase() === k).sort(byNewest);
  }, [data.records, id]);

  if (!r || r.deleted) {
    return (
      <Screen title="Record">
        <Card><T color={th.muted}>This record was deleted.</T></Card>
      </Screen>
    );
  }

  const home = data.homeCurrency;
  const amt = recordAmount(r);
  const color = amt.muted ? th.faint : amt.kind === 'in' ? th.in : amt.kind === 'out' ? th.out : th.ink;
  const cat = r.categoryId ? data.categories[r.categoryId] : null;
  const acc = r.accountId ? data.accounts[r.accountId] : null;
  const toAcc = r.toAccountId ? data.accounts[r.toAccountId] : null;
  const settleAcc = r.settledAccountId ? data.accounts[r.settledAccountId] : null;
  const rep = r.repeatId ? data.repeats[r.repeatId] : null;
  const status = statusOf(r);
  const debt = r.type === 'iowe' || r.type === 'owed';
  const open = isOpen(r);
  const foreign = r.currency && r.currency !== home;
  const sec = app.second(homeOf(r), 'record');
  const statusColor = status === 'Overdue' ? th.out : status === 'Pending' || status === 'Open' ? th.warn : th.muted;
  const photos = (data.photos || {})[r.id] || [];
  const sameTotal = same.reduce((s, x) => s + homeOf(x), 0) + homeOf(r);

  const del = () => {
    const extra = r.repeatId && rep && !rep.deleted ? ' The repeat keeps going. Stop it from the repeat itself.' : '';
    Alert.alert('Delete this record?', `You can undo straight after.${extra}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { nav.pop(); setTimeout(() => app.deleteRecord(r.id), 220); } },
    ]);
  };

  return (
    <Screen title="" right={<IconButton name="edit-2" label="Edit" onPress={() => nav.push('add', { id: r.id })} />}>
      <View style={{ alignItems: 'center', gap: 6, paddingTop: 4, paddingBottom: 6 }}>
        <IconBox emoji={recordEmoji(r, data.categories)} size={56} />
        <T size={18} weight="semi" center>{r.name || (r.type === 'transfer' ? 'Transfer' : 'Untitled')}</T>
        <T size={36} weight="semi" color={color} style={{ letterSpacing: -0.3 }}>{app.money(amt.value, { currency: r.currency, plus: amt.kind === 'in' })}</T>
        {foreign ? <T size={13} color={th.faint}>≈ {app.money(homeOf(r))} {home} at {fmt(r.rate, { decimals: 4 })}{r.rateCheck ? ' · rate to check' : ''}</T>
          : sec ? <T size={13} color={th.faint}>{fmtApprox(sec.amount, sec.currency)}</T> : null}
        <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: th.soft, marginTop: 2 }}>
          <T size={13} weight="medium" color={statusColor}>{status}{r.status === 'settled' && r.settledDate ? ` · ${fmtDate(r.settledDate)}` : ''}</T>
        </View>
      </View>

      {r.status === 'pending' ? (
        <Button label={r.type === 'income' ? 'Did it arrive?' : 'Did you pay it?'} onPress={() => nav.openSheet('confirm', { id: r.id })} />
      ) : null}
      {open ? <Button label={r.type === 'iowe' ? 'Mark paid' : 'Mark received'} onPress={() => nav.openSheet('settle', { id: r.id })} /> : null}
      {debt && r.status === 'settled' ? <Button label={r.type === 'iowe' ? 'Mark not paid' : 'Mark not received'} kind="secondary" onPress={() => app.reopenRecord(r.id)} /> : null}

      <Card pad={0} style={{ paddingHorizontal: 16 }}>
        <Row first label="Type" value={`${TYPE_LABEL[r.type]}${debt ? ` · ${KIND_LABEL[kindOf(r)]}` : ''}`} />
        {r.type !== 'transfer' ? <Row label="Category" value={cat && !cat.deleted ? `${cat.emoji} ${cat.name}` : 'None'} onPress={cat && !cat.deleted ? () => nav.push('category', { id: cat.id }) : undefined} /> : null}
        <Row label={debt ? 'Added' : 'Date'} value={fmtDate(r.date, { weekday: true })} />
        {debt && r.dueDate ? <Row label="Due" value={fmtDate(r.dueDate, { weekday: true })} valueColor={status === 'Overdue' ? th.out : undefined} /> : null}
        {r.who ? <Row label={r.type === 'iowe' ? 'To' : 'Who'} value={r.who} /> : null}
        {r.type === 'transfer' ? (
          <>
            <Row label="From" value={acc ? acc.name : '?'} onPress={acc && !acc.deleted ? () => nav.push('account', { id: acc.id }) : undefined} />
            <Row label="To" value={toAcc ? `${toAcc.name}${r.toAmount ? ` · ${app.money(r.toAmount, { currency: r.toCurrency })}` : ''}` : '?'} onPress={toAcc && !toAcc.deleted ? () => nav.push('account', { id: toAcc.id }) : undefined} />
          </>
        ) : (
          <Row label={r.type === 'income' || (r.type === 'iowe' && kindOf(r) === 'borrowed') ? 'Into' : r.type === 'owed' && kindOf(r) === 'work' ? 'Into' : 'Account'} value={acc && !acc.deleted ? acc.name : 'None'} onPress={acc && !acc.deleted ? () => nav.push('account', { id: acc.id }) : undefined} />
        )}
        {r.status === 'settled' && settleAcc && settleAcc.id !== r.accountId ? <Row label={r.type === 'iowe' ? 'Paid from' : 'Paid into'} value={settleAcc.name} /> : null}
        {rep ? <Row label="Repeats" value={rep.deleted ? 'Stopped' : rep.paused ? 'Paused' : describe(rep)} onPress={!rep.deleted ? () => nav.push('repeat', { id: rep.id }) : undefined} /> : null}
        {r.splitWith ? <Row label="Split with" value={`${r.splitWith} · your share`} /> : null}
        {r.splitOf && data.records[r.splitOf] && !data.records[r.splitOf].deleted ? <Row label="Split from" value={data.records[r.splitOf].name || 'Expense'} onPress={() => nav.push('record', { id: r.splitOf })} /> : null}
        {r.description ? <Row label="Description" sub={r.description} /> : null}
        <Pressable onPress={() => setMore(!more)} accessibilityRole="button" style={{ minHeight: 48, justifyContent: 'center', borderTopWidth: 1, borderTopColor: th.line }}>
          <T size={14} weight="medium" color={th.accent}>{more ? 'Fewer details' : 'More details'}</T>
        </Pressable>
        {more ? (
          <>
            <Row label="Counts as" sub={countsAs(r)} />
            {foreign ? <Row label="Rate" value={`1 ${r.currency} = ${fmt(r.rate, { decimals: 4 })} ${home}${r.rateManual ? ' (yours)' : ''}`} /> : null}
            <Row label="Added on this phone" value={r.createdAt ? fmtDate(new Date(r.createdAt).toISOString().slice(0, 10)) : '?'} />
            {r.updatedAt && r.updatedAt !== r.createdAt ? <Row label="Last changed" value={fmtDate(new Date(r.updatedAt).toISOString().slice(0, 10))} /> : null}
            {r.imported ? <Row label="From" value="Excel import" /> : null}
          </>
        ) : null}
      </Card>

      {r.type !== 'transfer' ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T>Receipt</T>
            <Button label="Add photo" icon="camera" kind="secondary" small onPress={() => nav.openSheet('choice', {
              title: 'Add a receipt photo', options: [{ id: 'camera', label: 'Take a photo' }, { id: 'library', label: 'Choose from photos' }],
              onPick: async (from) => {
                try { const uri = await pickPhoto(from); if (uri) await app.addPhoto(r.id, uri); } catch (e) { app.showToast('Allow the camera for Bag in your phone settings'); }
              },
            })} />
          </View>
          {photos.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {photos.map((u) => (
                <Pressable key={u} onPress={() => setViewing(u)} accessibilityRole="imagebutton" accessibilityLabel="Open receipt photo">
                  <Image source={{ uri: u }} style={{ width: 84, height: 84, borderRadius: 12, backgroundColor: th.soft }} />
                </Pressable>
              ))}
            </View>
          ) : <T size={13} color={th.faint} style={{ marginTop: 6 }}>No photo yet. Kept on this phone only.</T>}
        </Card>
      ) : null}

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' }}>
          {viewing ? <Image source={{ uri: viewing }} style={{ width: '100%', height: '75%' }} resizeMode="contain" accessibilityLabel="Receipt photo" /> : null}
          <View style={{ flexDirection: 'row', gap: 10, padding: 20 }}>
            <Button label="Close" kind="secondary" style={{ flex: 1 }} onPress={() => setViewing(null)} />
            <Button label="Remove" kind="danger" icon="trash-2" style={{ flex: 1 }} onPress={() => { app.removePhoto(r.id, viewing); setViewing(null); }} />
          </View>
        </View>
      </Modal>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label="Copy to today" kind="secondary" icon="copy" style={{ flex: 1 }} onPress={() => { const nid = app.duplicateRecord(r.id); if (nid) { nav.pop(); setTimeout(() => nav.push('record', { id: nid }), 250); } }} />
        <Button label="Delete" kind="dangerText" icon="trash-2" style={{ flex: 1 }} onPress={del} />
      </View>

      {same.length ? (
        <Card pad={0} style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 2 }}>
          <T size={16} weight="semi">Other “{r.name}” records</T>
          <T size={13} color={th.faint}>{same.length + 1} in total · {app.money(sameTotal)}</T>
          {same.slice(0, 5).map((x, i) => <RecordRow key={x.id} record={x} showDate first={i === 0} onPress={() => nav.push('record', { id: x.id })} />)}
        </Card>
      ) : null}
    </Screen>
  );
}
