import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';

const { fontFamily: INTER_FONT } = loadFont('normal', {
  weights: ['400'],
  subsets: ['latin'],
});

const CAPTION_FONT = `"${INTER_FONT}", "Apple Color Emoji", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;

export type PricePoint = { t: number; p: number };

export type Trade = {
  t: number;
  side: 'buy' | 'sell';
  amountUsd: number;
};

export type Series = {
  id: string;
  name: string;
  color: string;
  yesPrice: number;
  history: PricePoint[];
};

export type Format = 'caption' | 'square' | 'narrow';

export type MarketVideoProps = {
  question: string;
  icon: string | null;
  tags: string[];
  yesPrice: number;
  delta24hPct: number;
  history: PricePoint[];
  headline?: string;
  series?: Series[];
  format?: Format;
  smooth?: boolean;
  trades?: Trade[];
};

const BRAND_BLUE = '#2563EB';
const BRAND_BLUE_HALO = 'rgba(37, 99, 235, 0.18)';
const GREEN = '#1FB360';
const RED = '#E64545';
const TEXT_DARK = '#0B0B0F';
const TEXT_MUTED = '#7A7B82';
const GRID = '#E7E8EC';
const BG = '#FFFFFF';

const PAD_X = 56;
const CHART_RIGHT_INSET = 80;

type LayoutSpec = {
  width: number;
  height: number;
  showHeadline: boolean;
  titleTop: number;
  chanceTop: number;
  chartTop: number;
  chartBottom: number;
  buttonsBottom: number;
  buttonsHeight: number;
  stakeBottom: number;
};

const LAYOUTS: Record<Format, LayoutSpec> = {
  caption: {
    width: 1080,
    height: 1440,
    showHeadline: true,
    titleTop: 220,
    chanceTop: 380,
    chartTop: 480,
    chartBottom: 1080,
    buttonsBottom: 170,
    buttonsHeight: 92,
    stakeBottom: 70,
  },
  square: {
    width: 1080,
    height: 1080,
    showHeadline: false,
    titleTop: 60,
    chanceTop: 220,
    chartTop: 320,
    chartBottom: 760,
    buttonsBottom: 170,
    buttonsHeight: 92,
    stakeBottom: 70,
  },
  narrow: {
    width: 960,
    height: 1098,
    showHeadline: false,
    titleTop: 60,
    chanceTop: 220,
    chartTop: 320,
    chartBottom: 778,
    buttonsBottom: 170,
    buttonsHeight: 92,
    stakeBottom: 70,
  },
};

function chartGeometry(layout: LayoutSpec) {
  const chartLeft = PAD_X;
  const chartRight = layout.width - PAD_X - CHART_RIGHT_INSET;
  return {
    chartLeft,
    chartRight,
    chartW: chartRight - chartLeft,
  };
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const num = parseInt(m[1], 16);
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
}

function darken(hex: string, amount = 0.4): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const out = rgb.map((v) => Math.max(0, Math.round(v * (1 - amount))));
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('');
}

function halo(hex: string, opacity = 0.18): string {
  const rgb = parseHex(hex);
  if (!rgb) return `rgba(0, 0, 0, ${opacity})`;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacity})`;
}

function computeYRange(history: PricePoint[]): { yMin: number; yMax: number; ticks: number[] } {
  if (history.length === 0) return { yMin: 0, yMax: 100, ticks: [0, 25, 50, 75, 100] };
  let min = Infinity;
  let max = -Infinity;
  for (const pt of history) {
    const pct = pt.p * 100;
    if (pct < min) min = pct;
    if (pct > max) max = pct;
  }
  const range = max - min;
  const pad = Math.max(range * 0.15, 4);
  let yMin = Math.max(0, Math.floor((min - pad) / 10) * 10);
  let yMax = Math.min(100, Math.ceil((max + pad) / 10) * 10);
  if (yMax - yMin < 20) {
    const mid = (yMin + yMax) / 2;
    yMin = Math.max(0, Math.floor((mid - 10) / 10) * 10);
    yMax = Math.min(100, Math.ceil((mid + 10) / 10) * 10);
  }
  const step = Math.max(10, Math.ceil((yMax - yMin) / 5 / 10) * 10);
  const ticks: number[] = [];
  for (let v = yMin; v <= yMax + 0.001; v += step) ticks.push(Math.round(v));
  return { yMin, yMax, ticks };
}

