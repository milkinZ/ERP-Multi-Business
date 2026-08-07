export enum KitchenStatus {
  NEW = 'NEW',
  QUEUED = 'QUEUED',
  COOKING = 'COOKING',
  READY = 'READY',
  SERVED = 'SERVED',
  CANCELLED = 'CANCELLED',
  RECALLED = 'RECALLED',
}

export const KITCHEN_VALID_TRANSITIONS: Record<KitchenStatus, KitchenStatus[]> =
  {
    [KitchenStatus.NEW]: [KitchenStatus.QUEUED, KitchenStatus.CANCELLED],
    [KitchenStatus.QUEUED]: [KitchenStatus.COOKING, KitchenStatus.CANCELLED],
    [KitchenStatus.COOKING]: [
      KitchenStatus.READY,
      KitchenStatus.CANCELLED,
      KitchenStatus.RECALLED,
    ],
    [KitchenStatus.READY]: [KitchenStatus.SERVED, KitchenStatus.RECALLED],
    [KitchenStatus.SERVED]: [],
    [KitchenStatus.CANCELLED]: [],
    [KitchenStatus.RECALLED]: [
      KitchenStatus.COOKING,
      KitchenStatus.QUEUED,
      KitchenStatus.CANCELLED,
    ],
  };
