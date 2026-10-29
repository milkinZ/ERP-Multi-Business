import { KitchenController } from './kitchen.controller';
import { KitchenService } from './kitchen.service';

describe('KitchenController', () => {
  const getQueue = jest.fn();
  const getTicket = jest.fn();
  const getSettings = jest.fn();
  const updateWaitThreshold = jest.fn();
  const setPriority = jest.fn();
  const startCooking = jest.fn();
  const markReady = jest.fn();
  const markServed = jest.fn();
  const cancel = jest.fn();
  const recall = jest.fn();
  const service = {
    getQueue,
    getTicket,
    getSettings,
    updateWaitThreshold,
    setPriority,
    startCooking,
    markReady,
    markServed,
    cancel,
    recall,
  } as unknown as KitchenService;
  const user = { tenantId: 'tenant-a', outletId: 'outlet-a' } as never;
  const actor = { tenantId: 'tenant-a', userId: 'user-a' };
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

    await controller.getQueue({ search: '  order  ' }, user);
    await controller.getTicket('order-a', user);
    await controller.startCooking('order-a', dto, user);
    await controller.markReady('order-a', dto, user);
    await controller.markServed('order-a', dto, user);
    await controller.cancel('order-a', dto, user);
    await controller.recall('order-a', dto, user);

    expect(getQueue).toHaveBeenCalledWith('tenant-a', 'outlet-a', {
      search: '  order  ',
    });
    expect(getTicket).toHaveBeenCalledWith('order-a', 'tenant-a', 'outlet-a');
    expect(startCooking).toHaveBeenCalledWith(
      'order-a',
      'tenant-a',
      'outlet-a',
    );
    expect(markReady).toHaveBeenCalledWith('order-a', 'tenant-a', 'outlet-a');
    expect(markServed).toHaveBeenCalledWith('order-a', 'tenant-a', 'outlet-a');
    expect(cancel).toHaveBeenCalledWith('order-a', 'tenant-a', 'outlet-a');
    expect(recall).toHaveBeenCalledWith('order-a', 'tenant-a', 'outlet-a');
  });

  it('uses authenticated tenant and user for Kitchen settings and priority', async () => {
    getSettings.mockResolvedValue({ waitThresholdMinutes: 15 });
    updateWaitThreshold.mockResolvedValue({ waitThresholdMinutes: 20 });
    setPriority.mockResolvedValue({});

    await controller.getSettings(user);
    await controller.updateSettings(
      { waitThresholdMinutes: 20 },
      actor as never,
    );
    await controller.setPriority('order-a', { priority: 4 }, {
      ...actor,
      outletId: 'outlet-a',
    } as never);

    expect(getSettings).toHaveBeenCalledWith('tenant-a');
    expect(updateWaitThreshold).toHaveBeenCalledWith('tenant-a', 20, 'user-a');
    expect(setPriority).toHaveBeenCalledWith(
      'order-a',
      'tenant-a',
      4,
      'user-a',
      'outlet-a',
    );
  });
});
