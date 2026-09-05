import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

describe('PaymentsController', () => {
  const pay = jest.fn();
  const findAll = jest.fn();
  const findOne = jest.fn();
  const service = { pay, findAll, findOne } as unknown as PaymentsService;
  let controller: PaymentsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PaymentsController(service);
  });

  it('uses authenticated tenant context for payment creation', async () => {
    pay.mockResolvedValue({ id: 'payment-a', tenantId: 'tenant-a' });
    const dto = { orderId: 'order-a', amount: 100, method: 'CASH' } as never;

    await controller.pay(dto, { tenantId: 'tenant-a' } as never);

    expect(pay).toHaveBeenCalledWith('tenant-a', dto);
  });

  it('uses authenticated tenant context for payment reads', async () => {
    findAll.mockResolvedValue([]);
    findOne.mockResolvedValue(null);
    const user = { tenantId: 'tenant-a' } as never;

    await controller.findAll(user);
    await controller.findOne('payment-b', user);

    expect(findAll).toHaveBeenCalledWith('tenant-a');
    expect(findOne).toHaveBeenCalledWith('payment-b', 'tenant-a');
  });
});
