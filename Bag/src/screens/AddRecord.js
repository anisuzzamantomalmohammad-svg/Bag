// Add or edit a record. Four kinds: Cash out, Cash in, Move, People. The
// chips decide which fields show. A later date, or "Not paid yet", makes it
// Upcoming: it counts for nothing until you mark it paid.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Image, Platform, ScrollView, TextInput, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Bubble, Button, Card, Chip, Chips, F, Field, Icon, Row, Screen, Seg, Squish, T, Toggle, useTheme, Press as Pressable } from '../ui/kit';
import { accountColor, accountEmoji, alpha, catColor } from '../lib/look';
import { accountBalance, descriptionSuggestions, displayName, findDuplicate, isPending, splitNameAmount, live, nameSuggestions, peopleSuggestions } from '../lib/ledger';
import { fmtShort, today } from '../lib/dates';
import { fmt, parseAmount, round2 } from '../lib/money';
import { describe, presetRule } from '../lib/repeats';
import { savedRate } from '../lib/rates';
import { pickPhoto } from '../lib/photos';
import { keyAt } from '../lib/keypad';
import { defaultIn, homeGroups } from '../lib/plan';
import { feel } from '../lib/feel';

const TYPES = [['expense', 'Out'], ['income', 'In'], ['transfer', 'Move'], ['people', 'People']];
const PEOPLE_COLOR = '#B79CF0';
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];

function Key({ k, onPress, th }) {
  return (
    <Squish onPress={() => onPress(k)} accessibilityLabel={k === 'del' ? 'Delete' : k === '.' ? 'Point' : k} style={{ height: 50, borderRadius: 18, backgroundColor: th.soft, alignItems: 'center', justifyContent: 'center' }}>
      {k === 'del' ? <Icon name="delete" size={20} color={th.ink} /> : <T size={22}>{k}</T>}
    </Squish>
  );
}

// A blinking bar where the next digit goes.
function Caret({ color }) {
  const a = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(a, { toValue: 0, duration: 450, delay: 300, useNativeDriver: Platform.OS !== 'web' }), Animated.timing(a, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== 'web' })]));
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={{ width: 2.5, height: 44, borderRadius: 2, marginHorizontal: 1, backgroundColor: color, opacity: a }} />;
}

function AccButton({ a, label, on, onPress, app, th, flex = 1, more }) {
  const bal = a ? accountBalance(app.data, a, { flows: app.flows, homePerUnit: app.homePerUnit }) : null;
  const col = a ? accountColor(a) : th.faint;
  return (
    <Squish onPress={onPress} accessibilityLabel={`${label ? `${label} ` : ''}${a ? a.name : 'Choose account'}`} style={{ flex, minHeight: 52, borderRadius: 16, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: on ? alpha(col, 0.16) : th.soft, borderWidth: 1.5, borderColor: on ? col : 'transparent' }}>
      <T size={18}>{a ? accountEmoji(a) : '＋'}</T>
      <View style={{ flex: 1 }}>
        <T size={13.5} weight="medium" numberOfLines={1}>{label ? `${label} ` : ''}{a ? a.name : 'Choose'}{more ? ' ▾' : ''}</T>
        {bal ? <T size={11.5} color={bal.native < 0 ? th.out : th.faint}>{app.money(bal.native, { currency: a.currency })}</T> : null}
      </View>
    </Squish>
  );
}
const PEOPLE = [{ id: 'owed', label: 'I lent' }, { id: 'iowe', label: 'I borrowed' }];
const PEOPLE_HINT = {
  owed: 'Not cash out, and getting it back is not cash in',
  iowe: 'Not cash in, and paying it back is not cash out',
};

function presetOf(rep) {
  if (!rep) return 'never';
  if (rep.freq === 'week' && (rep.every || 1) === 1 && (rep.weekdays || []).length <= 1) return 'weekly';
  if (rep.freq === 'week' && rep.every === 2 && (rep.weekdays || []).length <= 1) return 'fortnightly';
  if (rep.freq === 'month' && (rep.every || 1) === 1 && rep.monthDay !== 'last') return 'monthly';
  return 'custom';
}

