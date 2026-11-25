// Number and money formatting. Done by hand so it's the same on every phone
// (Android's Intl support varies).
import { currencyDecimals } from '../data/currencies';

export const MINUS = '−';
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const roundTo = (n, dp) => {
  const f = 10 ** dp;
  return Math.round((Number(n) || 0) * f) / f;
};

function group(intStr) {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// 4318.6 -> "4,318.60"; negative per style: "−271.25" or "(271.25)"
export function fmt(n, { decimals = 2, negative = 'minus', plus = false } = {}) {
  const v = Number(n) || 0;
  const neg = v < 0 && Math.abs(v) >= 0.5 * 10 ** -decimals;
  const abs = Math.abs(v).toFixed(decimals);
  const [i, f] = abs.split('.');
  const body = f ? `${group(i)}.${f}` : group(i);
  if (neg) return negative === 'brackets' ? `(${body})` : `${MINUS}${body}`;
  return plus ? `+${body}` : body;
}

// Amount in its own currency; the code shows only when it isn't the home currency.
export function fmtMoney(n, currency, home, opts = {}) {
  const decimals = opts.decimals !== undefined ? opts.decimals : currencyDecimals(currency || home);
  const s = fmt(n, { ...opts, decimals });
  return currency && currency !== home ? `${s} ${currency}` : s;
}

// Parse what someone typed: "1,234.5" -> 1234.5; returns NaN if it isn't a number.
export function parseAmount(s) {
  const t = String(s ?? '').replace(/[,\s]/g, '').replace(MINUS, '-');
  if (!t || !/^-?\d*\.?\d*$/.test(t) || t === '-' || t === '.') return NaN;
  return Number(t);
}

// Rough "≈ −18,857 BDT" style: whole numbers for big amounts.
export function fmtApprox(n, currency) {
  const big = Math.abs(n) >= 1000;
  return `≈ ${fmt(n, { decimals: big ? 0 : currencyDecimals(currency) })} ${currency}`;
}
