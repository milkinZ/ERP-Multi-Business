export type OutboxEventStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'PROCESSED'
  | 'FAILED';

export type OutboxEventType = string;
