// Covers everything while Bag is locked. Asks for the fingerprint, face or
// PIN straight away, with a button to try again.
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useApp } from '../state/store';
import { Button, T, useTheme } from '../ui/kit';

export default function LockScreen() {
  const app = useApp();
  const th = useTheme();
  const [trying, setTrying] = useState(false);
  const go = async () => {
    if (trying) return;
    setTrying(true);
    await app.tryUnlock();
    setTrying(false);
  };
  useEffect(() => { const h = setTimeout(go, 250); return () => clearTimeout(h); }, []);
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 100, elevation: 100, backgroundColor: th.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }]}>
      <Image source={require('../../assets/icon.png')} style={{ width: 72, height: 72, borderRadius: 18 }} accessibilityIgnoresInvertColors />
      <T size={20} weight="semi">Bag is locked</T>
      <Button label={trying ? 'Waiting…' : 'Unlock'} icon="unlock" onPress={go} disabled={trying} style={{ alignSelf: 'stretch' }} />
    </View>
  );
}
