// Bag: personal money records. App shell: fonts, theme, tabs, sub-screens,
// sheets, the lock screen and the toast. Built the same way as Deen.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Linking, Platform, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { useFonts } from 'expo-font';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Fraunces_400Regular, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import './src/lib/background';
import { registerBackground } from './src/lib/background';
import { AppProvider, useApp } from './src/state/store';
import { NavCtx } from './src/nav';
import { Toast, useBackHandler } from './src/ui/kit';
import { TabBar } from './src/ui/parts';
import HomeScreen from './src/screens/Home';
import RecordsScreen from './src/screens/Records';
import OwedScreen from './src/screens/Owed';
import PlanScreen from './src/screens/Plan';
import ReportsScreen from './src/screens/Reports';
import Sheets from './src/screens/Sheets';
import Onboarding from './src/screens/Onboarding';
import LockScreen from './src/screens/Lock';

SplashScreen.preventAutoHideAsync().catch(() => {});

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

const TAB_SCREENS = { Home: HomeScreen, Records: RecordsScreen, Owed: OwedScreen, Plan: PlanScreen, Reports: ReportsScreen };

// Sub-screens load the first time they're opened.
const STACK_SCREENS = {
  add: () => require('./src/screens/AddRecord').default,
  record: () => require('./src/screens/RecordDetail').default,
  category: () => require('./src/screens/CategoryDetail').default,
  accounts: () => require('./src/screens/Accounts').default,
  account: () => require('./src/screens/AccountEdit').default,
  categories: () => require('./src/screens/Categories').default,
  settings: () => require('./src/screens/Settings').default,
  customise: () => require('./src/screens/Customise').default,
  import: () => require('./src/screens/Import').default,
  repeat: () => require('./src/screens/RepeatEdit').default,
  budget: () => require('./src/screens/BudgetEdit').default,
  goal: () => require('./src/screens/GoalEdit').default,
};

function StackLayer({ entry, closing, onClosed }) {
  const app = useApp();
  const x = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(x, { toValue: closing ? 1 : 0, duration: closing ? 200 : 280, easing: closing ? Easing.in(Easing.quad) : Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start(() => {
      if (closing) onClosed();
    });
  }, [closing]);
  const Screen = STACK_SCREENS[entry.name] ? STACK_SCREENS[entry.name]() : null;
  if (!Screen) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: app.theme.bg, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, 420] }) }] }]}>
      <Screen {...(entry.params || {})} />
    </Animated.View>
  );
}

function Shell() {
  const app = useApp();
  const th = app.theme;
  const [tab, setTabState] = useState('Home');
  const [tabParams, setTabParams] = useState({});
  const [stack, setStack] = useState([]);
  const [sheet, setSheet] = useState(null);

  // Tabs can be opened with filters, e.g. Records with only cash out this month.
  const setTab = useCallback((id, params) => {
    setStack([]);
    setTabState(id);
    setTabParams(params ? { ...params, nonce: Date.now() } : {});
  }, []);
  const push = useCallback((name, params) => setStack((s) => [...s, { name, params, key: `${name}-${Date.now()}-${Math.random()}` }]), []);
  const pop = useCallback(() => setStack((s) => {
    const i = s.map((e) => !e.closing).lastIndexOf(true);
    if (i < 0) return s;
    return s.map((e, k) => (k === i ? { ...e, closing: true } : e));
  }), []);
  const popTo = useCallback((n) => setStack((s) => s.map((e, k) => (k >= n ? { ...e, closing: true } : e))), []);
  const openSheet = useCallback((type, params = {}) => setSheet({ type, params, open: true, key: Date.now() }), []);
  const closeSheet = useCallback(() => setSheet((s) => (s ? { ...s, open: false } : s)), []);

  useBackHandler(useCallback(() => {
    if (sheet && sheet.open) { closeSheet(); return true; }
    if (stack.some((e) => !e.closing)) { pop(); return true; }
    if (tab !== 'Home') { setTab('Home'); return true; }
    return false;
  }, [sheet, stack, tab]));

  useEffect(() => { if (app.data.onboarded) registerBackground(); }, [app.data.onboarded]);

  // Taps on reminders open the bill or the "did it arrive?" sheet.
  useEffect(() => {
    const handle = (resp) => {
      const d = resp && resp.notification && resp.notification.request && resp.notification.request.content && resp.notification.request.content.data;
      if (d && d.type) app.setPendingOpen(d);
    };
    Notifications.getLastNotificationResponseAsync().then(handle).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, []);
  // Links from the widget: bag://add, bag://record/<id>, bag://records?counts=income&from=&to=
  useEffect(() => {
    const handle = (url) => { if (url && url.startsWith('bag://')) app.setPendingOpen({ type: 'link', url }); };
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const p = app.pendingOpen;
    if (!p || !app.data.onboarded || app.locked) return;
    app.setPendingOpen(null);
    if (p.type === 'link') {
      const [path, query] = p.url.replace('bag://', '').split('?');
      const [what, id] = path.split('/');
      const q = Object.fromEntries((query || '').split('&').filter(Boolean).map((kv) => kv.split('=').map(decodeURIComponent)));
      if (what === 'add') { setTab('Home'); setTimeout(() => push('add', {}), 50); }
      if (what === 'record' && id) { setTab('Home'); setTimeout(() => push('record', { id }), 50); }
      if (what === 'repeat' && id) { setTab('Plan'); setTimeout(() => push('repeat', { id }), 50); }
      if (what === 'records') setTab('Records', { counts: q.counts || null, from: q.from || null, to: q.to || null });
      if (what === 'reports') setTab('Reports');
      if (what === 'owed') setTab('Owed');
      if (what === 'home') setTab('Home');
      return;
    }
    if (p.type === 'record' && p.id) push('record', { id: p.id });
    if (p.type === 'confirm' && p.repeatId) {
      app.runRepeats();
      setTimeout(() => openSheet('confirm', { id: `rep_${p.repeatId}_${p.date}` }), 300);
    }
  }, [app.pendingOpen, app.data.onboarded, app.locked]);

  const nav = { tab, setTab, push, pop, popTo, openSheet, closeSheet };
  const Tab = TAB_SCREENS[tab];
  const topOpen = stack.some((e) => !e.closing);
  return (
    <NavCtx.Provider value={nav}>
      <View style={{ flex: 1, backgroundColor: th.bg }}>
        <StatusBar barStyle={th.statusBar} translucent backgroundColor="transparent" />
        {!app.data.onboarded ? (
          <Onboarding />
        ) : (
          <>
            <View style={{ flex: 1 }}><Tab {...tabParams} /></View>
            {!topOpen ? <TabBar active={tab} onChange={(id) => (id === tab ? setStack([]) : setTab(id))} /> : null}
            {stack.map((e) => (
              <StackLayer key={e.key} entry={e} closing={!!e.closing} onClosed={() => setStack((s) => s.filter((x) => x.key !== e.key))} />
            ))}
          </>
        )}
        <Sheets sheet={sheet} onClose={closeSheet} />
        <Toast toast={app.toast} onHide={() => app.setToast(null)} />
        {app.locked ? <LockScreen /> : null}
      </View>
    </NavCtx.Provider>
  );
}

function Ready() {
  const app = useApp();
  useEffect(() => { if (app.hydrated) SplashScreen.hideAsync().catch(() => {}); }, [app.hydrated]);
  if (!app.hydrated) return null;
  return <Shell />;
}

export default function App() {
  const [loaded, error] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Fraunces_400Regular, Fraunces_600SemiBold });
  if (!loaded && !error) return null;
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Ready />
      </AppProvider>
    </SafeAreaProvider>
  );
}
