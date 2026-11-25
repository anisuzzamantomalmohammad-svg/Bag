// Excel files in and out of the phone: export opens the share sheet (Drive,
// Files, email...); import opens the file picker.
import { Platform } from 'react-native';
import { buildWorkbook, exportFileName, readRows, readWorkbookBase64, workbookBase64 } from './excel';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function shareExcel(data, opts = {}) {
  const wb = buildWorkbook(data, opts);
  const b64 = workbookBase64(wb);
  const name = exportFileName(opts.from, opts.to);
  if (Platform.OS === 'web') {
    const a = document.createElement('a');
    a.href = `data:${XLSX_MIME};base64,${b64}`;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  }
  const FS = require('expo-file-system/legacy');
  const Sharing = require('expo-sharing');
  const path = `${FS.cacheDirectory}${name}`;
  await FS.writeAsStringAsync(path, b64, { encoding: FS.EncodingType.Base64 });
  if (!(await Sharing.isAvailableAsync())) throw new Error('no-share');
  await Sharing.shareAsync(path, { mimeType: XLSX_MIME, dialogTitle: 'Export to Excel', UTI: 'org.openxmlformats.spreadsheetml.sheet' });
  return true;
}

// Returns { name, rows, format } or null if cancelled. Throws on an unreadable file.
export async function pickExcel() {
  const DocumentPicker = require('expo-document-picker');
  const res = await DocumentPicker.getDocumentAsync({
    type: [XLSX_MIME, 'application/vnd.ms-excel', 'text/csv', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets || !res.assets[0]) return null;
  const asset = res.assets[0];
  let b64;
  if (Platform.OS === 'web') {
    const buf = await (await fetch(asset.uri)).arrayBuffer();
    let s = '';
    new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); });
    b64 = btoa(s);
  } else {
    const FS = require('expo-file-system/legacy');
    b64 = await FS.readAsStringAsync(asset.uri, { encoding: FS.EncodingType.Base64 });
  }
  const wb = readWorkbookBase64(b64);
  const out = readRows(wb);
  if (!out.format) throw new Error('not-records');
  return { name: asset.name || 'file.xlsx', ...out };
}
