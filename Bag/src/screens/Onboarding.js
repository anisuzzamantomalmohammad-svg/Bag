// First run: home currency, the first account, reminders. (A second
// currency is off until switched on in Settings.) Signing in with Google (to pull records from another phone) and importing
// an Excel file are offered but never required.
import React, { useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Button, Card, Field, Icon, Row, T, useTheme } from '../ui/kit';
import { COMMON, currencyName } from '../data/currencies';
import { askPermission, ensureChannel } from '../lib/reminders';
import { googleConfigured } from '../lib/google';
import { parseAmount } from '../lib/money';
import { today } from '../lib/dates';

const STEPS = ['welcome', 'home', 'account', 'reminders'];

function CurrencyList({ value, onPick, none, exclude }) {
  const nav = useNav();
  const th = useTheme();
  const list = COMMON.filter((c) => c !== exclude);
  const shown = value && !list.includes(value) && value !== exclude ? [value, ...list] : list;
  return (
    <Card pad={0} style={{ paddingHorizontal: 16 }}>
      {none ? <Row first label="None" right={!value ? <Icon name="check" size={18} color={th.accent} /> : null} onPress={() => onPick(null)} chevron={false} /> : null}
      {shown.slice(0, 8).map((c, i) => (
        <Row key={c} first={!none && i === 0} minHeight={50} label={c} sub={currencyName(c)} right={value === c ? <Icon name="check" size={18} color={th.accent} /> : null} onPress={() => onPick(c)} chevron={false} />
      ))}
      <Row label={<T color={th.accent} weight="medium">All currencies</T>} onPress={() => nav.openSheet('currency', { value, onPick })} />
    </Card>
  );
}

export default function Onboarding() {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [home, setHome] = useState(app.data.homeCurrency || 'NZD');
  const [accName, setAccName] = useState('Everyday');
  const [opening, setOpening] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [importAfter, setImportAfter] = useState(false);
  const id = STEPS[step];
  const next = () => { setErr(''); setStep((s) => Math.min(STEPS.length - 1, s + 1)); };
  const back = () => { setErr(''); setStep((s) => Math.max(0, s - 1)); };

  const finish = async (reminders) => {
    if (reminders) {
      await ensureChannel();
      await askPermission();
    }
    const o = opening.trim() ? parseAmount(opening) : 0;
    app.update({ homeCurrency: home, reminders: { ...app.data.reminders, on: !!reminders } });
    if (accName.trim()) app.saveAccount({ name: accName.trim(), currency: home, opening: Number.isNaN(o) ? 0 : o, openingDate: today() });
    app.update({ onboarded: true });
    if (importAfter) setTimeout(() => nav.push('import'), 400);
  };

  const google = async () => {
    setBusy(true);
    const ok = await app.signInGoogle();
    setBusy(false);
    if (ok) {
      app.update({ onboarded: true });
      app.showToast('Signed in. Bringing your records over…');
    }
  };

  const checkAccount = () => {
    if (opening.trim() && Number.isNaN(parseAmount(opening))) { setErr('Opening balance should be a number, like 1250.50'); return; }
    next();
  };

  return (
    <View style={{ flex: 1, backgroundColor: th.bg, paddingTop: insets.top }}>
      {step > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, minHeight: 56 }}>
          <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="chevron-left" size={24} />
          </Pressable>
          <View style={{ flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', marginRight: 44 }}>
            {STEPS.slice(1).map((s, i) => <View key={s} style={{ width: 28, height: 4, borderRadius: 2, backgroundColor: i < step ? th.accentFill : th.lineStrong }} />)}
          </View>
        </View>
      ) : null}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, padding: 20, gap: 14, justifyContent: id === 'welcome' ? 'center' : 'flex-start' }}>
        {id === 'welcome' ? (
          <>
            <View style={{ alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <Image source={require('../../assets/icon.png')} style={{ width: 88, height: 88, borderRadius: 22 }} accessibilityIgnoresInvertColors />
              <T size={30} weight="bold">Bag</T>
              <T size={16} color={th.muted} center style={{ maxWidth: 300 }}>Money in, money out, who owes who. Everything stays on this phone unless you turn on Google sync.</T>
            </View>
            <Button label="Start" onPress={next} />
            {googleConfigured() ? <Button label={busy ? 'Signing in…' : 'I use Bag on another phone'} kind="secondary" icon="cloud" disabled={busy} onPress={google} /> : null}
          </>
        ) : null}

        {id === 'home' ? (
          <>
            <T size={24} weight="semi">Your home currency</T>
            <T color={th.muted}>Totals, budgets and reports use this. Each record can still be in any currency.</T>
            <CurrencyList value={home} onPick={(c) => { if (c) setHome(c); }} />
            <T size={13} color={th.faint}>Want a second currency shown too, like BDT? Turn it on later in Settings → Money.</T>
          </>
        ) : null}

        {id === 'account' ? (
          <>
            <T size={24} weight="semi">Your first account</T>
            <T color={th.muted}>Where your money sits: a bank account, cash, a card. Add more later.</T>
            <Field label="Name" value={accName} onChangeText={(t) => { setErr(''); setAccName(t); }} placeholder="Everyday" autoCapitalize="words" />
            <Field label={`What's in it now (${home})`} value={opening} onChangeText={(t) => { setErr(''); setOpening(t); }} keyboardType="numbers-and-punctuation" placeholder="0.00" />
            <T size={13} color={th.faint}>This is the opening balance. It isn't counted as income.</T>
            {err ? <T size={13} color={th.danger}>{err}</T> : null}
            <Card pad={0} style={{ paddingHorizontal: 16 }}>
              <Row first label="Bring records in from Excel" sub="You'll pick the file after setup" right={<Icon name={importAfter ? 'check-square' : 'square'} size={20} color={importAfter ? th.accent : th.faint2} />} onPress={() => setImportAfter(!importAfter)} chevron={false} />
            </Card>
          </>
        ) : null}

        {id === 'reminders' ? (
          <>
            <T size={24} weight="semi">Reminders</T>
            <T color={th.muted}>Bag can remind you 2 days before a bill is due, and ask “Did it arrive?” when a repeat like salary comes round. You choose the timing in Settings.</T>
          </>
        ) : null}
      </ScrollView>
      {id !== 'welcome' ? (
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 + insets.bottom, gap: 8 }}>
          {id === 'reminders' ? (
            <>
              <Button label="Turn on reminders" onPress={() => finish(true)} />
              <Button label="Not now" kind="ghost" onPress={() => finish(false)} />
            </>
          ) : (
            <Button label="Next" onPress={id === 'account' ? checkAccount : next} />
          )}
        </View>
      ) : null}
    </View>
  );
}