function continuousIndex(arrivals: number[], s: number): number {
  if (arrivals.length === 0) return -1;
  if (s <= arrivals[0]) return 0;
  if (s >= arrivals[arrivals.length - 1]) return arrivals.length - 1;
  let lo = 0;
  let hi = arrivals.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (arrivals[mid] <= s) lo = mid;
    else hi = mid;
  }
  const span = arrivals[hi] - arrivals[lo] || 1;
  return lo + (s - arrivals[lo]) / span;
}

type TickerProps = {
  trades: Trade[];
  scrub: number;
  left: number;
  bottomY: number;
  topY: number;
};

const TradeTicker: React.FC<TickerProps> = ({
  trades,
  scrub,
  left,
  bottomY,
  topY,
}) => {
  if (trades.length === 0) return null;

  const arrivals =
    trades.length === 1 ? [0] : trades.map((_, i) => i / (trades.length - 1));
  const c = continuousIndex(arrivals, scrub);

  const SLOTS = 5;
  const SLOT_H = 52;
  const FADE_EDGE = 1.2;

  const elems: React.ReactNode[] = [];
  for (let i = 0; i < trades.length; i++) {
    const slot = c - i;
    if (slot < -FADE_EDGE || slot > SLOTS + FADE_EDGE) continue;
    let opacity = 1;
    if (slot < 0) opacity = Math.max(0, 1 + slot / FADE_EDGE);
    if (slot > SLOTS - 1) opacity = Math.max(0, (SLOTS + FADE_EDGE - slot) / (FADE_EDGE + 1));
    opacity = Math.max(0, Math.min(1, opacity));
    if (opacity <= 0.02) continue;
    const y = bottomY - slot * SLOT_H;
    if (y < topY - SLOT_H) continue;
    const tr = trades[i];
    const color = tr.side === 'buy' ? GREEN : RED;
    const amount = '+ $' + Math.round(tr.amountUsd).toLocaleString('en-US');
    elems.push(
      <div
        key={i}
        style={{
          position: 'absolute',
          left,
          top: y - 26,
          fontSize: 30,
          fontWeight: 700,
          color,
          opacity,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        {amount}
      </div>,
    );
  }
  return <>{elems}</>;
};

function smoothHistory(history: PricePoint[], window = 7): PricePoint[] {
  if (history.length < 3) return history;
  const half = Math.floor(window / 2);
  const N = history.length;
  const smoothed = history.map((_, i) => {
    let sum = 0;
    let count = 0;
    const lo = Math.max(0, i - half);
    const hi = Math.min(N - 1, i + half);
    for (let j = lo; j <= hi; j++) {
      sum += history[j].p;
      count++;
    }
    return { t: history[i].t, p: sum / count };
  });

  for (let k = 0; k <= half; k++) {
    const i = N - 1 - k;
    if (i < 0) break;
    const w = half === 0 ? 1 : (half - k) / half;
    smoothed[i] = {
      t: history[i].t,
      p: smoothed[i].p * (1 - w) + history[i].p * w,
    };
  }

  return smoothed;
}

function makeXForIndex(chartLeft: number, chartW: number) {
  return (i: number, n: number): number => {
    if (n <= 1) return chartLeft;
    return chartLeft + (i / (n - 1)) * chartW;
  };
}

function priceAtScrub(history: PricePoint[], s: number): { price: number; index: number } {
  const n = history.length;
  if (n === 0) return { price: 0, index: 0 };
  const clamped = Math.max(0, Math.min(1, s));
  const exact = clamped * (n - 1);
  const i0 = Math.floor(exact);
  const i1 = Math.min(n - 1, i0 + 1);
  const frac = exact - i0;
  const price = history[i0].p + (history[i1].p - history[i0].p) * frac;
  return { price, index: exact };
}

function payoutForPct(pct: number, stake = 1000): number {
  if (pct <= 0) return stake * 100;
  return (stake * 100) / pct;
}
function yesPayout(price: number, stake = 1000): number {
  return payoutForPct(Math.round(price * 100), stake);
}
function noPayout(price: number, stake = 1000): number {
  return payoutForPct(100 - Math.round(price * 100), stake);
}
function fmtMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function buildPathUpTo(
  history: PricePoint[],
  scrubIndex: number,
  xForIndex: (i: number, n: number) => number,
  yForPrice: (p: number) => number,
): string {
  if (history.length === 0) return '';
  const lastWhole = Math.min(history.length - 1, Math.floor(scrubIndex));
  let d = '';
  for (let i = 0; i <= lastWhole; i++) {
    const x = xForIndex(i, history.length);
    const y = yForPrice(history[i].p);
    d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2) + ' ';
  }
  const frac = scrubIndex - lastWhole;
  if (frac > 0 && lastWhole < history.length - 1) {
    const x0 = xForIndex(lastWhole, history.length);
    const y0 = yForPrice(history[lastWhole].p);
    const x1 = xForIndex(lastWhole + 1, history.length);
    const y1 = yForPrice(history[lastWhole + 1].p);
    const x = x0 + (x1 - x0) * frac;
    const y = y0 + (y1 - y0) * frac;
    d += 'L' + x.toFixed(2) + ',' + y.toFixed(2);
  }
  return d.trim();
}

function buildFullPath(
  history: PricePoint[],
  xForIndex: (i: number, n: number) => number,
  yForPrice: (p: number) => number,
): string {
  let d = '';
  for (let i = 0; i < history.length; i++) {
    const x = xForIndex(i, history.length);
    const y = yForPrice(history[i].p);
    d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2) + ' ';
  }
  return d.trim();
}

