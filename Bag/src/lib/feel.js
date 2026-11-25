// The little buzz under your finger. One place for every haptic, so the
// Vibration switch in Settings turns them all off at once.
//   tap      light tick: buttons, rows, chips, tabs, keys
//   pick     softer: switches, pickers, scrubbing the line
//   firm     something that matters happened: Save, a move, a jar
//   done     success: a tick on a count or a check
//   warn     a double buzz: delete, sign out, restore, or a "can't do that"
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

let on = true;
export function setFeel(v) { on = v !== false; }

const go = (fn) => { if (!on || Platform.OS === 'web') return; try { fn().catch(() => {}); } catch (e) { /* no haptics here */ } };

export const feel = {
  tap: () => go(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  pick: () => go(() => Haptics.selectionAsync()),
  firm: () => go(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  done: () => go(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warn: () => go(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
