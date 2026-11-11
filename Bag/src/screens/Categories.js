// Categories: spending and income. Tap one to change its name or emoji, move
// it up or down, or delete it (its records move to another category first).
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useApp } from '../state/store';
import { Button, Card, Chip, Chips, Field, Icon, IconBox, Row, Screen, Seg, Sheet, T, useTheme } from '../ui/kit';
import { IconButton } from '../ui/parts';
import { live, liveRecords } from '../lib/ledger';
import { EMOJI_SUGGESTIONS } from '../data/defaults';

// The last emoji someone typed, so the phone's emoji keyboard can be used.
function lastEmoji(s) {
  const word = String(s || '').trim().split(/\s+/).pop() || '';
  if (!word || /[A-Za-z0-9]/.test(word)) return '';
  // Up to 8 code points keeps flags, skin tones and joined emoji whole.
  const cps = Array.from(word);
  return cps.slice(-Math.min(cps.length, 8)).join('');
}

function EditSheet({ cat, kind, visible, onClose }) {
  const app = useApp();
  const th = useTheme();
  const { data } = app;
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🏷️');
  const [typing, setTyping] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [moveTo, setMoveTo] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!visible) return;
    setName(cat ? cat.name : '');
    setEmoji(cat ? cat.emoji : kind === 'income' ? '💰' : '🏷️');
    setTyping('');
    setDeleting(false);
    setMoveTo(null);
    setErr('');
  }, [visible, cat && cat.id]);
  const used = cat ? liveRecords(data).filter((r) => r.categoryId === cat.id).length : 0;
  const others = live(data.categories).filter((c) => c.kind === kind && (!cat || c.id !== cat.id)).sort((a, b) => (a.order || 0) - (b.order || 0));

  const save = () => {
    const n = name.trim();
    if (!n) { setErr('Give it a name'); return; }
    if (live(data.categories).some((c) => c.kind === kind && c.name.trim().toLowerCase() === n.toLowerCase() && (!cat || c.id !== cat.id))) { setErr('There is already one with that name'); return; }
    app.saveCategory({ id: cat ? cat.id : undefined, name: n, emoji: emoji || '🏷️', kind });
    onClose();
  };

  if (deleting) {
    return (
      <Sheet visible={visible} onClose={onClose} title={`Delete ${cat.name}?`}
        footer={<><Button label={used ? `Move ${used} and delete` : 'Delete'} kind="danger" onPress={() => { app.deleteCategory(cat.id, moveTo); onClose(); }} /><Button label="Cancel" kind="ghost" onPress={() => setDeleting(false)} /></>}>
        {used ? (
          <>
            <T size={14} color={th.muted}>{used} {used === 1 ? 'record uses' : 'records use'} it. Move them to:</T>
            <Chips>
              {others.map((c) => <Chip key={c.id} label={`${c.emoji} ${c.name}`} on={moveTo === c.id} onPress={() => setMoveTo(c.id)} />)}
              <Chip label="No category" on={!moveTo} onPress={() => setMoveTo(null)} />
            </Chips>
          </>
        ) : <T size={14} color={th.muted}>No records use it.</T>}
        {data.budgets[cat.id] && !data.budgets[cat.id].deleted ? <T size={13} color={th.warn}>Its budget goes too.</T> : null}
      </Sheet>
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={cat ? 'Edit category' : 'New category'}
      footer={<Button label="Save" onPress={save} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconBox emoji={emoji} size={56} />
        <Field value={name} onChangeText={(t) => { setErr(''); setName(t); }} placeholder="Name" style={{ flex: 1 }} inputStyle={{ backgroundColor: th.soft }} autoFocus={!cat} autoCapitalize="sentences" />
      </View>
      {err ? <T size={13} color={th.danger}>{err}</T> : null}
      <T size={13} weight="semi" color={th.muted}>Emoji</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {EMOJI_SUGGESTIONS.map((e) => (
          <Pressable key={e} onPress={() => setEmoji(e)} accessibilityRole="button" accessibilityLabel={`Emoji ${e}`} style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: emoji === e ? th.accentSoft : th.soft, borderWidth: emoji === e ? 1.5 : 0, borderColor: th.accent }}>
            <T size={22}>{e}</T>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={typing}
        onChangeText={(t) => { setTyping(t); const e = lastEmoji(t); if (e) setEmoji(e); }}
        placeholder="Or type any emoji from your keyboard"
        placeholderTextColor={th.faint2}
        accessibilityLabel="Type an emoji"
        style={{ minHeight: 48, borderRadius: 14, paddingHorizontal: 14, backgroundColor: th.soft, color: th.ink, fontSize: 16 }}
      />
      {cat ? <Button label="Delete category" kind="dangerText" icon="trash-2" onPress={() => setDeleting(true)} /> : null}
    </Sheet>
  );
}

export default function Categories({ kind: startKind, edit }) {
  const app = useApp();
  const th = useTheme();
  const { data } = app;
  const [kind, setKind] = useState(startKind === 'income' ? 'income' : 'expense');
  const [editing, setEditing] = useState(edit ? data.categories[edit] || null : null);
  const [open, setOpen] = useState(!!edit);
  const list = useMemo(() => live(data.categories).filter((c) => c.kind === kind).sort((a, b) => (a.order || 0) - (b.order || 0)), [data.categories, kind]);
  const counts = useMemo(() => {
    const m = {};
    liveRecords(data).forEach((r) => { if (r.categoryId) m[r.categoryId] = (m[r.categoryId] || 0) + 1; });
    return m;
  }, [data.records]);

  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const ordered = list.slice();
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    ordered.forEach((c, k) => { if ((c.order || 0) !== k + 1) app.saveCategory({ ...c, order: k + 1 }); });
  };

  return (
    <Screen title="Categories" right={<IconButton name="plus" label="New category" onPress={() => { setEditing(null); setOpen(true); }} />}>
      <Seg items={[{ id: 'expense', label: 'Spending' }, { id: 'income', label: 'Income' }]} value={kind} onChange={setKind} />
      <Card pad={0} style={{ paddingHorizontal: 16 }}>
        {list.map((c, i) => (
          <Row key={c.id} first={i === 0} minHeight={60} left={<IconBox emoji={c.emoji} />} label={c.name}
            sub={`${counts[c.id] || 0} ${counts[c.id] === 1 ? 'record' : 'records'}`}
            onPress={() => { setEditing(c); setOpen(true); }} chevron={false}
            right={
              <View style={{ flexDirection: 'row' }}>
                <Pressable onPress={() => move(i, -1)} disabled={i === 0} accessibilityRole="button" accessibilityLabel={`Move ${c.name} up`} style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center', opacity: i === 0 ? 0.25 : 1 }}>
                  <Icon name="chevron-up" size={20} color={th.muted} />
                </Pressable>
                <Pressable onPress={() => move(i, 1)} disabled={i === list.length - 1} accessibilityRole="button" accessibilityLabel={`Move ${c.name} down`} style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center', opacity: i === list.length - 1 ? 0.25 : 1 }}>
                  <Icon name="chevron-down" size={20} color={th.muted} />
                </Pressable>
              </View>
            } />
        ))}
        {!list.length ? <T color={th.faint} style={{ paddingVertical: 14 }}>No categories here yet.</T> : null}
      </Card>
      <Button label="New category" kind="secondary" icon="plus" onPress={() => { setEditing(null); setOpen(true); }} />
      <T size={13} color={th.faint} style={{ marginHorizontal: 4 }}>Tap a category to rename it, change its emoji or delete it. The arrows set the order in pickers.</T>
      <EditSheet cat={editing} kind={editing ? editing.kind : kind} visible={open} onClose={() => setOpen(false)} />
    </Screen>
  );
}
