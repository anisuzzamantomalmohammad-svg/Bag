// Repeat rule editor. Opened from Add record (Custom) to build a rule, or from
// a repeat to change it, pause it or stop it.
import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Button, Card, Chip, Chips, Field, Icon, IconBox, Row, Screen, Seg, T, Toggle, useTheme } from '../ui/kit';
import { RecordRow } from '../ui/parts';
import { describe, lastAmount, nextDates } from '../lib/repeats';
import { addDays, dow, fmtDate, fmtShort, ordinal, parseYmd, today, DAY_NAMES } from '../lib/dates';
import { parseAmount } from '../lib/money';
import { liveRecords, byNewest } from '../lib/ledger';

const FREQ = [{ id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }, { id: 'year', label: 'Year' }];
const UNIT = { day: ['day', 'days'], week: ['week', 'weeks'], month: ['month', 'months'], year: ['year', 'years'] };
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function Stepper({ value, onChange, min = 1, max = 99, label }) {
  const th = useTheme();
  const btn = (d, icon) => (
    <Pressable onPress={() => onChange(Math.max(min, Math.min(max, value + d)))} accessibilityRole="button" accessibilityLabel={`${d > 0 ? 'More' : 'Fewer'} ${label}`} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: th.soft, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={18} color={th.ink} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {btn(-1, 'minus')}
      <T size={16} weight="semi" style={{ minWidth: 28, textAlign: 'center' }}>{value}</T>
      {btn(1, 'plus')}
    </View>
  );
}

