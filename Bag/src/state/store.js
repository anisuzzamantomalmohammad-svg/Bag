// Bag's data and everything that changes it. One object, saved on the phone
// (AsyncStorage), the same way Deen keeps its data.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_CATEGORIES, HOME_CARDS, JARS } from '../data/defaults';
import { setFeel } from '../lib/feel';
import { lookById, pickLook } from '../ui/looks';
import { accountKind, catColor } from '../lib/look';
import { currencyDecimals } from '../data/currencies';
import { resolveTheme } from '../theme/palettes';
import { newId, repeatRecordId } from '../lib/ids';
import { addDays, daysBetween, today as todayYmd } from '../lib/dates';
import { fmt, fmtMoney, round2 } from '../lib/money';
import { allFlows, defaultKind, leftOf, unpayAutoCounted, upgradeRecords } from '../lib/ledger';
import { materialise } from '../lib/repeats';
import { ensureRates, latestRate, loadRates, savedRate } from '../lib/rates';
import { mergeSync, purgeTombstones, stampChanges, syncPayload, COLLECTIONS, WHOLE_FIELDS } from '../lib/sync';
import { scheduleAll } from '../lib/reminders';
import * as G from '../lib/google';
import { setHidden, unlock as unlockAuth } from '../lib/lock';
import { PERSIST_KEY } from '../lib/background';
import { refreshWidget } from '../widget/update';
import { dropPhoto, keepPhoto } from '../lib/photos';

export const BACKUP_KEY = '@bag:before-update';
const APP_VERSION = require('../../app.json').expo.version;

const now = () => Date.now();

export const DEFAULTS = {
  onboarded: false,
  // synced
  homeCurrency: 'NZD',
  secondCurrency: 'BDT',
  weekStart: 1,
  monthStartDay: 1,
  budgetRollover: false,
  records: {},
  accounts: {},
  categories: {},
  budgets: {},
  goals: {},
  repeats: {},
  // this phone only
  themeMode: 'auto', // auto | light | dark
  accent: 'slate',
  moneyColours: 'greenRed', // greenRed | blueOrange
  textSize: 1,
  lock: { on: false, after: 60, hideRecents: false, widgetNumbers: false },
  // Second currency: off until switched on, then shown only where picked.
  secondOn: false,
  secondShow: { home: true, tiles: false, accounts: true, record: false, reports: false, widget: true },
  homePeriod: 'month', // week | month | total
  addMore: false, // Add screen: were the extra options open last time
  photos: {}, // record id -> [file uri], kept on this phone only
  reminders: { on: true, billDays: 2, time: '09:00', repeats: true, owed: true, payday: true, monthly: true, nudges: true },
  homeCards: HOME_CARDS,
  defaults: { type: 'expense', account: 'last', fillCategory: true },
  numbers: { decimals: 2, negative: 'minus' },
  swipe: { left: 'delete', right: 'edit' },
  reportsView: 'monthly',
  google: null,
  lastSyncAt: null,
  syncStamps: {},
  dirtyAt: 0,
  lastDriveBackupAt: null,
  lastAccountId: null,
  askLater: {}, // record id -> the day you said "Not yet" on Home
  upgraded12: false, // 1.2 has checked for things 1.0.1 counted by itself
  // 2.2, synced
  margin: { on: false, amount: 280, accountId: null }, // money kept aside, never spendable
  paydays: { how: 'weekly', items: [], anchor: null },
  paydayDone: {}, // payday key -> record id, or 'skip'
  pins: [], // [{ type: 'cat' | 'person', id }] under the pills on Home
  defaultAccount: {}, // group -> account id, e.g. { bank: 'a1' }
  showAmounts: 'both', // other currencies: both | orig | home
  // 2.2, this phone only
  vibration: true,
  reduceMotion: false,
  tilt: true,
  looks: { pick: ['bag'], mode: 'each' }, // background looks, and how often they change
  lookNow: 'bag',
  lookDay: null,
  paydayLater: {}, // payday key -> the day you said "Not paid yet"
  checkedOn: {}, // account id -> last day you counted or checked it
  widget: { under: 'by', coming: true }, // what the home screen widget shows
  seenNew: null, // the version whose What's new you've seen
  nudgedWeek: null,
  // 2.3
  typeDefaults: {}, // { expense, income, moveFrom, moveTo, saveFrom, saveTo } -> account id (★)
  travel: { on: false, currency: 'BDT' }, // new records start in this currency
  nextUpDays: 7, // Home › Next up looks this many days ahead
  lowWarn: { on: true, days: 3 }, // tell me before a balance goes below 0
  evening: { on: true, time: '21:00' }, // "log today?" on days with nothing added
};

function initialData() {
  const t = now();
  return { ...DEFAULTS, categories: Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.id, { ...c, createdAt: t, updatedAt: t }])) };
}

// Saved data plus any settings added in later versions.
function withDefaults(saved) {
  const cards = Array.isArray(saved.homeCards) ? saved.homeCards : HOME_CARDS;
  const known = new Set(cards.map((c) => c.id));
  return {
    ...DEFAULTS,
    ...saved,
    lock: { ...DEFAULTS.lock, ...(saved.lock || {}) },
    reminders: { ...DEFAULTS.reminders, ...(saved.reminders || {}) },
    defaults: { ...DEFAULTS.defaults, ...(saved.defaults || {}) },
    numbers: { ...DEFAULTS.numbers, ...(saved.numbers || {}) },
    swipe: { ...DEFAULTS.swipe, ...(saved.swipe || {}) },
    secondShow: { ...DEFAULTS.secondShow, ...(saved.secondShow || {}) },
    photos: saved.photos || {},
    homeCards: [...cards, ...HOME_CARDS.filter((c) => !known.has(c.id))].map((c) => ({ ...c, label: (HOME_CARDS.find((h) => h.id === c.id) || c).label })),
    askLater: saved.askLater || {},
    margin: { ...DEFAULTS.margin, ...(saved.margin || {}) },
    paydays: { ...DEFAULTS.paydays, ...(saved.paydays || {}) },
    looks: { ...DEFAULTS.looks, ...(saved.looks || {}) },
  };
}

