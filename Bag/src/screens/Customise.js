// Customise: the Home cards, colours, text size, what a new record starts
// with, how numbers look, and what swiping a record does. All per phone.
import React from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useApp, DEFAULTS } from '../state/store';
import { useNav } from '../nav';
import { Button, Card, Icon, Label, Row, Seg, T, Toggle, Screen, useTheme } from '../ui/kit';
import { ACCENTS } from '../data/defaults';
import { TYPE_LABEL, live } from '../lib/ledger';
import { fmt } from '../lib/money';

const SWIPES = [['delete', 'Delete'], ['edit', 'Edit'], ['duplicate', 'Copy to today'], ['none', 'Nothing']];

export default function Customise() {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const { data, update } = app;
  const set = (k, v) => update((d) => ({ [k]: { ...d[k], ...v } }));
  const cards = data.homeCards || [];
  const choose = (title, options, value, onPick) => nav.openSheet('choice', { title, options: options.map(([id, label]) => ({ id, label })), value, onPick });

  const moveCard = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= cards.length) return;
    const next = cards.slice();
    [next[i], next[j]] = [next[j], next[i]];
    update({ homeCards: next });
  };
  const toggleCard = (i, on) => update({ homeCards: cards.map((c, k) => (k === i ? { ...c, hidden: !on } : c)) });
  const accName = data.defaults.account === 'last' ? 'Last one used' : (data.accounts[data.defaults.account] || {}).name || 'Last one used';
  const sample = -1234.5;

  return (
    <Screen title="Customise">
      <Label>Home</Label>
      <Card pad={0} style={{ paddingHorizontal: 16 }}>
        <Row first label="Balance" sub="Always on top" />
        {cards.map((c, i) => (
          <Row key={c.id} label={c.label} right={
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Pressable onPress={() => moveCard(i, -1)} disabled={i === 0} accessibilityRole="button" accessibilityLabel={`Move ${c.label} up`} style={{ width: 36, height: 44, alignItems: 'center', justifyContent: 'center', opacity: i === 0 ? 0.25 : 1 }}>
                <Icon name="chevron-up" size={20} color={th.muted} />
              </Pressable>
              <Pressable onPress={() => moveCard(i, 1)} disabled={i === cards.length - 1} accessibilityRole="button" accessibilityLabel={`Move ${c.label} down`} style={{ width: 36, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 8, opacity: i === cards.length - 1 ? 0.25 : 1 }}>
                <Icon name="chevron-down" size={20} color={th.muted} />
              </Pressable>
              <Toggle value={!c.hidden} onChange={(v) => toggleCard(i, v)} label={`Show ${c.label}`} />
            </View>
          } />
        ))}
      </Card>

      <Label>Colours</Label>
      <Card>
        <T style={{ marginBottom: 8 }}>Theme</T>
        <Seg small items={[{ id: 'auto', label: 'Phone' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]} value={data.themeMode} onChange={(v) => update({ themeMode: v })} />
        <T style={{ marginTop: 16, marginBottom: 10 }}>Accent</T>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {Object.entries(ACCENTS).map(([k, a]) => {
            const on = data.accent === k;
            return (
              <Pressable key={k} onPress={() => update({ accent: k })} accessibilityRole="button" accessibilityLabel={a.label} accessibilityState={{ selected: on }} style={{ alignItems: 'center', gap: 4 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, borderWidth: on ? 3 : 0, borderColor: th.ink, padding: 3 }}>
                  <View style={{ flex: 1, borderRadius: 20, backgroundColor: th.mode === 'dark' ? a.dark : a.light }} />
                </View>
                <T size={12} color={on ? th.ink : th.faint}>{a.label}</T>
              </Pressable>
            );
          })}
        </View>
        <T style={{ marginTop: 16, marginBottom: 8 }}>Money in and out</T>
        <Seg small items={[{ id: 'greenRed', label: 'Green and red' }, { id: 'blueOrange', label: 'Blue and orange' }]} value={data.moneyColours} onChange={(v) => update({ moneyColours: v })} />
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
          <T color={th.in} weight="medium">+{fmt(250)}</T><T color={th.out} weight="medium">{fmt(-80.5)}</T>
        </View>
        <T style={{ marginTop: 16, marginBottom: 8 }}>Text size</T>
        <Seg small items={[{ id: 0.9, label: 'Small' }, { id: 1, label: 'Normal' }, { id: 1.12, label: 'Large' }, { id: 1.25, label: 'Larger' }]} value={data.textSize} onChange={(v) => update({ textSize: v })} />
      </Card>

      <Label>New records</Label>
      <Card pad={0} style={{ paddingHorizontal: 16 }}>
        <Row first label="Start as" value={TYPE_LABEL[data.defaults.type] || 'Expense'} onPress={() => choose('New records start as', Object.entries(TYPE_LABEL), data.defaults.type, (v) => set('defaults', { type: v }))} />
        <Row label="Account" value={accName} onPress={() => choose('Account for new records', [['last', 'Last one used'], ...live(data.accounts).map((a) => [a.id, a.name])], data.defaults.account, (v) => set('defaults', { account: v }))} />
        <Row label="Fill in the category" sub="When you pick a name you've used before" right={<Toggle value={data.defaults.fillCategory !== false} onChange={(v) => set('defaults', { fillCategory: v })} label="Fill in the category" />} />
      </Card>

      <Label>Numbers</Label>
      <Card pad={0} style={{ paddingHorizontal: 16 }}>
        <Row first label="Decimals" value={Number(data.numbers.decimals) === 0 ? `None · ${fmt(sample, { decimals: 0 })}` : `Two · ${fmt(sample)}`} onPress={() => choose('Decimals', [[2, `Two · ${fmt(sample)}`], [0, `None · ${fmt(sample, { decimals: 0 })}`]], Number(data.numbers.decimals), (v) => set('numbers', { decimals: v }))} />
        <Row label="Negative amounts" value={fmt(sample, { negative: data.numbers.negative })} onPress={() => choose('Negative amounts', [['minus', fmt(sample, { negative: 'minus' })], ['brackets', fmt(sample, { negative: 'brackets' })]], data.numbers.negative, (v) => set('numbers', { negative: v }))} />
      </Card>

      <Label>Swipe a record</Label>
      <Card pad={0} style={{ paddingHorizontal: 16 }}>
        <Row first label="Swipe left" value={(SWIPES.find((s) => s[0] === data.swipe.left) || SWIPES[3])[1]} onPress={() => choose('Swipe left to', SWIPES, data.swipe.left, (v) => set('swipe', { left: v }))} />
        <Row label="Swipe right" value={(SWIPES.find((s) => s[0] === data.swipe.right) || SWIPES[3])[1]} onPress={() => choose('Swipe right to', SWIPES, data.swipe.right, (v) => set('swipe', { right: v }))} />
      </Card>

      <Button label="Reset all of these" kind="ghost" onPress={() => Alert.alert('Reset Customise?', 'Your records stay as they are.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', onPress: () => update({ homeCards: DEFAULTS.homeCards, themeMode: DEFAULTS.themeMode, accent: DEFAULTS.accent, moneyColours: DEFAULTS.moneyColours, textSize: DEFAULTS.textSize, defaults: DEFAULTS.defaults, numbers: DEFAULTS.numbers, swipe: DEFAULTS.swipe }) },
      ])} />
    </Screen>
  );
}
