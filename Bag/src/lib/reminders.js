// Reminders: bills you owe (a set number of days before they're due), money
// owed to you on its due date, and "did it arrive?" for repeats that ask to
// be confirmed. Every alert has a fixed id (kind + record or repeat + date),
// so scheduling again replaces it instead of adding a second one, and only
// one scheduling run happens at a time. Paying a bill reschedules, which
// drops its reminder. Taps open the right screen; there are no buttons in
// the notification itself.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { addDays, fmtDate, parseYmd, relative, ymd } from './dates';
import { fmtMoney } from './money';
import { isOpen, liveRecords } from './ledger';
import { nextDates } from './repeats';

export const CHANNEL = 'bag-reminders';
const PREFIX = 'bag-';
let queue = Promise.resolve();

export async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Reminders', importance: Notifications.AndroidImportance.DEFAULT });
  } catch (e) {
    // older Android
  }
}

export async function askPermission() {
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted) return true;
    const res = await Notifications.requestPermissionsAsync();
    return !!res.granted;
  } catch (e) {
    return false;
  }
}

function at(dateYmd, time) {
  const d = parseYmd(dateYmd);
  const [h, m] = String(time || '09:00').split(':').map(Number);
  d.setHours(h || 9, m || 0, 0, 0);
  return d;
}

export function plan(data, now = new Date()) {
  const r = data.reminders || {};
  if (r.on === false) return [];
  const home = data.homeCurrency || 'NZD';
  const today = ymd(now);
  const out = [];
  const add = (id, date, title, body, payload) => {
    if (date.getTime() <= now.getTime() + 30000) return;
    out.push({ id: `${PREFIX}${id}`, date, title, body, payload });
  };
  const days = Number.isFinite(Number(r.billDays)) ? Number(r.billDays) : 2;
  liveRecords(data).forEach((rec) => {
    if (!isOpen(rec) || !rec.dueDate) return;
    const money = fmtMoney(rec.amount, rec.currency, home);
    if (rec.type === 'iowe') {
      let fire = days > 0 ? addDays(rec.dueDate, -days) : rec.dueDate;
      if (fire < today && rec.dueDate >= today) fire = today;
      add(`bill-${rec.id}`, at(fire, r.time), `${rec.name || 'A bill'} is due ${relative(rec.dueDate, fire)}`, `${money} · due ${fmtDate(rec.dueDate, { weekday: true, year: false })}`, { type: 'record', id: rec.id });
    } else if (r.owed !== false) {
      add(`owed-${rec.id}`, at(rec.dueDate, r.time), `${rec.who || 'Someone'} owes you ${money}`, `${rec.name || 'Owed to me'} · due today`, { type: 'record', id: rec.id });
    }
  });
  if (r.repeats !== false) {
    Object.values(data.repeats || {}).forEach((rep) => {
      if (!rep || rep.deleted || rep.paused || !rep.confirm) return;
      const t = rep.template || {};
      if (t.type !== 'expense' && t.type !== 'income' && t.type !== 'transfer') return;
      nextDates(rep, today, addDays(today, 30)).forEach((d) => {
        const money = fmtMoney(t.amount, t.currency, home);
        const title = t.type === 'income' ? `Did your ${t.name || 'money'} arrive?` : t.type === 'transfer' ? `Did you move ${money}?` : `Did you pay ${t.name || 'it'}?`;
        add(`rep-${rep.id}-${d}`, at(d, r.time), title, `${money} · tap to confirm`, { type: 'confirm', repeatId: rep.id, date: d });
      });
    });
  }
  return out.sort((a, b) => a.date - b.date).slice(0, 60);
}

async function run(data) {
  const all = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  await Promise.all(all.filter((n) => String(n.identifier || '').startsWith(PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})));
  const items = plan(data);
  if (!items.length) return;
  await ensureChannel();
  for (const it of items) {
    await Notifications.scheduleNotificationAsync({
      identifier: it.id,
      content: { title: it.title, body: it.body, data: it.payload },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: it.date, channelId: CHANNEL },
    }).catch(() => {});
  }
}

export function scheduleAll(data) {
  if (Platform.OS === 'web') return Promise.resolve();
  queue = queue.then(() => run(data)).catch(() => {});
  return queue;
}
