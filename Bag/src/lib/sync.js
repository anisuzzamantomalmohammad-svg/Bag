// Two phones on one Google account keep the same records.
//
// Same mechanism as Deen: a sync file in the Drive app folder, checked when
// Bag opens, when it comes back to the front, and on "Sync now". The merge is
// different: Deen merges day by day, but money records change on their own
// (several a day, edits, deletes), so Bag merges record by record. Every
// record, account, category, budget, goal and repeat carries a time stamp of
// its last change; the newer side wins. A delete is kept as a small marker
// ({ id, deleted: true }) so it can't come back from the other phone.

export const COLLECTIONS = ['records', 'accounts', 'categories', 'budgets', 'goals', 'repeats'];
export const WHOLE_FIELDS = ['homeCurrency', 'secondCurrency', 'weekStart', 'monthStartDay', 'budgetRollover'];

// Settings that stay on one phone (never synced or backed up).
export const PER_PHONE = [
  'themeMode', 'accent', 'moneyColours', 'textSize', 'lock', 'reminders', 'homeCards', 'defaults', 'numbers', 'swipe',
  'reportsView', 'google', 'lastSyncAt', 'syncStamps', 'dirtyAt', 'lastDriveBackupAt', 'lastAccountId', 'notifAsked', 'tipsSeen',
  'secondOn', 'secondShow', 'homePeriod', 'photos', 'addMore',
];

const eq = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

export function stampChanges(prev, next, stamps, now = Date.now()) {
  let out = null;
  const set = (k) => {
    if (!out) out = { ...(stamps || {}) };
    out[k] = now;
  };
  COLLECTIONS.forEach((c) => {
    const a = prev[c] || {};
    const b = next[c] || {};
    if (a === b) return;
    new Set([...Object.keys(a), ...Object.keys(b)]).forEach((id) => {
      if (a[id] !== b[id] && !eq(a[id], b[id])) set(`${c}|${id}`);
    });
  });
  WHOLE_FIELDS.forEach((f) => {
    if (prev[f] !== next[f] && !eq(prev[f], next[f])) set(f);
  });
  return out;
}

// Returns { data, stamps, changedLocal, changedRemote }.
export function mergeSync(local, localStamps = {}, remote, remoteStamps = {}) {
  const data = {};
  const stamps = { ...localStamps };
  let changedLocal = false;
  let changedRemote = false;
  const pick = (k, lv, rv) => {
    const ls = localStamps[k] || 0;
    const rs = remoteStamps[k] || 0;
    let v = lv;
    if (rs > ls) {
      v = rv;
      stamps[k] = rs;
    } else if (!ls && !rs && lv === undefined) v = rv;
    if (!eq(v, lv)) changedLocal = true;
    if (!eq(v, rv)) changedRemote = true;
    return v;
  };
  COLLECTIONS.forEach((c) => {
    const L = local[c] || {};
    const R = remote[c] || {};
    const out = {};
    new Set([...Object.keys(L), ...Object.keys(R)]).forEach((id) => {
      const v = pick(`${c}|${id}`, L[id], R[id]);
      if (v !== undefined) out[id] = v;
    });
    data[c] = out;
  });
  WHOLE_FIELDS.forEach((f) => {
    const v = pick(f, local[f], remote[f]);
    if (v !== undefined) data[f] = v;
  });
  return { data, stamps, changedLocal, changedRemote };
}

export function syncPayload(data) {
  const out = {};
  [...COLLECTIONS, ...WHOLE_FIELDS].forEach((f) => { if (data[f] !== undefined) out[f] = data[f]; });
  return out;
}

export function backupPayload(data) {
  const out = { ...data };
  PER_PHONE.forEach((k) => { delete out[k]; });
  return out;
}

// Delete markers older than 120 days are dropped; both phones will have
// synced long before then.
export function purgeTombstones(data, now = Date.now()) {
  const cutoff = now - 120 * 86400000;
  let changed = false;
  const next = { ...data };
  COLLECTIONS.forEach((c) => {
    const coll = data[c] || {};
    const keep = {};
    Object.entries(coll).forEach(([id, v]) => {
      if (v && v.deleted && (v.updatedAt || 0) < cutoff) changed = true;
      else keep[id] = v;
    });
    next[c] = keep;
  });
  return changed ? next : data;
}
