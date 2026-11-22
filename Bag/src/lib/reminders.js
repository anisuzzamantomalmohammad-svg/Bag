// Reminders: Upcoming cash out a set number of days before it's due, "Did
// you pay it?" (or "Did it arrive?") on the day, and money owed to you on its
// due date. Every alert has a fixed id (kind + record or repeat + date),
// so scheduling again replaces it instead of adding a second one, and only
// one scheduling run happens at a time. Paying a bill reschedules, which
// drops its reminder. Taps open the right screen; there are no buttons in
// the notification itself.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { addDays, fmtDate, parseYmd, relative, ymd } from './dates';
import { fmtMoney } from './money';
import { displayName, isOpen, isPending, liveRecords } from './ledger';
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
  const until = addDays(today, 30);
  // One Upcoming thing on its day: ahead of time for cash out, then the ask.
  const remind = (key, t, d, payload) => {
    const money = fmtMoney(t.amount, t.currency, home);
    const name = displayName(t, data) || 'it';
    if (t.type === 'expense' && days > 0) {
      const early = addDays(d, -days);
      if (early >= today) add(`due-${key}`, at(early, r.time), `${name} is due ${relative(d, early)}`, `${money} · ${fmtDate(d, { weekday: true, year: false })}`, payload);
    }
    if (r.repeats === false) return;
    const title = t.type === 'income' ? `Did ${name} arrive?` : t.type === 'transfer' ? `Did you move ${money}?` : `Did you pay ${name}?`;
    add(`ask-${key}`, at(d, r.time), title, `${money} · tap to say yes`, payload);
  };
  liveRecords(data).forEach((rec) => {
    if (isPending(rec)) {
      if (rec.date >= today && rec.date <= until) remind(rec.id, rec, rec.date, { type: 'pay', id: rec.id });
      return;
    }
    if (!isOpen(rec) || !rec.dueDate) return;
    const money = fmtMoney(rec.amount, rec.currency, home);
    if (rec.type === 'iowe') {
      let fire = days > 0 ? addDays(rec.dueDate, -days) : rec.dueDate;
      if (fire < today && rec.dueDate >= today) fire = today;
      add(`bill-${rec.id}`, at(fire, r.time), `You owe ${rec.who || 'someone'} ${money}`, `${rec.name || 'Borrowed'} · due ${fmtDate(rec.dueDate, { weekday: true, year: false })}`, { type: 'record', id: rec.id });
    } else if (r.owed !== false) {
      add(`owed-${rec.id}`, at(rec.dueDate, r.time), `${rec.who || 'Someone'} owes you ${money}`, `${rec.name || 'Lent'} · due today`, { type: 'record', id: rec.id });
    }
  });
  Object.values(data.repeats || {}).forEach((rep) => {
    if (!rep || rep.deleted || rep.paused) return;
    const t = rep.template || {};
    if (t.type !== 'expense' && t.type !== 'income' && t.type !== 'transfer') return;
    nextDates(rep, today, until).forEach((d) => {
      if ((data.records || {})[`rep_${rep.id}_${d}`]) return;
      remind(`rep-${rep.id}-${d}`, t, d, { type: 'confirm', repeatId: rep.id, date: d });
    });
  });
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
