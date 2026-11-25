// The home screen widgets, drawn with react-native-android-widget.
// Bag (4x2 and bigger): the balance in the middle with one line under it,
// the balance line across the bottom with the jars in gold, Bank / Cash / 🫙
// pills, and Move, Count and + buttons. Faint money drawings sit behind it.
// Bag jar (2x2): what's in the jars and this month's saving.
import React from 'react';
import { FlexWidget, OverlapWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { drawingsSvg, jarSvg, wideLineSvg } from './model';

export const WIDGET_NAME = 'Bag';
export const JAR_WIDGET = 'BagJar';

const SERIF = 'Fraunces_400Regular';
const COLORS = {
  light: {
    bg: '#F1F3F6', card: '#FFFFFF', ink: '#18202B', muted: '#4A5768', faint: '#6B7888', border: '#E3E8EE',
    plus: '#2F3D4E', plusInk: '#FFFFFF', spark: '#3B6EA8', fut: '#8391A3', in: '#2E8A5E', out: '#C0392B',
    askBg: '#FCEFD3', ask: '#8A5300', askBtn: '#E9A93A', askBtnInk: '#2A1A00',
    gold: '#C9902E', goldSoft: '#FBF1DA', draw: '#C3CBD5', coin: '#DCC394', btn: '#E6EAF0',
  },
  dark: {
    bg: '#0E131A', card: '#151C25', ink: '#EEF2F6', muted: '#9AA7B6', faint: '#6F7D8D', border: '#232C38',
    plus: '#D6E3F0', plusInk: '#0E131A', spark: '#AFC6DE', fut: '#9AA7B6', in: '#5CC79A', out: '#F0857E',
    askBg: '#2E2615', ask: '#F5C35B', askBtn: '#F5C35B', askBtnInk: '#2A2213',
    gold: '#F5C35B', goldSoft: '#2E2615', draw: '#263140', coin: '#3D3524', btn: '#1D2631',
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

function Btn({ c, uri, text, label, strong }) {
  return (
    <FlexWidget {...link(uri)} accessibilityLabel={label} style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: strong ? c.plus : c.btn, alignItems: 'center', justifyContent: 'center' }}>
      <TextWidget text={text} style={{ fontSize: strong ? 20 : 15, color: strong ? c.plusInk : c.ink }} />
    </FlexWidget>
  );
}

function Body({ m, c, size }) {
  const W = Math.max(200, Math.round(size.width || 320));
  const H = Math.max(110, Math.round(size.height || 180));
  const tall = H >= 170;
  const comingRows = m.showComing ? (H >= 330 ? 2 : H >= 260 ? 1 : 0) : 0;
  const lineW = W - 28;
  const line = wideLineSvg(m.line, m.gold, { ink: c.spark, fut: c.fut, neg: c.out, goldColor: c.gold, width: lineW, height: tall ? 46 : 30 });
  const back = drawingsSvg(m.look, { color: c.draw, coin: c.coin, width: W, height: H });
  return (
    <OverlapWidget style={{ height: 'match_parent', width: 'match_parent', backgroundColor: c.bg, borderRadius: 30 }}>
      <SvgWidget svg={back} style={{ height: 'match_parent', width: 'match_parent' }} />
      <FlexWidget style={{ height: 'match_parent', width: 'match_parent', borderRadius: 30, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, paddingVertical: 12, flexGap: tall ? 8 : 4 }}>
        <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: 6 }}>
          {m.groups.slice(0, 3).map((g) => (
            <FlexWidget key={g.id} {...link(g.link)} style={{ backgroundColor: g.id === 'savings' ? c.goldSoft : c.card, borderRadius: 11, paddingHorizontal: 9, paddingVertical: 6 }}>
              <TextWidget text={g.text} style={{ fontSize: 12, color: g.negative ? c.out : g.id === 'savings' ? c.gold : c.ink }} maxLines={1} />
            </FlexWidget>
          ))}
          <FlexWidget style={{ flex: 1 }} />
          {W >= 300 ? <Btn c={c} uri="bag://add?type=transfer" text="⇄" label="Move money" /> : null}
          {W >= 260 ? <Btn c={c} uri="bag://check/cash" text="💵" label="Count your wallet" /> : null}
          <Btn c={c} uri="bag://add" text="+" label="Add record" strong />
        </FlexWidget>

        <FlexWidget {...link('bag://home')} style={{ width: 'match_parent', alignItems: 'center', flex: 1, justifyContent: 'center' }}>
          <TextWidget text={m.balanceText} style={{ fontSize: tall ? 34 : 28, color: m.balance < 0 ? c.out : c.ink, fontFamily: SERIF }} maxLines={1} adjustsFontSizeToFit />
          {m.underText ? (
            <FlexWidget style={{ flexDirection: 'row', flexGap: 4 }}>
              {m.underValueText && !/^a day/.test(m.underText) ? <TextWidget text={m.underText} style={{ fontSize: 11.5, color: c.muted }} /> : null}
              {m.underValueText ? <TextWidget text={m.underValueText} style={{ fontSize: 11.5, color: m.underValue < 0 ? c.out : c.ink, fontWeight: '600' }} /> : null}
              {/^a day/.test(m.underText) ? <TextWidget text={m.underText} style={{ fontSize: 11.5, color: c.muted }} /> : null}
              {m.marginText && W >= 300 ? <TextWidget text={` · ${m.marginText}`} style={{ fontSize: 11.5, color: c.faint }} /> : null}
            </FlexWidget>
          ) : m.second ? <TextWidget text={m.second} style={{ fontSize: 11.5, color: c.muted }} /> : null}
        </FlexWidget>

        <FlexWidget {...link('bag://home')} style={{ width: 'match_parent' }}>
          <SvgWidget svg={line} style={{ width: lineW, height: tall ? 46 : 30 }} />
        </FlexWidget>

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
    </OverlapWidget>
  );
}

