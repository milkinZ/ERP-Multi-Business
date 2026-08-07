import { BadRequestException, Injectable } from '@nestjs/common';

import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentsRepository } from './payments.repository';
import { OutboxPublisher } from '../../infrastructure/events/outbox.publisher';
import { DOMAIN_EVENTS } from '../../core/events/domain-events';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly paymentsRepository: PaymentsRepository,
    private readonly outbox: OutboxPublisher,
  ) {}

  async pay(tenantId: string, dto: CreatePaymentDto) {
    const order = await this.paymentsRepository.findOrderForPayment(
      dto.orderId,
      tenantId,
    );

    if (!order) {
      await this.outbox.publish({
        type: DOMAIN_EVENTS.ORDER_PAYMENT_FAILED,
        payload: {
          orderId: dto.orderId,
          tenantId,
          reason: 'Order not found',
        },
      });
      throw new BadRequestException('Order not found');
    }

    if (order.status === 'PAID') {
      await this.outbox.publish({
        type: DOMAIN_EVENTS.ORDER_PAYMENT_FAILED,
        payload: {
          orderId: order.id,
          tenantId,
          paymentId: undefined,
          reason: 'Order already paid',
        },
      });
      throw new BadRequestException('Order already paid');
    }

    if (dto.amount < order.totalAmount) {
      await this.outbox.publish({
        type: DOMAIN_EVENTS.ORDER_PAYMENT_FAILED,
        payload: {
          orderId: order.id,
          tenantId,
          paymentId: undefined,
          reason: 'Insufficient payment amount',
        },
      });
      throw new BadRequestException('Insufficient payment amount');
    }

    const payment = await this.paymentsRepository.createPayment(
      order.id,
      tenantId,
      dto.amount,
      dto.method,
    );

    await this.outbox.publish({
      type: DOMAIN_EVENTS.ORDER_PAYMENT_SUCCESS,
      payload: {
        orderId: order.id,
        tenantId,
        paymentId: payment.id,
      },
    });

    // Production-grade alias event
    await this.outbox.publish({
      type: DOMAIN_EVENTS.SALES_ORDER_PAID,
      payload: {
        orderId: order.id,
        tenantId,
        paymentId: payment.id,
      },
    });

    return payment;
  }

  async findAll(tenantId: string) {
    return this.paymentsRepository.findAll(tenantId);
  }

  async findOne(id: string, tenantId: string) {
    const payment = await this.paymentsRepository.findOne(id, tenantId);

    if (!payment) {
      throw new BadRequestException('Payment not found');
    }

    return payment;
  }
}
