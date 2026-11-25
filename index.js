import { Platform } from 'react-native';
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);

if (Platform.OS === 'android') {
  try {
    const { registerWidgetTaskHandler } = require('react-native-android-widget');
    const { widgetTaskHandler } = require('./src/widget/handler');
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch (e) {
    // Expo Go has no widget support
  }
}
