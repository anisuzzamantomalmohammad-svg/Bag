// The balance line on Home. Solid for what happened, dotted for what's
// coming (with a bubble on each drop), shaded below zero. Drag along it to
// see any day: onScrub gets the point under your finger, then null.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { feel } from '../lib/feel';
import { useTheme, F } from './kit';
import { daysUntil } from '../lib/ledger';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// period: also draw a second line that starts at 0 (just this week or month).
// details: show the figures on the line. onTap: a tap without dragging.
// gold: day by day savings [{ date, v }], drawn as a smooth gold curve on
// its own scale along the bottom (only when there's something saved).
// The figures on the line: where you started, where you'll end (and the
// this-period-only end), the gold Saved. Each stays inside the chart, clear
// of the others, today's dot and the 🏠 pins.
function placeLabels({ g, w, H, line, period, endXY, money, th, details }) {
  const out = [];
  const minY = 11;
  const maxY = H - g.bot - 3;
  const clamp = (y) => Math.max(minY, Math.min(maxY, y));
  const width = (t) => t.length * 6.3;
  if (g.pastXY.length) {
    const sy = g.y(line.start);
    out.push({ key: 'start', x: g.pastXY[0][0] + 8, anchor: 'start', y: sy - 8 < minY ? sy + 16 : sy - 8, text: money(line.start), color: th.warn });
  }
  const right = [];
  // Little left after today (end of the month): the end figures go left of
  // today's dot instead of piling up at the edge.
  const rx = endXY[0] - g.lastXY[0] < 70 && g.lastXY[0] > 120 ? g.lastXY[0] - 14 : w - 4;
  if (line.fut.length > 1) {
    const near = Math.abs(endXY[0] - g.lastXY[0]) < 70 && Math.abs(endXY[1] - g.lastXY[1]) < 22;
    right.push({ key: 'end', x: rx, anchor: 'end', y: rx < w - 4 ? endXY[1] - 12 : near ? endXY[1] + 20 : endXY[1] - 10, text: money(line.end), color: line.end < 0 ? th.out : th.muted });
  }
  if (period && g.f2XY.length) {
    const e2 = g.f2XY[g.f2XY.length - 1];
    const v2 = line.fut[line.fut.length - 1].v - line.start;
    right.push({ key: 'end2', x: rx, anchor: 'end', y: e2[1] + 16, text: `${v2 >= 0 ? '+' : ''}${money(v2)}`, color: th.lineP || '#B79CF0' });
  }
  if (g.goldD && details) right.push({ key: 'gold', x: g.goldEnd.x - 8, anchor: 'end', y: g.goldEnd.y - 8, text: `Saved ${money(g.goldEnd.v)}`, color: th.gold || '#F5C35B' });
  // Pins and today's dot are things to keep clear of.
  const avoid = [{ x: g.lastXY[0], y: g.lastXY[1], r: 9 }];
  g.pins.forEach((q) => avoid.push({ x: q.x, y: q.y, r: 12 }));
  const box = (l) => {
    const wd = width(l.text);
    const x0 = l.anchor === 'end' ? l.x - wd : l.anchor === 'middle' ? l.x - wd / 2 : l.x;
    return { x0, x1: x0 + wd, y0: l.y - 10, y1: l.y + 3 };
  };
  const hits = (l) => avoid.some((a) => { const b = box(l); return a.x + a.r > b.x0 && a.x - a.r < b.x1 && a.y + a.r > b.y0 && a.y - a.r < b.y1; });
  const all = [...out, ...right];
  all.forEach((l) => {
    l.y = clamp(l.y);
    // Off a pin or the dot: try below, then above.
    if (hits(l)) {
      const a = avoid.find((v) => { const b = box(l); return v.x + v.r > b.x0 && v.x - v.r < b.x1 && v.y + v.r > b.y0 && v.y - v.r < b.y1; });
      const down = clamp(a.y + a.r + 12);
      const up = clamp(a.y - a.r - 3);
      l.y = !hits({ ...l, y: down }) ? down : up;
    }
  });
  // No two figures on top of each other.
  const sorted = all.slice().sort((p, q) => p.y - q.y);
  for (let i = 1; i < sorted.length; i += 1) {
    const p = box(sorted[i - 1]);
    const q = box(sorted[i]);
    const overlapX = p.x0 < q.x1 && q.x0 < p.x1;
    if (overlapX && sorted[i].y - sorted[i - 1].y < 13) sorted[i].y = sorted[i - 1].y + 13;
  }
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    if (sorted[i].y > maxY) {
      sorted[i].y = maxY;
      for (let k = i - 1; k >= 0; k -= 1) if (sorted[k + 1].y - sorted[k].y < 13 && box(sorted[k]).x0 < box(sorted[k + 1]).x1 && box(sorted[k + 1]).x0 < box(sorted[k]).x1) sorted[k].y = sorted[k + 1].y - 13;
    }
  }
  return all;
}