export default function RepeatEdit({ id, draftRule, start: draftStart, type: draftType, onDone }) {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  const { data } = app;
  const rep = id ? data.repeats[id] : null;
  const src = rep || draftRule || {};
  const start = rep ? rep.start : draftStart || today();
  const t = rep ? rep.template || {} : { type: draftType };
  const [freq, setFreq] = useState(src.freq || 'month');
  const [every, setEvery] = useState(Number(src.every) || 1);
  const [weekdays, setWeekdays] = useState(src.weekdays && src.weekdays.length ? src.weekdays : [dow(start)]);
  const [monthDay, setMonthDay] = useState(src.monthDay || parseYmd(start).getDate());
  const [endType, setEndType] = useState((src.end && src.end.type) || 'never');
  const [endDate, setEndDate] = useState((src.end && src.end.date) || addDays(start, 365));
  const [endCount, setEndCount] = useState(Number(src.end && src.end.count) || 12);
  const money = t.type === 'expense' || t.type === 'income' || t.type === 'transfer' || !t.type;
  const [confirm, setConfirm] = useState(src.confirm !== undefined ? !!src.confirm : t.type !== 'transfer');
  const [amountMode, setAmountMode] = useState(src.amountMode || 'same');
  const [paused, setPaused] = useState(!!(rep && rep.paused));
  const [amount, setAmount] = useState(rep ? String(t.amount || '') : '');

  if (id && (!rep || rep.deleted)) return <Screen title="Repeat"><Card><T color={th.muted}>This repeat was stopped.</T></Card></Screen>;

  const rule = {
    freq, every,
    weekdays: freq === 'week' ? weekdays : undefined,
    monthDay: freq === 'month' ? monthDay : undefined,
    end: endType === 'date' ? { type: 'date', date: endDate } : endType === 'count' ? { type: 'count', count: endCount } : { type: 'never' },
    confirm: money ? confirm : false,
    amountMode,
  };
  const from = rep ? (today() > start ? addDays(today(), 1) : start) : start;
  const preview = nextDates({ ...rule, start, id: 'preview' }, from, addDays(from, 1200)).slice(0, 3);
  const made = rep ? liveRecords(data).filter((r) => r.repeatId === rep.id && r.status !== 'skipped').sort(byNewest) : [];
  const cat = t.categoryId ? data.categories[t.categoryId] : null;
  const toggleDay = (d) => setWeekdays((w) => (w.includes(d) ? (w.length > 1 ? w.filter((x) => x !== d) : w) : [...w, d]));
  const day = parseYmd(start).getDate();

  const save = () => {
    if (!rep) { onDone && onDone(rule); nav.pop(); return; }
    const a = parseAmount(amount);
    const template = a > 0 ? { ...t, amount: a } : t;
    app.saveRepeat({ ...rep, ...rule, paused, template });
    app.showToast(paused ? 'Repeat paused' : 'Repeat saved');
    nav.pop();
  };
  const stop = () => Alert.alert('Stop this repeat?', 'Records it already made stay. Ones waiting to be confirmed and bills not due yet are removed.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Stop', style: 'destructive', onPress: () => { nav.pop(); setTimeout(() => app.deleteRepeat(rep.id), 220); } },
  ]);

  return (
    <Screen title={rep ? t.name || 'Repeat' : 'Custom repeat'} footer={<Button label={rep ? 'Save' : 'Done'} onPress={save} />}>
      {rep ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconBox emoji={t.type === 'transfer' ? '🔀' : cat && !cat.deleted ? cat.emoji : '🔁'} />
          <View style={{ flex: 1 }}>
            <T weight="medium">{t.name || 'Repeat'}</T>
            <T size={13} color={th.faint}>{paused ? 'Paused' : describe({ ...rule, start })}</T>
          </View>
        </Card>
      ) : null}

      <Card>
        <T style={{ marginBottom: 8 }}>Every</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <Stepper value={every} onChange={setEvery} label="repeats" />
          <T color={th.muted}>{every === 1 ? UNIT[freq][0] : UNIT[freq][1]}</T>
        </View>
        <Seg small items={FREQ} value={freq} onChange={setFreq} />
        {freq === 'week' ? (
          <>
            <T style={{ marginTop: 16, marginBottom: 8 }}>On</T>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {WEEK_ORDER.map((d) => {
                const on = weekdays.includes(d);
                return (
                  <Pressable key={d} onPress={() => toggleDay(d)} accessibilityRole="button" accessibilityLabel={DAY_NAMES[d]} accessibilityState={{ selected: on }} style={{ flex: 1, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? th.chipOn : th.soft }}>
                    <T size={13} weight={on ? 'semi' : 'medium'} color={on ? th.chipOnInk : th.muted}>{DAY_NAMES[d].slice(0, 2)}</T>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}
        {freq === 'month' ? (
          <>
            <T style={{ marginTop: 16, marginBottom: 8 }}>On</T>
            <Chips>
              <Chip label={`The ${ordinal(day)}`} on={Number(monthDay) === day} onPress={() => setMonthDay(day)} />
              <Chip label="Last day" on={monthDay === 'last'} onPress={() => setMonthDay('last')} />
              <Chip label={monthDay !== 'last' && Number(monthDay) !== day ? `The ${ordinal(Number(monthDay))}` : 'Another day'} on={monthDay !== 'last' && Number(monthDay) !== day}
                onPress={() => nav.openSheet('choice', { title: 'Day of the month', value: monthDay, options: Array.from({ length: 31 }, (_, i) => ({ id: i + 1, label: `The ${ordinal(i + 1)}`, sub: i >= 28 ? 'Shorter months use their last day' : undefined })), onPick: setMonthDay })} />
            </Chips>
          </>
        ) : null}
        {freq === 'year' ? <T size={13} color={th.faint} style={{ marginTop: 12 }}>Every {fmtDate(start, { year: false })}</T> : null}
      </Card>

      <Card>
        <T style={{ marginBottom: 8 }}>Ends</T>
        <Seg small items={[{ id: 'never', label: 'Never' }, { id: 'date', label: 'On a date' }, { id: 'count', label: 'After' }]} value={endType} onChange={setEndType} />
        {endType === 'date' ? <Row first label="Last one on or before" value={fmtDate(endDate)} onPress={() => nav.openSheet('date', { value: endDate, title: 'Ends on', onPick: (d) => d && setEndDate(d) })} style={{ marginTop: 8 }} /> : null}
        {endType === 'count' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <Stepper value={endCount} onChange={setEndCount} max={500} label="times" />
            <T color={th.muted}>{endCount === 1 ? 'time' : 'times'} in total</T>
          </View>
        ) : null}
      </Card>

      <Card pad={0} style={{ paddingHorizontal: 16 }}>
        {money ? <Row first label="Ask me to confirm" sub="Each one waits as Pending until you say it happened" right={<Toggle value={confirm} onChange={setConfirm} label="Ask me to confirm" />} /> : <Row first label="Bills are added 14 days early" sub="So the reminder can go off. They wait as Open until you mark them paid." />}
        <View style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: th.line, gap: 8 }}>
          <T>Amount</T>
          <Seg small items={[{ id: 'same', label: 'Same each time' }, { id: 'last', label: 'Last confirmed' }]} value={amountMode} onChange={setAmountMode} />
          <T size={13} color={th.faint}>{amountMode === 'last' ? 'Good for pay that changes: the next one starts at whatever you confirmed last.' : 'Every one starts at the same amount.'}</T>
        </View>
        {rep ? <Row label="Amount" right={<Field value={amount} onChangeText={setAmount} keyboardType="decimal-pad" inputStyle={{ minHeight: 40, minWidth: 110, textAlign: 'right', paddingHorizontal: 0, backgroundColor: 'transparent' }} accessibilityLabel="Amount" />} /> : null}
        {rep && amountMode === 'last' ? <Row label="Last confirmed" value={app.money(lastAmount(data, rep), { currency: t.currency })} /> : null}
        {rep ? <Row label="Pause" sub="Nothing new is made while it's paused" right={<Toggle value={paused} onChange={setPaused} label="Pause" />} /> : null}
      </Card>

      <Card>
        <T size={13} weight="semi" color={th.muted}>Next</T>
        {paused ? <T color={th.faint} style={{ marginTop: 4 }}>Paused</T> : preview.length ? preview.map((d) => <T key={d} style={{ marginTop: 4 }}>{fmtDate(d, { weekday: true })}</T>) : <T color={th.faint} style={{ marginTop: 4 }}>No more dates. It has ended.</T>}
      </Card>

      {made.length ? (
        <Card pad={0} style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 2 }}>
          <T size={13} weight="semi" color={th.muted}>Made so far · {made.length}</T>
          {made.slice(0, 6).map((r, i) => <RecordRow key={r.id} record={r} showDate first={i === 0} onPress={() => nav.push('record', { id: r.id })} />)}
        </Card>
      ) : null}
      {rep ? <Button label="Stop repeat" kind="dangerText" icon="x-circle" onPress={stop} /> : null}
      {rep && made[0] ? <T size={13} color={th.faint} center>To change the name or category, edit the latest record: {fmtShort(made[0].date)}.</T> : null}
    </Screen>
  );
}
