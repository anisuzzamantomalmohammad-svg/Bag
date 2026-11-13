// One record. Tap the name, amount, category, date or account to change it
// right here; the pencil opens the full form for repeats and splits.
import React, { useMemo, useState } from 'react';
import { Image, Modal, Pressable, View } from 'react-native';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Button, Card, IconBox, Row, Screen, T, useTheme } from '../ui/kit';
import { IconButton, RecordRow, recordAmount, recordEmoji, useRecordActions } from '../ui/parts';
import { KIND_LABEL, TYPE_LABEL, displayName, flowsOf, homeOf, isOpen, kindOf, liveRecords, statusOf, byNewest } from '../lib/ledger';
import { describe } from '../lib/repeats';
import { fmtDate, ymd } from '../lib/dates';
import { fmt, fmtApprox, parseAmount } from '../lib/money';
import { pickPhoto } from '../lib/photos';

function countsAs(r) {
  const f = flowsOf({ ...r, status: r.status === 'pending' ? 'paid' : r.status });
  const k = kindOf(r);
  if (r.type === 'transfer') return 'Neither: money moved between your accounts';
  if (r.type === 'iowe' && k === 'borrowed') return 'Neither: borrowed money is not cash in';
  if (r.type === 'owed' && k === 'lent') return 'Neither: lent money is not cash out';
  if (r.type === 'iowe') return isOpen(r) ? 'Cash out, once you mark it paid' : 'Cash out, on the day you paid';
  if (r.type === 'owed') return isOpen(r) ? 'Cash in, once it arrives' : 'Cash in, on the day it arrived';
  if (r.status === 'scheduled') return `${r.type === 'income' ? 'Cash in' : 'Cash out'}, from its date`;
  if (r.status === 'pending') return `${r.type === 'income' ? 'Cash in' : 'Cash out'}, once you confirm it`;
  return f.some((x) => x.count === 'income') ? 'Cash in' : 'Cash out';
}

