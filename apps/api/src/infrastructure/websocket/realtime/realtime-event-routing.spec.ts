import {
  getRealtimeEventRooms,
  toRealtimeRoomRouting,
} from './realtime-event-routing';

describe('Realtime event routing', () => {
  it('should route to tenant/outlet/user rooms when present', () => {
    const routing = toRealtimeRoomRouting('any', {
      tenantId: 't1',
      outletId: 'o1',
      userId: 'u1',
    });

    const rooms = getRealtimeEventRooms(routing);

    expect(rooms).toContain('tenant:t1');
    expect(rooms).toContain('outlet:o1');
    expect(rooms).toContain('user:u1');
  });

  it('should route a sales order payload to tenant + outlet only', () => {
    const routing = toRealtimeRoomRouting('sales-order.created', {
      orderId: 'ord-1',
      tenantId: 't1',
      outletId: 'o1',
    });

    const rooms = getRealtimeEventRooms(routing);

    expect(rooms).toEqual(['tenant:t1', 'outlet:o1']);
    expect(rooms).not.toContain('user:');
  });

  it('should route a purchase order payload to tenant + outlet', () => {
    const routing = toRealtimeRoomRouting('purchase-order.approved', {
      purchaseOrderId: 'po-1',
      tenantId: 't1',
      outletId: 'o1',
    });

    const rooms = getRealtimeEventRooms(routing);

    expect(rooms).toEqual(['tenant:t1', 'outlet:o1']);
  });

  it('should route a kitchen payload to tenant + outlet', () => {
    const routing = toRealtimeRoomRouting('kitchen.ready', {
      ticketId: 'tk-1',
      salesOrderId: 'ord-1',
      tenantId: 't1',
      outletId: 'o1',
    });

    const rooms = getRealtimeEventRooms(routing);

    expect(rooms).toEqual(['tenant:t1', 'outlet:o1']);
  });

  it('should route a subscription payload to tenant only', () => {
    const routing = toRealtimeRoomRouting('subscription.created', {
      subscriptionId: 'sub-1',
      tenantId: 't1',
      planType: 'BUSINESS',
    });

    const rooms = getRealtimeEventRooms(routing);

    expect(rooms).toEqual(['tenant:t1']);
  });

  it('should route a feature flag payload to tenant + outlet', () => {
    const routing = toRealtimeRoomRouting('feature-flag.created', {
      featureFlagId: 'ff-1',
      key: 'KITCHEN_MODULE',
      tenantId: 't1',
      outletId: 'o1',
    });

    const rooms = getRealtimeEventRooms(routing);

    expect(rooms).toEqual(['tenant:t1', 'outlet:o1']);
  });

  it('should route a user login payload to tenant + user room', () => {
    const routing = toRealtimeRoomRouting('user.login', {
      userId: 'u1',
      tenantId: 't1',
    });

    const rooms = getRealtimeEventRooms(routing);

    expect(rooms).toEqual(['tenant:t1', 'user:u1']);
  });

  it('should drop events with missing tenantId (no global broadcast)', () => {
    const routing = toRealtimeRoomRouting('any', {
      productId: 'p1',
    });

    const rooms = getRealtimeEventRooms(routing);

    expect(rooms).toHaveLength(0);
  });

  it('should drop events with empty tenantId', () => {
    const routing = toRealtimeRoomRouting('any', {
      tenantId: '',
      outletId: 'o1',
    });

    const rooms = getRealtimeEventRooms(routing);

    expect(rooms).toHaveLength(0);
  });
});
