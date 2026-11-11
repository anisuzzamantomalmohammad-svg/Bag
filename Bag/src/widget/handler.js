// Android calls this when the widget is added, resized, due for a refresh,
// or tapped on Week / Month / All time.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildWidget, VIEW_KEY } from './load';

export async function widgetTaskHandler({ widgetInfo, widgetAction, clickAction, clickActionData, renderWidget }) {
  if (widgetAction === 'WIDGET_DELETED') return;
  let view;
  if (widgetAction === 'WIDGET_CLICK' && clickAction === 'PERIOD' && clickActionData && clickActionData.view) {
    view = String(clickActionData.view);
    await AsyncStorage.setItem(VIEW_KEY, view).catch(() => {});
  }
  renderWidget(await buildWidget(widgetInfo, view));
}