export const MarketVideo: React.FC<MarketVideoProps> = (props) => {
  if (props.series && props.series.length >= 2) {
    return <CompareLayout {...props} />;
  }
  return <SingleLayout {...props} />;
};

const SingleLayout: React.FC<MarketVideoProps> = ({
  question,
  icon,
  tags,
  yesPrice,
  delta24hPct,
  history: rawHistory,
  headline,
  format,
  smooth,
  trades,
}) => {
  const layout = LAYOUTS[format ?? 'caption'];
  const { chartLeft, chartRight, chartW } = chartGeometry(layout);
  const chartH = layout.chartBottom - layout.chartTop;
  const xForIndex = makeXForIndex(chartLeft, chartW);
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const history = smooth ? smoothHistory(rawHistory) : rawHistory;

  const pulseDur = Math.max(1, Math.round(fps * 1.5));
  const pulseT = (frame % pulseDur) / pulseDur;
  const pulseEased = 1 - Math.pow(1 - pulseT, 2);

  const { yMin, yMax, ticks: Y_TICKS } = computeYRange(history);
  const yForPrice = (p: number): number => {
    const pct = p * 100;
    const t = (pct - yMin) / (yMax - yMin || 1);
    return layout.chartBottom - t * chartH;
  };

  const scrubStart = Math.round(fps * 0.4);
  const scrubEnd = Math.round(fps * 4.4);
  const scrub = interpolate(frame, [scrubStart, scrubEnd], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.4, 0, 0.2, 1),
  });

  const isPostScrub = frame >= scrubEnd;
  const lastIdx = history.length - 1;
  const lastHistoryPrice = lastIdx >= 0 ? history[lastIdx].p : yesPrice;
  const { price: livePrice, index: liveIndex } = isPostScrub
    ? { price: lastHistoryPrice, index: Math.max(0, lastIdx) }
    : priceAtScrub(history, scrub);

  const livePct = livePrice * 100;
  const yesPay = yesPayout(livePrice);
  const noPay = noPayout(livePrice);
  const yesDelta = yesPay - 1000;
  const noDelta = noPay - 1000;

  const cursorX = xForIndex(liveIndex, history.length);
  const cursorY = yForPrice(livePrice);

  const pathD = isPostScrub
    ? buildFullPath(history, xForIndex, yForPrice)
    : buildPathUpTo(history, liveIndex, xForIndex, yForPrice);

  const deltaPositive = delta24hPct >= 0;
  const deltaColor = deltaPositive ? GREEN : RED;
  const deltaArrow = deltaPositive ? '▲' : '▼';

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BG,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Helvetica Neue", Arial, sans-serif',
        color: TEXT_DARK,
      }}
    >
      {layout.showHeadline && headline && headline.trim().length > 0 && (
        <div
          style={{
            position: 'absolute',
            left: PAD_X,
            right: PAD_X,
            top: 60,
            fontSize: 46,
            lineHeight: 1.28,
            fontWeight: 400,
            letterSpacing: -0.2,
            fontFamily: CAPTION_FONT,
          }}
        >
          {headline}
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          left: PAD_X,
          right: PAD_X,
          top: layout.titleTop,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 24,
        }}
      >
        <div
          style={{
            width: 92,
            height: 92,
            borderRadius: 14,
            background: '#111114',
            overflow: 'hidden',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon ? (
            <Img
              src={icon}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : null}
        </div>

        <div style={{ flex: 1, paddingTop: 4 }}>
          <div
            style={{
              color: TEXT_MUTED,
              fontSize: 28,
              fontWeight: 500,
              letterSpacing: 0.2,
            }}
          >
            {tags.length > 0 ? tags.slice(0, 2).join(' · ') : ' '}
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 38,
              fontWeight: 700,
              lineHeight: 1.18,
              letterSpacing: -0.2,
            }}
          >
            {question}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 22, paddingTop: 8, color: TEXT_DARK }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M12 3v13M12 3l-4 4M12 3l4 4M5 14v5a2 2 0 002 2h10a2 2 0 002-2v-5"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M6 4a1 1 0 011-1h10a1 1 0 011 1v17l-6-3.5L6 21V4z"
              stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: PAD_X,
          right: PAD_X,
          top: layout.chanceTop,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
          <div
            style={{
              fontSize: 50,
              fontWeight: 600,
              color: BRAND_BLUE,
              letterSpacing: -0.5,
            }}
          >
            {Math.round(livePct)}% chance
          </div>
          <div style={{ fontSize: 26, color: deltaColor, fontWeight: 600 }}>
            {deltaArrow} {Math.abs(Math.round(delta24hPct))}%
          </div>
        </div>
        <div
          style={{
            width: 220,
            height: 40,
            backgroundColor: '#B8B9BF',
            WebkitMaskImage: `url(${staticFile('layer_1.png')})`,
            maskImage: `url(${staticFile('layer_1.png')})`,
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskSize: 'contain',
            maskSize: 'contain',
            WebkitMaskPosition: 'right center',
            maskPosition: 'right center',
          }}
        />
      </div>

      <svg
        width={layout.width}
        height={chartH + 40}
        style={{ position: 'absolute', left: 0, top: layout.chartTop - 20 }}
      >
        {Y_TICKS.map((tick) => {
          const y = yForPrice(tick / 100) - (layout.chartTop - 20);
          return (
            <g key={tick}>
              <line
                x1={chartLeft}
                x2={chartRight}
                y1={y}
                y2={y}
                stroke={GRID}
                strokeWidth={1.5}
                strokeDasharray="2 6"
              />
              <text
                x={chartRight + 16}
                y={y + 8}
                fontSize="22"
                fill={TEXT_MUTED}
                fontWeight={500}
              >
                {tick}%
              </text>
            </g>
          );
        })}

        <path
          d={pathD}
          fill="none"
          stroke={BRAND_BLUE}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          transform={`translate(0, ${-(layout.chartTop - 20)})`}
        />

        <g transform={`translate(0, ${-(layout.chartTop - 20)})`}>
          <circle
            cx={cursorX}
            cy={cursorY}
            r={26 * (1 + pulseEased * 0.55)}
            fill={halo(BRAND_BLUE, (1 - pulseEased) * 0.22)}
          />
          <circle cx={cursorX} cy={cursorY} r={10} fill={BRAND_BLUE} />
        </g>
      </svg>

      {trades && trades.length > 0 && (
        <TradeTicker
          trades={trades}
          scrub={scrub}
          left={PAD_X}
          bottomY={layout.chartBottom - 20}
          topY={layout.chartTop + 10}
        />
      )}

