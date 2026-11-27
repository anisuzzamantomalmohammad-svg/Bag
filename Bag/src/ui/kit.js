// Shared building blocks: text, cards, rows, chips, switches, buttons,
// inputs, sheets and the toast. Everything reads the theme, so light, dark
// and the accent colour come for free.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Easing, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useApp } from '../state/store';
import { useNav } from '../nav';
import Svg, { Circle } from 'react-native-svg';
import { alpha } from '../lib/look';
import { feel } from '../lib/feel';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);


// Pressable with a light tap feel. Every plain button in the app uses this.
export function Press({ onPress, onLongPress, ...rest }) {
  return (
    <Pressable
      {...rest}
      onPress={onPress ? (e) => { feel.tap(); onPress(e); } : undefined}
      onLongPress={onLongPress ? (e) => { feel.firm(); onLongPress(e); } : undefined}
    />
  );
}

export const F = { regular: 'Inter_400Regular', medium: 'Inter_500Medium', semi: 'Inter_600SemiBold', bold: 'Inter_700Bold', serif: 'Fraunces_400Regular', serifSemi: 'Fraunces_600SemiBold' };
const native = Platform.OS !== 'web';

export function useTheme() {
  return useApp().theme;
}

export function T({ size = 15, weight = 'regular', color, center, style, children, serif, ...rest }) {
  const th = useTheme();
  const fam = serif ? (weight === 'semi' || weight === 'bold' ? F.serifSemi : F.serif) : F[weight] || F.regular;
  return (
    <Text
      allowFontScaling
      {...rest}
      style={[{ fontFamily: fam, fontSize: size * (th.textScale || 1), color: color || th.ink, textAlign: center ? 'center' : undefined, lineHeight: size * (th.textScale || 1) * 1.35 }, style]}
    >
      {children}
    </Text>
  );
}

export const Sub = (p) => {
  const th = useTheme();
  return <T size={13} color={th.faint} {...p} />;
};

export function Icon({ name, size = 20, color, style }) {
  const th = useTheme();
  return <Feather name={name} size={size} color={color || th.ink} style={style} />;
}

export function Card({ style, children, pad = 16, onPress, ...rest }) {
  const th = useTheme();
  const s = [{ backgroundColor: th.card, borderRadius: 22, padding: pad, overflow: 'hidden' }, style];
  if (onPress) {
    return (
      <Pressable onPress={(e) => { feel.tap(); onPress(e); }} style={({ pressed }) => [s, pressed && { opacity: 0.85 }]} {...rest}>
        {children}
      </Pressable>
    );
  }
  return <View style={s} {...rest}>{children}</View>;
}

// A row in a card: label on the left, value on the right, optional chevron.
export function Row({ label, sub, value, valueColor, left, right, onPress, first, chevron, style, minHeight = 54, accessibilityLabel }) {
  const th = useTheme();
  const content = (
    <View style={[{ minHeight, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: first ? 0 : 1, borderTopColor: th.line, paddingVertical: 8 }, style]}>
      {left}
      <View style={{ flex: 1 }}>
        {typeof label === 'string' ? <T>{label}</T> : label}
        {sub ? (typeof sub === 'string' ? <Sub>{sub}</Sub> : sub) : null}
      </View>
      {value !== undefined && value !== null ? (typeof value === 'string' ? <T size={14} color={valueColor || th.muted} style={{ maxWidth: '58%', textAlign: 'right' }}>{value}</T> : value) : null}
      {right}
      {chevron || (onPress && chevron !== false) ? <Icon name="chevron-right" size={18} color={th.faint2} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={(e) => { feel.tap(); onPress(e); }} accessibilityRole="button" accessibilityLabel={accessibilityLabel || (typeof label === 'string' ? label : undefined)} style={({ pressed }) => pressed && { opacity: 0.6 }}>
      {content}
    </Pressable>
  );
}

// Some newer emoji (like 🫙) make Android measure the whole line wrong, so
// the words after it vanish. A label that starts with an emoji draws the
// emoji on its own, then the words.
export function splitEmoji(label) {
  if (typeof label !== 'string') return [null, label];
  const chars = Array.from(label);
  const first = chars[0] || '';
  const cp = first.codePointAt(0) || 0;
  if (cp >= 0x2190 && chars[1] === ' ') return [first, chars.slice(2).join('')];
  return [null, label];
}
export function EmojiLabel({ text, size = 14, ...rest }) {
  const [emoji, words] = splitEmoji(text);
  if (!emoji) return <T size={size} numberOfLines={1} {...rest}>{words}</T>;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Text style={{ fontSize: size, lineHeight: size * 1.35, minWidth: size * 1.4, textAlign: 'center', includeFontPadding: false }} allowFontScaling={false}>{emoji}</Text>
      <T size={size} numberOfLines={1} {...rest}>{words}</T>
    </View>
  );
}

