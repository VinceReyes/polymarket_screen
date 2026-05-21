import crypto from 'crypto';

export type RenderJobStatus = 'queued' | 'running' | 'done' | 'error';

export type RenderJobResult = {
  videoUrl: string;
  filename: string;
  mode: 'single' | 'compare';
  market?: { question: string; yesPrice: number; delta24hPct: number; points: number };
  series?: { id: string; name: string; color: string; yesPrice: number; points: number }[];
};

type RenderJob = {
  id: string;
  status: RenderJobStatus;
  createdAt: number;
  updatedAt: number;
  error?: string;
  result?: RenderJobResult;
};

const jobs = new Map<string, RenderJob>();
const JOB_TTL_MS = 1000 * 60 * 60;

function prune() {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.updatedAt > JOB_TTL_MS) jobs.delete(id);
  }
}

export function createRenderJob(): RenderJob {
  prune();
  const now = Date.now();
  const job: RenderJob = {
    id: crypto.randomUUID(),
    status: 'queued',
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(job.id, job);
  return job;
}

export function startRenderJob(
  id: string,
  task: () => Promise<RenderJobResult>,
): void {
  const job = jobs.get(id);
  if (!job) return;
  job.status = 'running';
  job.updatedAt = Date.now();

  void task()
    .then((result) => {
      const j = jobs.get(id);
      if (!j) return;
      j.status = 'done';
      j.result = result;
      j.updatedAt = Date.now();
    })
    .catch((err: unknown) => {
      const j = jobs.get(id);
      if (!j) return;
      j.status = 'error';
      j.error = err instanceof Error ? err.message : 'Render failed';
      j.updatedAt = Date.now();
      console.error('[render-job]', err);
    });
}

export function getRenderJob(id: string): RenderJob | null {
  prune();
  return jobs.get(id) ?? null;
}
