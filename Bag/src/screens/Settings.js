// Settings on one page, searchable: Account, Money, Reminders, Look, Data.
// The rarely changed ones sit behind Advanced.
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { BACKUP_KEY, useApp, DEFAULTS } from '../state/store';
import { useNav } from '../nav';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Bubble, Button, Card, Field, Icon, Label, Row, Screen, Seg, Sheet, Squish, T, Toggle, useTheme, Press as Pressable } from '../ui/kit';
import { accountColor, accountEmoji, accountKind } from '../lib/look';
import { initials } from './Home';
import { currencyName } from '../data/currencies';
import { fmtDate, ordinal, ymd } from '../lib/dates';
import { canLock } from '../lib/lock';
import { askPermission, ensureChannel } from '../lib/reminders';
import { googleConfigured, listBackups, downloadBackup } from '../lib/google';
import { TYPE_LABEL, accountBalance, liveRecords, live } from '../lib/ledger';
import { ACCENTS } from '../data/defaults';
import { fmt, parseAmount } from '../lib/money';
import { DOW, defaultIn, groupOf, marginOf } from '../lib/plan';
import { LOOKS } from '../ui/looks';
import { NEW_IN } from './WhatsNew';
import { useCalmReason } from '../ui/live';

const VERSION = require('../../app.json').expo.version;
const SAMPLE = -1234.5;
const PRIVACY_URL = 'https://anisuzzamantomalmohammad-svg.github.io/Bag/Bag/docs/privacy.html';
const LOCK_AFTER = [[0, 'Straight away'], [60, 'After 1 minute'], [300, 'After 5 minutes'], [900, 'After 15 minutes']];
const NEXT_DAYS = [[3, '3 days'], [7, '7 days'], [14, '14 days'], [31, 'A month']];
const BILL_DAYS = [[0, 'On the day'], [1, '1 day before'], [2, '2 days before'], [3, '3 days before'], [7, 'A week before']];
const TIMES = ['07:00', '08:00', '09:00', '12:00', '17:00', '19:00', '21:00'];
const WEEK = [[1, 'Monday'], [0, 'Sunday'], [6, 'Saturday']];
const SHOW_AMT = { both: 'Both', original: 'Original only', home: 'NZD only' };
const WIDGET_UNDER = { by: 'Where the month ends', spend: 'To spend', perday: 'A day till payday', none: 'Nothing' };
const LOOK_MODE = { each: 'new each open', daily: 'new each day', keep: 'keep one' };
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
  return fmtDate(ymd(new Date(iso)));
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
    Alert.alert('Replace what is on this phone?', `Records, accounts, categories, budgets, goals and repeats go back to how they were on ${fmtDate(ymd(new Date(f.modifiedTime)))}. Settings on this phone stay.`, [
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
            <Row key={f.id} first={i === 0} label={fmtDate(ymd(new Date(f.modifiedTime)), { weekday: true })} sub={`${new Date(f.modifiedTime).toTimeString().slice(0, 5)} · ${Math.max(1, Math.round((Number(f.size) || 0) / 1024))} KB`} onPress={() => restore(f)} />
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
  const restoreBeforeUpdate = async () => {
    let b = null;
    try { b = JSON.parse(await AsyncStorage.getItem(BACKUP_KEY)); } catch (e) { b = null; }
    if (!b || !b.raw) { app.showToast('No copy from before an update on this phone'); return; }
    const go = () => { try { app.restoreData(JSON.parse(b.raw)); } catch (e) { app.showToast("Couldn't read that copy"); } };
    nav.openSheet('choice', {
      title: 'Go back to before the update?',
      text: `This puts back your records, accounts and categories as they were on ${new Date(b.at).toLocaleDateString()}, before version ${VERSION} opened. Anything added since is replaced.`,
      options: [{ id: 'go', label: 'Yes, put it back', emoji: '↺' }, { id: 'no', label: 'Cancel', emoji: '✕' }],
      onPick: (k) => { if (k === 'go') go(); },
    });
  };
  const [adv, setAdv] = useState(false);
  const cards = data.homeCards || [];
  const moveCard = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= cards.length) return;
    const next = cards.slice();
    [next[i], next[j]] = [next[j], next[i]];
    update({ homeCards: next });
  };
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

  const calm = useCalmReason();
  const margin = marginOf(data);
  const banks = live(data.accounts).filter((a) => groupOf(a) === 'bank');
  const marginBank = data.accounts[(data.margin || {}).accountId] || data.accounts[defaultIn(data, 'bank')];
  const pickedLooks = ((data.looks || {}).pick || ['bag']);
  const pd = data.paydays || {};
  const paydayText = pd.how === 'varies' ? 'It varies' : (pd.items || []).length
    ? (pd.how === 'monthly' ? `Monthly · ${(pd.items || []).map((x) => ordinal(x.dom)).join(', ')}` : `${pd.how === 'fortnightly' ? 'Fortnightly' : 'Weekly'} · ${(pd.items || []).map((x) => DOW[x.dow]).join(', ')}`)
    : 'Not set';
  const toggleMargin = (on) => {
    if (!on) { set('margin', { on: false }); return; }
    const bankId = (data.margin || {}).accountId || defaultIn(data, 'bank');
    const b = data.accounts[bankId];
    const amt = Number((data.margin || {}).amount) || 280;
    set('margin', { on: true, amount: amt, accountId: bankId });
    if (!b) return;
    // If they'd been hiding the margin by keeping the balance low, put it back
    // so the Bank pill shows what the bank app says.
    Alert.alert('Was it hidden before?', `If you've kept ${b.name} about ${app.money(amt, { decimals: 0 })} lower in Bag on purpose, Bag can add it back so ${b.name} matches your bank app. The margin now keeps it out of To spend instead.`, [
      { text: 'No, leave it', style: 'cancel' },
      { text: `Add ${app.money(amt, { decimals: 0 })} back`, onPress: () => { app.saveAccount({ ...b, opening: Math.round((Number(b.opening || 0) + amt) * 100) / 100 }); app.showToast(`${b.name} opening balance +${app.money(amt, { decimals: 0 })}`); } },
    ]);
  };

  const rows = {
    account: [
      g ? { key: 'g', words: 'google account email sync', node: (f) => <Row first={f} minHeight={64} left={<View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: th.accent, alignItems: 'center', justifyContent: 'center' }}><T size={14} weight="semi" color={th.accent}>{initials(g.name) || 'G'}</T></View>} label={g.name || 'Google account'} sub={g.email} /> } : null,
      g ? { key: 'sync', words: 'sync now phones drive', node: (f) => <Row first={f} label="Sync now" sub={app.syncing ? 'Syncing…' : `Last synced ${ago(data.lastSyncAt).toLowerCase()}`} onPress={() => app.syncNow({ manual: true })} /> } : null,
      g ? { key: 'backup', words: 'back up backup drive', node: (f) => <Row first={f} label="Back up now" sub={`Last backup ${ago(data.lastDriveBackupAt).toLowerCase()}. Bag also backs up on its own when something changes.`} onPress={() => app.backupNow({ manual: true })} /> } : null,
      g ? { key: 'restore', words: 'restore backup drive', node: (f) => <Row first={f} label="Restore a backup" onPress={() => setRestoring(true)} /> } : null,
      { key: 'beforeupdate', words: 'restore backup update undo before', node: (f) => <Row first={f} label="Go back to before the last update" sub="Bag saved a copy of everything the first time this version opened" onPress={restoreBeforeUpdate} /> },
      g ? { key: 'out', words: 'sign out google', node: (f) => <Row first={f} label={<T color={th.danger}>Sign out</T>} onPress={() => Alert.alert('Sign out of Google?', 'Your records stay on this phone. Syncing and Drive backups stop.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => app.signOutGoogle() }])} chevron={false} /> } : null,
      !g ? { key: 'in', words: 'google sign in account sync drive backup', node: (f) => <Row first={f} minHeight={64} left={<Icon name="cloud" size={20} color={th.accent} />} label="Sign in with Google" sub={configured ? 'Sync between phones and back up to your Google Drive. Optional.' : "Google sign-in isn't set up in this build yet"} onPress={configured ? () => app.signInGoogle() : undefined} /> } : null,
      !g ? { key: 'name', words: 'name you', node: (f) => <Row first={f} label="Your name" value={data.ownerName || 'Not set'} onPress={() => nav.openSheet('text', { title: 'Your name', value: data.ownerName, placeholder: 'Name', onPick: (v) => update({ ownerName: v }) })} /> } : null,
      { key: 'lock', words: 'lock fingerprint face pin security', node: (f) => <Row first={f} label="App lock" sub="Fingerprint, face or your phone's PIN" right={<Toggle value={!!data.lock.on} onChange={toggleLock} label="App lock" />} /> },
    ],
    defaults: [
      ...[['expense', 'Out from'], ['income', 'In into'], ['moveFrom', 'Move from'], ['moveTo', 'Move to'], ['saveFrom', 'Save button from'], ['saveTo', 'Save button into']].map(([k, label]) => ({
        key: `def-${k}`, words: `default account star ${label} out in move save`,
        node: (f) => {
          const id = (data.typeDefaults || {})[k];
          const a = id && data.accounts[id] && !data.accounts[id].deleted ? data.accounts[id] : null;
          const pool = k === 'saveTo' ? live(data.accounts).filter((x) => accountKind(x) === 'savings') : live(data.accounts);
          return <Row first={f} label={label} value={a ? `★ ${a.name}` : k === 'saveTo' ? 'The matching jar' : 'Last one used'} onPress={() => choose(label, [['none', k === 'saveTo' ? 'The matching jar' : 'Last one used'], ...pool.map((x) => [x.id, x.name])], id || 'none', (v) => set('typeDefaults', { [k]: v === 'none' ? null : v }))} />;
        },
      })),
      { key: 'deftip', words: 'default hold star', node: (f) => <T size={12} color={th.faint} style={{ paddingVertical: 10, borderTopWidth: f ? 0 : 1, borderTopColor: th.line }}>Or hold an account on the Add screen to make it the ★ default.</T> },
    ],
    money: [
      { key: 'travel', words: 'travel mode trip abroad currency bdt taka', node: (f) => <Row first={f} label="✈️ Travel mode" sub={data.travel && data.travel.on ? `New records start in ${data.travel.currency}` : 'New records start in another currency while you travel'} right={<Toggle value={!!(data.travel && data.travel.on)} onChange={(v) => set('travel', { on: v })} label="Travel mode" />} /> },
      data.travel && data.travel.on ? { key: 'travelCur', words: 'travel currency', node: (f) => <Row first={f} label="Travel currency" value={`${data.travel.currency} · ${currencyName(data.travel.currency)}`} onPress={() => nav.openSheet('currency', { title: 'Travel currency', value: data.travel.currency, onPick: (c) => c && set('travel', { currency: c }) })} /> } : null,
      { key: 'nextup', words: 'next up home days upcoming bills window', node: (f) => <Row first={f} label="Next up on Home" sub="The 3 soonest, each bill once" value={NEXT_DAYS.find((x) => x[0] === Number(data.nextUpDays || 7)) ? NEXT_DAYS.find((x) => x[0] === Number(data.nextUpDays || 7))[1] : `${data.nextUpDays} days`} onPress={() => choose('Next up looks ahead', [...NEXT_DAYS, ['other', 'Another number…']], NEXT_DAYS.some((x) => x[0] === Number(data.nextUpDays || 7)) ? Number(data.nextUpDays || 7) : 'other', (v) => {
        if (v !== 'other') { update({ nextUpDays: v }); return; }
        setTimeout(() => nav.openSheet('text', { title: 'Days ahead', number: true, value: String(data.nextUpDays || 7), placeholder: '10', onPick: (t) => { const n = Math.round(parseAmount(t)); if (n >= 1 && n <= 90) update({ nextUpDays: n }); } }), 250);
      })} /> },
      { key: 'home', words: 'home currency nzd', node: (f) => <Row first={f} label="Home currency" value={`${data.homeCurrency} · ${currencyName(data.homeCurrency)}`} onPress={changeHome} /> },
      { key: 'second', words: 'second currency bdt taka', node: (f) => <Row first={f} label="Second currency" sub="A small ≈ line in another currency" right={<Toggle value={!!data.secondOn} onChange={(v) => update({ secondOn: v, secondCurrency: data.secondCurrency && data.secondCurrency !== data.homeCurrency ? data.secondCurrency : data.homeCurrency === 'BDT' ? 'USD' : 'BDT' })} label="Second currency" />} /> },
      data.secondOn ? { key: 'secondCur', words: 'second currency bdt taka', node: (f) => <Row first={f} label="Currency" value={`${data.secondCurrency} · ${currencyName(data.secondCurrency)}`} onPress={() => nav.openSheet('currency', { title: 'Second currency', value: data.secondCurrency, onPick: (c) => c && update({ secondCurrency: c }) })} /> } : null,
      { key: 'paydays', words: 'payday pay salary wages income weekly fortnightly', node: (f) => <Row first={f} label="Paydays" value={paydayText} onPress={() => nav.push('paydays')} /> },
      { key: 'margin', words: 'safety margin aside buffer 280 shield', node: (f) => <Row first={f} label="🛡 Safety margin" sub={margin.on ? `${app.money(margin.amount, { decimals: 0 })} kept in ${marginBank ? marginBank.name : 'your bank'}. To spend leaves it out.` : 'Keep some money aside that To spend never counts'} right={<Toggle value={margin.on} onChange={toggleMargin} label="Safety margin" />} /> },
      margin.on ? { key: 'marginAmt', words: 'safety margin amount', node: (f) => <Row first={f} label="Margin amount" value={app.money(margin.amount, { decimals: 0 })} onPress={() => nav.openSheet('text', { title: 'Safety margin', number: true, value: String(margin.amount), placeholder: '280', onPick: (v) => { const n = parseAmount(v); if (n > 0) set('margin', { amount: n }); } })} /> } : null,
      banks.length > 1 ? { key: 'defbank', words: 'default bank star which bank', node: (f) => <Row first={f} label="Default bank" value={(data.accounts[defaultIn(data, 'bank')] || {}).name} onPress={() => nav.openSheet('which', { group: 'bank', title: 'Default bank', onPick: (id) => update({ defaultAccount: { ...(data.defaultAccount || {}), bank: id } }) })} /> } : null,
      { key: 'showamt', words: 'show amounts original currency both home nzd foreign', node: (f) => <Row first={f} label="Other currencies show" sub="Tap any amount on a record to flip it" value={SHOW_AMT[data.showAmounts] || SHOW_AMT.both} onPress={() => choose('Records in other currencies show', Object.entries(SHOW_AMT), data.showAmounts || 'both', (v) => update({ showAmounts: v }))} /> },
      { key: 'roll', words: 'budget rollover carry over left', node: (f) => <Row first={f} label="Roll over budgets" sub="Last month's leftover adds to this month" right={<Toggle value={!!data.budgetRollover} onChange={(v) => update({ budgetRollover: v })} label="Roll over budgets" />} /> },
    ],
    secondPlaces: data.secondOn ? SECOND_PLACES.map(([k, label, sub]) => ({
      key: `sp-${k}`, words: `second currency show ${label}`,
      node: (f) => <Row first={f} label={label} sub={sub} right={<Toggle value={!!(data.secondShow || {})[k]} onChange={(v) => set('secondShow', { [k]: v })} label={`Show second currency on ${label}`} />} />,
    })) : [],
    reminders: [
      { key: 'on', words: 'reminders notifications', node: (f) => <Row first={f} label="Reminders" right={<Toggle value={data.reminders.on !== false} onChange={toggleReminders} label="Reminders" />} /> },
      data.reminders.on !== false ? { key: 'low', words: 'low balance warning below zero overdrawn', node: (f) => <Row first={f} label="Low balance warning" sub={`${(data.lowWarn || {}).days || 3} days before your bank looks like going below 0`} right={<Toggle value={!data.lowWarn || data.lowWarn.on !== false} onChange={(v) => set('lowWarn', { on: v })} label="Low balance warning" />} /> } : null,
      data.reminders.on !== false ? { key: 'evening', words: 'evening 9pm log today nothing added reminder', node: (f) => <Row first={f} label="Log today?" sub="At 9pm, only on days you've added nothing" right={<Toggle value={!data.evening || data.evening.on !== false} onChange={(v) => set('evening', { on: v })} label="Log today reminder" />} /> } : null,
      data.reminders.on !== false ? { key: 'days', words: 'bill reminder days before due', node: (f) => <Row first={f} label="Bills, ahead of time" value={(BILL_DAYS.find((x) => x[0] === Number(data.reminders.billDays)) || BILL_DAYS[2])[1]} onPress={() => choose('Remind me about bills', BILL_DAYS, Number(data.reminders.billDays), (v) => set('reminders', { billDays: v }))} /> } : null,
      data.reminders.on !== false ? { key: 'time', words: 'reminder time morning', node: (f) => <Row first={f} label="At" value={timeLabel(data.reminders.time || '09:00')} onPress={() => choose('Reminder time', TIMES.map((t) => [t, timeLabel(t)]), data.reminders.time, (v) => set('reminders', { time: v }))} /> } : null,
      data.reminders.on !== false ? { key: 'rep', words: 'repeats confirm pending', node: (f) => <Row first={f} label="Did you pay it?" sub="On the day something Upcoming is due" right={<Toggle value={data.reminders.repeats !== false} onChange={(v) => set('reminders', { repeats: v })} label="Did you pay it?" />} /> } : null,
      data.reminders.on !== false ? { key: 'payday', words: 'payday how much came in', node: (f) => <Row first={f} label="Payday" sub="Asks how much came in on the day" right={<Toggle value={data.reminders.payday !== false} onChange={(v) => set('reminders', { payday: v })} label="Payday" />} /> } : null,
      data.reminders.on !== false ? { key: 'monthly', words: 'monthly check in first month summary', node: (f) => <Row first={f} label="Monthly check-in" sub="On the 1st: how last month went" right={<Toggle value={data.reminders.monthly !== false} onChange={(v) => set('reminders', { monthly: v })} label="Monthly check-in" />} /> } : null,
      data.reminders.on !== false ? { key: 'nudges', words: 'nudges tips budget', node: (f) => <Row first={f} label="Nudges" sub="A heads-up when a budget is running out. Once a week at most." right={<Toggle value={data.reminders.nudges !== false} onChange={(v) => set('reminders', { nudges: v })} label="Nudges" />} /> } : null,
      data.reminders.on !== false ? { key: 'owed', words: 'owed to me due', node: (f) => <Row first={f} label="Money I lent" sub="On the day it's due back" right={<Toggle value={data.reminders.owed !== false} onChange={(v) => set('reminders', { owed: v })} label="Money I lent" />} /> } : null,
    ],
    look: [
      { key: 'theme', words: 'dark mode light theme appearance', node: (f) => (
        <View style={{ paddingVertical: 12, borderTopWidth: f ? 0 : 1, borderTopColor: th.line, gap: 8 }}>
          <T>Theme</T>
          <Seg small items={[{ id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }, { id: 'auto', label: 'Phone' }]} value={data.themeMode} onChange={(v) => update({ themeMode: v })} />
        </View>
      ) },
      { key: 'looks', words: 'look background coins world country design culture', node: (f) => <Row first={f} label="Background" sub={data.backdrop === false ? 'Off' : `${pickedLooks.length} picked · ${LOOK_MODE[(data.looks || {}).mode] || LOOK_MODE.each}`} value={data.backdrop === false ? '' : (LOOKS.find((l) => l.id === data.lookNow) || LOOKS[0]).name} onPress={() => nav.openSheet('looks', {})} /> },
      { key: 'vibe', words: 'vibration haptic feedback buzz', node: (f) => <Row first={f} label="Vibration" sub="A small tap when you press things" right={<Toggle value={data.vibration !== false} onChange={(v) => update({ vibration: v })} label="Vibration" />} /> },
      { key: 'reduce', words: 'reduce motion calm animations battery', node: (f) => <Row first={f} label="Reduce motion" sub={calm === 'battery' ? 'Things are still now because battery saver is on' : calm === 'system' ? "Things are still now because the phone's Remove animations is on (Settings › Accessibility)" : 'Stops floating coins, folding cards and tilt. Battery saver does this too.'} right={<Toggle value={!!data.reduceMotion} onChange={(v) => update({ reduceMotion: v })} label="Reduce motion" />} /> },
      !data.reduceMotion ? { key: 'tilt', words: 'tilt 3d motion sensor lean', node: (f) => <Row first={f} label="Tilt" sub="Cards lean a little as you tilt the phone" right={<Toggle value={data.tilt !== false} onChange={(v) => update({ tilt: v })} label="Tilt" />} /> } : null,
      { key: 'wunder', words: 'widget home screen under number', node: (f) => <Row first={f} label="Widget: under the number" value={WIDGET_UNDER[(data.widget || {}).under || 'by']} onPress={() => choose('Under the widget number', Object.entries(WIDGET_UNDER), (data.widget || {}).under || 'by', (v) => set('widget', { under: v }))} /> },
      { key: 'wcoming', words: 'widget coming upcoming bills', node: (f) => <Row first={f} label="Widget: what's coming" sub="On a taller widget" right={<Toggle value={(data.widget || {}).coming !== false} onChange={(v) => set('widget', { coming: v })} label="Widget shows what's coming" />} /> },
      { key: 'whatsnew', words: 'whats new changes version', node: (f) => <Row first={f} label={`What's new in ${NEW_IN}`} onPress={() => nav.push('whatsnew')} /> },
      { key: 'cashcheck', words: 'cash check wallet sunday count', node: (f) => <Row first={f} label="Sunday wallet count" sub="Home asks you to count your wallet if you haven't that week" right={<Toggle value={data.cashCheck !== false} onChange={(v) => update({ cashCheck: v })} label="Sunday cash check" />} /> },
      { key: 'accent', words: 'accent colour color slate blue teal purple pink', node: (f) => (
        <View style={{ paddingVertical: 12, borderTopWidth: f ? 0 : 1, borderTopColor: th.line, gap: 10 }}>
          <T>Colour</T>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            {Object.entries(ACCENTS).map(([k, a]) => {
              const on = data.accent === k;
              return (
                <Pressable key={k} onPress={() => update({ accent: k })} accessibilityRole="button" accessibilityLabel={a.label} accessibilityState={{ selected: on }} style={{ width: 44, height: 44, borderRadius: 22, borderWidth: on ? 3 : 0, borderColor: th.ink, padding: 3 }}>
                  <View style={{ flex: 1, borderRadius: 20, backgroundColor: th.mode === 'dark' ? a.dark : a.light }} />
                </Pressable>
              );
            })}
          </View>
        </View>
      ) },
      { key: 'size', words: 'text size font large small', node: (f) => (
        <View style={{ paddingVertical: 12, borderTopWidth: f ? 0 : 1, borderTopColor: th.line, gap: 8 }}>
          <T>Text size</T>
          <Seg small items={[{ id: 0.9, label: 'Small' }, { id: 1, label: 'Normal' }, { id: 1.12, label: 'Large' }, { id: 1.25, label: 'Larger' }]} value={data.textSize} onChange={(v) => update({ textSize: v })} />
        </View>
      ) },
      ...cards.map((c, i) => ({
        key: `card-${c.id}`, words: `home cards show hide ${c.label}`,
        node: (f) => (
          <Row first={f} label={i === 0 ? `Home: ${c.label}` : c.label} right={
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Pressable onPress={() => moveCard(i, -1)} disabled={i === 0} accessibilityRole="button" accessibilityLabel={`Move ${c.label} up`} style={{ width: 36, height: 44, alignItems: 'center', justifyContent: 'center', opacity: i === 0 ? 0.25 : 1 }}>
                <Icon name="chevron-up" size={20} color={th.muted} />
              </Pressable>
              <Pressable onPress={() => moveCard(i, 1)} disabled={i === cards.length - 1} accessibilityRole="button" accessibilityLabel={`Move ${c.label} down`} style={{ width: 36, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 8, opacity: i === cards.length - 1 ? 0.25 : 1 }}>
                <Icon name="chevron-down" size={20} color={th.muted} />
              </Pressable>
              <Toggle value={!c.hidden} onChange={(v) => update({ homeCards: cards.map((x, k) => (k === i ? { ...x, hidden: !v } : x)) })} label={`Show ${c.label} on Home`} />
            </View>
          } />
        ),
      })),
    ],
    data: [
      { key: 'export', words: 'export excel xlsx file', node: (f) => <Row first={f} left={<Icon name="download" size={18} color={th.muted} />} label="Export to Excel" onPress={() => nav.openSheet('export', {})} /> },
      { key: 'import', words: 'import excel xlsx cash book file', node: (f) => <Row first={f} left={<Icon name="upload" size={18} color={th.muted} />} label="Import from Excel" onPress={() => nav.push('import')} /> },
      { key: 'acc', words: 'accounts bank cash', node: (f) => <Row first={f} left={<Icon name="credit-card" size={18} color={th.muted} />} label="Accounts" onPress={() => nav.push('accounts')} /> },
      { key: 'cat', words: 'categories emoji', node: (f) => <Row first={f} left={<Icon name="tag" size={18} color={th.muted} />} label="Categories" onPress={() => nav.push('categories')} /> },
    ],
    advanced: [
      data.lock.on ? { key: 'after', words: 'lock after time', node: (f) => <Row first={f} label="Lock" value={(LOCK_AFTER.find((x) => x[0] === Number(data.lock.after)) || LOCK_AFTER[1])[1]} onPress={() => choose('Lock', LOCK_AFTER, Number(data.lock.after), (v) => set('lock', { after: v }))} /> } : null,
      data.lock.on ? { key: 'wnum', words: 'widget numbers lock home screen', node: (f) => <Row first={f} label="Show numbers on the widget" sub="Off: the widget says Bag is locked" right={<Toggle value={!!data.lock.widgetNumbers} onChange={(v) => set('lock', { widgetNumbers: v })} label="Show numbers on the widget" />} /> } : null,
      { key: 'hide', words: 'hide recent apps screenshot privacy', node: (f) => <Row first={f} label="Hide in recent apps" sub="Also blocks screenshots" right={<Toggle value={!!data.lock.hideRecents} onChange={(v) => set('lock', { hideRecents: v })} label="Hide in recent apps" />} /> },
      { key: 'week', words: 'week starts monday sunday', node: (f) => <Row first={f} label="Week starts on" value={(WEEK.find((w) => w[0] === data.weekStart) || WEEK[0])[1]} onPress={() => choose('Week starts on', WEEK, data.weekStart, (v) => update({ weekStart: v }))} /> },
      { key: 'month', words: 'month starts payday budget', node: (f) => <Row first={f} label="Month starts on" sub="Set it to payday if you budget from pay to pay" value={`The ${ordinal(data.monthStartDay || 1)}`} onPress={() => choose('Month starts on', Array.from({ length: 28 }, (_, i) => [i + 1, `The ${ordinal(i + 1)}`]), data.monthStartDay || 1, (v) => update({ monthStartDay: v }))} /> },
      { key: 'rates', words: 'exchange rates refresh', node: (f) => <Row first={f} label="Update exchange rates" sub="Saved on the phone. Each record keeps the rate of its own day." onPress={async () => { await app.refreshRates(); app.showToast('Rates updated'); }} /> },
      { key: 'dec', words: 'decimals cents numbers', node: (f) => <Row first={f} label="Decimals" value={Number(data.numbers.decimals) === 0 ? `None · ${fmt(SAMPLE, { decimals: 0 })}` : `Two · ${fmt(SAMPLE)}`} onPress={() => choose('Decimals', [[2, `Two · ${fmt(SAMPLE)}`], [0, `None · ${fmt(SAMPLE, { decimals: 0 })}`]], Number(data.numbers.decimals), (v) => set('numbers', { decimals: v }))} /> },
      { key: 'neg', words: 'negative minus brackets numbers', node: (f) => <Row first={f} label="Negative amounts" value={fmt(SAMPLE, { negative: data.numbers.negative })} onPress={() => choose('Negative amounts', [['minus', fmt(SAMPLE, { negative: 'minus' })], ['brackets', fmt(SAMPLE, { negative: 'brackets' })]], data.numbers.negative, (v) => set('numbers', { negative: v }))} /> },
      { key: 'mcol', words: 'money colours green red blue orange', node: (f) => <Row first={f} label="Cash in and out colours" value={data.moneyColours === 'blueOrange' ? 'Blue and orange' : 'Green and red'} onPress={() => choose('Cash in and out colours', [['greenRed', 'Green and red'], ['blueOrange', 'Blue and orange']], data.moneyColours, (v) => update({ moneyColours: v }))} /> },
      { key: 'dtype', words: 'new records start as default type', node: (f) => <Row first={f} label="New records start as" value={TYPE_LABEL[data.defaults.type] || 'Cash out'} onPress={() => choose('New records start as', Object.entries(TYPE_LABEL), data.defaults.type, (v) => set('defaults', { type: v }))} /> },
      { key: 'dacc', words: 'default account new records', node: (f) => <Row first={f} label="Account for new records" value={data.defaults.account === 'last' ? 'Last one used' : (data.accounts[data.defaults.account] || {}).name || 'Last one used'} onPress={() => choose('Account for new records', [['last', 'Last one used'], ...live(data.accounts).map((a) => [a.id, a.name])], data.defaults.account, (v) => set('defaults', { account: v }))} /> },
      { key: 'fill', words: 'fill category from name suggestions', node: (f) => <Row first={f} label="Fill in the category" sub="When you pick a name you've used before" right={<Toggle value={data.defaults.fillCategory !== false} onChange={(v) => set('defaults', { fillCategory: v })} label="Fill in the category" />} /> },
      { key: 'reset', words: 'reset look colours defaults', node: (f) => <Row first={f} label={<T color={th.danger}>Reset look and defaults</T>} chevron={false} onPress={() => Alert.alert('Reset look and defaults?', 'Your records stay as they are.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Reset', onPress: () => update({ homeCards: DEFAULTS.homeCards, themeMode: DEFAULTS.themeMode, accent: DEFAULTS.accent, moneyColours: DEFAULTS.moneyColours, textSize: DEFAULTS.textSize, defaults: DEFAULTS.defaults, numbers: DEFAULTS.numbers }) }])} /> },
    ],
    about: [
      { key: 'ver', words: 'version about', node: (f) => <Row first={f} label="Version" value={VERSION} /> },
      { key: 'privacy', words: 'privacy policy', node: (f) => <Row first={f} label="Privacy policy" onPress={() => Linking.openURL(PRIVACY_URL).catch(() => app.showToast("Couldn't open the link"))} /> },
      { key: 'by', words: 'created designed by anisuzzaman tamal', node: (f) => <Row first={f} label="Created and designed by Anisuzzaman Tamal" /> },
    ],
  };
  const searching = !!q.trim();
  const sections = [
    ['account', 'Account'], ['defaults', 'Defaults'], ['money', 'Money'], ['secondPlaces', `Show ${data.secondCurrency || 'it'} on`], ['reminders', 'Reminders'],
    ['look', 'Look'], ['data', 'Data'], ...(adv || searching ? [['advanced', 'Advanced']] : []), ['about', 'About'],
  ].filter(([k]) => !only || k === only);

  return (
    <Screen title="Settings">
      {!only && !searching ? (
        <Squish onPress={() => nav.push('accounts')} accessibilityLabel="Accounts" style={{ borderRadius: 24, overflow: 'hidden', backgroundColor: th.card, padding: 16 }}>
          <Svg style={{ position: 'absolute', top: 0, left: 0 }} width="100%" height="100%" pointerEvents="none">
            <Defs><LinearGradient id="stg" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#7FB2F0" stopOpacity={0.18} /><Stop offset="1" stopColor="#B79CF0" stopOpacity={0.1} /></LinearGradient></Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#stg)" />
          </Svg>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T size={13} color={th.muted}>Accounts</T>
            <Icon name="chevron-right" size={18} color={th.faint} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            {live(data.accounts).sort((a, b) => (a.order || 0) - (b.order || 0)).slice(0, 4).map((a) => {
              const b = accountBalance(data, a, { flows: app.flows, homePerUnit: app.homePerUnit });
              return (
                <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: '45%' }}>
                  <Bubble emoji={accountEmoji(a)} color={accountColor(a)} size={34} />
                  <View><T size={13} color={th.muted}>{a.name}</T><T size={15} weight="semi" color={b.native < 0 ? th.out : th.ink}>{app.money(b.native, { currency: a.currency })}</T></View>
                </View>
              );
            })}
          </View>
        </Squish>
      ) : null}
      {!only ? <Field value={q} onChangeText={setQ} placeholder="Search settings" autoCorrect={false} /> : null}
      {sections.map(([k, title]) => (
        <React.Fragment key={k}>
          {k === (adv ? 'advanced' : 'about') && !only && !searching ? (
            <Card pad={0} style={{ paddingHorizontal: 16 }}>
              <Row first label="Advanced" sub="Lock timing, week and month start, number style, defaults" right={<Icon name={adv ? 'chevron-up' : 'chevron-down'} size={20} color={th.faint2} />} chevron={false} onPress={() => setAdv(!adv)} />
            </Card>
          ) : null}
          <Section title={title} q={q} rows={rows[k]} />
        </React.Fragment>
      ))}
      {only ? <Button label="All settings" kind="ghost" onPress={() => setOnly(null)} /> : null}
      {searching && !sections.some(([k, title]) => rows[k].filter(Boolean).some((r) => `${title} ${r.words}`.toLowerCase().includes(q.trim().toLowerCase()))) ? (
        <T color={th.faint} center style={{ marginTop: 12 }}>No setting matches “{q}”</T>
      ) : null}
      <RestoreSheet visible={restoring} onClose={() => setRestoring(false)} />
    </Screen>
  );
}
