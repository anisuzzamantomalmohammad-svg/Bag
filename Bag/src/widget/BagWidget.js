// The home screen widget, in slate and ice. Drawn with
// react-native-android-widget, which turns these into Android views. Every
// part opens something: the arch opens Home, the tiles open those records,
// a bill opens that bill, + opens a new record.
import React from 'react';
import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { chartSvg } from './model';

export const WIDGET_NAME = 'Bag';

const SERIF = 'Fraunces_400Regular';
const COLORS = {
  light: {
    bg: '#F1F3F6', card: '#FFFFFF', tint: '#E1E6ED', ink: '#1A2230', muted: '#5D6B7D', line: '#E2E7EE',
    arch: '#3B4B5E', archInk: '#F1F3F6', archSub: '#D6E3F0', archNeg: '#FFB4AB', acc: '#3B4B5E', onAcc: '#F1F3F6', in: '#2E8A5E', out: '#C0392B',
  },
  dark: {
    bg: '#121821', card: '#1A222D', tint: '#1E2733', ink: '#E8EDF3', muted: '#9AA8B8', line: '#232C38',
    arch: '#D6E3F0', archInk: '#121821', archSub: '#3B4B5E', archNeg: '#B42318', acc: '#D6E3F0', onAcc: '#121821', in: '#4BBF8A', out: '#F2766F',
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

function Pill({ c, label, on, view }) {
  return (
    <FlexWidget
      clickAction="PERIOD"
      clickActionData={{ view }}
      accessibilityLabel={label}
      style={{ flex: 1, height: 30, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.card : c.tint }}
    >
      <TextWidget text={label} style={{ fontSize: 12, color: on ? c.ink : c.muted, fontWeight: on ? '500' : '400' }} />
    </FlexWidget>
  );
}

function Tile({ c, label, text, color, uri }) {
  return (
    <FlexWidget {...link(uri)} style={{ flex: 1, backgroundColor: c.card, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 }}>
      <TextWidget text={label} style={{ fontSize: 11, color: c.muted, letterSpacing: 0.08 }} />
      <TextWidget text={text} style={{ fontSize: 17, color, fontFamily: SERIF }} maxLines={1} />
    </FlexWidget>
  );
}

function Body({ m, c, size }) {
  const h = size.height || 360;
  const showChart = h >= 250;
  const comingRows = h >= 380 ? 2 : h >= 330 ? 1 : 0;
  const counts = (k) => `bag://records?counts=${k}&from=${m.from || ''}&to=${m.to}`;
  const svg = chartSvg(m.series, { inColor: c.in, outColor: c.out, dotRing: c.bg, width: 300, height: 56 });
  return (
    <FlexWidget style={{ height: 'match_parent', width: 'match_parent', backgroundColor: c.bg, borderRadius: 28, padding: 14, flexGap: 10 }}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
        <TextWidget text={`Bag · ${m.date}`} style={{ fontSize: 11, color: c.muted, letterSpacing: 0.08 }} />
        <FlexWidget style={{ flex: 1 }} />
        <FlexWidget {...link('bag://add')} accessibilityLabel="Add record" style={{ height: 32, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: c.acc, flexDirection: 'row', alignItems: 'center' }}>
          <TextWidget text="+ Add" style={{ fontSize: 13, color: c.acc }} />
        </FlexWidget>
      </FlexWidget>

      <FlexWidget {...link('bag://home')} style={{ width: 'match_parent', backgroundColor: c.arch, borderTopLeftRadius: 90, borderTopRightRadius: 90, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, paddingTop: 16, paddingBottom: 12, paddingHorizontal: 12, alignItems: 'center' }}>
        <TextWidget text="Balance" style={{ fontSize: 11, color: c.archSub, letterSpacing: 0.08 }} />
        <TextWidget text={m.balanceText} style={{ fontSize: 30, color: m.balance < 0 ? c.archNeg : c.archInk, fontFamily: SERIF }} maxLines={1} adjustsFontSizeToFit />
        {m.second ? <TextWidget text={m.second} style={{ fontSize: 11, color: c.archSub }} /> : null}
        <TextWidget text={m.verdict} style={{ fontSize: 12, color: c.archInk, marginTop: 4 }} maxLines={1} />
      </FlexWidget>

      {showChart ? (
        <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', backgroundColor: c.tint, borderRadius: 14, padding: 3, flexGap: 3 }}>
          <Pill c={c} label="Week" view="week" on={m.view === 'week'} />
          <Pill c={c} label="Month" view="month" on={m.view === 'month'} />
          <Pill c={c} label="Total" view="total" on={m.view === 'total'} />
        </FlexWidget>
      ) : null}

      {showChart ? <SvgWidget svg={svg} {...link('bag://reports')} style={{ width: 'match_parent', height: 56 }} /> : null}

      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', flexGap: 8 }}>
        <Tile c={c} label="Cash in" text={m.inText} color={c.in} uri={counts('income')} />
        <Tile c={c} label="Cash out" text={m.outText} color={c.out} uri={counts('expense')} />
      </FlexWidget>

      {comingRows && m.coming.length ? (
        <FlexWidget style={{ width: 'match_parent', flexGap: 6 }}>
          <TextWidget text="Coming up" style={{ fontSize: 11, color: c.muted, letterSpacing: 0.08 }} />
          {m.coming.slice(0, comingRows).map((it) => (
            <FlexWidget key={it.key} {...link(it.link)} style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: 10, backgroundColor: c.card, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 6 }}>
              <FlexWidget style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: c.tint, alignItems: 'center', justifyContent: 'center' }}>
                <TextWidget text={it.emoji} style={{ fontSize: 15 }} />
              </FlexWidget>
              <FlexWidget style={{ flex: 1 }}>
                <TextWidget text={it.name} style={{ fontSize: 13, color: c.ink }} maxLines={1} truncate="END" />
                <TextWidget text={it.sub} style={{ fontSize: 11, color: c.muted }} maxLines={1} />
              </FlexWidget>
              <TextWidget text={it.amount} style={{ fontSize: 13, color: it.kind === 'in' ? c.in : it.kind === 'out' ? c.out : c.ink }} />
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
