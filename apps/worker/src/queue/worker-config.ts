import type { ConnectionOptions, WorkerOptions } from "bullmq";

export const WORKER_CONFIG = {
  attempts: Number(process.env.WORKER_ATTEMPTS ?? 5),
  backoffDelayMs: Number(process.env.WORKER_BACKOFF_DELAY_MS ?? 2000),
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 1),
} as const;

export function getWorkerOptions(connection: ConnectionOptions): WorkerOptions {
  return {
    connection,
    concurrency: WORKER_CONFIG.concurrency,
    autorun: true,
  };
}
