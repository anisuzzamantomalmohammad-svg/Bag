// App lock with the phone's fingerprint, face or PIN, and hiding Bag's
// screen from recent apps (Android also blocks screenshots then).
import { Platform } from 'react-native';

function auth() {
  if (Platform.OS === 'web') return null;
  try {
    return require('expo-local-authentication');
  } catch (e) {
    return null;
  }
}

// Can this phone lock apps at all (a fingerprint, face or a screen lock set up)?
export async function canLock() {
  const LA = auth();
  if (!LA) return false;
  try {
    const level = await LA.getEnrolledLevelAsync();
    return level !== LA.SecurityLevel.NONE;
  } catch (e) {
    return false;
  }
}

export async function unlock() {
  const LA = auth();
  if (!LA) return true;
  try {
    const res = await LA.authenticateAsync({ promptMessage: 'Unlock Bag', cancelLabel: 'Cancel', disableDeviceFallback: false });
    return !!res.success;
  } catch (e) {
    return false;
  }
}

export async function setHidden(on) {
  if (Platform.OS === 'web') return;
  try {
    const SC = require('expo-screen-capture');
    if (on) await SC.preventScreenCaptureAsync('bag');
    else await SC.allowScreenCaptureAsync('bag');
  } catch (e) {
    // not available
  }
}
