import path from 'path';
import fs from 'fs/promises';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import type { ComparisonData, MarketData } from './polymarket';

let cachedBundle: string | null = null;
let bundlePromise: Promise<string> | null = null;

async function getBundle(): Promise<string> {
  if (cachedBundle) return cachedBundle;
  if (bundlePromise) return bundlePromise;

  bundlePromise = bundle({
    entryPoint: path.resolve(process.cwd(), 'remotion/index.ts'),
    webpackOverride: (config) => config,
  }).then((loc) => {
    cachedBundle = loc;
    return loc;
  });

  return bundlePromise;
}

export type RenderFormat = 'caption' | 'square' | 'narrow';

type RenderInput =
  | { kind: 'single'; market: MarketData; headline: string; format: RenderFormat; smooth: boolean }
  | { kind: 'compare'; data: ComparisonData; headline: string; format: RenderFormat; smooth: boolean };

export async function renderMarketVideo(
  input: RenderInput,
): Promise<{ filename: string; publicPath: string }> {
  const serveUrl = await getBundle();

  const isCompare = input.kind === 'compare';
  const slug = isCompare ? input.data.slug : input.market.slug;
  const question = isCompare ? input.data.title : input.market.question;
  const icon = isCompare ? input.data.icon : input.market.icon;
  const tags = isCompare ? input.data.tags : input.market.tags;
  const format = input.format;

  const inputProps = isCompare
    ? {
        question,
        icon,
        tags,
        yesPrice: 0,
        delta24hPct: 0,
        history: [],
        headline: input.headline,
        series: input.data.series,
        format,
        smooth: input.smooth,
      }
    : {
        question,
        icon,
        tags,
        yesPrice: input.market.yesPrice,
        delta24hPct: input.market.delta24hPct,
        history: input.market.history,
        headline: input.headline,
        format,
        smooth: input.smooth,
        trades: input.market.trades,
      };

  const composition = await selectComposition({
    serveUrl,
    id: 'MarketVideo',
    inputProps,
  });

  const ts = Date.now();
  const safeSlug = slug.replace(/[^a-z0-9-]/gi, '-').slice(0, 60);
  const filename = `${safeSlug}-${ts}.mp4`;
  const outDir = path.resolve(process.cwd(), 'public', 'renders');
  await fs.mkdir(outDir, { recursive: true });
  const outputLocation = path.join(outDir, filename);

  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation,
    inputProps,
  });

  return { filename, publicPath: `/renders/${filename}` };
}