<div
        style={{
          position: 'absolute',
          left: PAD_X,
          right: PAD_X,
          bottom: layout.buttonsBottom,
          display: 'flex',
          gap: 22,
        }}
      >
        <div
          style={{
            flex: 1,
            background: GREEN,
            color: '#fff',
            borderRadius: 28,
            height: layout.buttonsHeight,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 34,
            fontWeight: 700,
            boxShadow: '0 8px 0 0 #157A45',
          }}
        >
          Buy Yes <span style={{ marginLeft: 12 }}>{Math.round(livePct)}%</span>
        </div>
        <div
          style={{
            flex: 1,
            background: RED,
            color: '#fff',
            borderRadius: 28,
            height: layout.buttonsHeight,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 34,
            fontWeight: 700,
            boxShadow: '0 8px 0 0 #B02828',
          }}
        >
          Buy No <span style={{ marginLeft: 12 }}>{Math.round(100 - livePct)}%</span>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: PAD_X,
          right: PAD_X,
          bottom: layout.stakeBottom,
          display: 'flex',
          gap: 22,
          fontSize: 36,
          color: TEXT_MUTED,
          fontWeight: 500,
        }}
      >
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 14 }}>
          <span>$1,000</span>
          <span>→</span>
          <span style={{ color: GREEN, fontWeight: 700 }}>{fmtMoney(yesPay)}</span>
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 14 }}>
          <span>$1,000</span>
          <span>→</span>
          <span style={{ color: GREEN, fontWeight: 700 }}>{fmtMoney(noPay)}</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