export function Chip({ label, on, onPress, style, icon }) {
  const th = useTheme();
  return (
    <Pressable
      onPress={onPress ? (e) => { feel.pick(); onPress(e); } : undefined}
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      style={({ pressed }) => [{
        minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: on ? th.chipOn : th.lineStrong,
        backgroundColor: on ? th.chipOn : th.card, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, opacity: pressed ? 0.8 : 1,
      }, style]}
    >
      {icon ? <Icon name={icon} size={15} color={on ? th.chipOnInk : th.muted} /> : null}
      <EmojiLabel text={label} size={14} weight={on ? 'semi' : 'medium'} color={on ? th.chipOnInk : th.muted} />
    </Pressable>
  );
}

export function Chips({ children, style }) {
  return <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, style]}>{children}</View>;
}

// Segmented control: [{ id, label }]. The selected one has a little card
// that slides across when you change it.
export function Seg({ items, value, onChange, style, small }) {
  const th = useTheme();
  const [lay, setLay] = useState({});
  const x = useRef(new Animated.Value(0)).current;
  const w = useRef(new Animated.Value(0)).current;
  const on = lay[value];
  useEffect(() => {
    if (!on) return;
    Animated.parallel([
      Animated.spring(x, { toValue: on.x, useNativeDriver: false, damping: 18, stiffness: 220 }),
      Animated.spring(w, { toValue: on.w, useNativeDriver: false, damping: 18, stiffness: 220 }),
    ]).start();
  }, [value, on && on.x, on && on.w]);
  return (
    <View accessibilityRole="tablist" style={[{ flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: th.card }, style]}>
      {on ? <Animated.View style={{ position: 'absolute', top: 4, bottom: 4, left: x, width: w, borderRadius: 12, backgroundColor: th.soft, borderWidth: 1, borderColor: th.lineStrong }} /> : null}
      {items.map((it) => {
        const sel = it.id === value;
        return (
          <Pressable
            key={it.id}
            onLayout={(e) => { const { x: lx, width } = e.nativeEvent.layout; setLay((l) => (l[it.id] && l[it.id].x === lx && l[it.id].w === width ? l : { ...l, [it.id]: { x: lx, w: width } })); }}
            onPress={() => { if (!sel) feel.pick(); onChange(it.id); }}
            accessibilityRole="tab"
            accessibilityState={{ selected: sel }}
            style={{ flex: 1, minHeight: small ? 36 : 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}
          >
            <T size={13.5} weight="medium" color={sel ? th.ink : th.faint} numberOfLines={1}>{it.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

// A soft coloured square with an emoji: the look of every category.
export function Bubble({ emoji, color, size = 42, style }) {
  const c = color || '#9AA7B6';
  return (
    <View style={[{ width: size, height: size, borderRadius: size * 0.36, backgroundColor: alpha(c, 0.17), alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={{ fontSize: size * 0.45 }}>{emoji || '🏷️'}</Text>
    </View>
  );
}

// A ring that fills to pct (0..1) when it appears.
export function Ring({ pct = 0, color, size = 44, stroke = 4, children, style }) {
  const th = useTheme();
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: Math.max(0, Math.min(1, pct)), duration: 1000, delay: 120, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [pct]);
  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={th.soft} strokeWidth={stroke} fill="none" />
        <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={color || th.chipOn} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${c} ${c}`} strokeDashoffset={a.interpolate({ inputRange: [0, 1], outputRange: [c, 0] })} />
      </Svg>
      {children}
    </View>
  );
}

// Days left, in a ring that empties as the day gets close.
export function DaysRing({ days, color }) {
  const th = useTheme();
  const label = days <= 0 ? (days === 0 ? 'Today' : 'Late') : String(days);
  return (
    <Ring pct={days <= 0 ? 1 : Math.min(1, days / 30)} color={days < 0 ? th.warn : color}>
      <T size={days > 0 ? 12 : 9} weight="semi" style={{ lineHeight: 13 }}>{label}</T>
      {days > 0 ? <T size={8.5} color={th.faint} style={{ lineHeight: 10 }}>{days === 1 ? 'day' : 'days'}</T> : null}
    </Ring>
  );
}

const OUTER_KEYS = new Set(['flex', 'flexGrow', 'flexShrink', 'flexBasis', 'width', 'minWidth', 'maxWidth', 'alignSelf', 'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical', 'position', 'top', 'left', 'right', 'bottom', 'zIndex']);

// Shrinks a little under your finger, then springs back.
export function Squish({ onPress, onLongPress, style, children, accessibilityLabel, accessibilityRole = 'button', delayLongPress }) {
  const s = useRef(new Animated.Value(1)).current;
  // Sizing that belongs to the outside (flex, width, margins) goes on the
  // Pressable, so a Squish fills its row like a View would.
  const flat = StyleSheet.flatten(style) || {};
  const outer = {};
  const inner = {};
  Object.keys(flat).forEach((k) => { (OUTER_KEYS.has(k) ? outer : inner)[k] = flat[k]; });
  if (outer.width !== undefined || outer.flex !== undefined || outer.flexGrow !== undefined) inner.flexGrow = 1;
  return (
    <Pressable style={outer} onPress={onPress ? (e) => { feel.tap(); onPress(e); } : undefined} onLongPress={onLongPress ? (e) => { feel.firm(); onLongPress(e); } : undefined} delayLongPress={delayLongPress} accessibilityRole={accessibilityRole} accessibilityLabel={accessibilityLabel}
      onPressIn={() => Animated.spring(s, { toValue: 0.96, useNativeDriver: native, speed: 40 }).start()}
      onPressOut={() => Animated.spring(s, { toValue: 1, useNativeDriver: native, friction: 4 }).start()}>
      <Animated.View style={[inner, { transform: [{ scale: s }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

export function Toggle({ value, onChange, label }) {
  const th = useTheme();
  const a = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: value ? 1 : 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [value]);
  return (
    <Pressable onPress={() => { feel.pick(); onChange(!value); }} accessibilityRole="switch" accessibilityState={{ checked: !!value }} accessibilityLabel={label} hitSlop={8}>
      <Animated.View style={{ width: 52, height: 32, borderRadius: 16, justifyContent: 'center', backgroundColor: a.interpolate({ inputRange: [0, 1], outputRange: [th.lineStrong, th.accentFill] }) }}>
        <Animated.View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF', transform: [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [4, 24] }) }] }} />
      </Animated.View>
    </Pressable>
  );
}

export function Button({ label, onPress, kind = 'primary', icon, style, disabled, small, accessibilityLabel }) {
  const th = useTheme();
  const look = {
    primary: { bg: th.chipOn, fg: th.chipOnInk, border: th.chipOn },
    secondary: { bg: th.card, fg: th.ink, border: th.lineStrong },
    danger: { bg: th.mode === 'dark' ? '#7F1D1D' : '#B91C1C', fg: '#FFFFFF', border: th.mode === 'dark' ? '#7F1D1D' : '#B91C1C' },
    dangerText: { bg: th.card, fg: th.danger, border: th.lineStrong },
    ghost: { bg: 'transparent', fg: th.accent, border: 'transparent' },
    amber: { bg: th.warnBtn, fg: th.warnBtnInk, border: th.warnBtn },
    soft: { bg: th.mode === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(14,19,26,0.06)', fg: th.ink, border: 'transparent' },
  }[kind];
  return (
    <Pressable
      onPress={disabled ? () => feel.warn() : (e) => { (kind === 'danger' || kind === 'dangerText' ? feel.warn : kind === 'primary' ? feel.firm : feel.tap)(); onPress && onPress(e); }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [{
        minHeight: small ? 40 : 52, borderRadius: small ? 12 : 16, paddingHorizontal: small ? 14 : 18, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
        backgroundColor: look.bg, borderWidth: 1, borderColor: look.border, opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
      }, style]}
    >
      {icon ? <Icon name={icon} size={small ? 16 : 18} color={look.fg} /> : null}
      <T size={small ? 14 : 16} weight="semi" color={look.fg}>{label}</T>
    </Pressable>
  );
}

export function Field({ label, style, inputStyle, big, ...rest }) {
  const th = useTheme();
  return (
    <View style={style}>
      {label ? <T size={13} color={th.muted} style={{ marginBottom: 6 }}>{label}</T> : null}
      <TextInput
        placeholderTextColor={th.faint2}
        accessibilityLabel={label}
        {...rest}
        style={[{
          minHeight: big ? 64 : 50, borderRadius: 14, paddingHorizontal: 16, backgroundColor: th.card, color: th.ink,
          fontFamily: big ? F.semi : F.regular, fontSize: (big ? 30 : 16) * (th.textScale || 1),
        }, inputStyle]}
      />
    </View>
  );
}

export function Label({ children, style }) {
  const th = useTheme();
  return <T size={12} weight="medium" color={th.muted} style={[{ marginTop: 8, marginBottom: 6, marginHorizontal: 4, letterSpacing: 1 }, style]}>{children}</T>;
}

// Coloured amount: green in, red out (or the blue/orange choice), neutral otherwise.
export function Amount({ value, kind = 'auto', size = 15, weight = 'medium', plus, currency, style, muted, serif }) {
  const th = useTheme();
  const { money } = useApp();
  const zero = !Number(value);
  const k = zero ? 'neutral' : kind === 'auto' ? (value > 0 ? 'in' : value < 0 ? 'out' : 'neutral') : kind;
  const color = muted ? th.faint : k === 'in' ? th.in : k === 'out' || k === 'neg' ? th.out : th.ink;
  return <T size={size} weight={serif ? 'regular' : weight} serif={serif} color={color} style={style}>{money(zero ? 0 : value, { plus: !zero && (plus !== undefined ? plus : k === 'in'), currency })}</T>;
}

// Balance colour rule: neutral above zero, red below.
export function Balance({ value, size = 34, style, color }) {
  const th = useTheme();
  const { money } = useApp();
  return <T size={size} serif color={value < 0 ? th.out : color || th.ink} style={[{ letterSpacing: -0.3 }, style]}>{money(value)}</T>;
}

export function IconBox({ emoji, size = 36, style }) {
  const th = useTheme();
  return (
    <View style={[{ width: size, height: size, borderRadius: size * 0.36, backgroundColor: th.soft, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={{ fontSize: size * 0.5 }}>{emoji || '🏷️'}</Text>
    </View>
  );
}

// Progress bar made of segments: [{ pct, color }]
export function Bar({ parts, height = 8, style }) {
  const th = useTheme();
  return (
    <View style={[{ height, borderRadius: height / 2, backgroundColor: th.line, overflow: 'hidden', flexDirection: 'row' }, style]}>
      {parts.map((p, i) => <View key={i} style={{ width: `${Math.max(0, Math.min(100, p.pct))}%`, backgroundColor: p.color }} />)}
    </View>
  );
}

export function Empty({ title, text, action, onAction, style }) {
  const th = useTheme();
  return (
    <Card style={[{ alignItems: 'center', paddingVertical: 24 }, style]}>
      <T size={15} weight="semi" center>{title}</T>
      {text ? <T size={14} color={th.muted} center style={{ marginTop: 6, maxWidth: 280 }}>{text}</T> : null}
      {action ? <Button label={action} onPress={onAction} kind="secondary" small style={{ marginTop: 12 }} /> : null}
    </Card>
  );
}

export function Header({ title, back = true, onBack, right, big }) {
  const th = useTheme();
  const nav = useNav();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: back ? 8 : 20, paddingTop: 8, paddingBottom: 8, minHeight: 56 }}>
      {back ? (
        <Pressable onPress={onBack || (() => nav.pop())} accessibilityRole="button" accessibilityLabel="Back" hitSlop={6} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={back === 'close' ? 'x' : 'chevron-left'} size={24} color={th.ink} />
        </Pressable>
      ) : null}
      <T size={big ? 24 : 20} serif style={{ flex: 1 }} numberOfLines={1}>{title}</T>
      {right}
    </View>
  );
}

// Android draws edge to edge, so the window doesn't always shrink for the
// keyboard (never inside a sheet). This is how much of the screen the
// keyboard really covers; 0 when the window already made room.
export function useKeyboardGap() {
  const { height: winH } = useWindowDimensions();
  const [gap, setGap] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      const top = e && e.endCoordinates ? e.endCoordinates.screenY : 0;
      const h = e && e.endCoordinates ? e.endCoordinates.height : 0;
      setGap(top > 0 ? Math.max(0, Math.min(h, Math.round(winH - top))) : 0);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setGap(0));
    return () => { show.remove(); hide.remove(); };
  }, [winH]);
  return gap;
}

// A full screen: safe area, header, scrolling body.
// live.js fills this in, so screens get the floating coins without kit
// importing live (which imports kit).
export const ScreenBack = { C: null };

export function Screen({ title, back = true, onBack, right, children, footer, big, scroll = true, contentStyle }) {
  const th = useTheme();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardGap();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: th.bg, paddingTop: insets.top, paddingBottom: kb }}>
      {back !== 'close' && ScreenBack.C ? <ScreenBack.C /> : null}
      {title !== undefined ? <Header title={title} back={back} onBack={onBack} right={right} big={big} /> : null}
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[{ paddingHorizontal: 16, paddingBottom: (footer ? 16 : 32) + (back ? insets.bottom : 0), gap: 12 }, contentStyle]}>
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1, paddingHorizontal: 16 }, contentStyle]}>{children}</View>
      )}
      {footer ? <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 + (kb ? 0 : insets.bottom), backgroundColor: th.bg }}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );
}

// Bottom sheet over a dimmed screen.
export function Sheet({ visible, onClose, title, children, footer }) {
  const th = useTheme();
  const insets = useSafeAreaInsets();
  // A fixed height cap: a percentage would be of the wrapper, which shrinks
  // the sheet and leaves a gap under it.
  const { height: winH } = useWindowDimensions();
  const a = useRef(new Animated.Value(0)).current;
  const kb = useKeyboardGap();
  const [shown, setShown] = useState(visible);
  useEffect(() => {
    if (visible) setShown(true);
    Animated.timing(a, { toValue: visible ? 1 : 0, duration: visible ? 260 : 200, easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.quad), useNativeDriver: native }).start(() => {
      if (!visible) setShown(false);
    });
  }, [visible]);
  if (!shown) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: th.overlay, opacity: a }}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ paddingBottom: kb }}>
          <Animated.View style={{ backgroundColor: th.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: Math.round(winH * 0.9) - insets.top - kb, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [500, 0] }) }] }}>
            <View style={{ alignItems: 'center', paddingTop: 10 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: th.lineStrong }} />
            </View>
            {title ? <T size={20} serif style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 }}>{title}</T> : null}
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: footer ? 8 : 20 + insets.bottom, gap: 10 }}>
              {children}
            </ScrollView>
            {footer ? <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 + insets.bottom, gap: 8 }}>{footer}</View> : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export function Toast({ toast, onHide }) {
  const th = useTheme();
  const insets = useSafeAreaInsets();
  const a = useRef(new Animated.Value(0)).current;
  const hide = () => Animated.timing(a, { toValue: 0, duration: 180, useNativeDriver: native }).start(() => onHide && onHide());
  useEffect(() => {
    if (!toast) return undefined;
    a.setValue(0);
    Animated.timing(a, { toValue: 1, duration: 200, useNativeDriver: native }).start();
    const h = setTimeout(hide, toast.action ? 5000 : 2600);
    return () => clearTimeout(h);
  }, [toast && toast.key]);
  if (!toast) return null;
  const dark = th.mode === 'dark';
  return (
    <Animated.View
      pointerEvents={toast.action ? 'box-none' : 'none'}
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute', left: 16, right: 80, bottom: insets.bottom + 104, zIndex: 50, opacity: a,
        transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        backgroundColor: dark ? '#D6E3F0' : '#1A2230', borderRadius: 14, minHeight: 50, paddingLeft: 16, paddingRight: 6, flexDirection: 'row', alignItems: 'center',
      }}
    >
      <T size={14} color={dark ? '#121821' : '#F1F3F6'} style={{ flex: 1, paddingVertical: 12 }}>{toast.message}</T>
      {toast.action ? (
        <Pressable onPress={() => { toast.action.onPress(); hide(); }} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }}>
          <T size={14} weight="semi" color={dark ? '#3B4B5E' : '#A9C1DA'}>{toast.action.label}</T>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

export function useBackHandler(handler) {
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => sub.remove();
  }, [handler]);
}

export function Divider({ style }) {
  const th = useTheme();
  return <View style={[{ height: 1, backgroundColor: th.line }, style]} />;
}
