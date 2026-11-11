// Settings, grouped and searchable. Google account first, then lock, money,
// reminders, data, looks and about. The finer looks live in Customise.
import React, { useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Button, Card, Field, Icon, Label, Row, Screen, Seg, Sheet, T, Toggle, useTheme } from '../ui/kit';
import { initials } from './Home';
import { currencyName } from '../data/currencies';
import { fmtDate, ordinal } from '../lib/dates';
import { canLock } from '../lib/lock';
import { askPermission, ensureChannel } from '../lib/reminders';
import { googleConfigured, listBackups, downloadBackup } from '../lib/google';
import { liveRecords, live } from '../lib/ledger';

const VERSION = require('../../app.json').expo.version;
const PRIVACY_URL = 'https://anisuzzamantomalmohammad-svg.github.io/Bag/privacy.html';
const LOCK_AFTER = [[0, 'Straight away'], [60, 'After 1 minute'], [300, 'After 5 minutes'], [900, 'After 15 minutes']];
const BILL_DAYS = [[0, 'On the day'], [1, '1 day before'], [2, '2 days before'], [3, '3 days before'], [7, 'A week before']];
const TIMES = ['07:00', '08:00', '09:00', '12:00', '17:00', '19:00', '21:00'];
const WEEK = [[1, 'Monday'], [0, 'Sunday'], [6, 'Saturday']];
const SECOND_PLACES = [
  ['home', 'Home balance'], ['tiles', 'Cash in and out tiles'], ['accounts', 'Accounts'],
  ['record', 'Record details'], ['reports', 'Reports'], ['widget', 'Widget'],
];

const ago = (iso) => {
  if (!iso) return 'Not yet';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  return fmtDate(new Date(iso).toISOString().slice(0, 10));
};
const timeLabel = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };

// A titled card that hides rows that don't match the search.
function Section({ title, q, rows }) {
  const query = q.trim().toLowerCase();
  const shown = rows.filter(Boolean).filter((r) => !query || `${title} ${r.words}`.toLowerCase().includes(query));
  if (!shown.length) return null;
  return (
    <View>
      <Label>{title}</Label>
      <Card pad={0} style={{ paddingHorizontal: 16 }}>
        {shown.map((r, i) => <React.Fragment key={r.key}>{r.node(i === 0)}</React.Fragment>)}
      </Card>
    </View>
  );
}

