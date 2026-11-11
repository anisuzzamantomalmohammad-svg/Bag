// Bag's data and everything that changes it. One object, saved on the phone
// (AsyncStorage), the same way Deen keeps its data.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_CATEGORIES, HOME_CARDS } from '../data/defaults';
import { currencyDecimals } from '../data/currencies';
import { resolveTheme } from '../theme/palettes';
import { newId, repeatRecordId } from '../lib/ids';
import { today as todayYmd } from '../lib/dates';
import { fmt, fmtMoney, round2 } from '../lib/money';
import { allFlows, defaultKind } from '../lib/ledger';
import { materialise } from '../lib/repeats';
import { ensureRates, latestRate, loadRates, savedRate } from '../lib/rates';
import { mergeSync, purgeTombstones, stampChanges, syncPayload, COLLECTIONS, WHOLE_FIELDS } from '../lib/sync';
import { scheduleAll } from '../lib/reminders';
import * as G from '../lib/google';
import { setHidden, unlock as unlockAuth } from '../lib/lock';
import { PERSIST_KEY } from '../lib/background';
import { refreshWidget } from '../widget/update';
import { dropPhoto, keepPhoto } from '../lib/photos';

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
  photos: {}, // record id -> [file uri], kept on this phone only
  reminders: { on: true, billDays: 2, time: '09:00', repeats: true, owed: true },
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
    homeCards: [...cards, ...HOME_CARDS.filter((c) => !known.has(c.id))],
  };
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
      } catch (e) {
        d = initialData();
      }
      d = purgeTombstones(d);
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
  const runRepeats = useCallback(() => {
    setData((d) => {
      if (!d) return d;
      const m = materialise(d);
      return m ? { ...d, records: { ...d.records, ...m.records }, repeats: { ...d.repeats, ...m.repeats } } : d;
    });
  }, []);

  /* ------------------------------ Rates ------------------------------ */
  const home = data ? data.homeCurrency : 'NZD';
  const refreshRates = useCallback(async () => {
    const d = dataRef.current;
    if (!d) return;
    const curs = [d.secondOn ? d.secondCurrency : null, ...Object.values(d.accounts || {}).filter((a) => a && !a.deleted).map((a) => a.currency)].filter(Boolean);
    if (!curs.some((c) => c !== d.homeCurrency)) return;
    await ensureRates(todayYmd(), d.homeCurrency, curs).catch(() => {});
    setRatesVersion((v) => v + 1);
  }, []);
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
        return { ...cur, records: { ...cur.records, [r.id]: { ...x, rate: rate || x.rate || 1, rateCheck: !res || res.missing.includes(r.currency), updatedAt: now() } } };
      });
    }
    setRatesVersion((v) => v + 1);
  }, []);

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
    const rate = !foreign ? 1 : draft.rateManual ? Number(draft.rate) : savedRate(draft.date, currency, d.homeCurrency) || Number(draft.rate) || 1;
    const type = draft.type || 'expense';
    const statusDefault = { expense: 'paid', income: 'received', transfer: 'paid', iowe: 'open', owed: 'open' }[type];
    let status = old && old.type === type ? old.status : statusDefault;
    if (old && old.status === 'pending' && (type === 'expense' || type === 'income' || type === 'transfer')) status = old.status;
    const rec = {
      ...(old || {}),
      ...draft,
      id,
      type,
      kind: type === 'iowe' || type === 'owed' ? draft.kind || defaultKind(type) : null,
      amount: round2(Math.abs(Number(draft.amount) || 0)),
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

  const deleteRecord = useCallback((id, { silent } = {}) => {
    const d = dataRef.current;
    const prev = d.records[id];
    if (!prev) return;
    setData((cur) => ({ ...cur, records: { ...cur.records, [id]: tomb(id) } }));
    if (!silent) showToast('Record deleted', { label: 'Undo', onPress: () => restore({ [id]: prev }) });
  }, [showToast, restore]);

  const settleRecord = useCallback((id, { date, accountId } = {}) => {
    const d = dataRef.current;
    const prev = d.records[id];
    if (!prev) return;
    const next = { ...prev, status: 'settled', settledDate: date || todayYmd(), settledAccountId: accountId || prev.accountId, updatedAt: now() };
    setData((cur) => ({ ...cur, records: { ...cur.records, [id]: next } }));
    showToast(prev.type === 'iowe' ? 'Marked paid' : 'Marked received', { label: 'Undo', onPress: () => restore({ [id]: prev }) });
  }, [showToast, restore]);

  const reopenRecord = useCallback((id) => {
    setData((cur) => {
      const r = cur.records[id];
      if (!r) return cur;
      return { ...cur, records: { ...cur.records, [id]: { ...r, status: 'open', settledDate: null, settledAccountId: null, updatedAt: now() } } };
    });
  }, []);

  const confirmPending = useCallback((id, { amount, accountId } = {}) => {
    const d = dataRef.current;
    const prev = d.records[id];
    if (!prev) return;
    const status = prev.type === 'income' ? 'received' : 'paid';
    const next = { ...prev, status, amount: amount !== undefined ? round2(Number(amount)) : prev.amount, accountId: accountId || prev.accountId, updatedAt: now() };
    setData((cur) => ({ ...cur, records: { ...cur.records, [id]: next } }));
    showToast(prev.type === 'income' ? 'Marked received' : 'Marked paid', { label: 'Undo', onPress: () => restore({ [id]: prev }) });
  }, [showToast, restore]);

  const skipPending = useCallback((id) => {
    const d = dataRef.current;
    const prev = d.records[id];
    if (!prev) return;
    setData((cur) => ({ ...cur, records: { ...cur.records, [id]: { ...prev, status: 'skipped', updatedAt: now() } } }));
    showToast('Skipped this time', { label: 'Undo', onPress: () => restore({ [id]: prev }) });
  }, [showToast, restore]);

  const duplicateRecord = useCallback((id) => {
    const d = dataRef.current;
    const r = d.records[id];
    if (!r) return null;
    const nid = newId('r');
    const t = now();
    const status = { expense: 'paid', income: 'received', transfer: 'paid', iowe: 'open', owed: 'open' }[r.type];
    setData((cur) => ({ ...cur, records: { ...cur.records, [nid]: { ...r, id: nid, date: todayYmd(), status, repeatId: null, settledDate: null, settledAccountId: null, splitOf: null, imported: false, createdAt: t, updatedAt: t } } }));
    showToast('Copied to today');
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
    return id;
  }, []);

  const deleteAccount = useCallback((id, moveTo) => {
    const t = now();
    setData((cur) => {
      const mv = (x) => (x === id ? moveTo || null : x);
      const records = { ...cur.records };
      Object.values(cur.records).forEach((r) => {
        if (!r || r.deleted) return;
        if (r.accountId === id || r.toAccountId === id || r.settledAccountId === id) records[r.id] = { ...r, accountId: mv(r.accountId), toAccountId: mv(r.toAccountId), settledAccountId: mv(r.settledAccountId), updatedAt: t };
      });
      const repeats = { ...cur.repeats };
      Object.values(cur.repeats).forEach((p) => {
        if (p && !p.deleted && p.template && (p.template.accountId === id || p.template.toAccountId === id)) repeats[p.id] = { ...p, template: { ...p.template, accountId: mv(p.template.accountId), toAccountId: mv(p.template.toAccountId) }, updatedAt: t };
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

  /* ------------------------------ Import and restore ------------------------------ */
  const applyImport = useCallback((plan) => {
    const strip = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => { const { isNew, ...rest } = v; return [k, rest]; }));
    setData((cur) => ({
      ...cur,
      accounts: { ...cur.accounts, ...strip(plan.accounts) },
      categories: { ...cur.categories, ...strip(plan.categories) },
      records: { ...cur.records, ...plan.records },
      lastAccountId: cur.lastAccountId || Object.keys(plan.accounts)[0] || null,
    }));
    const foreign = Object.values(plan.records).filter((r) => r.rateCheck).map((r) => r.id);
    if (foreign.length) setTimeout(() => fillRate(foreign), 100);
    showToast(`Imported ${Object.keys(plan.records).length} records`);
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
        if (d.onboarded && d.lock && d.lock.on && bgAt.current && now() - bgAt.current >= (Number(d.lock.after) || 0) * 1000) setLocked(true);
        bgAt.current = 0;
        runRepeats();
        if (d.google) syncNow();
      }
    });
    return () => sub.remove();
  }, [runRepeats, syncNow, backupNow]);

  useEffect(() => { if (data) setHidden(!!(data.lock && data.lock.hideRecents)); }, [data && data.lock && data.lock.hideRecents]);

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
  }, [data && data.records, data && data.repeats, data && data.reminders, data && data.onboarded]);

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
    saveRecord, deleteRecord, settleRecord, reopenRecord, confirmPending, skipPending, duplicateRecord,
    saveCategory, deleteCategory, saveAccount, deleteAccount, saveBudget, deleteBudget, saveGoal, deleteGoal, saveRepeat, deleteRepeat,
    applyImport, restoreData, syncNow, backupNow, signInGoogle, signOutGoogle, runRepeats, addPhoto, removePhoto,
  }), [data, theme, flows, money, second, homePerUnit, ratesVersion, toast, locked, syncing, pendingOpen]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
