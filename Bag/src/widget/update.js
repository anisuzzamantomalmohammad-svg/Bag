// Redraw the widget after the app saves something. Does nothing on web or
// when no widget has been added.
import { Platform } from 'react-native';

let timer = null;

export function refreshWidget() {
  if (Platform.OS !== 'android') return;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      const { requestWidgetUpdate } = require('react-native-android-widget');
      const { buildWidget } = require('./load');
      const { WIDGET_NAME } = require('./BagWidget');
      await requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: (info) => buildWidget(info), widgetNotFound: () => {} });
    } catch (e) {
      // widget library missing (Expo Go) or no widget on the home screen
    }
  }, 600);
}
