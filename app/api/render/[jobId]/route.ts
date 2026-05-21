import { NextResponse } from 'next/server';
import { getRenderJob } from '@/lib/render-jobs';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await ctx.params;
  const job = getRenderJob(jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    error: job.error,
    result: job.result,
  });
}
