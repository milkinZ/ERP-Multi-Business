import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { OrderMode, OrderStatus, PaymentStatus } from '@prisma/client';

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
      throw new BadRequestException('Order not found');
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Cancelled orders cannot be paid');
    }
    if (
      order.status === OrderStatus.PAID ||
      order.paymentStatus === PaymentStatus.PAID ||
      (order.status === OrderStatus.COMPLETED &&
        order.orderMode !== OrderMode.OPEN_BILL)
    ) {
      throw new BadRequestException('Order already paid');
    }

    const outstandingAmount = order.totalAmount - order.paidAmount;
    if (dto.amount > outstandingAmount) {
      throw new BadRequestException(
        'Payment amount exceeds the outstanding order balance',
      );
    }
    if (
      order.orderMode !== OrderMode.OPEN_BILL &&
      dto.amount < outstandingAmount
    ) {
      throw new BadRequestException('Insufficient payment amount');
    }

    const payment = await this.paymentsRepository.createPayment(
      order.id,
      tenantId,
      dto.amount,
      dto.method,
    );

    if (!payment) {
      throw new ConflictException(
        'The order balance changed while recording payment; refresh and retry',
      );
    }

    const isFullyPaid = payment.SalesOrder.paymentStatus === PaymentStatus.PAID;
    await this.outbox.publish({
      type: DOMAIN_EVENTS.ORDER_PAYMENT_SUCCESS,
      payload: {
        orderId: order.id,
        tenantId,
        paymentId: payment.id,
        isFullyPaid,
      },
    });

    if (isFullyPaid) {
      await this.outbox.publish({
        type: DOMAIN_EVENTS.SALES_ORDER_PAID,
        payload: {
          orderId: order.id,
          tenantId,
          paymentId: payment.id,
        },
      });
    }

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
