// Shown once after updating to 2.2: what changed, in a few lines.
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Button, Card, Screen, T, useTheme } from '../ui/kit';
import { Appear } from '../ui/live';

export const NEW_IN = '2.2';

const LINES = [
  ['🫙', 'Savings', 'One jar on Home with Bank savings and Cash savings inside. Put in, take out, or spend from it.'],
  ['⇄', 'Move', 'Bank to cash, cash to a jar, any account to any other, in one entry.'],
  ['🧮', 'Count any day', 'Check your wallet or bank app whenever. The gap goes in as Untracked, or split it.'],
  ['📅', 'Paydays', 'Pick as many days as you like. Bag asks how much came in on the day.'],
  ['🛡', 'Safety margin', 'Keep money aside without hiding it. To spend leaves it out.'],
  ['🏦', 'Several banks', 'One Bank pill for all of them, with a ★ default.'],
  ['🌏', 'Looks', 'Floating coins and drawings from 11 places. Settings › Look.'],
  ['📳', 'Feel', 'Little taps on every button. Turn off in Settings › Vibration.'],
];

export default function WhatsNew() {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  useEffect(() => { app.update({ seenNew: NEW_IN }); }, []);
  return (
    <Screen title="New in Bag 2.2" back="close" footer={<Button label="Nice" onPress={() => nav.pop()} />}>
      {LINES.map(([e, h, s], i) => (
        <Appear key={h} delay={i * 60}>
          <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <T size={24} style={{ width: 32, textAlign: 'center' }}>{e}</T>
            <View style={{ flex: 1 }}>
              <T size={15.5} weight="semi">{h}</T>
              <T size={13.5} color={th.muted} style={{ marginTop: 2 }}>{s}</T>
            </View>
          </Card>
        </Appear>
      ))}
    </Screen>
  );
}
