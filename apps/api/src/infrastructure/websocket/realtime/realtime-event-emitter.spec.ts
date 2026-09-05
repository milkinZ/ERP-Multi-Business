import { RealtimeEventEmitter } from './realtime-event-emitter';
import { WebsocketGateway } from '../gateways/websocket.gateway';
import { MetricsService } from '../../observability/metrics/metrics.service';

describe('RealtimeEventEmitter', () => {
  it('emits events only to the supplied scoped rooms', () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    const gateway = { server: { to } } as unknown as WebsocketGateway;
    const broadcastFailuresInc = jest.fn();
    const metrics = {
      websocketEventsEmitted: { inc: jest.fn() },
      websocketBroadcastLatency: { observe: jest.fn() },
      websocketBroadcastFailures: { inc: broadcastFailuresInc },
    } as unknown as MetricsService;
    const emitter = new RealtimeEventEmitter(gateway, metrics);

    emitter.emitToRooms('order.created', { tenantId: 'tenant-a' }, [
      'tenant:tenant-a',
      'outlet:outlet-a',
    ]);

    expect(to).toHaveBeenNthCalledWith(1, 'tenant:tenant-a');
    expect(to).toHaveBeenNthCalledWith(2, 'outlet:outlet-a');
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalledWith('order.created', {
      tenantId: 'tenant-a',
    });
  });

  it('continues delivering to other rooms when one room fails', () => {
    const emit = jest.fn();
    const broadcastFailuresInc = jest.fn();
    const to = jest
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('socket unavailable');
      })
      .mockReturnValue({ emit });
    const gateway = { server: { to } } as unknown as WebsocketGateway;
    const metrics = {
      websocketEventsEmitted: { inc: jest.fn() },
      websocketBroadcastLatency: { observe: jest.fn() },
      websocketBroadcastFailures: { inc: broadcastFailuresInc },
    } as unknown as MetricsService;

    new RealtimeEventEmitter(gateway, metrics).emitToRooms(
      'order.created',
      { tenantId: 'tenant-a' },
      ['tenant:tenant-a', 'outlet:outlet-a'],
    );

    expect(emit).toHaveBeenCalledTimes(1);
    expect(broadcastFailuresInc).toHaveBeenCalledWith({
      event: 'order.created',
    });
  });
});
