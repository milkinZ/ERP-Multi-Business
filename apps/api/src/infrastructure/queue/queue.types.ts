export type QueueProgressState =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

export type QueueProgressMetadata = {
  state: QueueProgressState;
  progress: number; // 0..100
  updatedAt: string; // ISO
  retryCount?: number;
};

export type QueueFailureMetadata = {
  reason: string;
  stack?: string;
  payload?: unknown;
  failedAt: string; // ISO
};
