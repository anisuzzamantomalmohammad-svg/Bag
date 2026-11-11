// Short random ids. Ids made by a repeat are built from the repeat and the
// date instead, so two phones never create the same repeat twice.
export function newId(prefix = 'r') {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${t}${r}`;
}

export const repeatRecordId = (repeatId, date) => `rep_${repeatId}_${date}`;

export function slug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || newId('c');
}
