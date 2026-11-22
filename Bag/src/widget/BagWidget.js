// The home screen widget. Drawn with react-native-android-widget, which turns
// these into Android views. Every part opens something: the balance opens
// Home, Bank and Cash open their records, an Upcoming row opens it, Paid opens
// the "Did you pay it?" sheet, + opens a new record.
import React from 'react';
import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { sparkSvg } from './model';

export const WIDGET_NAME = 'Bag';

const SERIF = 'Fraunces_400Regular';
const COLORS = {
  light: {
    bg: '#F1F3F6', card: '#FFFFFF', ink: '#18202B', muted: '#4A5768', faint: '#6B7888', border: '#E3E8EE',
    plus: '#2F3D4E', plusInk: '#FFFFFF', spark: '#3B6EA8', fut: '#8391A3', in: '#2E8A5E', out: '#C0392B',
    askBg: '#FCEFD3', ask: '#8A5300', askBtn: '#E9A93A', askBtnInk: '#2A1A00',
  },
  dark: {
    bg: '#0E131A', card: '#151C25', ink: '#EEF2F6', muted: '#9AA7B6', faint: '#6F7D8D', border: '#232C38',
    plus: '#D6E3F0', plusInk: '#0E131A', spark: '#AFC6DE', fut: '#9AA7B6', in: '#5CC79A', out: '#F0857E',
    askBg: '#2E2615', ask: '#F5C35B', askBtn: '#F5C35B', askBtnInk: '#2A2213',
  },
};

const link = (uri) => ({ clickAction: 'OPEN_URI', clickActionData: { uri } });

function Locked({ c }) {
  return (
    <FlexWidget {...link('bag://home')} style={{ height: 'match_parent', width: 'match_parent', backgroundColor: c.bg, borderRadius: 28, padding: 16, alignItems: 'center', justifyContent: 'center', flexGap: 6 }}>
      <TextWidget text="🔒" style={{ fontSize: 26 }} />
      <TextWidget text="Bag is locked" style={{ fontSize: 15, color: c.ink, fontFamily: SERIF }} />
      <TextWidget text="Tap to open" style={{ fontSize: 12, color: c.muted }} />
    </FlexWidget>
  );
}

function Body({ m, c, size }) {
  const h = size.height || 300;
  const comingRows = h >= 300 ? 2 : h >= 240 ? 1 : 0;
  const spark = sparkSvg(m.line, { ink: c.spark, fut: c.fut, neg: c.out, dot: c.ink, width: 140, height: 44 });
  return (
    <FlexWidget style={{ height: 'match_parent', width: 'match_parent', backgroundColor: c.bg, borderRadius: 30, borderWidth: 1, borderColor: c.border, padding: 16, flexGap: 10 }}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
        <TextWidget text={`BAG · ${m.date.toUpperCase()}`} style={{ fontSize: 11, color: c.faint, letterSpacing: 0.07 }} />
        <FlexWidget style={{ flex: 1 }} />
        <FlexWidget {...link('bag://add')} accessibilityLabel="Add record" style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: c.plus, alignItems: 'center', justifyContent: 'center' }}>
          <TextWidget text="+" style={{ fontSize: 20, color: c.plusInk }} />
        </FlexWidget>
      </FlexWidget>

      <FlexWidget {...link('bag://home')} style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'flex-end', flexGap: 10 }}>
        <FlexWidget>
          <TextWidget text={m.balanceText} style={{ fontSize: 34, color: m.balance < 0 ? c.out : c.ink, fontFamily: SERIF }} maxLines={1} adjustsFontSizeToFit />
          {m.byText ? (
            <FlexWidget style={{ flexDirection: 'row', flexGap: 4 }}>
              <TextWidget text={m.byText} style={{ fontSize: 11.5, color: c.muted }} />
              <TextWidget text={m.byValueText} style={{ fontSize: 11.5, color: m.byValue < 0 ? c.out : c.ink, fontWeight: '600' }} />
            </FlexWidget>
          ) : m.second ? <TextWidget text={m.second} style={{ fontSize: 11.5, color: c.muted }} /> : null}
        </FlexWidget>
        <FlexWidget style={{ flex: 1 }} />
        <SvgWidget svg={spark} style={{ width: 140, height: 44 }} />
      </FlexWidget>

      {m.accounts.length > 1 ? (
        <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', flexGap: 8 }}>
          {m.accounts.map((a) => (
            <FlexWidget key={a.id} {...link(`bag://records?account=${a.id}`)} style={{ flex: 1, backgroundColor: c.card, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 }}>
              <TextWidget text={a.text} style={{ fontSize: 12.5, color: a.negative ? c.out : c.ink }} maxLines={1} />
            </FlexWidget>
          ))}
        </FlexWidget>
      ) : null}

      {comingRows && m.coming.length ? (
        <FlexWidget style={{ width: 'match_parent', flexGap: 6 }}>
          {m.coming.slice(0, comingRows).map((it) => (
            <FlexWidget key={it.key} {...link(it.link)} style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: 10, backgroundColor: it.ask ? c.askBg : c.card, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 7 }}>
              <TextWidget text={it.emoji} style={{ fontSize: 16 }} />
              <FlexWidget style={{ flex: 1 }}>
                <TextWidget text={`${it.name} ${it.amount.replace(/^[+−]/, '')}`} style={{ fontSize: 12.5, color: c.ink }} maxLines={1} truncate="END" />
                <TextWidget text={it.sub} style={{ fontSize: 11, color: it.ask ? c.ask : c.muted }} maxLines={1} />
              </FlexWidget>
              {it.ask ? (
                <FlexWidget {...link(it.payLink)} accessibilityLabel={`Mark ${it.name} paid`} style={{ height: 30, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.askBtn, alignItems: 'center', justifyContent: 'center' }}>
                  <TextWidget text={it.payWord} style={{ fontSize: 12, color: c.askBtnInk, fontWeight: '600' }} />
                </FlexWidget>
              ) : <TextWidget text={it.amount} style={{ fontSize: 12.5, color: it.kind === 'in' ? c.in : it.kind === 'out' ? c.out : c.ink }} />}
            </FlexWidget>
          ))}
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}

// Light and dark versions; Android picks one to match the phone, unless
// Bag is set to always light or always dark.
export function renderBagWidget(model, size, themeMode) {
  const make = (k) => (model.locked ? <Locked c={COLORS[k]} /> : <Body m={model} c={COLORS[k]} size={size} />);
  if (themeMode === 'light') return make('light');
  if (themeMode === 'dark') return make('dark');
  return { light: make('light'), dark: make('dark') };
}