function priceAtTime(history: PricePoint[], t: number): { price: number; fracIndex: number } {
  if (history.length === 0) return { price: 0, fracIndex: 0 };
  if (t <= history[0].t) return { price: history[0].p, fracIndex: 0 };
  const last = history.length - 1;
  if (t >= history[last].t) return { price: history[last].p, fracIndex: last };
  for (let i = 1; i < history.length; i++) {
    if (history[i].t > t) {
      const t0 = history[i - 1].t;
      const t1 = history[i].t;
      const frac = (t - t0) / (t1 - t0);
      const price = history[i - 1].p + (history[i].p - history[i - 1].p) * frac;
      return { price, fracIndex: i - 1 + frac };
    }
  }
  return { price: history[last].p, fracIndex: last };
}

function buildSeriesPath(
  history: PricePoint[],
  upToT: number,
  xForTime: (t: number) => number,
  yForPrice: (p: number) => number,
): string {
  if (history.length === 0) return '';
  let d = '';
  let drawn = 0;
  for (const pt of history) {
    if (pt.t > upToT) break;
    const x = xForTime(pt.t);
    const y = yForPrice(pt.p);
    d += (drawn === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2) + ' ';
    drawn++;
  }
  if (drawn === 0) return '';
  if (drawn < history.length && history[drawn - 1].t < upToT) {
    const { price } = priceAtTime(history, upToT);
    const x = xForTime(upToT);
    const y = yForPrice(price);
    d += 'L' + x.toFixed(2) + ',' + y.toFixed(2);
  }
  return d.trim();
}