function RestoreSheet({ visible, onClose }) {
  const app = useApp();
  const th = useTheme();
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  React.useEffect(() => {
    if (!visible) return;
    setList(null); setErr('');
    listBackups().then(setList).catch(() => setErr("Couldn't reach Google Drive. Check your internet."));
  }, [visible]);
  const restore = (f) => {
    Alert.alert('Replace what is on this phone?', `Records, accounts, categories, budgets, goals and repeats go back to how they were on ${fmtDate(f.modifiedTime.slice(0, 10))}. Settings on this phone stay.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Restore', style: 'destructive', onPress: async () => {
        try { const d = await downloadBackup(f.id); app.restoreData(d); onClose(); } catch (e) { app.showToast("Couldn't restore that backup"); }
      } },
    ]);
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Restore a backup">
      <T size={14} color={th.muted}>Bag keeps your 4 newest backups in a private Bag folder in your Google Drive.</T>
      {err ? <T color={th.danger}>{err}</T> : !list ? <T color={th.faint}>Looking…</T> : !list.length ? <T color={th.faint}>No backups yet.</T> : (
        <View>
          {list.map((f, i) => (
            <Row key={f.id} first={i === 0} label={fmtDate(f.modifiedTime.slice(0, 10), { weekday: true })} sub={`${new Date(f.modifiedTime).toTimeString().slice(0, 5)} · ${Math.max(1, Math.round((Number(f.size) || 0) / 1024))} KB`} onPress={() => restore(f)} />
          ))}
        </View>
      )}
    </Sheet>
  );
}

export default function Settings({ section }) {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const { data, update } = app;
  const [q, setQ] = useState('');
  const [only, setOnly] = useState(section || null);
  const [restoring, setRestoring] = useState(false);
  const g = data.google;
  const configured = googleConfigured();
  const set = (k, v) => update((d) => ({ [k]: { ...d[k], ...v } }));
  const choose = (title, options, value, onPick) => nav.openSheet('choice', { title, options: options.map(([id, label]) => ({ id, label })), value, onPick });
  const hasData = liveRecords(data).length > 0 || live(data.accounts).some((a) => Number(a.opening));

  const toggleLock = async (on) => {
    if (on && !(await canLock())) { app.showToast('Set up a fingerprint, face or screen lock on your phone first'); return; }
    if (on && !(await app.tryUnlock())) return;
    set('lock', { on });
  };
  const toggleReminders = async (on) => {
    if (on) {
      await ensureChannel();
      if (!(await askPermission())) { app.showToast('Allow notifications for Bag in your phone settings'); return; }
    }
    set('reminders', { on });
  };
  const changeHome = () => {
    if (hasData) {
      Alert.alert('Home currency is set', `Every amount is saved against ${data.homeCurrency}. Changing it now would make your totals wrong. Records in other currencies are fine: pick the currency on each record.`);
      return;
    }
    nav.openSheet('currency', { value: data.homeCurrency, title: 'Home currency', onPick: (c) => update({ homeCurrency: c }) });
  };

  const rows = {
    you: [
      g ? { key: 'g', words: 'google account email sync', node: (f) => <Row first={f} minHeight={64} left={<View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: th.accent, alignItems: 'center', justifyContent: 'center' }}><T size={14} weight="semi" color={th.accent}>{initials(g.name) || 'G'}</T></View>} label={g.name || 'Google account'} sub={g.email} /> } : null,
      g ? { key: 'sync', words: 'sync now phones drive', node: (f) => <Row first={f} label="Sync now" sub={app.syncing ? 'Syncing…' : `Last synced ${ago(data.lastSyncAt).toLowerCase()}`} onPress={() => app.syncNow({ manual: true })} /> } : null,
      g ? { key: 'backup', words: 'back up backup drive', node: (f) => <Row first={f} label="Back up now" sub={`Last backup ${ago(data.lastDriveBackupAt).toLowerCase()}. Bag also backs up on its own when something changes.`} onPress={() => app.backupNow({ manual: true })} /> } : null,
      g ? { key: 'restore', words: 'restore backup drive', node: (f) => <Row first={f} label="Restore a backup" onPress={() => setRestoring(true)} /> } : null,
      g ? { key: 'out', words: 'sign out google', node: (f) => <Row first={f} label={<T color={th.danger}>Sign out</T>} onPress={() => Alert.alert('Sign out of Google?', 'Your records stay on this phone. Syncing and Drive backups stop.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => app.signOutGoogle() }])} chevron={false} /> } : null,
      !g ? { key: 'in', words: 'google sign in account sync drive backup', node: (f) => <Row first={f} minHeight={64} left={<Icon name="cloud" size={20} color={th.accent} />} label="Sign in with Google" sub={configured ? 'Sync between phones and back up to your Google Drive. Optional.' : "Google sign-in isn't set up in this build yet"} onPress={configured ? () => app.signInGoogle() : undefined} /> } : null,
      !g ? { key: 'name', words: 'name you', node: (f) => <Row first={f} label="Your name" value={data.ownerName || 'Not set'} onPress={() => nav.openSheet('text', { title: 'Your name', value: data.ownerName, placeholder: 'Name', onPick: (v) => update({ ownerName: v }) })} /> } : null,
    ],
    security: [
      { key: 'lock', words: 'lock fingerprint face pin security', node: (f) => <Row first={f} label="App lock" sub="Fingerprint, face or your phone's PIN" right={<Toggle value={!!data.lock.on} onChange={toggleLock} label="App lock" />} /> },
      data.lock.on ? { key: 'after', words: 'lock after time', node: (f) => <Row first={f} label="Lock" value={(LOCK_AFTER.find((x) => x[0] === Number(data.lock.after)) || LOCK_AFTER[1])[1]} onPress={() => choose('Lock', LOCK_AFTER, Number(data.lock.after), (v) => set('lock', { after: v }))} /> } : null,
      data.lock.on ? { key: 'wnum', words: 'widget numbers lock home screen', node: (f) => <Row first={f} label="Show numbers on the widget" sub="Off: the widget says Bag is locked" right={<Toggle value={!!data.lock.widgetNumbers} onChange={(v) => set('lock', { widgetNumbers: v })} label="Show numbers on the widget" />} /> } : null,
      { key: 'hide', words: 'hide recent apps screenshot privacy', node: (f) => <Row first={f} label="Hide in recent apps" sub="Also blocks screenshots" right={<Toggle value={!!data.lock.hideRecents} onChange={(v) => set('lock', { hideRecents: v })} label="Hide in recent apps" />} /> },
    ],
    money: [
      { key: 'home', words: 'home currency nzd', node: (f) => <Row first={f} label="Home currency" value={`${data.homeCurrency} · ${currencyName(data.homeCurrency)}`} onPress={changeHome} /> },
      { key: 'second', words: 'second currency bdt taka', node: (f) => <Row first={f} label="Second currency" sub="A small ≈ line in another currency" right={<Toggle value={!!data.secondOn} onChange={(v) => update({ secondOn: v, secondCurrency: data.secondCurrency && data.secondCurrency !== data.homeCurrency ? data.secondCurrency : data.homeCurrency === 'BDT' ? 'USD' : 'BDT' })} label="Second currency" />} /> },
      data.secondOn ? { key: 'secondCur', words: 'second currency bdt taka', node: (f) => <Row first={f} label="Currency" value={`${data.secondCurrency} · ${currencyName(data.secondCurrency)}`} onPress={() => nav.openSheet('currency', { title: 'Second currency', value: data.secondCurrency, onPick: (c) => c && update({ secondCurrency: c }) })} /> } : null,
      { key: 'rates', words: 'exchange rates refresh', node: (f) => <Row first={f} label="Exchange rates" sub="Saved on the phone for offline use. Each record keeps the rate of its own day." onPress={async () => { await app.refreshRates(); app.showToast('Rates updated'); }} /> },
      { key: 'week', words: 'week starts monday sunday', node: (f) => <Row first={f} label="Week starts on" value={(WEEK.find((w) => w[0] === data.weekStart) || WEEK[0])[1]} onPress={() => choose('Week starts on', WEEK, data.weekStart, (v) => update({ weekStart: v }))} /> },
      { key: 'month', words: 'month starts payday budget', node: (f) => <Row first={f} label="Month starts on" sub="Set it to payday if you budget from pay to pay" value={`The ${ordinal(data.monthStartDay || 1)}`} onPress={() => choose('Month starts on', Array.from({ length: 28 }, (_, i) => [i + 1, `The ${ordinal(i + 1)}`]), data.monthStartDay || 1, (v) => update({ monthStartDay: v }))} /> },
      { key: 'roll', words: 'budget rollover carry over left', node: (f) => <Row first={f} label="Roll over budgets" sub="What's left this month adds to next month" right={<Toggle value={!!data.budgetRollover} onChange={(v) => update({ budgetRollover: v })} label="Roll over budgets" />} /> },
    ],
    secondPlaces: data.secondOn ? SECOND_PLACES.map(([k, label, sub]) => ({
      key: `sp-${k}`, words: `second currency show ${label}`,
      node: (f) => <Row first={f} label={label} sub={sub} right={<Toggle value={!!(data.secondShow || {})[k]} onChange={(v) => set('secondShow', { [k]: v })} label={`Show second currency on ${label}`} />} />,
    })) : [],
    reminders: [
      { key: 'on', words: 'reminders notifications', node: (f) => <Row first={f} label="Reminders" right={<Toggle value={data.reminders.on !== false} onChange={toggleReminders} label="Reminders" />} /> },
      data.reminders.on !== false ? { key: 'days', words: 'bill reminder days before due', node: (f) => <Row first={f} label="Bills I owe" value={(BILL_DAYS.find((x) => x[0] === Number(data.reminders.billDays)) || BILL_DAYS[2])[1]} onPress={() => choose('Remind me about bills', BILL_DAYS, Number(data.reminders.billDays), (v) => set('reminders', { billDays: v }))} /> } : null,
      data.reminders.on !== false ? { key: 'time', words: 'reminder time morning', node: (f) => <Row first={f} label="At" value={timeLabel(data.reminders.time || '09:00')} onPress={() => choose('Reminder time', TIMES.map((t) => [t, timeLabel(t)]), data.reminders.time, (v) => set('reminders', { time: v }))} /> } : null,
      data.reminders.on !== false ? { key: 'rep', words: 'repeats confirm pending', node: (f) => <Row first={f} label="Repeats to confirm" sub="Like “Did your salary arrive?”" right={<Toggle value={data.reminders.repeats !== false} onChange={(v) => set('reminders', { repeats: v })} label="Repeats to confirm" />} /> } : null,
      data.reminders.on !== false ? { key: 'owed', words: 'owed to me due', node: (f) => <Row first={f} label="Money owed to me" sub="On the day it's due" right={<Toggle value={data.reminders.owed !== false} onChange={(v) => set('reminders', { owed: v })} label="Money owed to me" />} /> } : null,
    ],
    data: [
      { key: 'export', words: 'export excel xlsx file', node: (f) => <Row first={f} left={<Icon name="download" size={18} color={th.muted} />} label="Export to Excel" onPress={() => nav.openSheet('export', {})} /> },
      { key: 'import', words: 'import excel xlsx cash book file', node: (f) => <Row first={f} left={<Icon name="upload" size={18} color={th.muted} />} label="Import from Excel" onPress={() => nav.push('import')} /> },
      { key: 'acc', words: 'accounts bank cash', node: (f) => <Row first={f} left={<Icon name="credit-card" size={18} color={th.muted} />} label="Accounts" onPress={() => nav.push('accounts')} /> },
      { key: 'cat', words: 'categories emoji', node: (f) => <Row first={f} left={<Icon name="tag" size={18} color={th.muted} />} label="Categories" onPress={() => nav.push('categories')} /> },
    ],
    looks: [
      { key: 'theme', words: 'dark mode light theme appearance', node: (f) => (
        <View style={{ paddingVertical: 12, borderTopWidth: f ? 0 : 1, borderTopColor: th.line, gap: 8 }}>
          <T>Theme</T>
          <Seg small items={[{ id: 'auto', label: 'Phone' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]} value={data.themeMode} onChange={(v) => update({ themeMode: v })} />
        </View>
      ) },
      { key: 'custom', words: 'customise customize colour color accent text size home cards swipe numbers', node: (f) => <Row first={f} label="Customise" sub="Home cards, colours, text size, swipes, numbers" onPress={() => nav.push('customise')} /> },
    ],
    about: [
      { key: 'ver', words: 'version about', node: (f) => <Row first={f} label="Version" value={VERSION} /> },
      { key: 'privacy', words: 'privacy policy', node: (f) => <Row first={f} label="Privacy policy" onPress={() => Linking.openURL(PRIVACY_URL).catch(() => app.showToast("Couldn't open the link"))} /> },
      { key: 'by', words: 'created designed by anisuzzaman tamal', node: (f) => <Row first={f} label="Created and designed by Anisuzzaman Tamal" /> },
    ],
  };
  const sections = [
    ['you', g ? 'Google account' : 'You'], ['security', 'Lock and privacy'], ['money', 'Money'], ['secondPlaces', `Show ${data.secondCurrency || 'it'} on`], ['reminders', 'Reminders'],
    ['data', 'Data'], ['looks', 'Look'], ['about', 'About'],
  ].filter(([k]) => !only || k === only);

  return (
    <Screen title="Settings">
      {!only ? <Field value={q} onChangeText={setQ} placeholder="Search settings" autoCorrect={false} /> : null}
      {sections.map(([k, title]) => <Section key={k} title={title} q={q} rows={rows[k]} />)}
      {only ? <Button label="All settings" kind="ghost" onPress={() => setOnly(null)} /> : null}
      {q && !sections.some(([k, title]) => rows[k].filter(Boolean).some((r) => `${title} ${r.words}`.toLowerCase().includes(q.trim().toLowerCase()))) ? (
        <T color={th.faint} center style={{ marginTop: 12 }}>No setting matches “{q}”</T>
      ) : null}
      <RestoreSheet visible={restoring} onClose={() => setRestoring(false)} />
    </Screen>
  );
}
