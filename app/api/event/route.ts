import { NextRequest, NextResponse } from 'next/server';
import { getEventMeta } from '@/lib/polymarket';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const url = String(body?.url ?? '').trim();
    if (!url) {
      return NextResponse.json({ error: 'Missing url' }, { status: 400 });
    }
    const meta = await getEventMeta(url);
    return NextResponse.json(meta);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch event';
    console.error('[event]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
