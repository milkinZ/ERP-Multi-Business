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
import { CreateKitchenStationDto } from './dto/create-kitchen-station.dto';
import { UpdateKitchenStationDto } from './dto/update-kitchen-station.dto';
import { KitchenAnalyticsQueryDto } from './dto/kitchen-analytics-query.dto';

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

  async getTicket(id: string, tenantId: string, outletId: string | null) {
    const ticket = await this.kitchenRepository.findTicketBySalesOrderId(
      id,
      tenantId,
      outletId,
    );
    if (!ticket) throw new NotFoundException('Kitchen ticket not found');
    return ticket;
  }

  async enqueueTicket(
    id: string,
    tenantId: string,
    outletId: string | null,
    userId: string,
  ) {
    const ticket = await this.kitchenRepository.enqueueTicket({
      id,
      tenantId,
      outletId,
      userId,
    });
    if (!ticket) throw new NotFoundException('Kitchen ticket not found');
    await this.events.publish({
      type: DOMAIN_EVENTS.KITCHEN_UPDATED,
      payload: {
        tenantId,
        outletId: ticket.outletId,
        salesOrderId: id,
        action: 'ticket.enqueued',
      },
    });
    return ticket;
  }

  getStations(
    tenantId: string,
    actorOutletId: string | null,
    requestedOutletId?: string,
  ) {
    return this.kitchenRepository.findStations(
      tenantId,
      actorOutletId,
      requestedOutletId,
    );
  }

  getOutlets(tenantId: string, outletId: string | null) {
    return this.kitchenRepository.findOutlets(tenantId, outletId);
  }

  async createStation(
    tenantId: string,
    userId: string,
    actorOutletId: string | null,
    dto: CreateKitchenStationDto,
  ) {
    const station = await this.kitchenRepository.createStation({
      tenantId,
      userId,
      actorOutletId,
      outletId: dto.outletId,
      name: dto.name,
      categories: dto.categories,
      displayOrder: dto.displayOrder,
    });
    await this.events.publish({
      type: DOMAIN_EVENTS.KITCHEN_UPDATED,
      payload: {
        tenantId,
        outletId: dto.outletId,
        stationId: station.id,
        action: 'station.created',
      },
    });
    return station;
  }

  async updateStation(
    id: string,
    tenantId: string,
    userId: string,
    actorOutletId: string | null,
    dto: UpdateKitchenStationDto,
  ) {
    if (
      dto.name === undefined &&
      dto.categories === undefined &&
      dto.isActive === undefined &&
      dto.displayOrder === undefined
    ) {
      throw new BadRequestException('At least one station field is required');
    }
    const station = await this.kitchenRepository.updateStation({
      id,
      tenantId,
      userId,
      actorOutletId,
      ...dto,
    });
    await this.events.publish({
      type: DOMAIN_EVENTS.KITCHEN_UPDATED,
      payload: {
        tenantId,
        outletId: station.outletId,
        stationId: station.id,
        action: 'station.updated',
      },
    });
    return station;
  }

  getOperators(tenantId: string, outletId: string | null) {
    return this.kitchenRepository.findKitchenOperators(tenantId, outletId);
  }

  async assignTicket(
    id: string,
    tenantId: string,
    outletId: string | null,
    userId: string,
    assignedUserId: string | null,
  ) {
    const ticket = await this.kitchenRepository.assignTicket({
      id,
      tenantId,
      outletId,
      userId,
      assignedUserId,
    });
    if (!ticket) throw new NotFoundException('Kitchen ticket not found');
    await this.events.publish({
      type: DOMAIN_EVENTS.KITCHEN_UPDATED,
      payload: {
        tenantId,
        outletId: ticket.outletId,
        salesOrderId: id,
        action: 'ticket.assigned',
      },
    });
    return ticket;
  }

  async getAnalytics(
    tenantId: string,
    actorOutletId: string | null,
    query: KitchenAnalyticsQueryDto,
  ) {
    if (actorOutletId && query.outletId && actorOutletId !== query.outletId) {
      throw new NotFoundException('Kitchen analytics not found');
    }
    const now = new Date();
    const endAtExclusive = query.endDate
      ? this.parseAnalyticsDate(query.endDate, true)
      : new Date(now.getTime() + 1);
    const startAt = query.startDate
      ? this.parseAnalyticsDate(query.startDate, false)
      : new Date(endAtExclusive.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (
      !Number.isFinite(startAt.getTime()) ||
      !Number.isFinite(endAtExclusive.getTime())
    ) {
      throw new BadRequestException('Analytics date range is invalid');
    }
    if (startAt >= endAtExclusive) {
      throw new BadRequestException('Start date must not be after end date');
    }
    if (
      endAtExclusive.getTime() - startAt.getTime() >
      366 * 24 * 60 * 60 * 1000
    ) {
      throw new BadRequestException(
        'Kitchen analytics range cannot exceed 366 days',
      );
    }
    return this.kitchenRepository.getAnalytics({
      tenantId,
      outletId: actorOutletId ?? query.outletId ?? null,
      stationId: query.stationId ?? null,
      startAt,
      endAtExclusive,
    });
  }

  private parseAnalyticsDate(value: string, exclusiveEnd: boolean): Date {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return date;

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      if (date.toISOString().slice(0, 10) !== value) {
        return new Date(Number.NaN);
      }
      if (exclusiveEnd) date.setUTCDate(date.getUTCDate() + 1);
      return date;
    }

    return exclusiveEnd ? new Date(date.getTime() + 1) : date;
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
    outletId: string | null,
  ) {
    const ticket = await this.kitchenRepository.updatePriority(
      id,
      tenantId,
      priority,
      userId,
      outletId,
    );
    if (!ticket) throw new BadRequestException('Kitchen ticket not found');
    await this.events.publish({
      type: DOMAIN_EVENTS.KITCHEN_UPDATED,
      payload: {
        tenantId,
        outletId: ticket.outletId,
        salesOrderId: id,
        action: 'ticket.priority',
      },
    });
    return ticket;
  }

  async startCooking(
    id: string,
    tenantId: string,
    outletId: string | null,
    userId: string,
    reason?: string,
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
      { userId, reason },
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
    outletId: string | null,
    userId: string,
    reason?: string,
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
      { userId, reason },
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
    outletId: string | null,
    userId: string,
    reason?: string,
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
      { userId, reason },
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
    outletId: string | null,
    userId: string,
    reason?: string,
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
      { userId, reason },
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
    outletId: string | null,
    userId: string,
    reason?: string,
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
      { userId, reason },
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
