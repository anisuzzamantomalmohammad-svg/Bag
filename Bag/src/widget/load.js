// Builds the widget from what's saved on the phone. Used by the background
// handler (when Android asks) and by the app (after every change).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PERSIST_KEY } from '../lib/background';
import { latestRate, loadRates } from '../lib/rates';
import { widgetModel } from './model';
import { renderBagWidget } from './BagWidget';

export const VIEW_KEY = '@bag:widgetView';

export async function buildWidget(size, viewOverride) {
  let data = null;
  try {
    const raw = await AsyncStorage.getItem(PERSIST_KEY);
    data = raw ? JSON.parse(raw) : null;
  } catch (e) {
    data = null;
  }
  if (!data || !data.onboarded) {
    return renderBagWidget({ locked: true }, size, 'auto');
  }
  await loadRates().catch(() => {});
  const home = data.homeCurrency || 'NZD';
  const homePerUnit = (cur) => (!cur || cur === home ? 1 : latestRate(cur, home) || 1);
  let view = viewOverride;
  if (!view) view = (await AsyncStorage.getItem(VIEW_KEY).catch(() => null)) || data.homePeriod || 'month';
  const model = widgetModel(data, { view, homePerUnit });
  return renderBagWidget(model, size, data.themeMode || 'auto');
}
