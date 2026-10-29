import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { KitchenRepository } from './kitchen.repository';
import { KitchenTicketAggregate } from './domain/kitchen-ticket.aggregate';
import { DomainEventBus } from '../../core/events/domain-event-bus.service';
import { DOMAIN_EVENTS } from '../../core/events/domain-events';
import { InventoryReservationService } from '../inventory/inventory-reservation.service';
import { ListKitchenTicketsDto } from './dto/list-kitchen-tickets.dto';

@Injectable()
export class KitchenService {
  constructor(
    private readonly kitchenRepository: KitchenRepository,
    private readonly events: DomainEventBus,
    private readonly inventoryReservations: InventoryReservationService,
  ) {}

  async getQueue(
    tenantId: string,
    outletId: string | null,
    query: ListKitchenTicketsDto,
  ) {
    return this.kitchenRepository.findManyByTenant(tenantId, outletId, query);
  }

  async getTicket(
    id: string,
    tenantId: string,
    outletId: string | null = null,
  ) {
    const ticket = await this.kitchenRepository.findTicketBySalesOrderId(
      id,
      tenantId,
      outletId,
    );
    if (!ticket) throw new NotFoundException('Kitchen ticket not found');
    return ticket;
  }

  async getSettings(tenantId: string) {
    const settings = await this.kitchenRepository.getSettings(tenantId);
    if (!settings) throw new BadRequestException('Tenant not found');
    return settings;
  }

  async updateWaitThreshold(
    tenantId: string,
    waitThresholdMinutes: number,
    userId: string,
  ) {
    const settings = await this.kitchenRepository.updateWaitThreshold(
      tenantId,
      waitThresholdMinutes,
      userId,
    );
    if (!settings) throw new BadRequestException('Tenant not found');
    return settings;
  }

  async setPriority(
    id: string,
    tenantId: string,
    priority: number,
    userId: string,
    outletId: string | null = null,
  ) {
    const ticket = await this.kitchenRepository.updatePriority(
      id,
      tenantId,
      priority,
      userId,
      outletId,
    );
    if (!ticket) throw new BadRequestException('Kitchen ticket not found');
    return ticket;
  }

  async startCooking(
    id: string,
    tenantId: string,
    outletId: string | null = null,
  ): Promise<KitchenTicketAggregate> {
    const ticket = await this.kitchenRepository.findBySalesOrderId(
      id,
      tenantId,
      outletId,
    );
    if (!ticket) throw new BadRequestException('Kitchen ticket not found');
    const expectedStatus = ticket.status;
    ticket.startCooking();
    const persisted = await this.kitchenRepository.updateStatus(
      id,
      tenantId,
      ticket.status,
      expectedStatus,
      undefined,
      outletId,
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
    outletId: string | null = null,
  ): Promise<KitchenTicketAggregate> {
    const ticket = await this.kitchenRepository.findBySalesOrderId(
      id,
      tenantId,
      outletId,
    );
    if (!ticket) throw new BadRequestException('Kitchen ticket not found');
    const expectedStatus = ticket.status;
    ticket.markReady();
    const persisted = await this.kitchenRepository.updateStatus(
      id,
      tenantId,
      ticket.status,
      expectedStatus,
      undefined,
      outletId,
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
    outletId: string | null = null,
  ): Promise<KitchenTicketAggregate> {
    const ticket = await this.kitchenRepository.findBySalesOrderId(
      id,
      tenantId,
      outletId,
    );
    if (!ticket) throw new BadRequestException('Kitchen ticket not found');
    const expectedStatus = ticket.status;
    ticket.markServed();
    const persisted = await this.kitchenRepository.updateStatus(
      id,
      tenantId,
      ticket.status,
      expectedStatus,
      undefined,
      outletId,
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

  async cancel(
    id: string,
    tenantId: string,
    outletId: string | null = null,
  ): Promise<KitchenTicketAggregate> {
    const ticket = await this.kitchenRepository.findBySalesOrderId(
      id,
      tenantId,
      outletId,
    );
    if (!ticket) throw new BadRequestException('Kitchen ticket not found');
    const expectedStatus = ticket.status;
    ticket.cancel();
    const persisted = await this.kitchenRepository.updateStatus(
      id,
      tenantId,
      ticket.status,
      expectedStatus,
      (tx) => this.inventoryReservations.releaseReservation(id, tenantId, tx),
      outletId,
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

  async recall(
    id: string,
    tenantId: string,
    outletId: string | null = null,
  ): Promise<KitchenTicketAggregate> {
    const ticket = await this.kitchenRepository.findBySalesOrderId(
      id,
      tenantId,
      outletId,
    );
    if (!ticket) throw new BadRequestException('Kitchen ticket not found');
    const expectedStatus = ticket.status;
    ticket.recall();
    const persisted = await this.kitchenRepository.updateStatus(
      id,
      tenantId,
      ticket.status,
      expectedStatus,
      undefined,
      outletId,
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