export default function AddRecord({ id, type: startType, prefill, upcoming: startUpcoming, repeatPreset }) {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const { data } = app;
  const home = data.homeCurrency;
  const old = id ? data.records[id] : null;
  const oldRep = old && old.repeatId ? data.repeats[old.repeatId] : null;
  const accounts = live(data.accounts);
  const lastOk = data.defaults.account === 'last' && data.lastAccountId && data.accounts[data.lastAccountId] && !data.accounts[data.lastAccountId].deleted;
  const defAcc = (lastOk ? data.lastAccountId : defaultIn(data, 'bank') || defaultIn(data, 'cash') || (accounts[0] && accounts[0].id)) || null;
  const init = old || {
    type: startType || data.defaults.type || 'expense', date: today(), accountId: defAcc,
    currency: (defAcc && data.accounts[defAcc] && data.accounts[defAcc].currency) || home, ...(prefill || {}),
  };

  const [type, setType] = useState(init.type);
  const [amount, setAmount] = useState(init.amount ? String(init.amount) : '');
  // Where the next digit goes. null = at the end.
  const [caret, setCaret] = useState(null);
  const at = caret == null ? amount.length : Math.min(caret, amount.length);
  const [currency, setCurrency] = useState(init.currency || home);
  const [name, setName] = useState(init.name || '');
  const [categoryId, setCategoryId] = useState(init.categoryId || null);
  const [date, setDate] = useState(init.date || today());
  const [dueDate, setDueDate] = useState(init.dueDate || init.date || today());
  const [accountId, setAccountId] = useState(init.accountId || defAcc);
  const [toAccountId, setToAccountId] = useState(init.toAccountId || null);
  const [toAmount, setToAmount] = useState(init.toAmount ? String(init.toAmount) : '');
  const [who, setWho] = useState(init.who || '');
  const [description, setDescription] = useState(init.description || '');
  const [rateText, setRateText] = useState(old && old.rateManual ? String(old.rate) : '');
  const [preset, setPreset] = useState(oldRep ? presetOf(oldRep) : repeatPreset || 'never');
  // Not paid yet: waits in Upcoming even though its date has come.
  const [notPaid, setNotPaid] = useState(old ? isPending(old) : !!startUpcoming);
  const [customRule, setCustomRule] = useState(oldRep ? { freq: oldRep.freq, every: oldRep.every, weekdays: oldRep.weekdays, monthDay: oldRep.monthDay, end: oldRep.end, amountMode: oldRep.amountMode, confirm: oldRep.confirm } : null);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [split, setSplit] = useState(false);
  const [splitWho, setSplitWho] = useState('');
  const [splitHow, setSplitHow] = useState('equal');
  const [splitShare, setSplitShare] = useState('');
  const [nameFocus, setNameFocus] = useState(false);
  const [descFocus, setDescFocus] = useState(false);
  const [hintAmount, setHintAmount] = useState('');
  // Repeats, split, description and receipt sit behind "More options". Open
  // when this record already uses one, or when you used them last time.
  const [more, setMore] = useState(old ? !!(old.repeatId || old.description || ((data.photos || {})[old.id] || []).length) : !!data.addMore || !!repeatPreset);
  // Receipt photos: the ones already saved, new ones, and ones to remove.
  const [photos, setPhotos] = useState(old ? (data.photos || {})[old.id] || [] : []);
  const savedPhotos = old ? (data.photos || {})[old.id] || [] : [];
  const [whoFocus, setWhoFocus] = useState(false);
  const [errors, setErrors] = useState({});
  const dirty = useRef(false);
  const touch = (fn) => (v) => { dirty.current = true; setErrors({}); fn(v); };

  const isDebt = type === 'iowe' || type === 'owed';
  const kind = type === 'iowe' ? 'borrowed' : 'lent';
  const isMoney = !isDebt;
  const future = date > today();
  const willWait = isMoney && (future || notPaid);
  const catKind = type === 'income' ? 'income' : 'expense';
  const cat = categoryId ? data.categories[categoryId] : null;
  const acc = accountId ? data.accounts[accountId] : null;
  const toAcc = toAccountId ? data.accounts[toAccountId] : null;
  const amt = parseAmount(amount);
  const foreign = currency !== home;
  const autoRate = foreign ? savedRate(isDebt ? today() : date, currency, home) : 1;
  const rate = foreign ? (rateText ? parseAmount(rateText) : autoRate) : 1;
  const crossTransfer = type === 'transfer' && toAcc && toAcc.currency && toAcc.currency !== currency;
  const arrivesGuess = crossTransfer && amt > 0 && app.homePerUnit(toAcc.currency) ? round2((amt * (foreign ? rate || 1 : 1)) / app.homePerUnit(toAcc.currency)) : null;

  // Before typing: your most used names. While typing: names that match.
  const suggestions = useMemo(() => (nameFocus ? nameSuggestions(data, name, type === 'transfer' ? null : type).filter((s) => s.name.toLowerCase() !== name.trim().toLowerCase()) : []), [nameFocus, name, type]);
  const descs = useMemo(() => (descFocus ? descriptionSuggestions(data, description, name) : []), [descFocus, description, name]);
  // An amount Bag can offer but never fills in by itself: a number typed
  // after the name ("Countdown 45.20"), or what this name cost last time.
  const typedAmount = !amount ? splitNameAmount(name) : null;
  const offer = amount ? null : typedAmount ? { amount: typedAmount.amount, name: typedAmount.name, why: 'from the name' } : hintAmount ? { amount: hintAmount, why: 'last time' } : null;
  const useOffer = () => {
    if (!offer) return;
    dirty.current = true;
    setErrors({});
    setAmount(offer.amount);
    setCaret(null);
    if (offer.name) setName(offer.name);
    setHintAmount('');
  };
  const addPhoto = async (from) => {
    try {
      const uri = await pickPhoto(from);
      if (uri) { dirty.current = true; setPhotos((p) => [...p, uri]); }
    } catch (e) {
      app.showToast('Allow the camera for Bag in your phone settings');
    }
  };
  const people = useMemo(() => (whoFocus ? peopleSuggestions(data, who).filter((p) => p.name !== who) : []), [whoFocus, who]);

  const share = split ? (splitHow === 'equal' ? round2((amt || 0) / 2) : parseAmount(splitShare) || 0) : 0;

  const pickSuggestion = (s) => {
    dirty.current = true;
    setName(s.name);
    if (data.defaults.fillCategory !== false && s.categoryId && data.categories[s.categoryId] && !data.categories[s.categoryId].deleted) setCategoryId(s.categoryId);
    if (s.accountId && data.accounts[s.accountId] && !data.accounts[s.accountId].deleted) setAccountId(s.accountId);
    if (!amount && s.amount) setHintAmount(String(s.amount));
    setNameFocus(false);
  };

  const changeType = (t) => {
    dirty.current = true;
    setErrors({});
    const next = t === 'people' ? (isDebt ? type : 'owed') : t;
    setType(next);
    setSplit(false);
    // Bank and Cash: a move goes from the one you picked to the other one.
    if (next === 'transfer' && !toAccountId) { const other = accounts.find((x) => x.id !== accountId); if (other) setToAccountId(other.id); }
    if (next !== 'transfer' && !accountId) setAccountId(toAccountId || defAcc);
    if (cat && cat.kind !== (next === 'income' ? 'income' : 'expense')) setCategoryId(null);
  };

  const rule = () => {
    if (preset === 'never') return old && old.repeatId ? null : undefined;
    const base = { confirm: isMoney, amountMode: 'same', end: { type: 'never' } };
    if (preset === 'custom') return { ...base, ...(customRule || presetRule('monthly', date)) };
    return { ...base, ...(oldRep ? { confirm: oldRep.confirm, amountMode: oldRep.amountMode, end: oldRep.end } : {}), ...presetRule(preset, isDebt ? dueDate : date) };
  };

  const save = (confirmed) => {
    const e = {};
    const amtUse = amt;
    const nameUse = name;
    if (!(amtUse > 0)) e.amount = offer ? `Enter an amount, or tap “Use ${offer.amount}”` : 'Enter an amount';
    if (type === 'transfer') {
      if (!accountId || !toAccountId) e.account = 'Pick both accounts';
      else if (accountId === toAccountId) e.account = 'Pick two different accounts';
    } else if (!categoryId && !isDebt) e.category = 'Pick a category';
    if (!accountId && type !== 'transfer') e.account = 'Add an account first';
    if (isDebt && !who.trim()) e.who = type === 'owed' ? 'Who did you lend it to?' : 'Who did you borrow from?';
    if (split && !(share > 0 && share < amtUse)) e.split = 'Their share has to be less than the total';
    if (split && !splitWho.trim()) e.split = 'Who are you splitting with?';
    if (foreign && rateText && !(rate > 0)) e.rate = 'Enter a rate like 1.79';
    if (Object.keys(e).length) { setErrors(e); return; }
    const draft = {
      id: old ? old.id : undefined,
      type, kind: isDebt ? kind : null, amount: amtUse, currency, name: nameUse.trim() || (isDebt ? who.trim() : '') || (type === 'transfer' ? 'Transfer' : ''),
      categoryId: type === 'transfer' ? null : categoryId, date: isDebt ? (old ? old.date : today()) : date, accountId,
      toAccountId: type === 'transfer' ? toAccountId : null,
      toAmount: type === 'transfer' ? (crossTransfer ? parseAmount(toAmount) || null : null) : null,
      toCurrency: type === 'transfer' && toAcc ? toAcc.currency : null,
      who: isDebt ? who.trim() : '', dueDate: isDebt ? dueDate : null, description: description.trim(),
      rateManual: foreign && !!rateText, rate: foreign ? rate || null : 1,
      upcoming: isMoney ? willWait : undefined,
    };
    const dup = !old && (type === 'expense' || type === 'income') ? findDuplicate(data, draft) : null;
    if (dup && !confirmed) {
      nav.openSheet('choice', {
        title: 'Already added?',
        text: `${displayName(dup, data)} for ${app.money(dup.amount, { currency: dup.currency })} is already in ${fmtShort(dup.date, { weekday: true })}.`,
        options: [{ id: 'add', label: 'Add it again', emoji: '＋', sub: 'It really happened twice' }, { id: 'no', label: "Don't add it", emoji: '✕' }],
        onPick: (k) => { if (k === 'add') setTimeout(() => save(true), 260); else { dirty.current = false; setTimeout(() => nav.pop(), 260); } },
      });
      return;
    }
    const savedId = app.saveRecord(draft, { repeat: rule(), split: split ? { who: splitWho.trim(), share } : undefined });
    if (!old) app.update({ addMore: !!(preset !== 'never' || split || description.trim() || photos.length) });
    if (savedId) {
      photos.filter((u) => !savedPhotos.includes(u)).forEach((u) => app.addPhoto(savedId, u));
      savedPhotos.filter((u) => !photos.includes(u)).forEach((u) => app.removePhoto(savedId, u));
    }
    app.showToast(willWait ? `In Upcoming. Not counted until it's paid.` : old ? 'Saved' : type === 'expense' && split ? `Saved. ${splitWho.trim()} owes you ${app.money(share)}` : 'Saved');
    nav.pop();
  };

  const close = () => {
    if (!dirty.current) { nav.pop(); return; }
    Alert.alert('Discard this record?', "What you typed won't be saved.", [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => nav.pop() }]);
  };

  const pickAccount = (setter, title) => nav.openSheet('account', { title, onPick: (aid) => { dirty.current = true; setErrors({}); setter(aid); if (setter === setAccountId && data.accounts[aid] && data.accounts[aid].currency && !old) setCurrency(data.accounts[aid].currency); } });
  const repeatLabel = preset === 'never' ? 'Never' : preset === 'custom' ? describe({ ...(customRule || {}), start: isDebt ? dueDate : date }) : preset[0].toUpperCase() + preset.slice(1);

  const kindColor = type === 'income' ? th.in : type === 'transfer' ? th.chipOn : isDebt ? PEOPLE_COLOR : th.out;
  const onColor = th.mode === 'dark' ? '#0E131A' : '#FFFFFF';
  const bump = useRef(new Animated.Value(1)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const motion = data.animations !== false;
  const press = (k) => {
    dirty.current = true;
    setErrors({});
    const out = keyAt(amount, caret, k);
    setAmount(out.v);
    setCaret(out.c);
    feel.tap();
    if (motion) { bump.setValue(1.08); Animated.spring(bump, { toValue: 1, friction: 4, useNativeDriver: Platform.OS !== 'web' }).start(); }
  };
  useEffect(() => {
    if (!errors.amount || !motion) return;
    shake.setValue(0);
    Animated.sequence([-8, 8, -5, 0].map((v) => Animated.timing(shake, { toValue: v, duration: 60, useNativeDriver: Platform.OS !== 'web' }))).start();
  }, [errors.amount]);
  // Your usual places, one tap away before you type a name.
  const usual = useMemo(() => (type === 'transfer' || isDebt || name ? [] : nameSuggestions(data, '', type).slice(0, 3)), [type, name]);
  const live2 = accounts.slice().sort((x, y) => (x.order || 0) - (y.order || 0));
  // Where it's paid from: one button per group (all your banks share one),
  // each savings jar on its own. With more than one bank, tapping Bank
  // again asks which, with your default (★) already picked.
  const places = useMemo(() => {
    const out = [];
    homeGroups(data, { flows: app.flows, homePerUnit: app.homePerUnit }).forEach((g) => {
      if (g.id === 'savings') g.accounts.forEach((a) => out.push({ key: a.id, group: g.id, accounts: [a] }));
      else out.push({ key: g.id, group: g.id, accounts: g.accounts });
    });
    return out;
  }, [data.accounts]);
  const pickAcc = (aid) => { dirty.current = true; setErrors({}); setAccountId(aid); if (data.accounts[aid] && data.accounts[aid].currency && !old) setCurrency(data.accounts[aid].currency); };
  const pressPlace = (pl, cur, setter = pickAcc) => {
    const inIt = pl.accounts.some((a) => a.id === cur);
    if (pl.accounts.length > 1 && inIt) {
      nav.openSheet('which', { group: pl.group, title: pl.group === 'bank' ? 'Which bank?' : pl.group === 'cash' ? 'Which cash?' : 'Which one?', onPick: setter });
      return;
    }
    if (!inIt) setter(pl.accounts.length > 1 ? (defaultIn(data, pl.group) || pl.accounts[0].id) : pl.accounts[0].id);
  };
  const placeAcc = (pl, cur) => pl.accounts.find((a) => a.id === cur) || data.accounts[defaultIn(data, pl.group)] || pl.accounts[0];
  const accLabel = type === 'income' || type === 'iowe' ? 'Into' : type === 'owed' ? 'From' : 'Paid from';
  const swap = () => { if (!accountId || !toAccountId) return; dirty.current = true; const f = accountId; setAccountId(toAccountId); setToAccountId(f); };
  const datePill = date === today() ? 'Today' : fmtShort(date, { weekday: true });
  const pill = { minHeight: 38, paddingHorizontal: 12, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: th.soft };

  return (
    <Screen
      title={old ? 'Edit record' : 'New record'}
      back="close"
      onBack={close}
      footer={<Button label={willWait && !(old && isPending(old)) ? 'Save as Upcoming' : 'Save'} onPress={() => save(false)} />}
    >
      <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
        {TYPES.map(([t, l]) => {
          const on = t === 'people' ? isDebt : type === t;
          return (
            <Squish key={t} onPress={() => changeType(t)} accessibilityRole="tab" accessibilityLabel={l} style={{ height: 36, paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center', backgroundColor: on ? kindColor : th.soft, transform: [{ scale: on ? 1.05 : 1 }] }}>
              <T size={13.5} weight={on ? 'semi' : 'medium'} color={on ? onColor : th.muted}>{l}</T>
            </Squish>
          );
        })}
      </View>

      {isDebt ? (
        <View>
          <Seg items={PEOPLE} value={type} onChange={touch(setType)} />
          <T size={13} color={th.faint} center style={{ marginTop: 8 }}>{PEOPLE_HINT[type]}</T>
        </View>
      ) : null}

      <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 2 }}>
        <Svg width={260} height={170} style={{ position: 'absolute', top: -14 }} pointerEvents="none">
          <Defs><RadialGradient id="glow" cx="50%" cy="50%" r="50%"><Stop offset="0" stopColor={kindColor} stopOpacity={0.3} /><Stop offset="1" stopColor={kindColor} stopOpacity={0} /></RadialGradient></Defs>
          <Ellipse cx={130} cy={85} rx={130} ry={85} fill="url(#glow)" />
        </Svg>
        <Animated.View style={{ transform: [{ scale: bump }, { translateX: shake }] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable onPress={() => setCaret(Math.max(0, at - 1))} accessibilityRole="button" accessibilityLabel="Cursor left" hitSlop={6} style={{ width: 32, height: 32, borderRadius: 11, backgroundColor: th.soft, alignItems: 'center', justifyContent: 'center', opacity: amount ? 1 : 0.35 }}><Icon name="chevron-left" size={16} color={th.muted} /></Pressable>
            <View accessibilityLabel={`Amount ${amount || 0}`} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 66 }}>
              {amount ? amount.split('').map((ch, i) => (
                <React.Fragment key={i}>
                  {i === at ? <Caret color={kindColor} /> : null}
                  <Pressable onPress={(e) => { const half = e.nativeEvent.locationX < 14; setCaret(half ? i : i + 1); }} accessibilityLabel={`Digit ${ch}`}>
                    <T serif size={54} style={{ lineHeight: 64 }}>{ch}</T>
                  </Pressable>
                </React.Fragment>
              )) : <T serif size={54} color={th.faint2} style={{ lineHeight: 64 }}>{offer ? offer.amount : '0'}</T>}
              {at >= amount.length ? <Caret color={kindColor} /> : null}
            </View>
            <Pressable onPress={() => setCaret(Math.min(amount.length, at + 1))} accessibilityRole="button" accessibilityLabel="Cursor right" hitSlop={6} style={{ width: 32, height: 32, borderRadius: 11, backgroundColor: th.soft, alignItems: 'center', justifyContent: 'center', opacity: amount ? 1 : 0.35 }}><Icon name="chevron-right" size={16} color={th.muted} /></Pressable>
          </View>
        </Animated.View>
        <Pressable onPress={() => nav.openSheet('currency', { onPick: (c) => { dirty.current = true; setCurrency(c); setRateText(''); } })} accessibilityRole="button" accessibilityLabel={`Currency ${currency}`} hitSlop={8} style={{ minHeight: 26, paddingHorizontal: 10, borderRadius: 999, justifyContent: 'center' }}>
          <T size={12} weight="medium" color={th.faint}>{currency} ▾</T>
        </Pressable>
        {offer ? (
          <Pressable onPress={useOffer} accessibilityRole="button" accessibilityLabel={`Use ${offer.amount} as the amount, ${offer.why}`} style={{ marginTop: 6, minHeight: 32, paddingHorizontal: 14, borderRadius: 999, backgroundColor: th.accentSoft, justifyContent: 'center' }}>
            <T size={13} weight="medium" color={th.accent}>Use {offer.amount} · {offer.why}</T>
          </Pressable>
        ) : null}
        {errors.amount ? <T size={13} color={th.danger} style={{ marginTop: 6 }}>{errors.amount}</T> : null}
        {foreign ? (
          <Pressable onPress={() => nav.openSheet('rate2', { currency, home, amount: amt, date: isDebt ? today() : date, dateLabel: fmtShort(isDebt ? today() : date), value: rateText || '', onPick: (v) => { dirty.current = true; setRateText(v); } })} accessibilityRole="button" style={{ marginTop: 6 }}>
            <T size={13} color={rate ? th.faint : th.warn} center>
              {rate ? `1 ${currency} = ${fmt(rate, { decimals: 4 })} ${home}${rateText ? ' (your rate)' : ''} · ≈ ${app.money((amt || 0) * rate)} ${home}` : 'Rate to check: no rate saved yet. Tap to type one.'}
            </T>
          </Pressable>
        ) : null}
        {errors.rate ? <T size={13} color={th.danger}>{errors.rate}</T> : null}
      </View>

      {usual.length ? (
        <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
          {usual.map((s) => {
            const c = data.categories[s.categoryId];
            return (
              <Squish key={s.name} onPress={() => pickSuggestion(s)} accessibilityLabel={`Use ${s.name}`} style={{ height: 30, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: th.lineStrong, justifyContent: 'center' }}>
                <T size={12.5} weight="medium" color={th.muted}>{c && !c.deleted ? `${c.emoji} ` : ''}{s.name}</T>
              </Squish>
            );
          })}
        </View>
      ) : null}

      {type !== 'transfer' ? (
        <View>
          <Field value={name} onChangeText={(v) => { dirty.current = true; setErrors({}); setHintAmount(''); setName(v); }} onFocus={() => setNameFocus(true)} onBlur={() => setTimeout(() => setNameFocus(false), 150)} placeholder={type === 'income' ? 'Name, like Salary' : type === 'iowe' ? 'Name, optional, like Rent help' : type === 'owed' ? 'Name, optional, like Dinner' : 'Name, like Countdown'} autoCapitalize="sentences" accessibilityLabel="Name" />
          {suggestions.length ? (
            <Card pad={0} style={{ marginTop: 6, paddingHorizontal: 14 }}>
              {suggestions.map((s, i) => {
                const c = data.categories[s.categoryId];
                return <Row key={s.name} first={i === 0} minHeight={48} label={s.name} sub={`${c && !c.deleted ? `${c.emoji} ${c.name} · ` : ''}${s.count} ${s.count === 1 ? 'time' : 'times'}`} onPress={() => pickSuggestion(s)} chevron={false} />;
              })}
            </Card>
          ) : null}
        </View>
      ) : null}

      {isDebt ? (
        <Card pad={0} style={{ paddingHorizontal: 16 }}>
          <Row first label="Who" right={
            <TextInput value={who} onChangeText={touch(setWho)} onFocus={() => setWhoFocus(true)} onBlur={() => setTimeout(() => setWhoFocus(false), 150)} placeholder="Name" placeholderTextColor={th.faint2} accessibilityLabel="Who" style={{ fontFamily: F.regular, fontSize: 15 * (th.textScale || 1), color: th.ink, minWidth: 140, textAlign: 'right' }} />
          } />
          {people.length ? <Chips style={{ paddingBottom: 10 }}>{people.map((p) => <Chip key={p.name} label={p.name} onPress={() => { dirty.current = true; setWho(p.name); setWhoFocus(false); }} />)}</Chips> : null}
          <Row label="Pay back by" value={dueDate ? fmtShort(dueDate, { weekday: true }) : 'No date'} onPress={() => nav.openSheet('date', { value: dueDate, title: 'Pay back by', long: true, clearLabel: 'No date', onPick: touch(setDueDate) })} />
        </Card>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {type !== 'transfer' ? (
            <Squish onPress={() => nav.openSheet('category', { kind: catKind, value: categoryId, onPick: (cid) => { dirty.current = true; setErrors({}); setCategoryId(cid); } })} accessibilityLabel={`Category ${cat && !cat.deleted ? cat.name : 'not picked'}`} style={[pill, { paddingLeft: 6 }, errors.category ? { borderWidth: 1.5, borderColor: th.danger } : null]}>
              {cat && !cat.deleted ? <Bubble emoji={cat.emoji} color={catColor(cat)} size={28} /> : <View style={{ width: 28, height: 28, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: th.lineStrong }} />}
              <T size={14} weight="medium" color={cat && !cat.deleted ? th.ink : th.muted}>{cat && !cat.deleted ? cat.name : 'Category'}</T>
            </Squish>
          ) : null}
          <Squish onPress={() => nav.openSheet('date', { value: date, onPick: touch(setDate) })} accessibilityLabel={`Date ${datePill}`} style={[pill, willWait ? { backgroundColor: th.warnSoft } : null]}>
            <Icon name="calendar" size={15} color={willWait ? th.warn : th.muted} />
            <T size={14} weight="medium" color={willWait ? th.warn : th.ink}>{datePill}</T>
          </Squish>
          {!future ? (
            <Squish onPress={() => { dirty.current = true; setNotPaid(!notPaid); }} accessibilityRole="switch" accessibilityLabel="Not paid yet" style={[pill, notPaid ? { backgroundColor: th.warnSoft, borderWidth: 1, borderColor: th.warnBorder } : null]}>
              <T size={13.5} weight="medium" color={notPaid ? th.warn : th.muted}>{notPaid ? '✓ ' : ''}{type === 'income' ? 'Not arrived yet' : type === 'transfer' ? 'Not moved yet' : 'Not paid yet'}</T>
            </Squish>
          ) : null}
        </View>
      )}

      {type === 'transfer' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <AccButton a={acc} label="From" on={!!acc} app={app} th={th} onPress={() => pickAccount(setAccountId, 'From')} />
          <Squish onPress={swap} accessibilityLabel="Swap From and To" style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: th.soft, alignItems: 'center', justifyContent: 'center' }}><T size={17}>⇄</T></Squish>
          <AccButton a={toAcc} label="To" on={!!toAcc} app={app} th={th} onPress={() => pickAccount(setToAccountId, 'To')} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T size={12} color={th.faint} style={{ width: 58 }}>{accLabel}</T>
          {places.length <= 2 ? (
            <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
              {places.map((pl) => <AccButton key={pl.key} a={placeAcc(pl, accountId)} more={pl.accounts.length > 1} on={pl.accounts.some((a) => a.id === accountId)} app={app} th={th} onPress={() => pressPlace(pl, accountId)} />)}
              {!places.length ? <AccButton a={null} app={app} th={th} onPress={() => nav.push('account', {})} /> : null}
            </View>
          ) : (
            <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {places.map((pl) => <View key={pl.key} style={{ width: '48%', flexGrow: 1 }}><AccButton a={placeAcc(pl, accountId)} more={pl.accounts.length > 1} on={pl.accounts.some((a) => a.id === accountId)} app={app} th={th} onPress={() => pressPlace(pl, accountId)} /></View>)}
            </View>
          )}
        </View>
      )}
      {crossTransfer ? (
        <Card pad={0} style={{ paddingHorizontal: 16 }}>
          <Row first label={`Arrives as (${toAcc.currency})`} right={<TextInput value={toAmount} onChangeText={touch(setToAmount)} keyboardType="decimal-pad" placeholder={arrivesGuess ? `≈ ${fmt(arrivesGuess, { decimals: 0 })}` : 'Amount'} placeholderTextColor={th.faint2} accessibilityLabel="Amount that arrives" style={{ fontFamily: F.regular, fontSize: 15, color: th.ink, minWidth: 110, textAlign: 'right' }} />} />
        </Card>
      ) : null}
      {willWait ? <T size={13} color={th.warn} center>Upcoming: not in your balance yet. {future ? `On ${fmtShort(date, { weekday: true })} Home asks` : 'Home asks'} “{type === 'income' ? 'Did it arrive?' : 'Did you pay it?'}”</T> : null}
      {errors.account || errors.category || errors.who ? <T size={13} color={th.danger} center>{errors.account || errors.category || errors.who}</T> : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {KEYS.map((k) => <View key={k} style={{ width: '31.6%', flexGrow: 1 }}><Key k={k} th={th} onPress={press} /></View>)}
      </View>

      <Card pad={0} style={{ paddingHorizontal: 16 }}>
        <Pressable onPress={() => setMore(!more)} accessibilityRole="button" accessibilityState={{ expanded: more }} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T size={14} weight="medium" color={th.muted}>{type === 'expense' && !old ? 'Repeat, split, receipt, note' : type === 'transfer' ? 'Repeat, note' : 'Repeat, receipt, note'}</T>
          <Icon name={more ? 'chevron-up' : 'chevron-down'} size={18} color={th.faint} />
        </Pressable>
        {more ? (
          <>
        <Row label="Repeats" value={repeatLabel} onPress={() => setRepeatOpen(!repeatOpen)} right={null} chevron={false} />
        {repeatOpen ? (
          <Chips style={{ paddingBottom: 14 }}>
            {[['never', 'Never'], ['weekly', 'Weekly'], ['fortnightly', 'Fortnightly'], ['monthly', 'Monthly']].map(([pr, l]) => (
              <Chip key={pr} label={l} on={preset === pr} onPress={() => { dirty.current = true; setPreset(pr); setRepeatOpen(false); }} />
            ))}
            <Chip label="Custom" on={preset === 'custom'} onPress={() => nav.push('repeat', { draftRule: customRule, start: isDebt ? dueDate : date, type, onDone: (r) => { dirty.current = true; setCustomRule(r); setPreset('custom'); setRepeatOpen(false); } })} />
          </Chips>
        ) : null}
        {type === 'expense' && !old ? (
          <Row label="Split with someone" right={<Toggle value={split} onChange={(v) => { dirty.current = true; setSplit(v); }} label="Split with someone" />} />
        ) : null}
        {split ? (
          <View style={{ paddingBottom: 12, gap: 10 }}>
            <Field label="With" value={splitWho} onChangeText={touch(setSplitWho)} placeholder="Name" inputStyle={{ backgroundColor: th.soft }} />
            <Seg small items={[{ id: 'equal', label: 'Equally' }, { id: 'amount', label: 'Their share' }]} value={splitHow} onChange={setSplitHow} />
            {splitHow === 'amount' ? <Field value={splitShare} onChangeText={touch(setSplitShare)} keyboardType="decimal-pad" placeholder="Their share" inputStyle={{ backgroundColor: th.soft }} /> : null}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T color={th.muted}>Your share</T><T color={th.out}>{app.money(-Math.max(0, (amt || 0) - share), { currency })}</T></View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T color={th.muted}>{splitWho.trim() || 'They'} owe{splitWho.trim() ? 's' : ''} you</T><T>{app.money(share, { currency })}</T></View>
            {errors.split ? <T size={13} color={th.danger}>{errors.split}</T> : null}
          </View>
        ) : null}
          </>
        ) : null}
      </Card>

      {more ? (
      <View>
        <Field label="Note" value={description} onChangeText={touch(setDescription)} onFocus={() => setDescFocus(true)} onBlur={() => setTimeout(() => setDescFocus(false), 150)} placeholder="Optional" multiline inputStyle={{ paddingTop: 14, paddingBottom: 14 }} />
        {descs.length ? (
          <Chips style={{ marginTop: 8 }}>
            {descs.map((d) => <Chip key={d.text} label={d.text.length > 28 ? `${d.text.slice(0, 27)}…` : d.text} onPress={() => { dirty.current = true; setDescription(d.text); setDescFocus(false); }} />)}
          </Chips>
        ) : null}
      </View>
      ) : null}
      {more && type !== 'transfer' ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T>Receipt</T>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button label="Camera" icon="camera" kind="secondary" small onPress={() => addPhoto('camera')} />
              <Button label="Photos" icon="image" kind="secondary" small onPress={() => addPhoto('library')} />
            </View>
          </View>
          {photos.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {photos.map((u) => (
                <View key={u}>
                  <Image source={{ uri: u }} style={{ width: 72, height: 72, borderRadius: 12, backgroundColor: th.soft }} accessibilityLabel="Receipt photo" />
                  <Pressable onPress={() => { dirty.current = true; setPhotos((ps) => ps.filter((x) => x !== u)); }} accessibilityRole="button" accessibilityLabel="Remove photo" hitSlop={8} style={{ position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: th.ink, alignItems: 'center', justifyContent: 'center' }}>
                    <T size={12} color={th.bg}>✕</T>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : <T size={13} color={th.faint} style={{ marginTop: 6 }}>Kept on this phone only.</T>}
        </Card>
      ) : null}
      {old && old.repeatId && preset !== 'never' ? <T size={13} color={th.faint}>Changes apply to this record and to the repeat from now on.</T> : null}
    </Screen>
  );
}
