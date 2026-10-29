import { BadRequestException } from '@nestjs/common';
import { OrderMode, PaymentMethod, PaymentStatus } from '@prisma/client';

import { OutboxPublisher } from '../../infrastructure/events/outbox.publisher';
import { DOMAIN_EVENTS } from '../../core/events/domain-events';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  const findOrderForPayment = jest.fn();
  const createPayment = jest.fn();
  const findAll = jest.fn();
  const findOne = jest.fn();
  const repository = {
    findOrderForPayment,
    createPayment,
    findAll,
    findOne,
  } as unknown as PaymentsRepository;
  const publish = jest.fn<
    Promise<void>,
    [{ type: string; payload: Record<string, unknown> }]
  >(() => Promise.resolve());
  const outbox = { publish } as unknown as OutboxPublisher;
  let service: PaymentsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PaymentsService(repository, outbox);
  });

  it('creates a payment and emits success events in the trusted tenant scope', async () => {
    findOrderForPayment.mockResolvedValue({
      id: 'order-a',
      status: 'PENDING',
      orderMode: OrderMode.REGULAR,
      paymentStatus: PaymentStatus.PENDING,
      paidAmount: 0,
      totalAmount: 1000,
    });
    createPayment.mockResolvedValue({
      id: 'payment-a',
      orderId: 'order-a',
      tenantId: 'tenant-a',
      amount: 1000,
      SalesOrder: { paymentStatus: PaymentStatus.PAID },
    });

    await expect(
      service.pay('tenant-a', {
        orderId: 'order-a',
        amount: 1000,
        method: PaymentMethod.CASH,
      }),
    ).resolves.toEqual(expect.objectContaining({ id: 'payment-a' }));

    expect(findOrderForPayment).toHaveBeenCalledWith('order-a', 'tenant-a');
    expect(createPayment).toHaveBeenCalledWith(
      'order-a',
      'tenant-a',
      1000,
      PaymentMethod.CASH,
    );
    expect(publish).toHaveBeenCalledTimes(2);
    const successPayload = {
      orderId: 'order-a',
      tenantId: 'tenant-a',
      paymentId: 'payment-a',
      isFullyPaid: true,
    };
    expect(publish).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        payload: successPayload,
      }),
    );
  });

  it('rejects missing orders without creating a payment', async () => {
    findOrderForPayment.mockResolvedValue(null);

    await expect(
      service.pay('tenant-a', {
        orderId: 'order-b',
        amount: 1000,
        method: PaymentMethod.CASH,
      }),
    ).rejects.toThrow(new BadRequestException('Order not found'));
    expect(createPayment).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('rejects insufficient and duplicate payments without persistence side effects', async () => {
    findOrderForPayment.mockResolvedValueOnce({
      id: 'order-a',
      status: 'PENDING',
      orderMode: OrderMode.REGULAR,
      paymentStatus: PaymentStatus.PENDING,
      paidAmount: 0,
      totalAmount: 1000,
    });
    await expect(
      service.pay('tenant-a', {
        orderId: 'order-a',
        amount: 999,
        method: PaymentMethod.CASH,
      }),
    ).rejects.toThrow('Insufficient payment amount');

    findOrderForPayment.mockResolvedValueOnce({
      id: 'order-a',
      status: 'PAID',
      orderMode: OrderMode.REGULAR,
      paymentStatus: PaymentStatus.PAID,
      paidAmount: 1000,
      totalAmount: 1000,
    });
    await expect(
      service.pay('tenant-a', {
        orderId: 'order-a',
        amount: 1000,
        method: PaymentMethod.CASH,
      }),
    ).rejects.toThrow('Order already paid');
    expect(createPayment).not.toHaveBeenCalled();
  });

  it('rejects a payment lost to the repository transaction race', async () => {
    findOrderForPayment.mockResolvedValue({
      id: 'order-a',
      status: 'PENDING',
      orderMode: OrderMode.REGULAR,
      paymentStatus: PaymentStatus.PENDING,
      paidAmount: 0,
      totalAmount: 1000,
    });
    createPayment.mockResolvedValue(null);

    await expect(
      service.pay('tenant-a', {
        orderId: 'order-a',
        amount: 1000,
        method: PaymentMethod.CASH,
      }),
    ).rejects.toThrow('balance changed');
  });

  it('records partial payments for open bills without treating them as settled', async () => {
    findOrderForPayment.mockResolvedValue({
      id: 'order-a',
      status: 'IN_PROGRESS',
      orderMode: OrderMode.OPEN_BILL,
      paymentStatus: PaymentStatus.PENDING,
      paidAmount: 200,
      totalAmount: 1000,
    });
    createPayment.mockResolvedValue({
      id: 'payment-partial',
      orderId: 'order-a',
      tenantId: 'tenant-a',
      amount: 300,
      SalesOrder: { paymentStatus: PaymentStatus.PENDING },
    });

    await expect(
      service.pay('tenant-a', {
        orderId: 'order-a',
        amount: 300,
        method: PaymentMethod.CASH,
      }),
    ).resolves.toEqual(expect.objectContaining({ id: 'payment-partial' }));
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]?.[0]).toEqual({
      type: DOMAIN_EVENTS.ORDER_PAYMENT_SUCCESS,
      payload: {
        orderId: 'order-a',
        tenantId: 'tenant-a',
        paymentId: 'payment-partial',
        isFullyPaid: false,
      },
    });
  });

  it('does not expose another tenant payment through findOne', async () => {
    findOne.mockResolvedValue(null);

    await expect(service.findOne('payment-b', 'tenant-a')).rejects.toThrow(
      new BadRequestException('Payment not found'),
    );
    expect(findOne).toHaveBeenCalledWith('payment-b', 'tenant-a');
  });
});
