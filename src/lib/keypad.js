// Typing an amount on Bag's keypad: two decimals at most, nine digits.
export function keyIn(cur, k) {
  if (k === 'del') return cur.slice(0, -1);
  if (k === '.') return cur.includes('.') ? cur : `${cur || '0'}.`;
  if (cur.includes('.') && cur.split('.')[1].length >= 2) return cur;
  if (cur.replace('.', '').length >= 9) return cur;
  return cur === '0' ? k : cur + k;
}

// The same, typing at a cursor: returns the new text and where the cursor
// goes. Delete removes the digit before the cursor.
export function keyAt(cur, caret, k) {
  const c = Math.max(0, Math.min(cur.length, caret == null ? cur.length : caret));
  if (k === 'del') return c > 0 ? { v: cur.slice(0, c - 1) + cur.slice(c), c: c - 1 } : { v: cur, c };
  if (k === '.') {
    if (cur.includes('.')) return { v: cur, c };
    const head = cur.slice(0, c) || '0';
    return { v: `${head}.${cur.slice(c)}`, c: head.length + 1 };
  }
  const v = cur.slice(0, c) + k + cur.slice(c);
  const dec = v.split('.')[1];
  if (dec && dec.length > 2) return { v: cur, c };
  if (v.replace('.', '').length > 9) return { v: cur, c };
  if (v.length > 1 && v[0] === '0' && v[1] !== '.') return { v: v.slice(1), c: Math.max(0, c) };
  return { v, c: c + 1 };
}
