import { InventoryCostingService } from '../inventory/inventory-costing.service';
import { KitchenTicketAggregate } from './domain/kitchen-ticket.aggregate';
import { KitchenStatus } from './domain/kitchen-status.enum';
import { KitchenRepository } from './kitchen.repository';

describe('KitchenRepository', () => {
  const findMany = jest.fn<Promise<unknown[]>, [Record<string, unknown>]>();
  const findFirst = jest.fn<Promise<unknown>, [Record<string, unknown>]>();
  const updateOrder = jest.fn();
  const findOrderItems = jest.fn();
  const updateSalesOrderItem = jest.fn();
  const findStationRoutes = jest.fn();
  const updatePriority = jest.fn<
    Promise<unknown>,
    [{ where: Record<string, unknown>; data: Record<string, unknown> }]
  >();
  const updateOrderItems = jest.fn<
    Promise<{ count: number }>,
    [
      {
        where: Record<string, unknown>;
        data: {
          kitchenStartedAt?: Date;
          kitchenCompletedAt?: Date;
        };
      },
    ]
  >();
  const rawQuery = jest.fn();
  const updateTenant = jest.fn();
  const createAuditLog = jest.fn();
  const tenantFindUnique = jest.fn();
  const findReservations = jest.fn();
  const updateReservations = jest.fn();
  const countAllocations = jest.fn();
  const findMovement = jest.fn();
  const transaction = jest.fn();
  const tx = {
    $queryRaw: rawQuery,
    salesOrder: { update: updatePriority, updateMany: updateOrder },
    salesOrderItem: {
      findMany: findOrderItems,
      update: updateSalesOrderItem,
      updateMany: updateOrderItems,
    },
    kitchenStationCategory: { findMany: findStationRoutes },
    tenant: { findUnique: tenantFindUnique, update: updateTenant },
    auditLog: { create: createAuditLog },
    inventoryMovement: {
      findMany: findReservations,
      updateMany: updateReservations,
      findUnique: findMovement,
    },
    inventoryMovementCostAllocation: { count: countAllocations },
  };
  const prisma = {
    salesOrder: { findMany, findFirst },
    tenant: { findUnique: tenantFindUnique },
    $transaction: transaction,
  };
  const issue = jest.fn();
  const costing = { issue } as unknown as InventoryCostingService;
  let repository: KitchenRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    tenantFindUnique.mockResolvedValue({ businessType: 'CAFE' });
    createAuditLog.mockResolvedValue({});
    transaction.mockImplementation(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    repository = new KitchenRepository(prisma as never, costing);
  });

  it('only exposes orders explicitly released to the kitchen', async () => {
    findMany.mockResolvedValue([]);

    await expect(
      repository.findManyByTenant('tenant-a', null, {}),
    ).resolves.toEqual([]);

    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        tenantId: 'tenant-a',
        kitchenReleasedAt: { not: null },
        status: { in: ['PENDING', 'IN_PROGRESS', 'READY'] },
      },
      orderBy: [
        { kitchenPriority: 'desc' },
        { kitchenReleasedAt: 'asc' },
        { id: 'asc' },
      ],
    });
  });

  it('filters by kitchen status, search term, and authenticated outlet scope', async () => {
    findMany.mockResolvedValue([]);

    await repository.findManyByTenant('tenant-a', 'outlet-a', {
      status: KitchenStatus.COOKING,
      search: '  cappuccino ',
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          outletId: 'outlet-a',
          kitchenReleasedAt: { not: null },
          status: 'IN_PROGRESS',
          OR: [
            { orderNumber: { contains: 'cappuccino', mode: 'insensitive' } },
            { id: { contains: 'cappuccino', mode: 'insensitive' } },
          ],
        },
      }),
    );
  });

  it('applies pagination only when explicitly requested', async () => {
    findMany.mockResolvedValue([]);

    await repository.findManyByTenant('tenant-a', null, {
      skip: 50,
      take: 50,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 50, take: 50 }),
    );

    findMany.mockClear();
    await repository.findManyByTenant('tenant-a', null, {});
    const unpaginatedQuery = findMany.mock.calls[0]?.[0];
    expect(unpaginatedQuery).toBeDefined();
    expect(unpaginatedQuery && 'skip' in unpaginatedQuery).toBe(false);
    expect(unpaginatedQuery && 'take' in unpaginatedQuery).toBe(false);
  });

  it('restricts ticket detail lookup to the authenticated outlet when provided', async () => {
    findFirst.mockResolvedValue(null);

    await repository.findTicketBySalesOrderId(
      'order-a',
      'tenant-a',
      'outlet-a',
    );

    const query = findFirst.mock.calls[0]?.[0];
    expect(query?.where).toEqual({
      id: 'order-a',
      tenantId: 'tenant-a',
      outletId: 'outlet-a',
      kitchenReleasedAt: { not: null },
      status: {
        in: ['PENDING', 'IN_PROGRESS', 'READY', 'COMPLETED', 'CANCELLED'],
      },
    });
  });

  it('finds released tickets in the authenticated tenant, including terminal tickets', async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      repository.findTicketBySalesOrderId('order-a', 'tenant-a'),
    ).resolves.toBeNull();

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'order-a',
          tenantId: 'tenant-a',
          kitchenReleasedAt: { not: null },
          status: {
            in: ['PENDING', 'IN_PROGRESS', 'READY', 'COMPLETED', 'CANCELLED'],
          },
        },
      }),
    );
  });

  it('enqueues a paid pending order, snapshots its route, and audits atomically', async () => {
    rawQuery.mockResolvedValue([
      {
        id: 'order-a',
        orderNumber: 'ORD-1',
        outletId: 'outlet-a',
        kitchenReleasedAt: null,
        status: 'PENDING',
        orderMode: 'REGULAR',
        paymentStatus: 'PAID',
      },
    ]);
    findOrderItems.mockResolvedValue([
      {
        id: 'order-item-a',
        Product: {
          kitchenCategory: ' Coffee ',
          kitchenPrepTimeMinutes: 5,
        },
      },
    ]);
    findStationRoutes.mockResolvedValue([
      { category: 'coffee', stationId: 'station-a' },
    ]);
    updateSalesOrderItem.mockResolvedValue({});
    updatePriority.mockResolvedValue({});
    const queuedTicket = KitchenTicketAggregate.fromPersistence({
      id: 'order-a',
      ticketNumber: 'ORD-1',
      salesOrderId: 'order-a',
      tenantId: 'tenant-a',
      outletId: 'outlet-a',
      assignedUser: null,
      releasedAt: new Date('2026-10-31T10:00:00.000Z'),
      startedAt: null,
      readyAt: null,
      items: [],
      status: KitchenStatus.QUEUED,
      priority: 0,
      createdById: null,
      createdAt: new Date('2026-10-31T10:00:00.000Z'),
      updatedAt: new Date('2026-10-31T10:00:00.000Z'),
    });
    const findBySalesOrderId = jest
      .spyOn(repository, 'findBySalesOrderId')
      .mockResolvedValue(queuedTicket);

    await expect(
      repository.enqueueTicket({
        id: 'order-a',
        tenantId: 'tenant-a',
        outletId: 'outlet-a',
        userId: 'user-a',
      }),
    ).resolves.toBe(queuedTicket);

    expect(updateSalesOrderItem).toHaveBeenCalledWith({
      where: { id: 'order-item-a' },
      data: {
        kitchenCategorySnapshot: 'coffee',
        kitchenPrepTimeMinutes: 5,
        kitchenStationId: 'station-a',
      },
    });
    const releaseUpdate = updatePriority.mock.calls[0]?.[0];
    expect(releaseUpdate?.where).toEqual({ id: 'order-a' });
    expect(releaseUpdate?.data.kitchenReleasedAt).toBeInstanceOf(Date);
    expect(createAuditLog).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-a',
        userId: 'user-a',
        outletId: 'outlet-a',
        entity: 'SalesOrder',
        entityId: 'order-a',
        action: 'KITCHEN_TICKET_ENQUEUED',
        metadata: { orderNumber: 'ORD-1', itemCount: 1 },
      },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(findBySalesOrderId).toHaveBeenCalledWith(
      'order-a',
      'tenant-a',
      'outlet-a',
    );
  });

  it('flags queued tickets after the tenant threshold without changing priority', async () => {
    findMany.mockResolvedValue([
      {
        id: 'order-a',
        orderNumber: 'T-A',
        tenantId: 'tenant-a',
        outletId: null,
        status: 'PENDING',
        kitchenPriority: 0,
        kitchenReleasedAt: new Date(Date.now() - 16 * 60_000),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        SalesOrderItem: [],
        Tenant: { kitchenWaitThresholdMinutes: 15 },
      },
    ]);

    const [ticket] = await repository.findManyByTenant('tenant-a', null, {});

    expect(ticket?.toObject()).toMatchObject({
      status: KitchenStatus.QUEUED,
      priority: 0,
      waitingTooLong: true,
    });
  });

  it('updates priority and appends an audit record in one transaction', async () => {
    rawQuery.mockResolvedValue([
      { id: 'order-a', kitchenPriority: 0, outletId: 'outlet-a' },
    ]);
    updatePriority.mockResolvedValue({});
    createAuditLog.mockResolvedValue({});
    findFirst.mockResolvedValue(null);

    await repository.updatePriority(
      'order-a',
      'tenant-a',
      3,
      'user-a',
      'outlet-a',
    );

    expect(rawQuery).toHaveBeenCalledWith(
      expect.anything(),
      'order-a',
      'tenant-a',
      'outlet-a',
      'outlet-a',
    );
    expect(updatePriority).toHaveBeenCalledWith({
      where: { id: 'order-a' },
      data: { kitchenPriority: 3 },
    });
    expect(createAuditLog).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-a',
        userId: 'user-a',
        outletId: 'outlet-a',
        entity: 'SalesOrder',
        entityId: 'order-a',
        action: 'KITCHEN_PRIORITY_UPDATED',
        metadata: { previousPriority: 0, priority: 3 },
      },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('persists tenant wait settings and audits the previous value atomically', async () => {
    rawQuery.mockResolvedValue([
      { id: 'tenant-a', kitchenWaitThresholdMinutes: 15 },
    ]);
    updateTenant.mockResolvedValue({});
    createAuditLog.mockResolvedValue({});

    await expect(
      repository.updateWaitThreshold('tenant-a', 20, 'user-a'),
    ).resolves.toEqual({ waitThresholdMinutes: 20 });

    expect(updateTenant).toHaveBeenCalledWith({
      where: { id: 'tenant-a' },
      data: { kitchenWaitThresholdMinutes: 20 },
    });
    expect(createAuditLog).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-a',
        userId: 'user-a',
        entity: 'Tenant',
        entityId: 'tenant-a',
        action: 'KITCHEN_WAIT_THRESHOLD_UPDATED',
        metadata: {
          previousWaitThresholdMinutes: 15,
          waitThresholdMinutes: 20,
        },
      },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('commits and costs a reservation atomically when kitchen work starts', async () => {
    rawQuery.mockResolvedValue([{ status: 'PENDING', outletId: 'outlet-a' }]);
    updateOrder.mockResolvedValue({ count: 1 });
    findReservations.mockResolvedValue([{ id: 'reservation-a' }]);
    updateReservations.mockResolvedValue({ count: 1 });
    countAllocations.mockResolvedValue(0);
    findMovement.mockResolvedValue({
      id: 'reservation-a',
      inventoryItemId: 'item-a',
      warehouseId: 'warehouse-a',
      quantity: 2,
    });
    findFirst.mockResolvedValue(null);

    await repository.updateStatus(
      'order-a',
      'tenant-a',
      KitchenStatus.COOKING,
      KitchenStatus.QUEUED,
      undefined,
      null,
      { userId: 'user-a' },
    );

    expect(updateReservations).toHaveBeenCalledWith({
      where: {
        id: { in: ['reservation-a'] },
        tenantId: 'tenant-a',
        referenceType: 'ORDER_RESERVATION',
      },
      data: {
        referenceType: 'ORDER_RESERVATION_COMMITTED',
        type: 'CONSUMPTION',
        note: 'Committed cafe stock reservation when kitchen preparation started',
      },
    });
    const itemStartUpdate = updateOrderItems.mock.calls[0]?.[0];
    expect(itemStartUpdate?.where).toEqual({
      orderId: 'order-a',
      kitchenStartedAt: null,
    });
    expect(itemStartUpdate?.data.kitchenStartedAt).toBeInstanceOf(Date);
    expect(issue).toHaveBeenCalledWith(tx, {
      tenantId: 'tenant-a',
      inventoryItemId: 'item-a',
      warehouseId: 'warehouse-a',
      quantity: 2,
      movementId: 'reservation-a',
    });
  });

  it('records item completion times when a kitchen order becomes ready', async () => {
    rawQuery.mockResolvedValue([
      {
        status: 'IN_PROGRESS',
        outletId: 'outlet-a',
        kitchenStartedAt: new Date('2026-10-31T10:00:00.000Z'),
        kitchenReadyAt: null,
      },
    ]);
    updateOrder.mockResolvedValue({ count: 1 });
    updateOrderItems.mockResolvedValue({ count: 1 });

    await repository.updateStatus(
      'order-a',
      'tenant-a',
      KitchenStatus.READY,
      KitchenStatus.COOKING,
      undefined,
      null,
      { userId: 'user-a' },
    );

    const itemCompletionUpdate = updateOrderItems.mock.calls[0]?.[0];
    expect(itemCompletionUpdate?.where).toEqual({
      orderId: 'order-a',
      kitchenStartedAt: { not: null },
      kitchenCompletedAt: null,
    });
    expect(itemCompletionUpdate?.data.kitchenCompletedAt).toBeInstanceOf(Date);
  });

  it('releases active reservations inside the kitchen cancellation transaction', async () => {
    rawQuery.mockResolvedValue([{ status: 'PENDING', outletId: 'outlet-a' }]);
    updateOrder.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue(null);
    const releaseReservation = jest.fn();

    await repository.updateStatus(
      'order-a',
      'tenant-a',
      KitchenStatus.CANCELLED,
      KitchenStatus.QUEUED,
      releaseReservation,
      null,
      { userId: 'user-a', reason: 'cancelled by request' },
    );

    expect(releaseReservation).toHaveBeenCalledWith(tx);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