export default function BalanceLine({ line, ticks = [], onScrub, money, motion = true, period = false, details = false, onTap, height, gold = null }) {
  const H = height || 180;
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
    if (period) [...line.pts, ...line.fut].forEach((p) => all.push(p.v - line.start));
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
    const p2XY = period ? line.pts.map((p, i) => [pastXY[i][0], y(p.v - line.start)]) : [];
    const f2XY = period ? line.fut.map((p, i) => [futXY[i][0], y(p.v - line.start)]) : [];
    const targets = [...line.pts.map((p, i) => ({ ...p, x: pastXY[i][0], y: pastXY[i][1] })), ...line.fut.map((p, i) => ({ ...p, x: futXY[i][0], y: futXY[i][1] })).filter((p) => p.pin)];
    // Savings: smooth curve, own scale, in the lower part of the chart.
    let goldD = null;
    let goldEnd = null;
    const gmax = gold && gold.length ? Math.max(...gold.map((p) => p.v)) : 0;
    if (gmax > 0) {
      const gy = (v) => H - bot - 4 - (Math.max(0, v) / gmax) * (H - top - bot) * 0.42;
      const P = gold.map((p) => [xOf(p), gy(p.v)]);
      let d = `M${P[0][0].toFixed(1)} ${P[0][1].toFixed(1)}`;
      for (let k = 0; k < P.length - 1; k += 1) {
        const p0 = P[k - 1] || P[k], p1 = P[k], p2 = P[k + 1], p3 = P[k + 2] || p2;
        d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
      }
      goldD = d;
      goldEnd = { x: P[P.length - 1][0], y: P[P.length - 1][1], v: gold[gold.length - 1].v, area: `${d} L${P[P.length - 1][0].toFixed(1)} ${H - bot} L${P[0][0].toFixed(1)} ${H - bot} Z` };
    }
    // 🏠 pins sit on the line; two close together stack instead of covering each other.
    const pins = [];
    line.fut.forEach((p, i) => {
      if (!p.pin) return;
      let px = futXY[i][0];
      let py = futXY[i][1];
      const near = pins.filter((q) => Math.abs(q.x - px) < 20 && Math.abs(q.y - py) < 22);
      if (near.length) {
        py = Math.max(...near.map((q) => q.y)) + 22;
        if (py > H - bot - 10) py = Math.min(...near.map((q) => q.y)) - 22;
      }
      px = Math.min(w - 11, Math.max(11, px));
      pins.push({ x: px, y: Math.max(top - 6, Math.min(H - bot - 10, py)), pin: p.pin, color: p.color, key: `pin${i}` });
    });
    return { padL, padR, top, bot, y, xOf, pastXY, futXY, p2XY, f2XY, path, len: Math.max(1, len), lastXY, area, lo, targets, span, goldD, goldEnd, pins };
  }, [w, line, period, H, gold]);

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
  const scrubbing = useRef(false);
  const startX = useRef(0);
  const stop = () => { lastPick.current = null; scrubbing.current = false; setHover(null); onScrub && onScrub(null); };
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => !scrubbing.current,
    onPanResponderGrant: (e) => { startX.current = e.nativeEvent.locationX; scrubbing.current = false; },
    onPanResponderMove: (e, gs) => {
      // A drag scrubs; a tap (no real movement) shows or hides the details.
      if (!scrubbing.current && Math.abs(gs.dx) < 5) return;
      scrubbing.current = true;
      const p = pick(e.nativeEvent.locationX);
      if (p && p !== lastPick.current) { lastPick.current = p; setHover(p); onScrub && onScrub(p); feel.pick(); }
    },
    onPanResponderRelease: () => { const was = scrubbing.current; stop(); if (!was && onTap) onTap(); },
    onPanResponderTerminate: stop,
  }), [g, onTap]);

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
            <LinearGradient id="gg" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#F5C35B" stopOpacity="0.22" /><Stop offset="1" stopColor="#F5C35B" stopOpacity="0" /></LinearGradient>
          </Defs>
          {negative ? (
            <G>
              <Rect x={0} y={g.y(0)} width={w} height={Math.max(0, H - g.bot - g.y(0))} fill="url(#ng)" />
              <Line x1={g.padL} x2={w - g.padR} y1={g.y(0)} y2={g.y(0)} stroke={th.out} strokeOpacity={0.35} strokeDasharray="3 4" />
              <SvgText x={4} y={g.y(0) + 3} fontSize={10} fill={th.faint} fontFamily={F.regular}>0</SvgText>
            </G>
          ) : null}
          {g.area ? <Path d={g.area} fill="url(#ag)" /> : null}
          {g.goldD ? <Path d={g.goldEnd.area} fill="url(#gg)" /> : null}
          {g.goldD ? <Path d={g.goldD} stroke={th.gold || '#F5C35B'} strokeWidth={2.3} fill="none" strokeLinecap="round" /> : null}
          {g.goldD ? <Circle cx={g.goldEnd.x} cy={g.goldEnd.y} r={4} fill={th.gold || '#F5C35B'} stroke={th.dotRing} strokeWidth={2} /> : null}
          {g.pastXY.length > 1 ? (
            <AnimatedPath d={g.path(g.pastXY)} stroke="url(#lg)" strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray={`${g.len} ${g.len}`} strokeDashoffset={draw.interpolate({ inputRange: [0, 1], outputRange: [g.len, 0] })} />
          ) : null}
          {period && g.p2XY.length > 1 ? <Path d={g.path(g.p2XY)} stroke={th.lineP || '#B79CF0'} strokeWidth={2.2} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
          {period && g.f2XY.length > 1 ? <Path d={g.path(g.f2XY)} stroke={th.lineP || '#B79CF0'} strokeOpacity={0.55} strokeWidth={1.8} fill="none" strokeDasharray="2 6" strokeLinecap="round" /> : null}
          {period && g.p2XY.length ? <Circle cx={g.p2XY[g.p2XY.length - 1][0]} cy={g.p2XY[g.p2XY.length - 1][1]} r={4} fill={th.lineP || '#B79CF0'} /> : null}
          <Path d={g.path(g.futXY)} stroke={futColor} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeDasharray="2 6" />
          {line.fut.length > 1 ? <Circle cx={endXY[0]} cy={endXY[1]} r={4} fill={futColor} /> : null}
          {g.pastXY.length ? <Circle cx={g.pastXY[0][0]} cy={g.y(line.start)} r={4} fill={th.warn} /> : null}
          {g.pins.map((q) => (
            <G key={q.key}>
              <Circle cx={q.x} cy={q.y} r={10} fill={th.pinBg} stroke={q.color || th.warn} strokeWidth={1.2} />
              <SvgText x={q.x} y={q.y + 4} fontSize={10.5} textAnchor="middle">{q.pin}</SvgText>
            </G>
          ))}
          {placeLabels({ g, w, H, line, period, endXY, money, th, details }).map((l) => (
            <SvgText key={l.key} x={l.x} y={l.y} fontSize={11} fontFamily={F.semi} textAnchor={l.anchor} fill={l.color}>{l.text}</SvgText>
          ))}
          <Circle cx={g.lastXY[0]} cy={g.lastXY[1]} r={5} fill={th.dot} stroke={th.dotRing} strokeWidth={3} />
          {ticks.filter(([date, label], i, arr) => label === 'Today' || !arr.some(([d2, l2]) => l2 === 'Today' && Math.abs(g.xOf({ date: d2 }) - g.xOf({ date })) < 44)).map(([date, label]) => {
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
