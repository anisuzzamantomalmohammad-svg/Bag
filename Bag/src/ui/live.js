// What makes Bag feel alive: the floating coins and drawings behind every
// tab, cards folding in, and a gentle tilt when you tilt the phone. All of
// it stops with Reduce motion (Bag's switch or the phone's), and goes calm
// by itself while the phone is in battery saver.
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Dimensions, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { ScreenBack, T } from './kit';
import Svg, { Path } from 'react-native-svg';
import { useApp } from '../state/store';
import { DRAW, lookById } from './looks';

const native = Platform.OS !== 'web';

/* ------------------------------ Calm or alive ------------------------------ */

let sysReduce = false;
let lowPower = false;
const listeners = new Set();
const tell = () => listeners.forEach((f) => f());
AccessibilityInfo.isReduceMotionEnabled().then((v) => { sysReduce = !!v; tell(); }).catch(() => {});
try { AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => { sysReduce = !!v; tell(); }); } catch (e) { /* older platforms */ }
if (native) {
  try {
    const Battery = require('expo-battery');
    Battery.isLowPowerModeEnabledAsync().then((v) => { lowPower = !!v; tell(); }).catch(() => {});
    Battery.addLowPowerModeListener(({ lowPowerMode }) => { lowPower = !!lowPowerMode; tell(); });
  } catch (e) { /* no battery module in this build */ }
}

// Why things are still, if they are: 'bag' (Bag's switch), 'system' (the
// phone's Remove animations), 'battery' (battery saver), or null.
export function useCalmReason() {
  const { data } = useApp();
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    listeners.add(f);
    return () => listeners.delete(f);
  }, []);
  if (data && data.reduceMotion) return 'bag';
  if (sysReduce) return 'system';
  if (lowPower) return 'battery';
  return null;
}

// true: animations on. false: Reduce motion or battery saver.
export function useAlive() {
  const { data } = useApp();
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    listeners.add(f);
    return () => listeners.delete(f);
  }, []);
  return !(data && data.reduceMotion) && !sysReduce && !lowPower;
}

/* ------------------------------ Showing ------------------------------ */

// Each tab gets a number that goes up every time it comes into view (0 while
// it's hidden), so its cards fold in and its numbers count up again. Screens
// outside the tabs get undefined and always count as showing.
export const ShownCtx = createContext(undefined);
export const useShown = () => useContext(ShownCtx);

/* ------------------------------ Fold in ------------------------------ */

// Cards come in from below one after another, tipping up into place.
export function Appear({ delay = 0, children, style, off }) {
  const alive = useAlive();
  const shown = useShown();
  const a = useRef(new Animated.Value(alive && !off ? 0 : 1)).current;
  useEffect(() => {
    if (!alive || off) { a.setValue(1); return; }
    if (shown === 0) return; // hidden tab: wait until it comes into view
    a.setValue(0);
    Animated.timing(a, { toValue: 1, duration: 620, delay, easing: Easing.out(Easing.back(1.1)), useNativeDriver: native }).start();
  }, [shown, alive]);
  if (off) return <View style={style}>{children}</View>;
  return (
    <Animated.View style={[style, {
      opacity: a,
      transform: [
        { perspective: 900 },
        { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) },
        { rotateX: a.interpolate({ inputRange: [0, 1], outputRange: ['-18deg', '0deg'] }) },
      ],
    }]}>
      {children}
    </Animated.View>
  );
}

/* ------------------------------ Count up ------------------------------ */

// A number that runs up from 0 to its value when the screen comes into
// view, and slides between values when it changes. fmt turns it into text.
export function useCountUp(target, ms = 800) {
  const alive = useAlive();
  const shown = useShown();
  const [v, setV] = useState(alive ? 0 : target);
  const from = useRef(0);
  const last = useRef(null);
  useEffect(() => {
    if (!alive) { setV(target); return undefined; }
    if (shown === 0) return undefined;
    const start = last.current === shown ? from.current : 0;
    last.current = shown;
    let raf = null;
    const t0 = Date.now();
    const step = () => {
      const k = Math.min(1, (Date.now() - t0) / ms);
      const now = start + (target - start) * (1 - Math.pow(1 - k, 3));
      from.current = now;
      setV(now);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => raf && cancelAnimationFrame(raf);
  }, [target, shown, alive]);
  return Math.round(v * 100) / 100;
}

export function Count({ value, fmt, ...rest }) {
  const v = useCountUp(Number(value) || 0);
  return <T {...rest}>{fmt(v)}</T>;
}

/* ------------------------------ Tilt ------------------------------ */

// One shared motion sensor for every card that tilts. Values are -1..1.
const tilt = { x: new Animated.Value(0), y: new Animated.Value(0), users: 0, sub: null };
function startTilt() {
  if (!native || tilt.sub) return;
  try {
    const { Accelerometer } = require('expo-sensors');
    Accelerometer.setUpdateInterval(60);
    let sx = 0;
    let sy = 0;
    tilt.sub = Accelerometer.addListener(({ x, y }) => {
      sx += ((Math.max(-1, Math.min(1, x * 1.6))) - sx) * 0.18;
      sy += ((Math.max(-1, Math.min(1, (y + 0.55) * 1.6))) - sy) * 0.18;
      tilt.x.setValue(sx);
      tilt.y.setValue(sy);
    });
  } catch (e) { tilt.sub = null; }
}
function stopTilt() {
  if (tilt.sub) { tilt.sub.remove(); tilt.sub = null; }
  tilt.x.setValue(0);
  tilt.y.setValue(0);
}
AppState.addEventListener('change', (s) => { if (s !== 'active') stopTilt(); else if (tilt.users > 0) startTilt(); });

// A card that leans a few degrees as you tilt the phone. Only the card
// leans (about 3°), so the text on it stays sharp. depth: how much.
export function Tilt({ children, style, depth = 1 }) {
  const { data } = useApp();
  const alive = useAlive();
  const on = alive && data && data.tilt !== false;
  useEffect(() => {
    if (!on) return undefined;
    tilt.users += 1;
    startTilt();
    return () => { tilt.users -= 1; if (tilt.users <= 0) { tilt.users = 0; stopTilt(); } };
  }, [on]);
  if (!on) return <View style={style}>{children}</View>;
  const deg = 3 * depth;
  return (
    <Animated.View style={[style, {
      transform: [
        { perspective: 1000 },
        { rotateY: tilt.x.interpolate({ inputRange: [-1, 1], outputRange: [`${deg}deg`, `-${deg}deg`] }) },
        { rotateX: tilt.y.interpolate({ inputRange: [-1, 1], outputRange: [`-${deg * 0.8}deg`, `${deg * 0.8}deg`] }) },
      ],
    }]}>
      {children}
    </Animated.View>
  );
}

/* ------------------------------ Background ------------------------------ */

const W = Dimensions.get('window').width;
const H = Dimensions.get('window').height;

function Coin({ size, sym, color, mode }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: color, alignItems: 'center', justifyContent: 'center', backgroundColor: mode === 'dark' ? 'rgba(245,195,91,0.06)' : 'rgba(201,144,46,0.06)' }}>
      <Text style={{ color, fontSize: size * 0.46, fontWeight: '700' }}>{sym}</Text>
    </View>
  );
}

