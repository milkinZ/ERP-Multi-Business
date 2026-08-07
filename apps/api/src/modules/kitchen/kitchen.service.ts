import { BadRequestException, Injectable } from '@nestjs/common';
import { KitchenRepository } from './kitchen.repository';
import { KitchenTicketAggregate } from './domain/kitchen-ticket.aggregate';
import { DomainEventBus } from '../../core/events/domain-event-bus.service';
import { DOMAIN_EVENTS } from '../../core/events/domain-events';

@Injectable()
export class KitchenService {
  constructor(
    private readonly kitchenRepository: KitchenRepository,
    private readonly events: DomainEventBus,
  ) {}

  async getQueue(tenantId: string) {
    return this.kitchenRepository.findManyByTenant(tenantId);
  }

  async startCooking(
    id: string,
    tenantId: string,
  ): Promise<KitchenTicketAggregate> {
    const ticket = await this.kitchenRepository.findBySalesOrderId(
      id,
      tenantId,
    );
    if (!ticket) throw new BadRequestException('Kitchen ticket not found');
    ticket.startCooking();
    const persisted = await this.kitchenRepository.updateStatus(
      id,
      tenantId,
      ticket.status,
    );
    if (!persisted)
      throw new BadRequestException('Failed to persist kitchen ticket');
    await this.events.publish({
      type: DOMAIN_EVENTS.KITCHEN_COOKING_STARTED,
      payload: {
        ticketId: ticket.id,
        salesOrderId: id,
        tenantId,
        outletId: ticket.outletId,
      },
    });
    return persisted;
  }

  async markReady(
    id: string,
    tenantId: string,
  ): Promise<KitchenTicketAggregate> {
    const ticket = await this.kitchenRepository.findBySalesOrderId(
      id,
      tenantId,
    );
    if (!ticket) throw new BadRequestException('Kitchen ticket not found');
    ticket.markReady();
    const persisted = await this.kitchenRepository.updateStatus(
      id,
      tenantId,
      ticket.status,
    );
    if (!persisted)
      throw new BadRequestException('Failed to persist kitchen ticket');
    await this.events.publish({
      type: DOMAIN_EVENTS.KITCHEN_READY,
      payload: {
        ticketId: ticket.id,
        salesOrderId: id,
        tenantId,
        outletId: ticket.outletId,
      },
    });
    return persisted;
  }

  async markServed(
    id: string,
    tenantId: string,
  ): Promise<KitchenTicketAggregate> {
    const ticket = await this.kitchenRepository.findBySalesOrderId(
      id,
      tenantId,
    );
    if (!ticket) throw new BadRequestException('Kitchen ticket not found');
    ticket.markServed();
    const persisted = await this.kitchenRepository.updateStatus(
      id,
      tenantId,
      ticket.status,
    );
    if (!persisted)
      throw new BadRequestException('Failed to persist kitchen ticket');
    await this.events.publish({
      type: DOMAIN_EVENTS.KITCHEN_SERVED,
      payload: {
        ticketId: ticket.id,
        salesOrderId: id,
        tenantId,
        outletId: ticket.outletId,
      },
    });
    return persisted;
  }

  async cancel(id: string, tenantId: string): Promise<KitchenTicketAggregate> {
    const ticket = await this.kitchenRepository.findBySalesOrderId(
      id,
      tenantId,
    );
    if (!ticket) throw new BadRequestException('Kitchen ticket not found');
    ticket.cancel();
    const persisted = await this.kitchenRepository.updateStatus(
      id,
      tenantId,
      ticket.status,
    );
    if (!persisted)
      throw new BadRequestException('Failed to persist kitchen ticket');
    await this.events.publish({
      type: DOMAIN_EVENTS.KITCHEN_CANCELLED,
      payload: {
        ticketId: ticket.id,
        salesOrderId: id,
        tenantId,
        outletId: ticket.outletId,
      },
    });
    return persisted;
  }

  async recall(id: string, tenantId: string): Promise<KitchenTicketAggregate> {
    const ticket = await this.kitchenRepository.findBySalesOrderId(
      id,
      tenantId,
    );
    if (!ticket) throw new BadRequestException('Kitchen ticket not found');
    ticket.recall();
    const persisted = await this.kitchenRepository.updateStatus(
      id,
      tenantId,
      ticket.status,
    );
    if (!persisted)
      throw new BadRequestException('Failed to persist kitchen ticket');
    await this.events.publish({
      type: DOMAIN_EVENTS.KITCHEN_RECALLED,
      payload: {
        ticketId: ticket.id,
        salesOrderId: id,
        tenantId,
        outletId: ticket.outletId,
      },
    });
    return persisted;
  }
}
