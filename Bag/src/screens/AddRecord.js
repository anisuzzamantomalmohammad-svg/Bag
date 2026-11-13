// Add or edit a record. One form for all five types: the type chips decide
// which fields show, so options sit inside each other instead of all at once.
import React, { useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, TextInput, View } from 'react-native';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Button, Card, Chip, Chips, F, Field, Row, Screen, Seg, T, Toggle, useTheme } from '../ui/kit';
import { descriptionSuggestions, splitNameAmount, live, nameSuggestions, peopleSuggestions } from '../lib/ledger';
import { fmtShort, today } from '../lib/dates';
import { fmt, parseAmount, round2 } from '../lib/money';
import { describe, presetRule } from '../lib/repeats';
import { savedRate } from '../lib/rates';
import { pickPhoto } from '../lib/photos';

const TYPES = [['expense', 'Expense'], ['income', 'Income'], ['iowe', 'I owe'], ['owed', 'Owed to me'], ['transfer', 'Transfer']];
const KINDS = { iowe: [['bill', 'Bill'], ['borrowed', 'Borrowed money']], owed: [['lent', 'Lent or split'], ['work', 'Payment for work']] };
const KIND_HINT = {
  bill: 'Counts as spending when you mark it paid',
  borrowed: 'Not income, and paying it back is not spending',
  lent: 'Getting it back is not income',
  work: 'Counts as income when it arrives',
};
const ACCOUNT_LABEL = { expense: 'Account', income: 'Into', bill: 'Pay from', borrowed: 'Into', lent: 'From', work: 'Into' };

function presetOf(rep) {
  if (!rep) return 'never';
  if (rep.freq === 'week' && (rep.every || 1) === 1 && (rep.weekdays || []).length <= 1) return 'weekly';
  if (rep.freq === 'week' && rep.every === 2 && (rep.weekdays || []).length <= 1) return 'fortnightly';
  if (rep.freq === 'month' && (rep.every || 1) === 1 && rep.monthDay !== 'last') return 'monthly';
  return 'custom';
}

