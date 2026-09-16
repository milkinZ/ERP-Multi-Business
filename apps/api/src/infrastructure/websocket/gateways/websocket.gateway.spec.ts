import { MetricsService } from '../../observability/metrics/metrics.service';
import { WebsocketService } from '../websocket.service';
import { WebsocketJwtGuard } from '../guards/websocket-jwt.guard';
import { WebsocketGateway } from './websocket.gateway';

describe('WebsocketGateway', () => {
  const joinTenantRoom = jest.fn().mockResolvedValue(undefined);
  const joinOutletRoom = jest.fn().mockResolvedValue(undefined);
  const joinUserRoom = jest.fn().mockResolvedValue(undefined);
  const leaveAllRooms = jest.fn().mockResolvedValue(undefined);
  const websocketService = {
    joinTenantRoom,
    joinOutletRoom,
    joinUserRoom,
    leaveAllRooms,
  } as unknown as WebsocketService;
  const metrics = {
    websocketConnections: { inc: jest.fn(), dec: jest.fn() },
    websocketDisconnects: { inc: jest.fn() },
  } as unknown as MetricsService;
  const authGuard = {
    authenticateSocket: jest.fn(),
  } as unknown as WebsocketJwtGuard;
  const gateway = new WebsocketGateway(websocketService, metrics, authGuard);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('joins authenticated clients to tenant, outlet, and user rooms', async () => {
    const client = {
      id: 'socket-a',
      data: {
        ctx: { userId: 'user-a', tenantId: 'tenant-a', outletId: 'outlet-a' },
      },
      once: jest.fn(),
      disconnect: jest.fn(),
    };

    await gateway.handleConnection(client as never);

    expect(joinTenantRoom).toHaveBeenCalledWith(client, 'tenant-a');
    expect(joinOutletRoom).toHaveBeenCalledWith(client, 'outlet-a');
    expect(joinUserRoom).toHaveBeenCalledWith(client, 'user-a');
    expect(client.disconnect).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(metrics.websocketConnections.inc).toHaveBeenCalledWith(
      { tenant: 'tenant-a' },
      1,
    );
  });

  it('disconnects clients with missing tenant identity without joining rooms', async () => {
    const client = {
      id: 'socket-invalid',
      data: { ctx: { userId: 'user-a', tenantId: '' } },
      once: jest.fn(),
      disconnect: jest.fn(),
    };

    await gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(joinTenantRoom).not.toHaveBeenCalled();
    expect(joinOutletRoom).not.toHaveBeenCalled();
    expect(joinUserRoom).not.toHaveBeenCalled();
  });

  it('leaves rooms during disconnect cleanup', async () => {
    const client = {
      id: 'socket-a',
      data: {
        ctx: { userId: 'user-a', tenantId: 'tenant-a', outletId: null },
      },
    };

    await gateway.handleDisconnect(client as never);

    expect(leaveAllRooms).toHaveBeenCalledWith(client);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(metrics.websocketDisconnects.inc).toHaveBeenCalledWith(
      { tenant: 'tenant-a', outlet: '' },
      1,
    );
  });
});