// 1.2: the new categories (each with a colour), Bills and other renamed to
// Bills, and every account marked Bank, Cash, Savings or Card.
function upgradeLook(d) {
  const t = now();
  const categories = {};
  const accounts = {};
  const have = d.categories || {};
  DEFAULT_CATEGORIES.forEach((c) => {
    const cur = have[c.id];
    if (!cur) categories[c.id] = { ...c, createdAt: t, updatedAt: t };
    else if (!cur.deleted) {
      const patch = {};
      if (!cur.color) patch.color = c.color;
      if (c.id === 'bills' && cur.name === 'Bills and other') patch.name = 'Bills';
      if (c.id === 'clothing' && cur.name === 'Clothing and accessories') patch.name = 'Clothing';
      if (c.id === 'untracked-in' && cur.name === 'Untracked') patch.name = 'Untracked (in)';
      if (Object.keys(patch).length) categories[c.id] = { ...cur, ...patch, updatedAt: t };
    }
  });
  Object.values(have).forEach((c) => { if (c && !c.deleted && !c.color && !categories[c.id]) categories[c.id] = { ...c, color: catColor(c), updatedAt: t }; });
  Object.values(d.accounts || {}).forEach((a) => { if (a && !a.deleted && !a.kind) accounts[a.id] = { ...a, kind: accountKind(a), updatedAt: t }; });
  // 2.2: the two savings jars, once you have any account at all.
  const hasAny = Object.values(d.accounts || {}).some((a) => a && !a.deleted);
  if (hasAny) {
    JARS.forEach((j, i) => {
      if ((d.accounts || {})[j.id]) return;
      accounts[j.id] = { ...j, currency: d.homeCurrency || 'NZD', opening: 0, openingRate: 1, order: 90 + i, createdAt: t, updatedAt: t };
    });
  }
  return Object.keys(categories).length || Object.keys(accounts).length ? { categories, accounts } : null;
}

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

const tomb = (id) => ({ id, deleted: true, updatedAt: now() });

