// Typing an amount on Bag's keypad: two decimals at most, nine digits.
export function keyIn(cur, k) {
  if (k === 'del') return cur.slice(0, -1);
  if (k === '.') return cur.includes('.') ? cur : `${cur || '0'}.`;
  if (cur.includes('.') && cur.split('.')[1].length >= 2) return cur;
  if (cur.replace('.', '').length >= 9) return cur;
  return cur === '0' ? k : cur + k;
}
