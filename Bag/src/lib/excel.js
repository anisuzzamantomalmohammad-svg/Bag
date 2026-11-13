// Excel export and import.
//
// Export: Records (one row per record, the same columns every time),
// Summary (totals as formulas) and Running balance. Import reads that same
// layout back, so a file exported from Bag comes back in unchanged. It also
// reads a plain cash book (Date, Notes, Cash In, Cash Out).
import * as XLSX from 'xlsx';
import { fmtDate, isYmd, parseYmd, today as todayYmd, ymd, MONTHS } from './dates';
import { round2 } from './money';
import { allFlows, effectiveDate, flowsOf, kindOf, live, liveRecords, statusOf, TYPE_LABEL, KIND_LABEL } from './ledger';
import { newId, slug } from './ids';

const TYPE_FROM = { expense: 'expense', income: 'income', 'i owe': 'iowe', iowe: 'iowe', 'owed to me': 'owed', owed: 'owed', transfer: 'transfer' };
const KIND_FROM = { bill: 'bill', 'borrowed money': 'borrowed', borrowed: 'borrowed', 'lent or split': 'lent', lent: 'lent', split: 'lent', 'payment for work': 'work', work: 'work' };
const STATUS_FROM = { paid: 'paid', received: 'received', open: 'open', overdue: 'open', settled: 'settled', pending: 'pending', skipped: 'skipped' };

export const columns = (home) => [
  'Date', 'Type', 'Kind', 'Name', 'Category', 'Description', 'Amount', 'Currency', 'Rate', `Amount ${home}`,
  'Account', 'To account', 'Who', 'Due date', 'Status', 'Settled date', 'Counts as',
];

const toDate = (s) => (isYmd(s) ? parseYmd(s) : null);
const colLetter = (i) => String.fromCharCode(65 + i);

// What a record adds to income or spending, for the Summary formulas.
function countsAs(r) {
  const f = flowsOf(r).find((x) => x.count);
  return f ? (f.count === 'income' ? 'Income' : 'Expense') : '';
}

// Rows for the Records sheet, oldest first.
export function recordRows(data, { from, to } = {}) {
  const home = data.homeCurrency || 'NZD';
  const cats = data.categories || {};
  const accs = data.accounts || {};
  const name = (coll, id) => (coll[id] && !coll[id].deleted ? coll[id].name : '');
  const rows = [];
  live(data.accounts).forEach((a) => {
    if (!Number(a.opening)) return;
    const d = a.openingDate || '';
    if ((from && d && d < from) || (to && d && d > to)) return;
    rows.push({ sort: d || '0000', vals: [toDate(d), 'Opening balance', '', 'Opening balance', 'Opening balance', '', Number(a.opening), a.currency || home, Number(a.openingRate) || 1, null, a.name, '', '', null, '', null, ''] });
  });
  liveRecords(data).forEach((r) => {
    if (r.status === 'skipped') return;
    const d = effectiveDate(r);
    if ((from && d < from) || (to && d > to)) return;
    rows.push({
      sort: r.date,
      vals: [
        toDate(r.date), TYPE_LABEL[r.type] || r.type, kindOf(r) ? KIND_LABEL[kindOf(r)] : '', r.name || '', name(cats, r.categoryId), r.description || '',
        Number(r.amount) || 0, r.currency || home, Number(r.rate) || 1, null, name(accs, r.accountId), name(accs, r.toAccountId), r.who || '',
        toDate(r.dueDate), statusOf(r), toDate(r.settledDate), countsAs(r),
      ],
    });
  });
  rows.sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0));
  return rows.map((x) => x.vals);
}

