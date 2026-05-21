import { NextRequest, NextResponse } from 'next/server';
import {
  getComparisonData,
  getEventMeta,
  getMarketDataForOption,
  type ComparisonRequest,
  type Interval,
  type TokenSide,
} from '@/lib/polymarket';
import { renderMarketVideo, type RenderFormat } from '@/lib/render';

export const runtime = 'nodejs';
export const maxDuration = 300;

const VALID_INTERVALS: Interval[] = ['1h', '6h', '1d', '1w', '1m', 'max'];

function parseInterval(raw: unknown): Interval {
  const s = String(raw ?? 'max');
  return (VALID_INTERVALS as string[]).includes(s) ? (s as Interval) : 'max';
}

function parseFormat(raw: unknown): RenderFormat {
  if (raw === 'square') return 'square';
  if (raw === 'narrow') return 'narrow';
  return 'caption';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const url = String(body?.url ?? '').trim();
    const headline = typeof body?.headline === 'string' ? body.headline : '';
    const interval = parseInterval(body?.interval);
    const format = parseFormat(body?.format);
    const smooth = body?.smooth === true;
    const withTrades = body?.trades === true;

    if (!url) {
      return NextResponse.json({ error: 'Missing url' }, { status: 400 });
    }

    const meta = await getEventMeta(url);

    if (Array.isArray(body?.options) && body.options.length >= 2) {
      const requests: ComparisonRequest[] = body.options
        .slice(0, 2)
        .map((o: any) => ({
          optionId: String(o?.id ?? ''),
          name: String(o?.name ?? ''),
          color: String(o?.color ?? '#2563EB'),
        }))
        .filter((r: ComparisonRequest) => r.optionId);

      if (requests.length < 2) {
        return NextResponse.json(
          { error: 'Compare mode needs two valid option ids' },
          { status: 400 },
        );
      }

      const data = await getComparisonData(meta, requests, interval);
      const { filename, publicPath } = await renderMarketVideo({
        kind: 'compare',
        data,
        headline,
        format,
        smooth,
      });

      return NextResponse.json({
        filename,
        videoUrl: publicPath,
        mode: 'compare',
        series: data.series.map((s) => ({
          id: s.id,
          name: s.name,
          color: s.color,
          yesPrice: s.yesPrice,
          points: s.history.length,
        })),
      });
    }

    const optionId =
      typeof body?.optionId === 'string' && body.optionId
        ? body.optionId
        : meta.options[0].id;
    const token: TokenSide = body?.token === 'no' ? 'no' : 'yes';

    const market = await getMarketDataForOption(meta, optionId, token, interval, withTrades);
    const { filename, publicPath } = await renderMarketVideo({
      kind: 'single',
      market,
      headline,
      format,
      smooth,
    });

    return NextResponse.json({
      filename,
      videoUrl: publicPath,
      mode: 'single',
      market: {
        question: market.question,
        yesPrice: market.yesPrice,
        delta24hPct: market.delta24hPct,
        points: market.history.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Render failed';
    console.error('[render]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
