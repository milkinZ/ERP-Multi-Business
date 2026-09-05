import { KitchenController } from './kitchen.controller';
import { KitchenService } from './kitchen.service';

describe('KitchenController', () => {
  const getQueue = jest.fn();
  const startCooking = jest.fn();
  const markReady = jest.fn();
  const markServed = jest.fn();
  const cancel = jest.fn();
  const recall = jest.fn();
  const service = {
    getQueue,
    startCooking,
    markReady,
    markServed,
    cancel,
    recall,
  } as unknown as KitchenService;
  const user = { tenantId: 'tenant-a' } as never;
  let controller: KitchenController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new KitchenController(service);
  });

  it('uses authenticated tenant for queue and every state transition', async () => {
    getQueue.mockResolvedValue([]);
    startCooking.mockResolvedValue({});
    markReady.mockResolvedValue({});
    markServed.mockResolvedValue({});
    cancel.mockResolvedValue({});
    recall.mockResolvedValue({});
    const dto = {} as never;

    await controller.getQueue(user);
    await controller.startCooking('order-a', dto, user);
    await controller.markReady('order-a', dto, user);
    await controller.markServed('order-a', dto, user);
    await controller.cancel('order-a', dto, user);
    await controller.recall('order-a', dto, user);

    expect(getQueue).toHaveBeenCalledWith('tenant-a');
    expect(startCooking).toHaveBeenCalledWith('order-a', 'tenant-a');
    expect(markReady).toHaveBeenCalledWith('order-a', 'tenant-a');
    expect(markServed).toHaveBeenCalledWith('order-a', 'tenant-a');
    expect(cancel).toHaveBeenCalledWith('order-a', 'tenant-a');
    expect(recall).toHaveBeenCalledWith('order-a', 'tenant-a');
  });
});