export function buildWorkbook(data, { from, to, summary = true, running = true } = {}) {
  const home = data.homeCurrency || 'NZD';
  const head = columns(home);
  const rows = recordRows(data, { from, to });
  const ws = XLSX.utils.aoa_to_sheet([head, ...rows], { cellDates: true });
  const last = rows.length + 1;
  const A = (c) => colLetter(head.indexOf(c));
  for (let i = 0; i < rows.length; i++) {
    const r = i + 2;
    const amount = rows[i][6];
    const rate = rows[i][8];
    ws[`${A(`Amount ${home}`)}${r}`] = { t: 'n', f: `${A('Amount')}${r}*${A('Rate')}${r}`, v: round2(amount * rate), z: '#,##0.00' };
    ['Date', 'Due date', 'Settled date'].forEach((c) => { const cell = ws[`${A(c)}${r}`]; if (cell && cell.t === 'd') cell.z = 'd mmm yyyy'; });
    const amt = ws[`${A('Amount')}${r}`];
    if (amt) amt.z = '#,##0.00';
  }
  ws['!cols'] = [12, 15, 15, 22, 24, 20, 11, 9, 8, 13, 12, 12, 12, 12, 10, 12, 10].map((wch) => ({ wch }));
  ws['!autofilter'] = { ref: `A1:${colLetter(head.length - 1)}${last}` };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Records');

  if (summary) {
    const H = `Records!$${A(`Amount ${home}`)}$2:$${A(`Amount ${home}`)}$${Math.max(2, last)}`;
    const CA = `Records!$${A('Counts as')}$2:$${A('Counts as')}$${Math.max(2, last)}`;
    const CAT = `Records!$${A('Category')}$2:$${A('Category')}$${Math.max(2, last)}`;
    const TY = `Records!$${A('Type')}$2:$${A('Type')}$${Math.max(2, last)}`;
    const aoa = [['Counts as', 'Category', `Total ${home}`, 'Records']];
    const seen = {};
    const cats = [];
    rows.forEach((r) => {
      if (!r[16]) return;
      const k = `${r[16]}|${r[4]}`;
      if (!seen[k]) { seen[k] = true; cats.push([r[16], r[4]]); }
    });
    cats.sort((a, b) => (a[0] === b[0] ? 0 : a[0] === 'Income' ? -1 : 1));
    cats.forEach(([kind, cat]) => aoa.push([kind, cat, null, null]));
    const ws2 = XLSX.utils.aoa_to_sheet(aoa);
    cats.forEach(([kind, cat], i) => {
      const r = i + 2;
      const total = round2(rows.filter((x) => x[16] === kind && x[4] === cat).reduce((s, x) => s + x[6] * x[8], 0));
      ws2[`C${r}`] = { t: 'n', f: `SUMIFS(${H},${CA},A${r},${CAT},B${r})`, v: total, z: '#,##0.00' };
      ws2[`D${r}`] = { t: 'n', f: `COUNTIFS(${CA},A${r},${CAT},B${r})`, v: rows.filter((x) => x[16] === kind && x[4] === cat).length };
    });
    const s = cats.length + 3;
    const inc = round2(rows.filter((x) => x[16] === 'Income').reduce((t, x) => t + x[6] * x[8], 0));
    const exp = round2(rows.filter((x) => x[16] === 'Expense').reduce((t, x) => t + x[6] * x[8], 0));
    const opn = round2(rows.filter((x) => x[1] === 'Opening balance').reduce((t, x) => t + x[6] * x[8], 0));
    XLSX.utils.sheet_add_aoa(ws2, [['Total income'], ['Total expenses'], ['Opening balance'], ['Net (opening + income − expenses)']], { origin: `A${s}` });
    ws2[`C${s}`] = { t: 'n', f: `SUMIFS(${H},${CA},"Income")`, v: inc, z: '#,##0.00' };
    ws2[`C${s + 1}`] = { t: 'n', f: `SUMIFS(${H},${CA},"Expense")`, v: exp, z: '#,##0.00' };
    ws2[`C${s + 2}`] = { t: 'n', f: `SUMIFS(${H},${TY},"Opening balance")`, v: opn, z: '#,##0.00' };
    ws2[`C${s + 3}`] = { t: 'n', f: `C${s + 2}+C${s}-C${s + 1}`, v: round2(opn + inc - exp), z: '#,##0.00' };
    ws2['!ref'] = `A1:D${s + 3}`;
    ws2['!cols'] = [{ wch: 34 }, { wch: 26 }, { wch: 14 }, { wch: 9 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Summary');
  }

  if (running) {
    const flows = allFlows(data).filter((f) => (!from || f.date >= from) && (!to || f.date <= to)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.record.createdAt || 0) - (b.record.createdAt || 0)));
    const aoa = [['Date', 'Name', 'Account', `Money in ${home}`, `Money out ${home}`, `Balance ${home}`]];
    const accs = data.accounts || {};
    live(data.accounts).forEach((a) => { if (Number(a.opening)) aoa.push([toDate(a.openingDate), 'Opening balance', a.name, round2(Number(a.opening) * (Number(a.openingRate) || 1)), 0, null]); });
    flows.forEach((f) => aoa.push([toDate(f.date), f.record.name || TYPE_LABEL[f.record.type], (accs[f.accountId] || {}).name || '', f.home > 0 ? round2(f.home) : 0, f.home < 0 ? round2(-f.home) : 0, null]));
    const ws3 = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    let bal = 0;
    for (let i = 1; i < aoa.length; i++) {
      const r = i + 1;
      bal = round2(bal + aoa[i][3] - aoa[i][4]);
      ws3[`F${r}`] = { t: 'n', f: i === 1 ? `D${r}-E${r}` : `F${r - 1}+D${r}-E${r}`, v: bal, z: '#,##0.00' };
      const dc = ws3[`A${r}`];
      if (dc && dc.t === 'd') dc.z = 'd mmm yyyy';
    }
    ws3['!cols'] = [{ wch: 12 }, { wch: 24 }, { wch: 12 }, { wch: 13 }, { wch: 13 }, { wch: 13 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Running balance');
  }
  return wb;
}

export function exportFileName(from, to) {
  const f = (s) => (s ? fmtDate(s).replace(/ /g, '-') : '');
  if (from && to) return `Bag_${f(from)}_to_${f(to)}.xlsx`;
  return `Bag_records_${fmtDate(todayYmd()).replace(/ /g, '-')}.xlsx`;
}

export function workbookBase64(wb) {
  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx', compression: true });
}

/* ------------------------------ Import ------------------------------ */

// Any date a spreadsheet might hold -> "YYYY-MM-DD" or ''.
export function toYmd(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date && !isNaN(v)) return ymd(new Date(v.getFullYear(), v.getMonth(), v.getDate(), 12));
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : '';
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s,]+(\d{4})$/.exec(s);
  if (m) {
    const mi = MONTHS.findIndex((x) => x.toLowerCase() === m[2].toLowerCase());
    if (mi >= 0) return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); // NZ style d/m/yyyy
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

const num = (v) => {
  if (typeof v === 'number') return v;
  const n = Number(String(v || '').replace(/[,\s]/g, '').replace('−', '-'));
  return isNaN(n) ? 0 : n;
};

// Rows of plain objects from the first sheet that looks like records.
export function readRows(wb) {
  const name = wb.SheetNames.find((n) => n.toLowerCase() === 'records') || wb.SheetNames[0];
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
  const hi = aoa.findIndex((row) => {
    const l = row.map((c) => String(c).trim().toLowerCase());
    return l.includes('date') && (l.includes('type') || l.includes('cash in') || l.includes('cash out'));
  });
  if (hi < 0) return { rows: [], format: null };
  const head = aoa[hi].map((c) => String(c).trim().toLowerCase());
  const format = head.includes('type') ? 'bag' : 'cashbook';
  const rows = [];
  for (let i = hi + 1; i < aoa.length; i++) {
    const o = {};
    head.forEach((h, j) => { if (h) o[h] = aoa[i][j]; });
    if (!toYmd(o.date)) continue; // headers, totals and blank lines
    rows.push(o);
  }
  return { rows, format };
}

export function readWorkbookBase64(b64) {
  return XLSX.read(b64, { type: 'base64', cellDates: true });
}

// Turn rows into what would be added, without changing anything yet.
export function planImport(data, { rows, format }) {
  const home = data.homeCurrency || 'NZD';
  const accounts = {};
  const categories = {};
  const records = {};
  const stamp = Date.now();
  const byName = (coll, extra, n, kind) => {
    const want = String(n || '').trim().toLowerCase();
    if (!want) return null;
    const found = [...live(coll), ...Object.values(extra)].find((x) => x.name.trim().toLowerCase() === want && (!kind || !x.kind || x.kind === kind));
    return found || null;
  };
  const account = (n, cur) => {
    const label = String(n || '').trim() || 'Cash';
    const f = byName(data.accounts, accounts, label);
    if (f) return f.id;
    const id = newId('a');
    accounts[id] = { id, name: label, currency: cur || home, opening: 0, openingDate: null, openingRate: 1, createdAt: stamp, updatedAt: stamp, isNew: true };
    return id;
  };
  const category = (n, kind) => {
    const label = String(n || '').trim();
    if (!label) return null;
    const f = byName(data.categories, categories, label, kind);
    if (f) return f.id;
    let id = slug(label);
    if ((data.categories || {})[id] || categories[id]) id = newId('c');
    categories[id] = { id, name: label, emoji: kind === 'income' ? '💰' : '🏷️', kind, order: 50, createdAt: stamp, updatedAt: stamp, isNew: true };
    return id;
  };
  const existing = new Set(liveRecords(data).map((r) => `${r.type}|${r.date}|${String(r.name || '').toLowerCase()}|${round2(r.amount)}`));
  const counts = { expense: 0, income: 0, iowe: 0, owed: 0, transfer: 0, opening: 0, duplicates: 0, skipped: 0 };
  let openingTotal = 0;

  rows.forEach((o, i) => {
    const date = toYmd(o.date);
    let type;
    let amount;
    let nameStr;
    if (format === 'cashbook') {
      const cin = num(o['cash in']);
      const cout = num(o['cash out']);
      nameStr = String(o.notes || o.name || '').trim();
      if (cin > 0) { type = 'income'; amount = cin; } else if (cout > 0) { type = 'expense'; amount = cout; } else { counts.skipped += 1; return; }
      if (!nameStr) nameStr = type === 'income' ? 'Money in' : 'Money out';
    } else {
      const t = String(o.type || '').trim().toLowerCase();
      if (t === 'opening balance') {
        const id = account(o.account, String(o.currency || home).toUpperCase());
        const before = (data.accounts || {})[id];
        if (before && Number(before.opening)) { counts.duplicates += 1; return; } // already set: importing the same file twice
        const acc = accounts[id] || { ...before };
        acc.opening = round2((Number(acc.opening) || 0) + num(o.amount));
        acc.openingDate = !acc.openingDate || date < acc.openingDate ? date : acc.openingDate;
        acc.openingRate = num(o.rate) || 1;
        accounts[id] = { ...acc, updatedAt: stamp };
        counts.opening += 1;
        openingTotal += num(o.amount) * (num(o.rate) || 1);
        return;
      }
      type = TYPE_FROM[t];
      if (!type) { counts.skipped += 1; return; }
      amount = Math.abs(num(o.amount));
      nameStr = String(o.name || '').trim();
    }
    const currency = String(o.currency || home).trim().toUpperCase() || home;
    const catKind = type === 'income' || (type === 'owed' && KIND_FROM[String(o.kind || '').toLowerCase()] === 'work') ? 'income' : 'expense';
    const key = `${type}|${date}|${nameStr.toLowerCase()}|${round2(amount)}`;
    if (existing.has(key)) { counts.duplicates += 1; return; }
    existing.add(key);
    const rate = currency === home ? 1 : num(o.rate) || null;
    const rec = {
      id: newId('r'),
      type,
      name: nameStr,
      description: String(o.description || '').trim(),
      categoryId: type === 'transfer' ? null : category(o.category || (format === 'cashbook' ? (type === 'income' ? 'Other income' : 'Bills and other') : ''), catKind),
      amount,
      currency,
      rate: rate || 1,
      rateCheck: currency !== home && !rate,
      date,
      accountId: account(o.account, currency),
      who: String(o.who || '').trim(),
      createdAt: stamp + i,
      updatedAt: stamp + i,
      imported: true,
    };
    const kind = KIND_FROM[String(o.kind || '').trim().toLowerCase()];
    if (type === 'iowe' || type === 'owed') rec.kind = kind || (type === 'iowe' ? 'bill' : 'lent');
    if (type === 'transfer') rec.toAccountId = account(o['to account'], currency);
    const st = STATUS_FROM[String(o.status || '').trim().toLowerCase()];
    if (type === 'expense') rec.status = st === 'pending' ? 'pending' : 'paid';
    else if (type === 'income') rec.status = st === 'pending' ? 'pending' : 'received';
    else if (type === 'transfer') rec.status = 'paid';
    if ((type === 'expense' || type === 'income' || type === 'transfer') && rec.status !== 'pending' && date > todayYmd()) rec.status = 'scheduled';
    if (type === 'iowe' || type === 'owed') {
      rec.status = st === 'settled' ? 'settled' : 'open';
      rec.dueDate = toYmd(o['due date']) || null;
      if (rec.status === 'settled') rec.settledDate = toYmd(o['settled date']) || date;
    }
    records[rec.id] = rec;
    counts[type] += 1;
  });
  const after = {
    ...data,
    accounts: { ...(data.accounts || {}), ...accounts },
    categories: { ...(data.categories || {}), ...categories },
    records: { ...(data.records || {}), ...records },
  };
  return {
    records, accounts, categories, counts, openingTotal: round2(openingTotal),
    newAccounts: Object.values(accounts).filter((a) => a.isNew).map((a) => a.name),
    newCategories: Object.values(categories).map((c) => c.name),
    after,
  };
}