export default function AddRecord({ id, type: startType, prefill }) {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const { data } = app;
  const home = data.homeCurrency;
  const old = id ? data.records[id] : null;
  const oldRep = old && old.repeatId ? data.repeats[old.repeatId] : null;
  const accounts = live(data.accounts);
  const defAcc = (data.defaults.account === 'last' && data.lastAccountId && data.accounts[data.lastAccountId] && !data.accounts[data.lastAccountId].deleted ? data.lastAccountId : accounts[0] && accounts[0].id) || null;
  const init = old || {
    type: startType || data.defaults.type || 'expense', date: today(), accountId: defAcc,
    currency: (defAcc && data.accounts[defAcc] && data.accounts[defAcc].currency) || home, ...(prefill || {}),
  };

  const [type, setType] = useState(init.type);
  const [kind, setKind] = useState(init.kind || (init.type === 'iowe' ? 'bill' : 'lent'));
  const [amount, setAmount] = useState(init.amount ? String(init.amount) : '');
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
  const [preset, setPreset] = useState(presetOf(oldRep));
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
  const [more, setMore] = useState(old ? !!(old.repeatId || old.description || ((data.photos || {})[old.id] || []).length) : !!data.addMore);
  // Receipt photos: the ones already saved, new ones, and ones to remove.
  const [photos, setPhotos] = useState(old ? (data.photos || {})[old.id] || [] : []);
  const savedPhotos = old ? (data.photos || {})[old.id] || [] : [];
  const [whoFocus, setWhoFocus] = useState(false);
  const [errors, setErrors] = useState({});
  const dirty = useRef(false);
  const touch = (fn) => (v) => { dirty.current = true; setErrors({}); fn(v); };

  const isDebt = type === 'iowe' || type === 'owed';
  const subKind = isDebt ? kind : type;
  const catKind = type === 'income' || (type === 'owed' && kind === 'work') ? 'income' : 'expense';
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
    setType(t);
    setSplit(false);
    if (t === 'iowe') setKind('bill');
    if (t === 'owed') setKind('lent');
    if (cat && cat.kind !== (t === 'income' ? 'income' : 'expense')) setCategoryId(null);
  };

  const rule = () => {
    if (preset === 'never') return old && old.repeatId ? null : undefined;
    const base = { confirm: type === 'expense' || type === 'income' || type === 'transfer', amountMode: 'same', end: { type: 'never' } };
    if (preset === 'custom') return { ...base, ...(customRule || presetRule('monthly', date)) };
    return { ...base, ...(oldRep ? { confirm: oldRep.confirm, amountMode: oldRep.amountMode, end: oldRep.end } : {}), ...presetRule(preset, isDebt ? dueDate : date) };
  };

  const save = () => {
    const e = {};
    const amtUse = amt;
    const nameUse = name;
    if (!(amtUse > 0)) e.amount = offer ? `Enter an amount, or tap “Use ${offer.amount}”` : 'Enter an amount';
    if (type === 'transfer') {
      if (!accountId || !toAccountId) e.account = 'Pick both accounts';
      else if (accountId === toAccountId) e.account = 'Pick two different accounts';
    } else if (!categoryId) e.category = 'Pick a category';
    if (!accountId && type !== 'transfer') e.account = 'Add an account first';
    if (isDebt && type === 'owed' && !who.trim()) e.who = 'Who owes you?';
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
      rateManual: foreign && !!rateText, rate: foreign ? rate || 1 : 1,
    };
    const savedId = app.saveRecord(draft, { repeat: rule(), split: split ? { who: splitWho.trim(), share } : undefined });
    if (!old) app.update({ addMore: !!(preset !== 'never' || split || description.trim() || photos.length) });
    if (savedId) {
      photos.filter((u) => !savedPhotos.includes(u)).forEach((u) => app.addPhoto(savedId, u));
      savedPhotos.filter((u) => !photos.includes(u)).forEach((u) => app.removePhoto(savedId, u));
    }
    app.showToast(old ? 'Saved' : type === 'expense' && split ? `Saved. ${splitWho.trim()} owes you ${app.money(share)}` : 'Saved');
    nav.pop();
  };

  const close = () => {
    if (!dirty.current) { nav.pop(); return; }
    Alert.alert('Discard this record?', "What you typed won't be saved.", [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => nav.pop() }]);
  };

  const pickAccount = (setter, title) => nav.openSheet('account', { title, onPick: (aid) => { dirty.current = true; setErrors({}); setter(aid); if (setter === setAccountId && data.accounts[aid] && data.accounts[aid].currency && !old) setCurrency(data.accounts[aid].currency); } });
  const repeatLabel = preset === 'never' ? 'Never' : preset === 'custom' ? describe({ ...(customRule || {}), start: isDebt ? dueDate : date }) : preset[0].toUpperCase() + preset.slice(1);

  return (
    <Screen
      title={old ? 'Edit record' : 'New record'}
      back="close"
      onBack={close}
      footer={<Button label="Save" onPress={save} />}
    >
      <Chips>
        {TYPES.map(([t, l]) => <Chip key={t} label={l} on={type === t} onPress={() => changeType(t)} />)}
      </Chips>

      {isDebt ? (
        <View>
          <Seg items={KINDS[type].map(([k, l]) => ({ id: k, label: l }))} value={kind} onChange={touch(setKind)} />
          <T size={13} color={th.faint} center style={{ marginTop: 8 }}>{KIND_HINT[kind]}</T>
        </View>
      ) : null}

      <View style={{ alignItems: 'center', paddingTop: 4 }}>
        <T size={13} color={th.muted}>Amount</T>
        <TextInput
          value={amount}
          onChangeText={touch(setAmount)}
          keyboardType="decimal-pad"
          placeholder={offer ? offer.amount : '0.00'}
          placeholderTextColor={th.faint2}
          accessibilityLabel="Amount"
          autoFocus={!old}
          style={{ fontFamily: F.semi, fontSize: 46 * (th.textScale || 1), color: th.ink, textAlign: 'center', minWidth: 200, paddingVertical: 2 }}
        />
        <Pressable onPress={() => nav.openSheet('currency', { onPick: (c) => { dirty.current = true; setCurrency(c); setRateText(''); } })} accessibilityRole="button" accessibilityLabel={`Currency ${currency}`} style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: th.lineStrong, backgroundColor: th.card, justifyContent: 'center' }}>
          <T size={13} weight="semi" color={th.muted}>{currency} ▾</T>
        </Pressable>
        {offer ? (
          <Pressable onPress={useOffer} accessibilityRole="button" accessibilityLabel={`Use ${offer.amount} as the amount, ${offer.why}`} style={{ marginTop: 8, minHeight: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: th.accentSoft, justifyContent: 'center' }}>
            <T size={13} weight="medium" color={th.accent}>Use {offer.amount} · {offer.why}</T>
          </Pressable>
        ) : null}
        {errors.amount ? <T size={13} color={th.danger} style={{ marginTop: 6 }}>{errors.amount}</T> : null}
        {foreign ? (
          <Pressable onPress={() => nav.openSheet('rate', { currency, home, value: rateText || (autoRate ? String(autoRate) : ''), onPick: (v) => { dirty.current = true; setRateText(v); } })} accessibilityRole="button" style={{ marginTop: 8 }}>
            <T size={13} color={rate ? th.faint : th.warn} center>
              {rate ? `1 ${currency} = ${fmt(rate, { decimals: 4 })} ${home}${rateText ? ' (your rate)' : ''} · ≈ ${app.money((amt || 0) * rate)} ${home}` : 'Rate to check: no rate saved yet. Tap to type one.'}
            </T>
          </Pressable>
        ) : null}
        {errors.rate ? <T size={13} color={th.danger}>{errors.rate}</T> : null}
      </View>

      {type !== 'transfer' ? (
        <View>
          <Field label="Name" value={name} onChangeText={(v) => { dirty.current = true; setErrors({}); setHintAmount(''); setName(v); }} onFocus={() => setNameFocus(true)} onBlur={() => setTimeout(() => setNameFocus(false), 150)} placeholder={type === 'income' ? 'Salary' : type === 'iowe' ? 'Phone bill' : type === 'owed' ? 'Dinner split' : 'Grocery'} autoCapitalize="sentences" />
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

      <Card pad={0} style={{ paddingHorizontal: 16 }}>
        {type === 'transfer' ? (
          <>
            <Row first label="From" value={acc ? acc.name : 'Choose'} onPress={() => pickAccount(setAccountId, 'From')} />
            <Row label="To" value={toAcc ? toAcc.name : 'Choose'} onPress={() => pickAccount(setToAccountId, 'To')} />
            {crossTransfer ? (
              <Row label={`Arrives as (${toAcc.currency})`} right={<TextInput value={toAmount} onChangeText={touch(setToAmount)} keyboardType="decimal-pad" placeholder={arrivesGuess ? `≈ ${fmt(arrivesGuess, { decimals: 0 })}` : 'Amount'} placeholderTextColor={th.faint2} accessibilityLabel="Amount that arrives" style={{ fontFamily: F.regular, fontSize: 15, color: th.ink, minWidth: 110, textAlign: 'right' }} />} />
            ) : null}
          </>
        ) : (
          <Row first label="Category" value={cat && !cat.deleted ? `${cat.emoji} ${cat.name}` : 'Choose'} valueColor={errors.category ? th.danger : undefined} onPress={() => nav.openSheet('category', { kind: catKind, onPick: (cid) => { dirty.current = true; setErrors({}); setCategoryId(cid); } })} />
        )}
        {isDebt ? (
          <>
            <Row label="Who" right={
              <TextInput value={who} onChangeText={touch(setWho)} onFocus={() => setWhoFocus(true)} onBlur={() => setTimeout(() => setWhoFocus(false), 150)} placeholder={type === 'owed' ? 'Name' : 'Optional'} placeholderTextColor={th.faint2} accessibilityLabel="Who" style={{ fontFamily: F.regular, fontSize: 15 * (th.textScale || 1), color: th.ink, minWidth: 140, textAlign: 'right' }} />
            } />
            {people.length ? <Chips style={{ paddingBottom: 10 }}>{people.map((p) => <Chip key={p.name} label={p.name} onPress={() => { dirty.current = true; setWho(p.name); setWhoFocus(false); }} />)}</Chips> : null}
            <Row label="Due" value={fmtShort(dueDate, { weekday: true })} onPress={() => nav.openSheet('date', { value: dueDate, title: 'Due date', onPick: touch(setDueDate) })} />
          </>
        ) : (
          <Row label="Date" value={date === today() ? `Today, ${fmtShort(date)}` : fmtShort(date, { weekday: true })} onPress={() => nav.openSheet('date', { value: date, onPick: touch(setDate) })} />
        )}
        {type !== 'transfer' ? <Row label={ACCOUNT_LABEL[subKind] || 'Account'} value={acc && !acc.deleted ? acc.name : 'Choose'} valueColor={errors.account ? th.danger : undefined} onPress={() => pickAccount(setAccountId, ACCOUNT_LABEL[subKind])} /> : null}
        {more ? (
          <>
        <Row label="Repeats" value={repeatLabel} onPress={() => setRepeatOpen(!repeatOpen)} right={null} chevron={false} />
        {repeatOpen ? (
          <Chips style={{ paddingBottom: 14 }}>
            {[['never', 'Never'], ['weekly', 'Weekly'], ['fortnightly', 'Fortnightly'], ['monthly', 'Monthly']].map(([p, l]) => (
              <Chip key={p} label={l} on={preset === p} onPress={() => { dirty.current = true; setPreset(p); setRepeatOpen(false); }} />
            ))}
            <Chip label="Custom" on={preset === 'custom'} onPress={() => nav.push('repeat', { draftRule: customRule, start: isDebt ? dueDate : date, type, onDone: (r) => { dirty.current = true; setCustomRule(r); setPreset('custom'); setRepeatOpen(false); } })} />
          </Chips>
        ) : null}
        {type === 'iowe' ? <Row label="Remind me" value={data.reminders.on === false ? 'Off' : Number(data.reminders.billDays) ? `${data.reminders.billDays} days before` : 'On the day'} onPress={() => nav.push('settings', { section: 'reminders' })} /> : null}
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
        <Pressable onPress={() => setMore(!more)} accessibilityRole="button" accessibilityState={{ expanded: more }} style={{ minHeight: 48, justifyContent: 'center', borderTopWidth: 1, borderTopColor: th.line }}>
          <T size={14} weight="medium" color={th.accent}>{more ? 'Fewer options' : type === 'expense' && !old ? 'More options: repeat, split, receipt, description' : type === 'transfer' ? 'More options: repeat, description' : 'More options: repeat, receipt, description'}</T>
        </Pressable>
      </Card>
      {!isDebt && date > today() ? <T size={13} color={th.faint} style={{ marginHorizontal: 4, marginTop: -4 }}>That's a future date, so it waits as Scheduled and counts from {fmtShort(date)}.</T> : null}
      {errors.account || errors.category || errors.who ? <T size={13} color={th.danger} style={{ marginTop: -4 }}>{errors.account || errors.category || errors.who}</T> : null}

      {more ? (
      <View>
        <Field label="Description" value={description} onChangeText={touch(setDescription)} onFocus={() => setDescFocus(true)} onBlur={() => setTimeout(() => setDescFocus(false), 150)} placeholder="Optional" multiline inputStyle={{ paddingTop: 14, paddingBottom: 14 }} />
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
                  <Pressable onPress={() => { dirty.current = true; setPhotos((p) => p.filter((x) => x !== u)); }} accessibilityRole="button" accessibilityLabel="Remove photo" hitSlop={8} style={{ position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: th.ink, alignItems: 'center', justifyContent: 'center' }}>
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
