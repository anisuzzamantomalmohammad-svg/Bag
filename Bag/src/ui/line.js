// The balance line on Home. Solid for what happened, dotted for what's
// coming (with a bubble on each drop), shaded below zero. Drag along it to
// see any day: onScrub gets the point under your finger, then null.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Platform, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useTheme, F } from './kit';
import { daysUntil } from '../lib/ledger';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const H = 180;

export default function BalanceLine({ line, ticks = [], onScrub, money, motion = true }) {
  const th = useTheme();
  const [w, setW] = useState(0);
  const draw = useRef(new Animated.Value(0)).current;
  const [hover, setHover] = useState(null);
  const from = line.pts.length ? line.pts[0].date : line.fut[0].date;
  const last = line.fut[line.fut.length - 1].date;

  const g = useMemo(() => {
    if (!w) return null;
    const padL = 18, padR = 30, top = 22, bot = 26;
    const span = Math.max(1, daysUntil(from, last));
    const xOf = (p, i, arr) => {
      let d = daysUntil(from, p.date);
      // Overdue drops sit just after today so they don't hide behind it.
      if (p.late && arr && i > 0) d += 0.6;
      return padL + (d / span) * (w - padL - padR);
    };
    const all = [...line.pts, ...line.fut].map((p) => p.v);
    let lo = Math.min(0, ...all);
    let hi = Math.max(...all);
    const sp = hi - lo || 1;
    lo -= sp * 0.08; hi += sp * 0.14;
    const y = (v) => top + ((hi - v) / (hi - lo)) * (H - top - bot);
    const pastXY = line.pts.map((p) => [xOf(p), y(p.v)]);
    const futXY = line.fut.map((p, i) => [xOf(p, i, line.fut), y(p.v)]);
    const path = (xy) => xy.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
    let len = 0;
    for (let i = 1; i < pastXY.length; i += 1) len += Math.hypot(pastXY[i][0] - pastXY[i - 1][0], pastXY[i][1] - pastXY[i - 1][1]);
    const lastXY = pastXY.length ? pastXY[pastXY.length - 1] : futXY[0];
    const area = pastXY.length ? `${path(pastXY)} L${lastXY[0]} ${y(lo)} L${pastXY[0][0]} ${y(lo)} Z` : '';
    const targets = [...line.pts.map((p, i) => ({ ...p, x: pastXY[i][0], y: pastXY[i][1] })), ...line.fut.map((p, i) => ({ ...p, x: futXY[i][0], y: futXY[i][1] })).filter((p) => p.pin)];
    return { padL, padR, top, bot, y, xOf, pastXY, futXY, path, len: Math.max(1, len), lastXY, area, lo, targets, span };
  }, [w, line]);

  useEffect(() => {
    if (!g) return;
    draw.setValue(motion ? 0 : 1);
    if (motion) Animated.timing(draw, { toValue: 1, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [g && g.len, g && line.now, motion]);

  const pick = (x) => {
    if (!g) return null;
    let best = null;
    let bd = 1e9;
    g.targets.forEach((p) => { const d = Math.abs(p.x - x); if (d < bd) { bd = d; best = p; } });
    return best;
  };
  const lastPick = useRef(null);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => { const p = pick(e.nativeEvent.locationX); lastPick.current = p; setHover(p); onScrub && onScrub(p); },
    onPanResponderMove: (e) => {
      const p = pick(e.nativeEvent.locationX);
      if (p && p !== lastPick.current) { lastPick.current = p; setHover(p); onScrub && onScrub(p); if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); }
    },
    onPanResponderRelease: () => { lastPick.current = null; setHover(null); onScrub && onScrub(null); },
    onPanResponderTerminate: () => { lastPick.current = null; setHover(null); onScrub && onScrub(null); },
  }), [g]);

  const endV = line.end;
  const endXY = g ? g.futXY[g.futXY.length - 1] : [0, 0];
  const negative = line.fut.concat(line.pts).some((p) => p.v < 0);
  const futColor = endV < 0 ? th.out : th.faint;

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: H }} {...pan.panHandlers} accessibilityRole="adjustable" accessibilityLabel="Your balance over time. Drag along it to see any day.">
      {g ? (
        <Svg width={w} height={H}>
          <Defs>
            <LinearGradient id="lg" gradientUnits="userSpaceOnUse" x1={g.padL} y1="0" x2={w - g.padR} y2="0"><Stop offset="0" stopColor={th.lineA} /><Stop offset="1" stopColor={th.lineB} /></LinearGradient>
            <LinearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={th.area} stopOpacity="0.3" /><Stop offset="1" stopColor={th.area} stopOpacity="0" /></LinearGradient>
            <LinearGradient id="ng" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={th.out} stopOpacity="0.2" /><Stop offset="1" stopColor={th.out} stopOpacity="0" /></LinearGradient>
          </Defs>
          {negative ? (
            <G>
              <Rect x={0} y={g.y(0)} width={w} height={Math.max(0, H - g.bot - g.y(0))} fill="url(#ng)" />
              <Line x1={g.padL} x2={w - g.padR} y1={g.y(0)} y2={g.y(0)} stroke={th.out} strokeOpacity={0.35} strokeDasharray="3 4" />
              <SvgText x={4} y={g.y(0) + 3} fontSize={10} fill={th.faint} fontFamily={F.regular}>0</SvgText>
            </G>
          ) : null}
          {g.area ? <Path d={g.area} fill="url(#ag)" /> : null}
          {g.pastXY.length > 1 ? (
            <AnimatedPath d={g.path(g.pastXY)} stroke="url(#lg)" strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray={`${g.len} ${g.len}`} strokeDashoffset={draw.interpolate({ inputRange: [0, 1], outputRange: [g.len, 0] })} />
          ) : null}
          <Path d={g.path(g.futXY)} stroke={futColor} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeDasharray="2 6" />
          {line.fut.length > 1 ? (
            <G>
              <Circle cx={endXY[0]} cy={endXY[1]} r={4} fill={futColor} />
              <SvgText x={endXY[0] - 4} y={endXY[1] - 9} fontSize={11} fontFamily={F.semi} textAnchor="end" fill={endV < 0 ? th.out : th.muted}>{money(endV)}</SvgText>
            </G>
          ) : null}
          {line.fut.map((p, i) => (p.pin ? (
            <G key={`pin${i}`}>
              <Circle cx={g.futXY[i][0]} cy={g.futXY[i][1] + 16} r={11} fill={th.pinBg} stroke={p.color || th.warn} strokeWidth={1.2} />
              <SvgText x={g.futXY[i][0]} y={g.futXY[i][1] + 20} fontSize={11} textAnchor="middle">{p.pin}</SvgText>
            </G>
          ) : null))}
          <Circle cx={g.lastXY[0]} cy={g.lastXY[1]} r={5} fill={th.dot} stroke={th.dotRing} strokeWidth={3} />
          {ticks.map(([date, label]) => {
            const x = g.xOf({ date });
            return <SvgText key={date + label} x={x} y={H - 6} fontSize={10} fontFamily={F.regular} textAnchor={x < 40 ? 'start' : x > w - 40 ? 'end' : 'middle'} fill={label === 'Today' ? th.chipOn : th.faint}>{label}</SvgText>;
          })}
          {hover ? (
            <G>
              <Line x1={hover.x} x2={hover.x} y1={g.top - 10} y2={H - g.bot} stroke={th.ink} strokeOpacity={0.3} strokeDasharray="2 3" />
              <Circle cx={hover.x} cy={hover.y} r={6} fill={th.bg} stroke={th.ink} strokeWidth={2.5} />
            </G>
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
}