const CompareLayout: React.FC<MarketVideoProps> = ({
  question,
  icon,
  tags,
  series,
  headline,
  format,
  smooth,
}) => {
  const layout = LAYOUTS[format ?? 'caption'];
  const { chartLeft, chartRight, chartW } = chartGeometry(layout);
  const chartH = layout.chartBottom - layout.chartTop;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const data = smooth
    ? (series ?? []).map((s) => ({ ...s, history: smoothHistory(s.history) }))
    : series ?? [];

  const pulseDur = Math.max(1, Math.round(fps * 1.5));
  const pulseT = (frame % pulseDur) / pulseDur;
  const pulseEased = 1 - Math.pow(1 - pulseT, 2);

  const allPoints = data.flatMap((s) => s.history);
  const { yMin, yMax, ticks: Y_TICKS } = computeYRange(allPoints);
  const yForPrice = (p: number): number => {
    const pct = p * 100;
    const t = (pct - yMin) / (yMax - yMin || 1);
    return layout.chartBottom - t * chartH;
  };

  let tMin = Infinity;
  let tMax = -Infinity;
  for (const pt of allPoints) {
    if (pt.t < tMin) tMin = pt.t;
    if (pt.t > tMax) tMax = pt.t;
  }
  if (!Number.isFinite(tMin) || !Number.isFinite(tMax) || tMin === tMax) {
    tMin = 0;
    tMax = 1;
  }
  const xForTime = (t: number): number =>
    chartLeft + ((t - tMin) / (tMax - tMin)) * chartW;

  const scrubStart = Math.round(fps * 0.4);
  const scrubEnd = Math.round(fps * 4.4);
  const scrub = interpolate(frame, [scrubStart, scrubEnd], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.4, 0, 0.2, 1),
  });
  const isPostScrub = frame >= scrubEnd;
  const upToT = isPostScrub ? tMax : tMin + scrub * (tMax - tMin);

  const seriesView = data.map((s) => {
    const { price } = priceAtTime(s.history, upToT);
    const pathD = buildSeriesPath(s.history, upToT, xForTime, yForPrice);
    return {
      series: s,
      livePrice: price,
      livePct: price * 100,
      payout: payoutForPct(Math.round(price * 100)),
      cursorX: xForTime(upToT),
      cursorY: yForPrice(price),
      pathD,
    };
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BG,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Helvetica Neue", Arial, sans-serif',
        color: TEXT_DARK,
      }}
    >
      {layout.showHeadline && headline && headline.trim().length > 0 && (
        <div
          style={{
            position: 'absolute',
            left: PAD_X,
            right: PAD_X,
            top: 60,
            fontSize: 46,
            lineHeight: 1.28,
            fontWeight: 400,
            letterSpacing: -0.2,
            fontFamily: CAPTION_FONT,
          }}
        >
          {headline}
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          left: PAD_X,
          right: PAD_X,
          top: layout.titleTop,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 24,
        }}
      >
        <div
          style={{
            width: 92,
            height: 92,
            borderRadius: 14,
            background: '#111114',
            overflow: 'hidden',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon ? (
            <Img
              src={icon}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : null}
        </div>

        <div style={{ flex: 1, paddingTop: 4 }}>
          <div
            style={{
              color: TEXT_MUTED,
              fontSize: 28,
              fontWeight: 500,
              letterSpacing: 0.2,
            }}
          >
            {tags.length > 0 ? tags.slice(0, 2).join(' · ') : ' '}
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 38,
              fontWeight: 700,
              lineHeight: 1.18,
              letterSpacing: -0.2,
            }}
          >
            {question}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 22, paddingTop: 8, color: TEXT_DARK }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3v13M12 3l-4 4M12 3l4 4M5 14v5a2 2 0 002 2h10a2 2 0 002-2v-5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 4a1 1 0 011-1h10a1 1 0 011 1v17l-6-3.5L6 21V4z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: PAD_X,
          right: PAD_X,
          top: layout.chanceTop,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
          {seriesView.map(({ series: s, livePct }) => (
            <div
              key={s.id}
              style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 28 }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  background: s.color,
                }}
              />
              <span style={{ color: TEXT_MUTED, fontWeight: 500 }}>{s.name}</span>
              <span style={{ color: TEXT_DARK, fontWeight: 700 }}>
                {Math.round(livePct)}%
              </span>
            </div>
          ))}
        </div>
        <div
          style={{
            width: 220,
            height: 40,
            backgroundColor: '#B8B9BF',
            WebkitMaskImage: `url(${staticFile('layer_1.png')})`,
            maskImage: `url(${staticFile('layer_1.png')})`,
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskSize: 'contain',
            maskSize: 'contain',
            WebkitMaskPosition: 'right center',
            maskPosition: 'right center',
            flexShrink: 0,
          }}
        />
      </div>

      <svg
        width={layout.width}
        height={chartH + 40}
        style={{ position: 'absolute', left: 0, top: layout.chartTop - 20 }}
      >
        {Y_TICKS.map((tick) => {
          const y = yForPrice(tick / 100) - (layout.chartTop - 20);
          return (
            <g key={tick}>
              <line
                x1={chartLeft}
                x2={chartRight}
                y1={y}
                y2={y}
                stroke={GRID}
                strokeWidth={1.5}
                strokeDasharray="2 6"
              />
              <text
                x={chartRight + 16}
                y={y + 8}
                fontSize="22"
                fill={TEXT_MUTED}
                fontWeight={500}
              >
                {tick}%
              </text>
            </g>
          );
        })}

        <g transform={`translate(0, ${-(layout.chartTop - 20)})`}>
          {seriesView.map(({ series: s, pathD }) => (
            <path
              key={s.id}
              d={pathD}
              fill="none"
              stroke={s.color}
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {seriesView.map(({ series: s, cursorX, cursorY }) => (
            <g key={s.id + '-cursor'}>
              <circle
                cx={cursorX}
                cy={cursorY}
                r={22 * (1 + pulseEased * 0.55)}
                fill={halo(s.color, (1 - pulseEased) * 0.25)}
              />
              <circle cx={cursorX} cy={cursorY} r={9} fill={s.color} />
            </g>
          ))}
        </g>
      </svg>

      <div
        style={{
          position: 'absolute',
          left: PAD_X,
          right: PAD_X,
          bottom: layout.buttonsBottom,
          display: 'flex',
          gap: 22,
        }}
      >
        {seriesView.map(({ series: s, livePct }) => (
          <div
            key={s.id}
            style={{
              flex: 1,
              background: s.color,
              color: '#fff',
              borderRadius: 28,
              height: layout.buttonsHeight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 30,
              fontWeight: 700,
              boxShadow: `0 8px 0 0 ${darken(s.color, 0.4)}`,
              padding: '0 24px',
              textAlign: 'center',
            }}
          >
            <span>{s.name}</span>
            <span style={{ marginLeft: 12 }}>{Math.round(livePct)}%</span>
          </div>
        ))}
      </div>

      <div
        style={{
          position: 'absolute',
          left: PAD_X,
          right: PAD_X,
          bottom: layout.stakeBottom,
          display: 'flex',
          gap: 22,
          fontSize: 36,
          color: TEXT_MUTED,
          fontWeight: 500,
        }}
      >
        {seriesView.map(({ series: s, payout }) => (
          <div
            key={s.id}
            style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 14 }}
          >
            <span>$1,000</span>
            <span>→</span>
            <span style={{ color: s.color, fontWeight: 700 }}>{fmtMoney(payout)}</span>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