function Jar({ m, c }) {
  const ring = jarSvg(m.jarFill, { gold: c.gold, track: c.border, size: 64 });
  return (
    <FlexWidget {...link('bag://savings')} style={{ height: 'match_parent', width: 'match_parent', backgroundColor: c.bg, borderRadius: 28, borderWidth: 1, borderColor: c.border, padding: 12, alignItems: 'center', justifyContent: 'center', flexGap: 4 }}>
      <OverlapWidget style={{ width: 64, height: 64 }}>
        <SvgWidget svg={ring} style={{ width: 64, height: 64 }} />
        <FlexWidget style={{ width: 64, height: 64, alignItems: 'center', justifyContent: 'center' }}>
          <TextWidget text="🫙" style={{ fontSize: 24 }} />
        </FlexWidget>
      </OverlapWidget>
      <TextWidget text={m.jarText} style={{ fontSize: 20, color: c.gold, fontFamily: SERIF }} maxLines={1} adjustsFontSizeToFit />
      <TextWidget text={m.jarGoalText || m.savedMonthText} style={{ fontSize: 11, color: c.muted }} maxLines={1} />
      <FlexWidget {...link('bag://add?type=transfer&to=jar')} style={{ marginTop: 2, backgroundColor: c.goldSoft, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5 }}>
        <TextWidget text="+ Put in" style={{ fontSize: 12, color: c.gold, fontWeight: '600' }} />
      </FlexWidget>
    </FlexWidget>
  );
}

// Light and dark versions; Android picks one to match the phone, unless
// Bag is set to always light or always dark.
export function renderBagWidget(model, size, themeMode, name = WIDGET_NAME) {
  const make = (k) => (model.locked ? <Locked c={COLORS[k]} /> : name === JAR_WIDGET ? <Jar m={model} c={COLORS[k]} /> : <Body m={model} c={COLORS[k]} size={size} />);
  if (themeMode === 'light') return make('light');
  if (themeMode === 'dark') return make('dark');
  return { light: make('light'), dark: make('dark') };
}
