export type PricePoint = { t: number; p: number };

export type MarketData = {
  slug: string;
  question: string;
  icon: string | null;
  tags: string[];
  yesPrice: number;
  delta24hPct: number;
  history: PricePoint[];
  trades?: Trade[];
};

export type EventOption = {
  id: string;
  slug: string;
  conditionId: string;
  question: string;
  yesPrice: number;
  yesTokenId: string;
  noTokenId: string;
  icon: string | null;
  startDate: string | null;
};

export type Trade = {
  t: number;
  side: 'buy' | 'sell';
  amountUsd: number;
};

export type EventMeta = {
  slug: string;
  title: string;
  description: string;
  icon: string | null;
  tags: string[];
  options: EventOption[];
};

export type SeriesData = {
  id: string;
  name: string;
  color: string;
  yesPrice: number;
  history: PricePoint[];
};

export type ComparisonData = {
  slug: string;
  title: string;
  icon: string | null;
  tags: string[];
  series: SeriesData[];
};

export type Interval = '1h' | '6h' | '1d' | '1w' | '1m' | 'max';
export type TokenSide = 'yes' | 'no';

function extractSlug(input: string): string {
  const trimmed = input.trim();
  try {
    const u = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const parts = u.pathname.split('/').filter(Boolean);
    const eventIdx = parts.indexOf('event');
    if (eventIdx >= 0 && parts[eventIdx + 1]) return parts[eventIdx + 1];
    const marketIdx = parts.indexOf('market');
    if (marketIdx >= 0 && parts[marketIdx + 1]) return parts[marketIdx + 1];
    return parts[parts.length - 1] || trimmed;
  } catch {
    return trimmed;
  }
}

async function fetchEventBySlug(slug: string): Promise<any> {
  const r = await fetch(`https://gamma-api.polymarket.com/events/slug/${encodeURIComponent(slug)}`);
  if (r.ok) return r.json();

  const r2 = await fetch(`https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(slug)}&limit=1`);
  if (r2.ok) {
    const arr = await r2.json();
    if (Array.isArray(arr) && arr[0]) return arr[0];
  }

  const r3 = await fetch(`https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}&limit=1`);
  if (r3.ok) {
    const arr = await r3.json();
    if (Array.isArray(arr) && arr[0]) {
      return { markets: [arr[0]], tags: arr[0].tags ?? [], category: arr[0].category };
    }
  }

  throw new Error(`No market found for slug "${slug}"`);
}

function parseClobTokenIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {}
  }
  return [];
}

const FIDELITY_BY_INTERVAL: Record<Interval, number> = {
  '1h': 1,
  '6h': 5,
  '1d': 15,
  '1w': 60,
  '1m': 60,
  max: 1440,
};

const FIDELITY_BUCKETS = [1, 5, 15, 60, 240, 1440];
const POINT_TARGET = 700;

function adaptiveMaxFidelity(startDate: string | null | undefined): number {
  if (!startDate) return FIDELITY_BY_INTERVAL.max;
  const startMs = Date.parse(startDate);
  if (!Number.isFinite(startMs)) return FIDELITY_BY_INTERVAL.max;
  const ageMinutes = (Date.now() - startMs) / 60000;
  if (ageMinutes <= 0) return FIDELITY_BUCKETS[0];
  for (const b of FIDELITY_BUCKETS) {
    if (ageMinutes / b <= POINT_TARGET) return b;
  }
  return 1440;
}