export function AppProvider({ children }) {
  const [data, setData] = useState(null);
  const [toast, setToast] = useState(null);
  const [locked, setLocked] = useState(false);
  const [ratesVersion, setRatesVersion] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(null);
  const scheme = useColorScheme();
  const dataRef = useRef(null);
  dataRef.current = data;

  const update = useCallback((patch) => {
    setData((d) => ({ ...d, ...(typeof patch === 'function' ? patch(d) : patch) }));
  }, []);

  /* ------------------------------ Load and save ------------------------------ */
  useEffect(() => {
    (async () => {
      let d;
      try {
        const raw = await AsyncStorage.getItem(PERSIST_KEY);
        d = raw ? withDefaults(JSON.parse(raw)) : initialData();
        // First open after an update: keep a copy of everything as it was,
        // before any upgrade step touches it. Settings can bring it back.
        if (raw && d.appVersion !== APP_VERSION) {
          await AsyncStorage.setItem(BACKUP_KEY, JSON.stringify({ at: now(), from: d.appVersion || 'older', raw })).catch(() => {});
          d = { ...d, appVersion: APP_VERSION };
        } else if (!raw) d = { ...d, appVersion: APP_VERSION };
      } catch (e) {
        d = initialData();
      }
      d = purgeTombstones(d);
      // Background look for this open (Settings › Look).
      const lk = pickLook(d.looks, d.lookNow, d.lookDay, todayYmd());
      const lookChanged = lk.id !== d.lookNow && (d.looks && d.looks.pick || []).length > 1;
      d = { ...d, lookNow: lk.id, lookDay: lk.day };
      if (lookChanged) setTimeout(() => setToast({ message: `Today's look: ${lookById(lk.id).name}`, key: now() }), 1600);
      const m = materialise(d);
      if (m) d = { ...d, records: { ...d.records, ...m.records }, repeats: { ...d.repeats, ...m.repeats } };
      setLocked(!!(d.onboarded && d.lock && d.lock.on));
      setData(d);
      await loadRates();
      setRatesVersion((v) => v + 1);
    })();
  }, []);

  useEffect(() => {
    if (!data) return undefined;
    const h = setTimeout(() => {
      AsyncStorage.setItem(PERSIST_KEY, JSON.stringify(data)).then(() => refreshWidget()).catch(() => {});
    }, 300);
    return () => clearTimeout(h);
  }, [data]);

  // Stamp what changed so the other phone can merge it.
  const prevRef = useRef(null);
  useEffect(() => {
    if (!data) return;
    const prev = prevRef.current;
    prevRef.current = data;
    if (!prev) return;
    const st = stampChanges(prev, data, data.syncStamps || {});
    if (st) setData((d) => ({ ...d, syncStamps: st, dirtyAt: now() }));
  }, [data]);

  /* ------------------------------ Repeats ------------------------------ */
  // Brings older records up to date, then makes what repeats are due.
  const runRepeats = useCallback(() => {
    setData((d) => {
      if (!d) return d;
      let d2 = d;
      const look = upgradeLook(d2);
      if (look) d2 = { ...d2, categories: { ...d2.categories, ...look.categories }, accounts: { ...d2.accounts, ...look.accounts } };
      const up = upgradeRecords(d2);
      if (up) d2 = { ...d2, records: { ...d2.records, ...up.records }, repeats: { ...d2.repeats, ...up.repeats } };
      if (!d2.upgraded12) {
        const back = d2.onboarded ? unpayAutoCounted(d2) : null;
        d2 = { ...d2, upgraded12: true, records: back ? { ...d2.records, ...back } : d2.records };
      }
      const m = materialise(d2);
      return m ? { ...d2, records: { ...d2.records, ...m.records }, repeats: { ...d2.repeats, ...m.repeats } } : d2;
    });
  }, []);
  const runRepeatsRef = useRef(null);
  runRepeatsRef.current = runRepeats;
  const hydrated = !!data;
  useEffect(() => { if (hydrated) setTimeout(runRepeats, 0); }, [hydrated]);

  /* ------------------------------ Rates ------------------------------ */
  const home = data ? data.homeCurrency : 'NZD';
  const refreshRates = useCallback(async () => {
    const d = dataRef.current;
    if (!d) return;
    const curs = [d.secondOn ? d.secondCurrency : null, ...Object.values(d.accounts || {}).filter((a) => a && !a.deleted).map((a) => a.currency),
      ...Object.values(d.records || {}).filter((r) => r && !r.deleted && r.rate === null).map((r) => r.currency)].filter(Boolean);
    if (!curs.some((c) => c !== d.homeCurrency)) return;
    await ensureRates(todayYmd(), d.homeCurrency, curs).catch(() => {});
    setRatesVersion((v) => v + 1);
    // Records saved while offline get their rate now.
    const waitingRate = Object.values(dataRef.current.records || {}).filter((r) => r && !r.deleted && r.rate === null).map((r) => r.id);
    if (waitingRate.length && fillRateRef.current) fillRateRef.current(waitingRate);
  }, []);
  const fillRateRef = useRef(null);
  useEffect(() => { if (data && data.onboarded) refreshRates(); }, [data && data.onboarded, data && data.homeCurrency, data && data.secondCurrency, data && data.secondOn]);

  const homePerUnit = useCallback((cur) => (!cur || cur === home ? 1 : latestRate(cur, home)), [home, ratesVersion]);

  // Fill in the day's rate for records in another currency, in the background.
  const fillRate = useCallback(async (ids) => {
    const d = dataRef.current;
    const recs = ids.map((id) => d.records[id]).filter((r) => r && !r.deleted && r.currency && r.currency !== d.homeCurrency && !r.rateManual);
    for (const r of recs) {
      const res = await ensureRates(r.date, d.homeCurrency, [r.currency]).catch(() => null);
      const rate = res && res.rates[r.currency];
      setData((cur) => {
        const x = cur.records[r.id];
        if (!x || x.deleted || x.rateManual) return cur;
        return { ...cur, records: { ...cur.records, [r.id]: { ...x, rate: rate || x.rate || null, rateCheck: !res || res.missing.includes(r.currency), updatedAt: now() } } };
      });
    }
    setRatesVersion((v) => v + 1);
  }, []);
  fillRateRef.current = fillRate;

  /* ------------------------------ Toast ------------------------------ */
  const showToast = useCallback((message, action) => setToast({ message, action, key: now() }), []);

  /* ------------------------------ Records ------------------------------ */
  // draft: record fields. opts.repeat: a rule to start a repeat from this record.
  // opts.split: { who, share } to turn part of an expense into Owed to me.
  const saveRecord = useCallback((draft, opts = {}) => {
    const d = dataRef.current;
    const t = now();
    const editing = draft.id && d.records[draft.id] && !d.records[draft.id].deleted;
    const old = editing ? d.records[draft.id] : null;
    let repeatId = draft.repeatId || (old && old.repeatId) || null;
    if (opts.repeat && !repeatId) repeatId = newId('p');
    const id = editing ? draft.id : opts.repeat ? repeatRecordId(repeatId, draft.date) : newId('r');
    const currency = draft.currency || d.homeCurrency;
    const foreign = currency !== d.homeCurrency;
    const rate = !foreign ? 1 : draft.rateManual ? Number(draft.rate) : savedRate(draft.date, currency, d.homeCurrency) || Number(draft.rate) || null;
    const type = draft.type || 'expense';
    const statusDefault = { expense: 'paid', income: 'received', transfer: 'paid', iowe: 'open', owed: 'open' }[type];
    const isMoney = type === 'expense' || type === 'income' || type === 'transfer';
    let status = old && (old.type === type || (isMoney && ['expense', 'income', 'transfer'].includes(old.type))) ? old.status : statusDefault;
    // Upcoming: a later date, or "not paid yet" ticked. It counts for nothing
    // until it's marked paid. Paid ones keep their status when edited.
    if (isMoney) {
      const was = old && (old.status === 'pending' || old.status === 'scheduled');
      if (draft.upcoming === true || draft.date > todayYmd() || (was && draft.upcoming !== false)) status = 'pending';
      else if (status !== 'skipped') status = statusDefault;
    }
    const fields = { ...draft };
    delete fields.upcoming;
    const rec = {
      ...(old || {}),
      ...fields,
      id,
      type,
      kind: type === 'iowe' || type === 'owed' ? draft.kind || defaultKind(type) : null,
      amount: round2(Math.abs(Number(draft.amount) || 0)),
      name: String(draft.name || '').trim() || (type === 'transfer' ? '' : ((d.categories[draft.categoryId] || {}).name) || ''),
      currency,
      rate,
      rateCheck: foreign && !draft.rateManual && !savedRate(draft.date, currency, d.homeCurrency),
      status,
      repeatId,
      createdAt: old ? old.createdAt : t,
      updatedAt: t,
    };
    if (type !== 'transfer') { rec.toAccountId = null; rec.toAmount = null; rec.toCurrency = null; }
    if (type === 'transfer') rec.categoryId = null;
    const records = { [id]: rec };
    if (opts.split && type === 'expense' && Number(opts.split.share) > 0) {
      const share = round2(Number(opts.split.share));
      rec.amount = round2(rec.amount - share);
      rec.splitWith = opts.split.who;
      const oid = newId('r');
      records[oid] = {
        id: oid, type: 'owed', kind: 'lent', name: `${rec.name || 'Split'} split`, description: '', categoryId: rec.categoryId,
        amount: share, currency, rate, date: rec.date, accountId: rec.accountId, who: opts.split.who, dueDate: opts.split.dueDate || null,
        status: 'open', splitOf: id, createdAt: t, updatedAt: t,
      };
    }
    let repeats = d.repeats;
    if (opts.repeat) {
      const prev = d.repeats[repeatId];
      const template = {
        type, kind: rec.kind, name: rec.name, description: rec.description || '', categoryId: rec.categoryId, amount: rec.amount, currency, rate,
        accountId: rec.accountId, toAccountId: rec.toAccountId || null, toAmount: rec.toAmount || null, toCurrency: rec.toCurrency || null, who: rec.who || '',
      };
      repeats = {
        ...d.repeats,
        [repeatId]: {
          amountMode: 'same', confirm: type === 'expense' || type === 'income', end: { type: 'never' },
          ...(prev || {}), ...opts.repeat, id: repeatId, template, start: (prev && prev.start) || rec.date,
          lastMade: prev && prev.lastMade && prev.lastMade > rec.date ? prev.lastMade : rec.date, createdAt: (prev && prev.createdAt) || t, updatedAt: t, deleted: false,
        },
      };
      if (type === 'iowe' || type === 'owed') rec.dueDate = rec.dueDate || rec.date;
    } else if (opts.repeat === null && repeatId && d.repeats[repeatId]) {
      // "Never": stop the repeat from here on
      repeats = { ...d.repeats, [repeatId]: { ...d.repeats[repeatId], deleted: true, updatedAt: t } };
    }
    setData((cur) => ({
      ...cur,
      records: { ...cur.records, ...records },
      repeats,
      lastAccountId: rec.accountId || cur.lastAccountId,
    }));
    if (foreign && !draft.rateManual) setTimeout(() => fillRate(Object.keys(records)), 50);
    if (opts.repeat) setTimeout(runRepeats, 80);
    return id;
  }, [fillRate, runRepeats]);

  const restore = useCallback((prevRecords) => {
    setData((cur) => ({ ...cur, records: { ...cur.records, ...Object.fromEntries(Object.entries(prevRecords).map(([k, v]) => [k, { ...v, updatedAt: now() }])) } }));
  }, []);

  // Change several records at once (account, category, date), with Undo.
  // A transfer keeps its own accounts; a category only goes on records of
  // the same kind (spending categories on spending, income on income).
  const patchRecords = useCallback((ids, patch, message) => {
    const d = dataRef.current;
    const prev = {};
    const next = {};
    ids.forEach((id) => {
      const r = d.records[id];
      if (!r || r.deleted) return;
      const p = { ...patch };
      if (r.type === 'transfer') { delete p.accountId; delete p.categoryId; }
      if (p.categoryId) {
        const c = d.categories[p.categoryId];
        const want = r.type === 'income' ? 'income' : 'expense';
        if (!c || (c.kind || 'expense') !== want) delete p.categoryId;
      }
      if (!Object.keys(p).length) return;
      prev[id] = r;
      next[id] = { ...r, ...p, updatedAt: now() };
    });
    const n = Object.keys(next).length;
    if (!n) { showToast('Nothing to change there'); return 0; }
    setData((cur) => ({ ...cur, records: { ...cur.records, ...next } }));
    showToast(message ? message(n) : `${n} changed`, { label: 'Undo', onPress: () => restore(prev) });
    return n;
  }, [showToast, restore]);

  const deleteRecords = useCallback((ids) => {
    const d = dataRef.current;
    const prev = {};
    ids.forEach((id) => { if (d.records[id] && !d.records[id].deleted) prev[id] = d.records[id]; });
    const n = Object.keys(prev).length;
    if (!n) return;
    setData((cur) => ({ ...cur, records: { ...cur.records, ...Object.fromEntries(Object.keys(prev).map((x) => [x, tomb(x)])) } }));
    showToast(`${n} deleted`, { label: 'Undo', onPress: () => restore(prev) });
  }, [showToast, restore]);

  const deleteRecord = useCallback((id, { silent, extra } = {}) => {
    const d = dataRef.current;
    const prev = d.records[id];
    if (!prev) return;
    const pics = (d.photos || {})[id] || [];
    const also = (extra || []).filter((x) => d.records[x] && !d.records[x].deleted);
    const prevAll = { [id]: prev, ...Object.fromEntries(also.map((x) => [x, d.records[x]])) };
    setData((cur) => {
      const photos = { ...cur.photos };
      delete photos[id];
      return { ...cur, photos, records: { ...cur.records, [id]: tomb(id), ...Object.fromEntries(also.map((x) => [x, tomb(x)])) } };
    });
    // The photo files are removed once Undo is no longer on offer.
    let undone = false;
    if (pics.length) setTimeout(() => { if (!undone) pics.forEach(dropPhoto); }, 8000);
    if (!silent) {
      showToast(also.length ? 'Both deleted' : 'Record deleted', { label: 'Undo', onPress: () => {
        undone = true;
        restore(prevAll);
        if (pics.length) setData((cur) => ({ ...cur, photos: { ...cur.photos, [id]: pics } }));
      } });
    }
  }, [showToast, restore]);

  const settleRecord = useCallback((id, { date, accountId } = {}) => {
    const d = dataRef.current;
    const prev = d.records[id];
    if (!prev) return;
    const next = { ...prev, status: 'settled', settledDate: date || todayYmd(), settledAccountId: accountId || prev.accountId, updatedAt: now() };
    setData((cur) => ({ ...cur, records: { ...cur.records, [id]: next } }));
    showToast(prev.type === 'iowe' ? 'Marked paid back' : 'Marked got it back', { label: 'Undo', onPress: () => restore({ [id]: prev }) });
  }, [showToast, restore]);

  // Pay some of a debt back, from one account or several (split). Each part
  // is { date, accountId, amount, currency }. Done in full = settled.
  const payDebt = useCallback((id, parts) => {
    const d = dataRef.current;
    const prev = d.records[id];
    if (!prev || prev.deleted) return;
    const home = d.homeCurrency;
    const debtRate = prev.currency === home ? 1 : Number(prev.rate) || savedRate(todayYmd(), prev.currency, home) || latestRate(prev.currency, home) || 1;
    const add = parts.filter((p) => Number(p.amount) > 0).map((p) => {
      const cur = p.currency || prev.currency;
      const rate = cur === home ? 1 : savedRate(p.date, cur, home) || latestRate(cur, home) || null;
      const debtAmount = cur === prev.currency ? Number(p.amount) : round2((Number(p.amount) * (rate || 0)) / debtRate);
      return { id: newId('y'), date: p.date, accountId: p.accountId || null, amount: round2(Number(p.amount)), currency: cur, rate, debtAmount: round2(debtAmount) };
    });
    if (!add.length) return;
    let next = { ...prev, payments: [...(prev.payments || []), ...add], updatedAt: now() };
    const done = leftOf(next) <= 0.004;
    if (done) {
      const last = add[add.length - 1];
      next = { ...next, status: 'settled', settledDate: add.reduce((m, p) => (p.date > m ? p.date : m), last.date), settledAccountId: last.accountId };
    }
    setData((cur) => ({ ...cur, records: { ...cur.records, [id]: next } }));
    showToast(done ? (prev.type === 'iowe' ? 'All paid back 🎉' : 'All back 🎉') : `Paid. ${fmt(leftOf(next))} ${prev.currency} left`, { label: 'Undo', onPress: () => restore({ [id]: prev }) });
  }, [showToast, restore]);

  const removePayment = useCallback((id, pid) => {
    const d = dataRef.current;
    const prev = d.records[id];
    if (!prev) return;
    const next = { ...prev, payments: (prev.payments || []).filter((p) => p.id !== pid), updatedAt: now() };
    if (next.status === 'settled' && leftOf({ ...next, status: 'open' }) > 0.004) { next.status = 'open'; next.settledDate = null; next.settledAccountId = null; }
    setData((cur) => ({ ...cur, records: { ...cur.records, [id]: next } }));
    showToast('Payment removed', { label: 'Undo', onPress: () => restore({ [id]: prev }) });
  }, [showToast, restore]);

  const reopenRecord = useCallback((id) => {
    setData((cur) => {
      const r = cur.records[id];
      if (!r) return cur;
      return { ...cur, records: { ...cur.records, [id]: { ...r, status: 'open', settledDate: null, settledAccountId: null, updatedAt: now() } } };
    });
  }, []);

  // Upcoming -> paid. Counts from its own date, or from today when that's
  // still to come.
  const confirmPending = useCallback((id, { amount, accountId, date } = {}) => {
    const d = dataRef.current;
    const prev = d.records[id];
    if (!prev) return;
    const t = todayYmd();
    const status = prev.type === 'income' ? 'received' : 'paid';
    const next = {
      ...prev, status, date: date || (prev.date > t ? t : prev.date), amount: amount !== undefined && Number(amount) > 0 ? round2(Number(amount)) : prev.amount,
      accountId: accountId || prev.accountId, confirmedAt: now(), updatedAt: now(),
    };
    setData((cur) => {
      const askLater = { ...(cur.askLater || {}) };
      delete askLater[id];
      return { ...cur, askLater, records: { ...cur.records, [id]: next } };
    });
    showToast(prev.type === 'income' ? 'Marked received' : prev.type === 'transfer' ? 'Marked moved' : 'Marked paid', { label: 'Undo', onPress: () => restore({ [id]: prev }) });
  }, [showToast, restore]);
  const markPaid = confirmPending;

  // Paid by mistake: back to Upcoming, out of the balance.
  const unpay = useCallback((id) => {
    const d = dataRef.current;
    const prev = d.records[id];
    if (!prev) return;
    setData((cur) => ({ ...cur, records: { ...cur.records, [id]: { ...prev, status: 'pending', confirmedAt: null, updatedAt: now() } } }));
    showToast('Back in Upcoming. Not counted.', { label: 'Undo', onPress: () => restore({ [id]: prev }) });
  }, [showToast, restore]);

  // "Not yet" on Home: ask again tomorrow.
  const askLater = useCallback((id) => {
    setData((cur) => ({ ...cur, askLater: { ...(cur.askLater || {}), [id]: todayYmd() } }));
  }, []);

  const skipPending = useCallback((id) => {
    const d = dataRef.current;
    const prev = d.records[id];
    if (!prev) return;
    setData((cur) => ({ ...cur, records: { ...cur.records, [id]: { ...prev, status: 'skipped', updatedAt: now() } } }));
    showToast('Skipped this time', { label: 'Undo', onPress: () => restore({ [id]: prev }) });
  }, [showToast, restore]);

  // Next up: a repeat's coming date, paid early (today) or skipped. The
  // record takes that date's id, so the repeat won't make it again.
  const answerRepeat = useCallback((repId, date, paid) => {
    const d = dataRef.current;
    const rep = d.repeats[repId];
    if (!rep) return;
    const id = repeatRecordId(repId, date);
    if (d.records[id]) { if (paid) confirmPending(id, { date: todayYmd() }); else skipPending(id); return; }
    const t = rep.template || {};
    const stamp = now();
    const rec = { ...t, id, amount: t.amount, date: paid ? todayYmd() : date, repeatId: repId, status: paid ? (t.type === 'income' ? 'received' : 'paid') : 'skipped', createdAt: stamp, updatedAt: stamp };
    setData((cur) => ({ ...cur, records: { ...cur.records, [id]: rec } }));
    showToast(paid ? `${t.name || 'Paid'}: marked paid` : 'Skipped this time', { label: 'Undo', onPress: () => setData((cur) => ({ ...cur, records: { ...cur.records, [id]: { ...rec, date, status: 'pending', updatedAt: now() } } })) });
  }, [showToast, confirmPending, skipPending]);

  const duplicateRecord = useCallback((id) => {
    const d = dataRef.current;
    const r = d.records[id];
    if (!r) return null;
    const nid = newId('r');
    const t = now();
    const status = { expense: 'paid', income: 'received', transfer: 'paid', iowe: 'open', owed: 'open' }[r.type];
    setData((cur) => ({ ...cur, records: { ...cur.records, [nid]: { ...r, id: nid, date: todayYmd(), dueDate: r.dueDate ? addDays(todayYmd(), Math.max(0, daysBetween(r.date, r.dueDate))) : r.dueDate, status, repeatId: null, settledDate: null, settledAccountId: null, splitOf: null, imported: false, createdAt: t, updatedAt: t } } }));
    showToast('Duplicated to today');
    return nid;
  }, [showToast]);

  /* ------------------------------ Categories, accounts ------------------------------ */
  const saveCategory = useCallback((c) => {
    const id = c.id || newId('c');
    const t = now();
    setData((cur) => {
      const old = cur.categories[id];
      const order = c.order || (old && old.order) || Object.values(cur.categories).filter((x) => x && !x.deleted && x.kind === c.kind).length + 1;
      return { ...cur, categories: { ...cur.categories, [id]: { ...(old || {}), ...c, id, order, createdAt: (old && old.createdAt) || t, updatedAt: t, deleted: false } } };
    });
    return id;
  }, []);

  const deleteCategory = useCallback((id, moveTo) => {
    const t = now();
    setData((cur) => {
      const records = { ...cur.records };
      Object.values(cur.records).forEach((r) => { if (r && !r.deleted && r.categoryId === id) records[r.id] = { ...r, categoryId: moveTo || null, updatedAt: t }; });
      const repeats = { ...cur.repeats };
      Object.values(cur.repeats).forEach((p) => { if (p && !p.deleted && p.template && p.template.categoryId === id) repeats[p.id] = { ...p, template: { ...p.template, categoryId: moveTo || null }, updatedAt: t }; });
      const budgets = { ...cur.budgets };
      if (budgets[id]) budgets[id] = tomb(id);
      return { ...cur, records, repeats, budgets, categories: { ...cur.categories, [id]: tomb(id) } };
    });
    showToast('Category deleted');
  }, [showToast]);

  const saveAccount = useCallback((a) => {
    const id = a.id || newId('a');
    const t = now();
    setData((cur) => {
      const old = cur.accounts[id];
      return { ...cur, accounts: { ...cur.accounts, [id]: { openingRate: 1, ...(old || {}), ...a, id, createdAt: (old && old.createdAt) || t, updatedAt: t, deleted: false } }, lastAccountId: cur.lastAccountId || id };
    });
    const d = dataRef.current;
    if (a.currency && a.currency !== d.homeCurrency && !a.openingRateManual) {
      ensureRates(a.openingDate || todayYmd(), d.homeCurrency, [a.currency]).then((res) => {
        const r = res.rates[a.currency];
        if (r) setData((cur) => (cur.accounts[id] ? { ...cur, accounts: { ...cur.accounts, [id]: { ...cur.accounts[id], openingRate: r, updatedAt: now() } } } : cur));
        setRatesVersion((v) => v + 1);
      }).catch(() => {});
    }
    setTimeout(() => runRepeatsRef.current && runRepeatsRef.current(), 60);
    return id;
  }, []);

  const deleteAccount = useCallback((id, moveTo) => {
    const t = now();
    setData((cur) => {
      const mv = (x) => (x === id ? moveTo || null : x);
      const records = { ...cur.records };
      Object.values(cur.records).forEach((r) => {
        if (!r || r.deleted) return;
        if (r.accountId === id || r.toAccountId === id || r.settledAccountId === id) {
          const next = { ...r, accountId: mv(r.accountId), toAccountId: mv(r.toAccountId), settledAccountId: mv(r.settledAccountId), updatedAt: t };
          // A move between the two merged accounts now goes nowhere: drop it.
          records[r.id] = r.type === 'transfer' && next.accountId && next.accountId === next.toAccountId ? tomb(r.id) : next;
        }
      });
      const repeats = { ...cur.repeats };
      Object.values(cur.repeats).forEach((p) => {
        if (p && !p.deleted && p.template && (p.template.accountId === id || p.template.toAccountId === id)) {
          const tp = { ...p.template, accountId: mv(p.template.accountId), toAccountId: mv(p.template.toAccountId) };
          repeats[p.id] = tp.type === 'transfer' && tp.accountId && tp.accountId === tp.toAccountId ? { ...p, deleted: true, updatedAt: t } : { ...p, template: tp, updatedAt: t };
        }
      });
      const goals = { ...cur.goals };
      Object.values(cur.goals).forEach((g) => { if (g && !g.deleted && g.accountId === id) goals[g.id] = { ...g, accountId: moveTo || null, updatedAt: t }; });
      return { ...cur, records, repeats, goals, accounts: { ...cur.accounts, [id]: tomb(id) }, lastAccountId: cur.lastAccountId === id ? moveTo || null : cur.lastAccountId };
    });
    showToast('Account deleted');
  }, [showToast]);

  /* ------------------------------ Budgets, goals, repeats ------------------------------ */
  const saveBudget = useCallback((b) => {
    const t = now();
    setData((cur) => ({ ...cur, budgets: { ...cur.budgets, [b.categoryId]: { period: 'month', ...(cur.budgets[b.categoryId] || {}), ...b, id: b.categoryId, updatedAt: t, deleted: false } } }));
  }, []);
  const deleteBudget = useCallback((categoryId) => {
    setData((cur) => ({ ...cur, budgets: { ...cur.budgets, [categoryId]: tomb(categoryId) } }));
    showToast('Budget removed');
  }, [showToast]);

  const saveGoal = useCallback((g) => {
    const id = g.id || newId('g');
    const t = now();
    setData((cur) => ({ ...cur, goals: { ...cur.goals, [id]: { ...(cur.goals[id] || {}), ...g, id, createdAt: (cur.goals[id] && cur.goals[id].createdAt) || t, updatedAt: t, deleted: false } } }));
    return id;
  }, []);
  const deleteGoal = useCallback((id) => {
    setData((cur) => ({ ...cur, goals: { ...cur.goals, [id]: tomb(id) } }));
    showToast('Goal deleted');
  }, [showToast]);

  const saveRepeat = useCallback((rep) => {
    const t = now();
    setData((cur) => ({ ...cur, repeats: { ...cur.repeats, [rep.id]: { ...(cur.repeats[rep.id] || {}), ...rep, updatedAt: t, deleted: false } } }));
    setTimeout(runRepeats, 50);
  }, [runRepeats]);

  // Stops a repeat. Pending ones it made and bills not due yet go too.
  const deleteRepeat = useCallback((id) => {
    const t = now();
    const today = todayYmd();
    setData((cur) => {
      const records = { ...cur.records };
      Object.values(cur.records).forEach((r) => {
        if (!r || r.deleted || r.repeatId !== id) return;
        if (r.status === 'pending' || (r.status === 'open' && (r.dueDate || r.date) > today)) records[r.id] = tomb(r.id);
      });
      return { ...cur, records, repeats: { ...cur.repeats, [id]: { ...(cur.repeats[id] || {}), id, deleted: true, updatedAt: t } } };
    });
    showToast('Repeat stopped');
  }, [showToast]);

  /* ------------------------------ 2.2: checks and paydays ------------------------------ */
  // A count of the wallet or a look at the bank app found a gap. parts: the
  // bits you named ({ amount, name, categoryId, description }); whatever is
  // left goes in as Untracked. dir: 'out' (money gone) or 'in' (extra).
  const saveCheck = useCallback((accountId, { gap, dir, parts = [] }) => {
    const d = dataRef.current;
    const acc = d.accounts[accountId];
    if (!acc) return [];
    const today = todayYmd();
    const total = round2(Math.abs(Number(gap) || 0));
    const ids = [];
    if (total > 0) {
      const type = dir === 'in' ? 'income' : 'expense';
      let used = 0;
      parts.filter((p) => Number(p.amount) > 0).forEach((p) => {
        const amt = round2(Math.min(Number(p.amount), total - used));
        if (amt <= 0) return;
        used = round2(used + amt);
        ids.push(saveRecord({ type, amount: amt, name: p.name || '', categoryId: p.categoryId || (type === 'income' ? 'untracked-in' : 'untracked'), description: p.description || '', date: today, accountId, currency: acc.currency, fromCheck: true }));
      });
      const rest = round2(total - used);
      if (rest > 0) {
        const one = parts.length === 1 && !(Number(parts[0].amount) > 0) ? parts[0] : null;
        ids.push(saveRecord({
          type, amount: rest, date: today, accountId, currency: acc.currency, fromCheck: true,
          name: (one && one.name) || (accountKind(acc) === 'cash' ? 'Untracked cash' : 'Untracked'),
          categoryId: (one && one.categoryId) || (type === 'income' ? 'untracked-in' : 'untracked'),
          description: (one && one.description) || '',
        }));
      }
    }
    setData((cur) => ({ ...cur, checkedOn: { ...(cur.checkedOn || {}), [accountId]: today } }));
    if (ids.length) {
      showToast(ids.length === 1 ? 'Saved the difference' : `Saved ${ids.length} records`, { label: 'Undo', onPress: () => {
        setData((cur) => ({ ...cur, records: { ...cur.records, ...Object.fromEntries(ids.map((x) => [x, tomb(x)])) } }));
      } });
    } else showToast(accountKind(acc) === 'cash' ? 'Wallet matches' : 'Matches');
    return ids;
  }, [saveRecord, showToast]);

  // Payday came: save what arrived as Cash in, into the account it lands in.
  const confirmPayday = useCallback((key, { amount, accountId, name, date }) => {
    const d = dataRef.current;
    const acc = d.accounts[accountId];
    const id = saveRecord({ type: 'income', amount, accountId, currency: acc ? acc.currency : d.homeCurrency, categoryId: 'salary', name: name || 'Pay', date: date || todayYmd() });
    setData((cur) => ({ ...cur, paydayDone: { ...(cur.paydayDone || {}), [key]: id } }));
    showToast('Pay saved', { label: 'Undo', onPress: () => setData((cur) => {
      const done = { ...(cur.paydayDone || {}) };
      delete done[key];
      return { ...cur, paydayDone: done, records: { ...cur.records, [id]: tomb(id) } };
    }) });
    return id;
  }, [saveRecord, showToast]);
  const paydayLater = useCallback((key) => setData((cur) => ({ ...cur, paydayLater: { ...(cur.paydayLater || {}), [key]: todayYmd() } })), []);
  const paydaySkip = useCallback((key) => setData((cur) => ({ ...cur, paydayDone: { ...(cur.paydayDone || {}), [key]: 'skip' } })), []);

  /* ------------------------------ Import and restore ------------------------------ */
  // replace: the file becomes your records. Everything there now is
  // removed first (Undo brings it all back).
  const applyImport = useCallback((plan, { replace } = {}) => {
    const strip = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => { const { isNew, ...rest } = v; return [k, rest]; }));
    const before = dataRef.current;
    const undo = () => setData((cur) => {
      const t = now();
      const back = (coll, added) => {
        const next = { ...cur[coll] };
        Object.keys(added).forEach((k) => { next[k] = before[coll][k] ? { ...before[coll][k], updatedAt: t } : tomb(k); });
        if (replace && coll !== 'categories') Object.keys(before[coll]).forEach((k) => { if (!added[k]) next[k] = { ...before[coll][k], updatedAt: t }; });
        return next;
      };
      return { ...cur, records: back('records', plan.records), accounts: back('accounts', plan.accounts), categories: back('categories', plan.categories) };
    });
    setData((cur) => {
      const t = now();
      const gone = replace ? Object.fromEntries(Object.keys(cur.records).filter((k) => !cur.records[k].deleted && !plan.records[k]).map((k) => [k, tomb(k)])) : {};
      const resetOpen = replace ? Object.fromEntries(Object.values(cur.accounts).filter((a) => a && !a.deleted && !plan.accounts[a.id] && Number(a.opening)).map((a) => [a.id, { ...a, opening: 0, openingDate: null, updatedAt: t }])) : {};
      return {
        ...cur,
        accounts: { ...cur.accounts, ...resetOpen, ...strip(plan.accounts) },
        categories: { ...cur.categories, ...strip(plan.categories) },
        records: { ...cur.records, ...gone, ...plan.records },
        lastAccountId: cur.lastAccountId || Object.keys(plan.accounts)[0] || null,
      };
    });
    const foreign = Object.values(plan.records).filter((r) => r.rateCheck).map((r) => r.id);
    if (foreign.length) setTimeout(() => fillRate(foreign), 100);
    showToast(replace ? `Replaced with ${Object.keys(plan.records).length} records` : `Imported ${Object.keys(plan.records).length} records`, { label: 'Undo', onPress: undo });
  }, [fillRate, showToast]);

  // Replace everything that syncs with a backup (settings on this phone stay).
  const restoreData = useCallback((backup) => {
    setData((cur) => {
      const next = { ...cur };
      [...COLLECTIONS, ...WHOLE_FIELDS].forEach((k) => { if (backup[k] !== undefined) next[k] = backup[k]; });
      return next;
    });
    showToast('Backup restored');
  }, [showToast]);

  /* ------------------------------ Google and sync ------------------------------ */
  const syncLock = useRef(false);
  const syncNow = useCallback(async ({ manual } = {}) => {
    const d = dataRef.current;
    if (!d || !d.google || syncLock.current) return false;
    syncLock.current = true;
    setSyncing(true);
    try {
      const remote = await G.downloadSync();
      const local = dataRef.current;
      const m = remote
        ? mergeSync(syncPayload(local), local.syncStamps || {}, remote.data || {}, remote.stamps || {})
        : { data: syncPayload(local), stamps: local.syncStamps || {}, changedLocal: false, changedRemote: true };
      if (m.changedLocal) {
        prevRef.current = null; // merged data shouldn't be stamped as a new change
        setData((cur) => ({ ...cur, ...m.data, syncStamps: m.stamps }));
      }
      if (m.changedRemote) await G.uploadSync({ data: m.data, stamps: m.stamps }, remote && remote.fileId);
      setData((cur) => ({ ...cur, lastSyncAt: new Date().toISOString() }));
      if (manual) showToast('Synced');
      setTimeout(runRepeats, 100);
      return true;
    } catch (e) {
      if (manual) showToast(String(e.message).includes('signed-out') ? 'Sign in again to sync' : "Couldn't sync. Check your internet.");
      return false;
    } finally {
      syncLock.current = false;
      setSyncing(false);
    }
  }, [showToast, runRepeats]);

  const backupNow = useCallback(async ({ manual } = {}) => {
    const d = dataRef.current;
    if (!d || !d.google) return false;
    try {
      await G.uploadBackup(d);
      setData((cur) => ({ ...cur, lastDriveBackupAt: new Date().toISOString() }));
      if (manual) showToast('Backed up to Drive');
      return true;
    } catch (e) {
      if (manual) showToast("Couldn't back up. Check your internet.");
      return false;
    }
  }, [showToast]);

  const signInGoogle = useCallback(async () => {
    try {
      const user = await G.signIn();
      if (!user) return false;
      setData((cur) => ({ ...cur, google: user }));
      setTimeout(() => { syncNow({ manual: true }); }, 300);
      return true;
    } catch (e) {
      showToast(String(e.message) === 'unsupported' ? "Google sign-in isn't set up in this build" : "Couldn't sign in. Try again.");
      return false;
    }
  }, [syncNow, showToast]);

  const signOutGoogle = useCallback(async () => {
    await G.signOut();
    setData((cur) => ({ ...cur, google: null, lastSyncAt: null }));
    showToast('Signed out. Your records stay on this phone.');
  }, [showToast]);

  // Sync a few seconds after opening, and whenever Bag comes back to the front.
  useEffect(() => {
    if (!data || !data.google) return undefined;
    const backupIfChanged = () => { const d = dataRef.current; if (G.driveBackupDue(d)) backupNow(); };
    const h = setTimeout(() => { syncNow().finally(backupIfChanged); }, 3000);
    return () => clearTimeout(h);
  }, [data && !!data.google]);

  /* ------------------------------ App state: lock, sync, repeats ------------------------------ */
  const bgAt = useRef(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      const d = dataRef.current;
      if (!d) return;
      if (s === 'background') {
        bgAt.current = now();
        if (d.google && G.driveBackupDue(d)) backupNow();
      }
      if (s === 'active') {
        if (bgAt.current && now() - bgAt.current > 60000 && d.looks && d.looks.mode === 'each' && (d.looks.pick || []).length > 1) {
          const lk = pickLook(d.looks, d.lookNow, d.lookDay, todayYmd());
          setData((cur) => ({ ...cur, lookNow: lk.id, lookDay: lk.day }));
        }
        if (d.onboarded && d.lock && d.lock.on && bgAt.current && now() - bgAt.current >= (Number(d.lock.after) || 0) * 1000) setLocked(true);
        bgAt.current = 0;
        runRepeats();
        if (d.google) syncNow();
      }
    });
    return () => sub.remove();
  }, [runRepeats, syncNow, backupNow]);

  useEffect(() => { if (data) setHidden(!!(data.lock && data.lock.hideRecents)); }, [data && data.lock && data.lock.hideRecents]);
  useEffect(() => { if (data) setFeel(data.vibration); }, [data && data.vibration]);

  const tryUnlock = useCallback(async () => {
    const ok = await unlockAuth();
    if (ok) setLocked(false);
    return ok;
  }, []);

  /* ------------------------------ Reminders ------------------------------ */
  useEffect(() => {
    if (!data || !data.onboarded || Platform.OS === 'web') return undefined;
    const h = setTimeout(() => scheduleAll(dataRef.current), 1500);
    return () => clearTimeout(h);
  }, [data && data.records, data && data.repeats, data && data.reminders, data && data.onboarded, data && data.paydays, data && data.paydayDone, data && data.budgets, data && data.lowWarn, data && data.evening, data && data.margin, data && data.accounts]);

  /* ------------------------------ Derived ------------------------------ */
  const mode = data && data.themeMode !== 'auto' ? data.themeMode : scheme === 'dark' ? 'dark' : 'light';
  const theme = useMemo(() => resolveTheme({ mode, accent: data ? data.accent : 'slate', money: data ? data.moneyColours : 'greenRed', textSize: data ? data.textSize : 1 }), [mode, data && data.accent, data && data.moneyColours, data && data.textSize]);
  const flows = useMemo(() => (data ? allFlows(data) : []), [data && data.records]);

  const nums = (data && data.numbers) || DEFAULTS.numbers;
  // Home-currency amount -> text with the person's number style.
  const money = useCallback((n, { plus = false, currency, decimals } = {}) => {
    const cur = currency || home;
    const dp = decimals !== undefined ? decimals : cur === home ? Number(nums.decimals) : currencyDecimals(cur);
    return currency && currency !== home ? fmtMoney(n, currency, home, { decimals: dp, negative: nums.negative, plus }) : fmt(n, { decimals: dp, negative: nums.negative, plus });
  }, [home, nums.decimals, nums.negative]);

  // The same amount in the second currency, or null when it's switched off,
  // not wanted in this place (home, tiles, accounts, record, reports), or
  // there's no rate yet.
  const second = useCallback((homeAmount, place) => {
    const d = dataRef.current;
    if (!d || !d.secondOn || !d.secondCurrency || d.secondCurrency === d.homeCurrency) return null;
    if (place && !(d.secondShow || {})[place]) return null;
    const r = latestRate(d.secondCurrency, d.homeCurrency);
    if (!r) return null;
    return { amount: homeAmount / r, currency: d.secondCurrency };
  }, [ratesVersion, data && data.secondOn, data && data.secondShow, data && data.secondCurrency]);

  // Receipt photos live in the app's own folder and only on this phone.
  const addPhoto = useCallback(async (recordId, uri) => {
    const saved = await keepPhoto(uri);
    if (!saved) return false;
    setData((d) => ({ ...d, photos: { ...d.photos, [recordId]: [...((d.photos || {})[recordId] || []), saved] } }));
    return true;
  }, []);
  const removePhoto = useCallback((recordId, uri) => {
    setData((d) => {
      const left = ((d.photos || {})[recordId] || []).filter((u) => u !== uri);
      const photos = { ...d.photos };
      if (left.length) photos[recordId] = left; else delete photos[recordId];
      return { ...d, photos };
    });
    dropPhoto(uri);
  }, []);

  const value = useMemo(() => ({
    data, hydrated: !!data, update, theme, flows, money, second, homePerUnit, ratesVersion, refreshRates,
    toast, setToast, showToast, locked, tryUnlock, syncing, pendingOpen, setPendingOpen,
    saveRecord, deleteRecord, patchRecords, deleteRecords, settleRecord, payDebt, removePayment, reopenRecord, confirmPending, markPaid, unpay, askLater, skipPending, answerRepeat, duplicateRecord,
    saveCategory, deleteCategory, saveAccount, deleteAccount, saveBudget, deleteBudget, saveGoal, deleteGoal, saveRepeat, deleteRepeat,
    applyImport, restoreData, syncNow, backupNow, signInGoogle, signOutGoogle, runRepeats, addPhoto, removePhoto,
    saveCheck, confirmPayday, paydayLater, paydaySkip,
  }), [data, theme, flows, money, second, homePerUnit, ratesVersion, toast, locked, syncing, pendingOpen]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
