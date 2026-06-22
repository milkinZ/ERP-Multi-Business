// Job payload contracts between apps/api and apps/worker.
// Keep these strongly typed (no any / no Record<string, unknown>).

export type OrderProcessingJobPayload = {
  orderId: string;
  tenantId: string;
  outletId?: string | null;
};

export type InventorySyncJobPayload = {
  tenantId: string;
};

export type AnalyticsAggregationJobPayload = {
  tenantId: string;
};

export type NotificationDispatchJobPayload = {
  tenantId: string;
  type: string;
};

export type JobPayloadByQueue = {
  ORDER_QUEUE: OrderProcessingJobPayload;
  INVENTORY_QUEUE: InventorySyncJobPayload;
  ANALYTICS_QUEUE: AnalyticsAggregationJobPayload;
  NOTIFICATION_QUEUE: NotificationDispatchJobPayload;
};


