// Every 12 hours or so (when Android allows): top up reminders and back up
// to Drive if anything changed. Same idea as Deen's background task.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const TASK = 'bag-12h';
export const PERSIST_KEY = '@bag:v1';

if (Platform.OS !== 'web') {
  try {
    const TaskManager = require('expo-task-manager');
    const BackgroundTask = require('expo-background-task');
    TaskManager.defineTask(TASK, async () => {
      try {
        const raw = await AsyncStorage.getItem(PERSIST_KEY);
        if (!raw) return BackgroundTask.BackgroundTaskResult.Success;
        const s = JSON.parse(raw);
        const { scheduleAll } = require('./reminders');
        await scheduleAll(s);
        const { driveBackupDue, uploadBackup } = require('./google');
        if (driveBackupDue(s)) {
          const ok = await uploadBackup(s).then(() => true).catch(() => false);
          if (ok) {
            const now = await AsyncStorage.getItem(PERSIST_KEY);
            const cur = now ? JSON.parse(now) : s;
            await AsyncStorage.setItem(PERSIST_KEY, JSON.stringify({ ...cur, lastDriveBackupAt: new Date().toISOString() }));
          }
        }
        return BackgroundTask.BackgroundTaskResult.Success;
      } catch (e) {
        return BackgroundTask.BackgroundTaskResult.Failed;
      }
    });
  } catch (e) {
    // task manager missing (web or Expo Go)
  }
}

export async function registerBackground() {
  if (Platform.OS === 'web') return;
  try {
    const BackgroundTask = require('expo-background-task');
    const TaskManager = require('expo-task-manager');
    if (await TaskManager.isTaskRegisteredAsync(TASK)) return;
    await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 12 * 60 });
  } catch (e) {
    // not allowed on this phone
  }
}
