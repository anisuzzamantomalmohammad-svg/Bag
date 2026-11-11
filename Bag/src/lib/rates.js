// Exchange rates, saved per day so old records keep the rate of their day.
//
// Source: Frankfurter v2 (central-bank rates, BDT included, back to 1998,
// no key). If it can't be reached, the free currency-api on jsDelivr, then
// its Cloudflare mirror. Offline, the last saved rate is used and the record
// is marked "rate to check" until it's refreshed.
//
// A rate here is how many home-currency units one unit of the other
// currency is worth: with NZD at home, USD -> 1.7912.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { today as todayYmd } from './dates';

const KEY = '@bag:rates:v1';
let cache = null; // { [date]: { [home]: { [cur]: homePerUnit } } }

async function load() {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? JSON.parse(raw) : {};
  } catch (e) {
    cache = {};
  }
  return cache;
}

function save() {
  AsyncStorage.setItem(KEY, JSON.stringify(cache || {})).catch(() => {});
}

async function getJson(url) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), 9000) : null;
  try {
    const res = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
    if (!res.ok) throw new Error(`http-${res.status}`);
    return await res.json();
  } finally {
    if (t) clearTimeout(t);
  }
}

// Frankfurter v2 returns [{ date, base, quote, rate }] with 1 base = rate quote.
async function fromFrankfurter(date, home, quotes) {
  const q = quotes.join(',');
  const d = date === todayYmd() ? '' : `&date=${date}`;
  const j = await getJson(`https://api.frankfurter.dev/v2/rates?base=${home}&quotes=${q}${d}`);
  const list = Array.isArray(j) ? j : j && Array.isArray(j.rates) ? j.rates : [];
  const out = {};
  list.forEach((x) => {
    if (x && x.quote && x.rate > 0) out[String(x.quote).toUpperCase()] = 1 / Number(x.rate);
  });
  return out;
}

// currency-api: { date, nzd: { usd: 0.558, bdt: 69.5 } } with 1 home = n other.
async function fromCurrencyApi(date, home, quotes) {
  const tag = date === todayYmd() ? 'latest' : date;
  const h = home.toLowerCase();
  let j;
  try {
    j = await getJson(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${tag}/v1/currencies/${h}.json`);
  } catch (e) {
    j = await getJson(`https://${tag}.currency-api.pages.dev/v1/currencies/${h}.json`);
  }
  const table = (j && j[h]) || {};
  const out = {};
  quotes.forEach((c) => {
    const v = Number(table[c.toLowerCase()]);
    if (v > 0) out[c] = 1 / v;
  });
  return out;
}

// Saved rate on or before a date, or null.
export function savedRate(date, cur, home) {
  if (!cache || cur === home) return cur === home ? 1 : null;
  if (cache[date] && cache[date][home] && cache[date][home][cur]) return cache[date][home][cur];
  const days = Object.keys(cache).filter((d) => d <= date && cache[d][home] && cache[d][home][cur]).sort();
  const d = days[days.length - 1];
  return d ? cache[d][home][cur] : null;
}

// The newest saved rate for a currency (used to show account balances).
export function latestRate(cur, home) {
  return savedRate('9999-12-31', cur, home);
}

// Get rates for these currencies on a date, from the saved copy or online.
// Returns { rates: { CUR: homePerUnit }, missing: [CUR] }.
export async function ensureRates(date, home, currencies) {
  await load();
  const want = [...new Set(currencies.filter((c) => c && c !== home))];
  const have = (cache[date] && cache[date][home]) || {};
  let need = want.filter((c) => !have[c]);
  if (need.length) {
    let got = {};
    try {
      got = await fromFrankfurter(date, home, need);
    } catch (e) {
      got = {};
    }
    const still = need.filter((c) => !got[c]);
    if (still.length) {
      try {
        got = { ...got, ...(await fromCurrencyApi(date, home, still)) };
      } catch (e) {
        // offline: fall back to saved rates below
      }
    }
    if (Object.keys(got).length) {
      cache[date] = { ...(cache[date] || {}), [home]: { ...((cache[date] || {})[home] || {}), ...got } };
      save();
    }
    need = need.filter((c) => !got[c]);
  }
  const rates = {};
  const missing = [];
  want.forEach((c) => {
    const exact = cache[date] && cache[date][home] && cache[date][home][c];
    if (exact) rates[c] = exact;
    else {
      const old = savedRate(date, c, home);
      if (old) rates[c] = old;
      missing.push(c); // no rate for that exact day yet
    }
  });
  return { rates, missing };
}

export async function loadRates() {
  return load();
}
