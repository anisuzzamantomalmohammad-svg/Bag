// Bag: personal money records. App shell: fonts, theme, tabs, sub-screens,
// sheets, the lock screen and the toast. Built the same way as Deen.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Linking, PanResponder, Platform, StatusBar, StyleSheet, View, useWindowDimensions } from 'react-native';
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
import UpcomingScreen from './src/screens/Upcoming';
import ReportsScreen from './src/screens/Reports';
import Sheets from './src/screens/Sheets';
import Onboarding from './src/screens/Onboarding';
import LockScreen from './src/screens/Lock';

SplashScreen.preventAutoHideAsync().catch(() => {});

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

const TAB_ORDER = ['Home', 'Records', 'Upcoming', 'Reports'];
const TAB_SCREENS = { Home: HomeScreen, Records: RecordsScreen, Upcoming: UpcomingScreen, Reports: ReportsScreen };
const native = Platform.OS !== 'web';

// Sub-screens load the first time they're opened.
const STACK_SCREENS = {
  add: () => require('./src/screens/AddRecord').default,
  record: () => require('./src/screens/RecordDetail').default,
  category: () => require('./src/screens/CategoryDetail').default,
  accounts: () => require('./src/screens/Accounts').default,
  account: () => require('./src/screens/AccountEdit').default,
  categories: () => require('./src/screens/Categories').default,
  settings: () => require('./src/screens/Settings').default,
  import: () => require('./src/screens/Import').default,
  repeat: () => require('./src/screens/RepeatEdit').default,
  budget: () => require('./src/screens/BudgetEdit').default,
  goal: () => require('./src/screens/GoalEdit').default,
  breakdown: () => require('./src/screens/Breakdown').default,
};

// Add slides up from the bottom like a sheet; everything else slides in
// from the right while the screen behind sinks back a little.
function StackLayer({ entry, closing, onClosed }) {
  const app = useApp();
  const up = entry.name === 'add';
  const x = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(x, { toValue: closing ? 1 : 0, duration: closing ? 200 : 280, easing: closing ? Easing.in(Easing.quad) : Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start(() => {
      if (closing) onClosed();
    });
  }, [closing]);
  const Screen = STACK_SCREENS[entry.name] ? STACK_SCREENS[entry.name]() : null;
  if (!Screen) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: app.theme.bg, transform: [up ? { translateY: x.interpolate({ inputRange: [0, 1], outputRange: [0, 900] }) } : { translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, 420] }) }] }]}>
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
  // Links from the widget: bag://add, bag://record/<id>, bag://pay/<id>,
  // bag://records?counts=income&from=&to=, bag://records?account=<id>
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
      if (what === 'pay' && id) { setTab('Home'); setTimeout(() => openSheet('confirm', { id }), 150); }
      if (what === 'repeat' && id) { setTab('Upcoming'); setTimeout(() => push('repeat', { id }), 50); }
      if (what === 'records') setTab('Records', { counts: q.counts || null, from: q.from || null, to: q.to || null, accountId: q.account || null });
      if (what === 'reports') setTab('Reports');
      if (what === 'owed' || what === 'upcoming') setTab('Upcoming');
      if (what === 'plan') setTab('Reports', { seg: 'budgets' });
      if (what === 'home') setTab('Home');
      return;
    }
    if (p.type === 'record' && p.id) push('record', { id: p.id });
    if (p.type === 'pay' && p.id) { setTab('Home'); setTimeout(() => openSheet('confirm', { id: p.id }), 300); }
    if (p.type === 'confirm' && p.repeatId) {
      app.runRepeats();
      setTab('Home');
      setTimeout(() => openSheet('confirm', { id: `rep_${p.repeatId}_${p.date}` }), 300);
    }
  }, [app.pendingOpen, app.data.onboarded, app.locked]);

  // The four tabs sit side by side like the faces of a box. Drag sideways
  // anywhere and they turn with your finger; let go and they spring to the
  // nearest one. Only clearly sideways drags count, so scrolling is left alone.
  const { width: W } = useWindowDimensions();
  const pos = useRef(new Animated.Value(0)).current;
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const motion = app.data.animations !== false;
  useEffect(() => {
    const i = TAB_ORDER.indexOf(tab);
    if (motion) Animated.spring(pos, { toValue: i, useNativeDriver: native, damping: 20, stiffness: 180, mass: 0.9 }).start();
    else pos.setValue(i);
  }, [tab]);
  const swipe = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderMove: (_, g) => {
      const i = TAB_ORDER.indexOf(tabRef.current);
      let p = i - g.dx / W;
      if (p < 0) p *= 0.3;
      if (p > TAB_ORDER.length - 1) p = TAB_ORDER.length - 1 + (p - (TAB_ORDER.length - 1)) * 0.3;
      pos.setValue(p);
    },
    onPanResponderRelease: (_, g) => {
      const i = TAB_ORDER.indexOf(tabRef.current);
      let n = i;
      if (g.dx < -W * 0.22 || g.vx < -0.45) n = i + 1;
      if (g.dx > W * 0.22 || g.vx > 0.45) n = i - 1;
      n = Math.max(0, Math.min(TAB_ORDER.length - 1, n));
      if (n !== i) { setTabState(TAB_ORDER[n]); setTabParams({}); }
      else Animated.spring(pos, { toValue: i, useNativeDriver: native, damping: 20, stiffness: 180 }).start();
    },
    onPanResponderTerminate: () => Animated.spring(pos, { toValue: TAB_ORDER.indexOf(tabRef.current), useNativeDriver: native }).start(),
  }), [W]);

  const nav = { tab, setTab, push, pop, popTo, openSheet, closeSheet };
  const topOpen = stack.some((e) => !e.closing);
  // Every tab stays mounted, so the neighbours are there to turn into view.
  const faces = TAB_ORDER.map((id, i) => {
    const Tab = TAB_SCREENS[id];
    const d = Animated.subtract(i, pos);
    const style = motion ? {
      opacity: d.interpolate({ inputRange: [-1.3, -1, 0, 1, 1.3], outputRange: [0, 0.65, 1, 0.65, 0], extrapolate: 'clamp' }),
      transform: [
        { perspective: 1100 },
        { translateX: d.interpolate({ inputRange: [-1, 0, 1], outputRange: [-W, 0, W] }) },
        { rotateY: d.interpolate({ inputRange: [-1, 0, 1], outputRange: ['24deg', '0deg', '-24deg'], extrapolate: 'clamp' }) },
        { scale: d.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.9, 1, 0.9], extrapolate: 'clamp' }) },
      ],
    } : { opacity: tab === id ? 1 : 0, transform: [{ translateX: tab === id ? 0 : W * 2 }] };
    return (
      <Animated.View key={id} pointerEvents={tab === id ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { backfaceVisibility: 'hidden' }, style]}>
        <Tab {...(tab === id ? tabParams : {})} active={tab === id} />
      </Animated.View>
    );
  });
  return (
    <NavCtx.Provider value={nav}>
      <View style={{ flex: 1, backgroundColor: th.bg }}>
        <StatusBar barStyle={th.statusBar} translucent backgroundColor="transparent" />
        {!app.data.onboarded ? (
          <Onboarding />
        ) : (
          <>
            <View style={{ flex: 1, overflow: 'hidden' }} {...(topOpen ? {} : swipe.panHandlers)}>{faces}</View>
            {!topOpen ? <TabBar active={tab} pos={pos} order={TAB_ORDER} onChange={(id) => (id === tab ? setStack([]) : setTab(id))} onAdd={() => push('add', {})} /> : null}
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
