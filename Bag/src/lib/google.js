// Google sign-in and Drive backup, the same way Deen does it. Optional: Bag
// works the same without it. Files go in Drive's hidden app folder
// (drive.appdata), which only Bag can see. There's no server of ours.
import { Platform } from 'react-native';
import { GOOGLE_WEB_CLIENT_ID } from './config';
import { backupPayload } from './sync';

const SCOPES = ['https://www.googleapis.com/auth/drive.appdata'];
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
export const KEEP_BACKUPS = 4;
const BACKUP_PREFIX = 'bag-backup';
const SYNC_NAME = 'bag-sync.json';

let configured = false;
function lib() {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null;
  if (!GOOGLE_WEB_CLIENT_ID) return null;
  try {
    const m = require('@react-native-google-signin/google-signin');
    if (!configured) {
      m.GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, scopes: SCOPES, offlineAccess: false });
      configured = true;
    }
    return m;
  } catch (e) {
    return null;
  }
}

export const googleAvailable = () => !!lib();
export const googleConfigured = () => !!GOOGLE_WEB_CLIENT_ID;

const userOf = (u) => {
  const x = (u && (u.user || u)) || {};
  return { id: x.id || null, name: x.name || x.givenName || x.email || '', email: x.email || '' };
};

// Returns the user, or null if cancelled. Throws on a real error.
export async function signIn() {
  const m = lib();
  if (!m) throw new Error('unsupported');
  await m.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const res = await m.GoogleSignin.signIn();
  if (!res || res.type === 'cancelled') return null;
  return userOf(res.data);
}

export async function signOut() {
  const m = lib();
  if (!m) return;
  try { await m.GoogleSignin.revokeAccess(); } catch (e) { /* already revoked */ }
  try { await m.GoogleSignin.signOut(); } catch (e) { /* not signed in */ }
}

async function token() {
  const m = lib();
  if (!m) throw new Error('unsupported');
  if (!m.GoogleSignin.getCurrentUser()) {
    const r = await m.GoogleSignin.signInSilently();
    if (!r || r.type !== 'success') throw new Error('signed-out');
  }
  const t = await m.GoogleSignin.getTokens();
  return t.accessToken;
}

async function call(url, opts = {}, retry = true) {
  const tk = await token();
  const res = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${tk}` } });
  if (res.status === 401 && retry) {
    try { await lib().GoogleSignin.clearCachedAccessToken(tk); } catch (e) { /* ignore */ }
    return call(url, opts, false);
  }
  if (!res.ok) throw new Error(`drive-${res.status}`);
  return res;
}

function multipart(meta, body) {
  const b = `bag${Date.now()}`;
  return {
    headers: { 'Content-Type': `multipart/related; boundary=${b}` },
    body: `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`,
  };
}

// Newest first: [{ id, name, modifiedTime, size }]
export async function listBackups() {
  const q = encodeURIComponent(`name contains '${BACKUP_PREFIX}'`);
  const res = await call(`${API}/files?spaces=appDataFolder&q=${q}&orderBy=modifiedTime desc&pageSize=20&fields=files(id,name,modifiedTime,size)`);
  const j = await res.json();
  return j.files || [];
}

export async function uploadBackup(data) {
  const body = JSON.stringify({ app: 'Bag', exportedAt: new Date().toISOString(), data: backupPayload(data) });
  const meta = { name: `${BACKUP_PREFIX}-${new Date().toISOString().slice(0, 16).replace(':', '')}.json`, parents: ['appDataFolder'], mimeType: 'application/json' };
  const mp = multipart(meta, body);
  await call(`${UPLOAD}/files?uploadType=multipart`, { method: 'POST', ...mp });
  try {
    const all = await listBackups();
    for (const f of all.slice(KEEP_BACKUPS)) await call(`${API}/files/${f.id}`, { method: 'DELETE' });
  } catch (e) {
    // not critical
  }
  return true;
}

export async function downloadBackup(id) {
  const res = await call(`${API}/files/${id}?alt=media`);
  const j = JSON.parse(await res.text());
  return j && j.data ? j.data : j;
}

// Back up only when something changed since the last backup.
export const driveBackupDue = (d) => !!(d.google && (d.dirtyAt || 0) > (d.lastDriveBackupAt ? new Date(d.lastDriveBackupAt).getTime() : 0));

async function findSyncFile() {
  const q = encodeURIComponent(`name = '${SYNC_NAME}'`);
  const res = await call(`${API}/files?spaces=appDataFolder&q=${q}&orderBy=modifiedTime desc&pageSize=5&fields=files(id,modifiedTime)`);
  const j = await res.json();
  return (j.files || [])[0] || null;
}

export async function downloadSync() {
  const f = await findSyncFile();
  if (!f) return null;
  const res = await call(`${API}/files/${f.id}?alt=media`);
  const j = JSON.parse(await res.text());
  return { ...j, fileId: f.id };
}

export async function uploadSync(payload, fileId) {
  const body = JSON.stringify({ app: 'Bag', at: new Date().toISOString(), ...payload });
  if (fileId) {
    await call(`${UPLOAD}/files/${fileId}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
    return fileId;
  }
  const mp = multipart({ name: SYNC_NAME, parents: ['appDataFolder'], mimeType: 'application/json' }, body);
  const res = await call(`${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', ...mp });
  const j = await res.json();
  return j.id;
}