function Drawing({ d, size, color }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={d} stroke={color} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// One floating thing: rises from below the screen to above it, swaying and
// (for coins) spinning, then starts again. Kept to the side gutters so it
// never drifts over the balance, the pills or a number.
function Floater({ item, alive }) {
  const t = useRef(new Animated.Value(item.start)).current;
  const s = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!alive) return undefined;
    let stopped = false;
    const run = (from) => {
      t.setValue(from);
      Animated.timing(t, { toValue: 1, duration: Math.max(500, item.dur * (1 - from)), easing: Easing.linear, useNativeDriver: native }).start(({ finished }) => { if (finished && !stopped) run(0); });
    };
    run(item.start);
    const sway = Animated.loop(Animated.sequence([
      Animated.timing(s, { toValue: 1, duration: item.sway, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      Animated.timing(s, { toValue: 0, duration: item.sway, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
    ]));
    sway.start();
    return () => { stopped = true; t.stopAnimation(); sway.stop(); };
  }, [alive]);
  if (!alive) {
    // Calm: the coins stay where they are instead of disappearing.
    return (
      <View style={{ position: 'absolute', left: item.x, top: H + 40 - item.start * (H + 120), opacity: item.op }}>
        {item.coin ? <Coin size={item.size} sym={item.sym} color={item.color} mode={item.mode} /> : <Drawing d={item.d} size={item.size} color={item.color} />}
      </View>
    );
  }
  const ty = t.interpolate({ inputRange: [0, 1], outputRange: [H + 40, -80] });
  const tx = s.interpolate({ inputRange: [0, 1], outputRange: [-8, 8] });
  const rot = s.interpolate({ inputRange: [0, 1], outputRange: ['-15deg', '15deg'] });
  const spin = t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: ['0deg', '180deg', '360deg', '540deg', '720deg'] });
  return (
    <Animated.View style={{ position: 'absolute', left: item.x, top: 0, opacity: item.op, transform: [{ translateY: ty }, { translateX: tx }, { perspective: 600 }, item.coin ? { rotateY: spin } : { rotate: rot }] }}>
      {item.coin ? <Coin size={item.size} sym={item.sym} color={item.color} mode={item.mode} /> : <Drawing d={item.d} size={item.size} color={item.color} />}
    </Animated.View>
  );
}

export function Backdrop() {
  const app = useApp();
  const shown = useShown();
  // Coins only move on the screen you're looking at.
  const alive = useAlive() && shown !== 0;
  const th = app.theme;
  const look = lookById(app.data.lookNow);
  const items = useMemo(() => {
    const out = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const left = i % 2 === 0;
      const size = 14 + ((i * 7) % 14);
      const coin = i % 3 !== 1 || !look.draw.length;
      out.push({
        key: `${look.id}-${i}`,
        // Half off the edge, so they never sit over a row or a number.
        x: left ? -size * 0.45 + ((i * 5) % 6) : W - size * 0.55 - ((i * 5) % 6),
        size,
        coin,
        sym: look.sym,
        d: DRAW[look.draw[i % look.draw.length]] || DRAW.coin,
        color: coin ? (th.mode === 'dark' ? '#C9A257' : '#B7863A') : th.mode === 'dark' ? '#9FB0C3' : '#6B7888',
        op: th.mode === 'dark' ? 0.26 + ((i * 3) % 5) * 0.03 : 0.2 + ((i * 3) % 5) * 0.03,
        dur: 22000 + ((i * 3779) % 14000),
        sway: 2400 + ((i * 911) % 2400),
        start: ((i * 0.137) % 1),
        mode: th.mode,
      });
    }
    return out;
  }, [look.id, th.mode]);
  if (app.data.backdrop === false) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', top: -170, right: -150, width: 320, height: 320, borderRadius: 160, backgroundColor: look.glow[0], opacity: th.mode === 'dark' ? 0.05 : 0.045 }} />
      {items.map((it) => <Floater key={`${it.key}-${alive ? 'a' : 'c'}`} item={it} alive={alive} />)}
    </View>
  );
}

ScreenBack.C = Backdrop;
