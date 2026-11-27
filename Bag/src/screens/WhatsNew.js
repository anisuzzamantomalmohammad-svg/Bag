// Shown once after updating to 2.3: what changed, in a few lines.
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import { Button, Card, Screen, T, useTheme } from '../ui/kit';
import { Appear } from '../ui/live';

export const NEW_IN = '2.3';

const LINES = [
  ['⌨️', "Your phone's keyboard", 'Amounts use the normal number keyboard. A comma works too.'],
  ['★', 'Defaults', 'Hold an account on Add to make it the default for Out, In or Move.'],
  ['🤝', 'Debts, paid in parts', 'No account needed. Pay some back from any account, or split it across a few.'],
  ['🗓', 'Upcoming calendar', 'Your bank at the end of each day. Tap a day to see the sum.'],
  ['⚠️', 'Low balance warning', 'A heads-up 3 days before your bank looks like going below 0.'],
  ['⚡', 'Quick add', 'Type "lunch 15 cash" on Home and it’s saved.'],
  ['👆', 'Less on screen', 'Tap a number, tile or row and the details pop up.'],
  ['▭', 'Small widget', 'A 2 × 1 widget with the balance, to spend, Bank, Cash and the jar.'],
];

export default function WhatsNew() {
  const app = useApp();
  const nav = useNav();
  const th = useTheme();
  useEffect(() => { app.update({ seenNew: NEW_IN }); }, []);
  return (
    <Screen title={`New in Bag ${NEW_IN}`} back="close" footer={<Button label="Nice" onPress={() => nav.pop()} />}>
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