export default function RecordDetail({ id }) {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const { data } = app;
  const r = data.records[id];
  const [more, setMore] = useState(false);
  const [viewing, setViewing] = useState(null);
  const { remove } = useRecordActions();
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

  // Change one thing and save straight away.
  const set = (patch) => app.saveRecord({ ...r, ...patch });
  const editName = () => nav.openSheet('text', { title: 'Name', value: r.name, placeholder: cat && !cat.deleted ? cat.name : 'Name', onPick: (v) => set({ name: v }) });
  const editAmount = () => nav.openSheet('text', { title: 'Amount', value: String(r.amount), number: true, placeholder: '0.00', onPick: (v) => { const n = parseAmount(v); if (n > 0) set({ amount: n }); } });
  const editCategory = () => nav.openSheet('category', { kind: r.type === 'income' || (r.type === 'owed' && kindOf(r) === 'work') ? 'income' : 'expense', value: r.categoryId, onPick: (cid) => set({ categoryId: cid }) });
  const editAccount = (key, title, exclude) => nav.openSheet('account', { title, value: r[key], exclude, onPick: (aid) => set({ [key]: aid }) });
  const showBadge = status && !(status === 'Paid' || status === 'Received');

  return (
    <Screen title="" right={<IconButton name="edit-2" label="Edit" onPress={() => nav.push('add', { id: r.id })} />}>
      <View style={{ alignItems: 'center', gap: 6, paddingTop: 4, paddingBottom: 6 }}>
        <IconBox emoji={recordEmoji(r, data.categories)} size={56} />
        <Pressable onPress={editName} accessibilityRole="button" accessibilityLabel={`Name: ${displayName(r, data)}. Tap to change`} hitSlop={6}>
          <T size={18} weight="semi" center>{displayName(r, data)}</T>
        </Pressable>
        <Pressable onPress={editAmount} accessibilityRole="button" accessibilityLabel="Amount. Tap to change" hitSlop={4}>
          <T size={38} serif color={color} style={{ letterSpacing: -0.3 }}>{app.money(amt.value, { currency: r.currency, plus: amt.kind === 'in' })}</T>
        </Pressable>
        {foreign ? <T size={13} color={th.faint}>≈ {app.money(homeOf(r))} {home} at {fmt(r.rate, { decimals: 4 })}{r.rateCheck ? ' · rate to check' : ''}</T>
          : sec ? <T size={13} color={th.faint}>{fmtApprox(sec.amount, sec.currency)}</T> : null}
        {showBadge ? (
          <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: th.soft, marginTop: 2 }}>
            <T size={13} weight="medium" color={statusColor}>{status}{r.status === 'settled' && r.settledDate ? ` · ${fmtDate(r.settledDate)}` : r.status === 'scheduled' ? ` · counts from ${fmtDate(r.date)}` : ''}</T>
          </View>
        ) : null}
      </View>

      {r.status === 'pending' ? (
        <Button label={r.type === 'income' ? 'Did it arrive?' : 'Did you pay it?'} onPress={() => nav.openSheet('confirm', { id: r.id })} />
      ) : null}
      {open ? <Button label={r.type === 'iowe' ? 'Mark paid' : 'Mark received'} onPress={() => nav.openSheet('settle', { id: r.id })} /> : null}
      {debt && r.status === 'settled' ? <Button label={r.type === 'iowe' ? 'Mark not paid' : 'Mark not received'} kind="secondary" onPress={() => app.reopenRecord(r.id)} /> : null}

      <Card pad={0} style={{ paddingHorizontal: 16 }}>
        <Row first label="Type" value={`${TYPE_LABEL[r.type]}${debt ? ` · ${KIND_LABEL[kindOf(r)]}` : ''}`} />
        {r.type !== 'transfer' ? <Row label="Category" value={cat && !cat.deleted ? `${cat.emoji} ${cat.name}` : 'Choose'} onPress={editCategory} /> : null}
        {debt ? <Row label="Added" value={fmtDate(r.date, { weekday: true })} /> : <Row label="Date" value={fmtDate(r.date, { weekday: true })} onPress={() => nav.openSheet('date', { value: r.date, onPick: (d) => d && set({ date: d }) })} />}
        {debt ? <Row label="Due" value={r.dueDate ? fmtDate(r.dueDate, { weekday: true }) : 'No date'} valueColor={status === 'Overdue' ? th.out : undefined} onPress={() => nav.openSheet('date', { value: r.dueDate || r.date, title: 'Due date', onPick: (d) => d && set({ dueDate: d }) })} /> : null}
        {r.who ? <Row label={r.type === 'iowe' ? 'To' : 'Who'} value={r.who} /> : null}
        {r.type === 'transfer' ? (
          <>
            <Row label="From" value={acc ? acc.name : '?'} onPress={() => editAccount('accountId', 'From', [r.toAccountId])} />
            <Row label="To" value={toAcc ? `${toAcc.name}${r.toAmount ? ` · ${app.money(r.toAmount, { currency: r.toCurrency })}` : ''}` : '?'} onPress={() => editAccount('toAccountId', 'To', [r.accountId])} />
          </>
        ) : (
          <Row label={r.type === 'income' || (r.type === 'iowe' && kindOf(r) === 'borrowed') ? 'Into' : r.type === 'owed' && kindOf(r) === 'work' ? 'Into' : 'Account'} value={acc && !acc.deleted ? acc.name : 'Choose'} onPress={() => editAccount('accountId', 'Account')} />
        )}
        {r.status === 'settled' && settleAcc && settleAcc.id !== r.accountId ? <Row label={r.type === 'iowe' ? 'Paid from' : 'Paid into'} value={settleAcc.name} /> : null}
        {rep ? <Row label="Repeats" value={rep.deleted ? 'Stopped' : rep.paused ? 'Paused' : describe(rep)} onPress={!rep.deleted ? () => nav.push('repeat', { id: rep.id }) : undefined} /> : null}
        {r.splitWith ? <Row label="Split with" value={`${r.splitWith} · your share`} /> : null}
        {r.splitOf && data.records[r.splitOf] && !data.records[r.splitOf].deleted ? <Row label="Split from" value={data.records[r.splitOf].name || 'Expense'} onPress={() => nav.push('record', { id: r.splitOf })} /> : null}
        <Row label="Description" sub={r.description || undefined} value={r.description ? undefined : 'Add'} onPress={() => nav.openSheet('text', { title: 'Description', value: r.description, placeholder: 'Optional', clearLabel: r.description ? 'Remove' : undefined, onPick: (v) => set({ description: v }) })} />
        <Pressable onPress={() => setMore(!more)} accessibilityRole="button" style={{ minHeight: 48, justifyContent: 'center', borderTopWidth: 1, borderTopColor: th.line }}>
          <T size={14} weight="medium" color={th.accent}>{more ? 'Fewer details' : 'More details'}</T>
        </Pressable>
        {more ? (
          <>
            <Row label="Counts as" sub={countsAs(r)} />
            {foreign ? <Row label="Rate" value={`1 ${r.currency} = ${fmt(r.rate, { decimals: 4 })} ${home}${r.rateManual ? ' (yours)' : ''}`} /> : null}
            <Row label="Added on this phone" value={r.createdAt ? fmtDate(ymd(new Date(r.createdAt))) : '?'} />
            {r.updatedAt && r.updatedAt !== r.createdAt ? <Row label="Last changed" value={fmtDate(ymd(new Date(r.updatedAt)))} /> : null}
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
        <Button label="Duplicate" kind="secondary" icon="copy" style={{ flex: 1 }} onPress={() => { const nid = app.duplicateRecord(r.id); if (nid) { nav.pop(); setTimeout(() => nav.push('record', { id: nid }), 250); } }} />
        <Button label="Delete" kind="dangerText" icon="trash-2" style={{ flex: 1 }} onPress={() => remove(r, () => nav.pop())} />
      </View>

      {same.length ? (
        <Card pad={0} style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 2 }}>
          <T size={12} color={th.muted} style={{ letterSpacing: 1 }}>Other “{r.name}” records</T>
          <T size={13} color={th.faint}>{same.length + 1} in total · {app.money(sameTotal)}</T>
          {same.slice(0, 5).map((x, i) => <RecordRow key={x.id} record={x} showDate first={i === 0} onPress={() => nav.push('record', { id: x.id })} />)}
        </Card>
      ) : null}
      {cat && !cat.deleted ? <Button label={`See all ${cat.name}`} kind="ghost" onPress={() => nav.push('category', { id: cat.id })} /> : null}
    </Screen>
  );
}