async function fetchPriceHistory(
  tokenId: string,
  interval: Interval,
  startDate?: string | null,
): Promise<PricePoint[]> {
  const fidelity =
    interval === 'max'
      ? adaptiveMaxFidelity(startDate)
      : FIDELITY_BY_INTERVAL[interval];
  const url = `https://clob.polymarket.com/prices-history?market=${encodeURIComponent(tokenId)}&interval=${interval}&fidelity=${fidelity}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`prices-history failed (${r.status})`);
  const json = await r.json();
  const history: PricePoint[] = Array.isArray(json.history) ? json.history : [];
  return history.filter((pt) => typeof pt.t === 'number' && typeof pt.p === 'number');
}

function compute24hDelta(history: PricePoint[]): number {
  if (history.length < 2) return 0;
  const latest = history[history.length - 1];
  const targetT = latest.t - 24 * 3600;
  let prior = history[0];
  for (const pt of history) {
    if (pt.t <= targetT) prior = pt;
    else break;
  }
  if (prior.p === 0) return 0;
  return ((latest.p - prior.p) / prior.p) * 100;
}

function extractTags(event: any, market: any): string[] {
  const out: string[] = [];
  const push = (s: unknown) => {
    if (typeof s === 'string' && s.trim() && !out.includes(s)) out.push(s);
  };
  if (Array.isArray(event?.tags)) for (const t of event.tags) push(t?.label ?? t);
  if (Array.isArray(event?.categories)) for (const c of event.categories) push(c?.label ?? c);
  if (typeof market?.category === 'string') push(market.category);
  return out.slice(0, 3);
}

function toEventOption(market: any): EventOption | null {
  const tokenIds = parseClobTokenIds(market.clobTokenIds);
  const yesTokenId = tokenIds[0];
  const noTokenId = tokenIds[1] ?? '';
  if (!yesTokenId) return null;

  const outcomePrices = parseClobTokenIds(market.outcomePrices);
  const yesPrice = Number(outcomePrices[0] ?? market.lastTradePrice ?? 0);

  const startDate =
    (typeof market.startDate === 'string' && market.startDate) ||
    (typeof market.startDateIso === 'string' && market.startDateIso) ||
    (typeof market.createdAt === 'string' && market.createdAt) ||
    null;

  return {
    id: String(market.id ?? market.conditionId ?? market.slug ?? yesTokenId),
    slug: String(market.slug ?? ''),
    conditionId: String(market.conditionId ?? ''),
    question: String(market.question ?? market.groupItemTitle ?? ''),
    yesPrice: Number.isFinite(yesPrice) ? yesPrice : 0,
    yesTokenId,
    noTokenId,
    icon: market.icon ?? market.image ?? null,
    startDate: startDate || null,
  };
}

export async function getEventMeta(input: string): Promise<EventMeta> {
  const slug = extractSlug(input);
  const event = await fetchEventBySlug(slug);

  const rawMarkets = Array.isArray(event?.markets) ? event.markets : [];
  const options = rawMarkets
    .map(toEventOption)
    .filter((o: EventOption | null): o is EventOption => o !== null);

  if (options.length === 0) {
    throw new Error(`Event "${slug}" has no usable markets`);
  }

  return {
    slug,
    title: String(event.title ?? event.name ?? slug),
    description: String(event.description ?? ''),
    icon: event.icon ?? event.image ?? options[0]?.icon ?? null,
    tags: extractTags(event, rawMarkets[0]),
    options,
  };
}

const TRADE_MIN_USD = 5;
const TRADE_SAMPLE_TARGET = 20;

async function fetchTrades(
  conditionId: string,
  outcomeIndex: number,
  limit = 500,
): Promise<Trade[]> {
  if (!conditionId) return [];
  const url = `https://data-api.polymarket.com/trades?market=${encodeURIComponent(conditionId)}&limit=${limit}`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const json = await r.json();
  if (!Array.isArray(json)) return [];

  const all = json
    .filter((row: any) => row && row.outcomeIndex === outcomeIndex)
    .map((row: any): Trade | null => {
      const t = Number(row.timestamp);
      const size = Number(row.size);
      const price = Number(row.price);
      const sideRaw = String(row.side ?? '').toLowerCase();
      if (!Number.isFinite(t) || !Number.isFinite(size) || !Number.isFinite(price)) return null;
      const side: 'buy' | 'sell' = sideRaw === 'buy' ? 'buy' : 'sell';
      return { t, side, amountUsd: size * price };
    })
    .filter((tr: Trade | null): tr is Trade => tr !== null && tr.amountUsd >= TRADE_MIN_USD);

  const topByAmount = [...all]
    .sort((a, b) => b.amountUsd - a.amountUsd)
    .slice(0, TRADE_SAMPLE_TARGET);
  topByAmount.sort((a, b) => a.t - b.t);
  return topByAmount;
}

export async function getMarketDataForOption(
  meta: EventMeta,
  optionId: string,
  token: TokenSide,
  interval: Interval,
  withTrades = false,
): Promise<MarketData> {
  const option = meta.options.find((o) => o.id === optionId) ?? meta.options[0];
  const tokenId = token === 'yes' ? option.yesTokenId : option.noTokenId || option.yesTokenId;
  const isInverted = token === 'no' && !option.noTokenId;

  const [rawHistory, trades] = await Promise.all([
    fetchPriceHistory(tokenId, interval, option.startDate),
    withTrades
      ? fetchTrades(option.conditionId, token === 'yes' ? 0 : 1)
      : Promise.resolve(undefined as Trade[] | undefined),
  ]);

  if (rawHistory.length === 0) {
    throw new Error(`No price history for "${option.question || meta.title}"`);
  }

  const history = isInverted
    ? rawHistory.map((pt) => ({ t: pt.t, p: 1 - pt.p }))
    : rawHistory;

  const yesPrice = history[history.length - 1].p;
  const delta24hPct = compute24hDelta(history);

  return {
    slug: option.slug || meta.slug,
    question: option.question || meta.title,
    icon: option.icon ?? meta.icon,
    tags: meta.tags,
    yesPrice,
    delta24hPct,
    history,
    trades,
  };
}

export async function getMarketData(input: string): Promise<MarketData> {
  const meta = await getEventMeta(input);
  return getMarketDataForOption(meta, meta.options[0].id, 'yes', 'max');
}

export type ComparisonRequest = {
  optionId: string;
  name: string;
  color: string;
};

export async function getComparisonData(
  meta: EventMeta,
  requests: ComparisonRequest[],
  interval: Interval,
): Promise<ComparisonData> {
  const series = await Promise.all(
    requests.map(async (req): Promise<SeriesData | null> => {
      const option = meta.options.find((o) => o.id === req.optionId);
      if (!option) return null;
      const history = await fetchPriceHistory(option.yesTokenId, interval, option.startDate);
      if (history.length === 0) return null;
      return {
        id: option.id,
        name: req.name || option.question,
        color: req.color,
        yesPrice: history[history.length - 1].p,
        history,
      };
    }),
  );

  const filtered = series.filter((s): s is SeriesData => s !== null);
  if (filtered.length === 0) {
    throw new Error('No price history for the selected options');
  }

  return {
    slug: meta.slug,
    title: meta.title,
    icon: meta.icon,
    tags: meta.tags,
    series: filtered,
  };
}
