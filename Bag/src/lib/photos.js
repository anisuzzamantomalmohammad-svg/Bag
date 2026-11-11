// Receipt photos. Copied into Bag's own folder so they survive the picker's
// cache being cleared. They stay on this phone: no sync, no Drive, no Excel.
import { Platform } from 'react-native';

const DIR = 'receipts/';

function fs() {
  if (Platform.OS === 'web') return null;
  try { return require('expo-file-system/legacy'); } catch (e) { return null; }
}

export async function keepPhoto(uri) {
  const FS = fs();
  if (!FS) return uri;
  try {
    const dir = FS.documentDirectory + DIR;
    const info = await FS.getInfoAsync(dir);
    if (!info.exists) await FS.makeDirectoryAsync(dir, { intermediates: true });
    const ext = (/\.(jpe?g|png|heic|webp)$/i.exec(uri) || ['.jpg'])[0].toLowerCase();
    const to = `${dir}${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    await FS.copyAsync({ from: uri, to });
    return to;
  } catch (e) {
    return null;
  }
}

export async function dropPhoto(uri) {
  const FS = fs();
  if (!FS || !uri || !uri.startsWith(FS.documentDirectory || '~')) return;
  try { await FS.deleteAsync(uri, { idempotent: true }); } catch (e) { /* already gone */ }
}

// Camera or gallery. Returns a file uri, or null if cancelled.
export async function pickPhoto(from) {
  let IP;
  try { IP = require('expo-image-picker'); } catch (e) { return null; }
  const opts = { mediaTypes: ['images'], quality: 0.6, allowsEditing: false };
  if (from === 'camera') {
    const p = await IP.requestCameraPermissionsAsync();
    if (!p.granted) throw new Error('camera-denied');
    const r = await IP.launchCameraAsync(opts);
    return r.canceled ? null : r.assets[0].uri;
  }
  const r = await IP.launchImageLibraryAsync(opts);
  return r.canceled ? null : r.assets[0].uri;
}
