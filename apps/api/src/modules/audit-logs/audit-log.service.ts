import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { DomainEventBus } from '../../core/events/domain-event-bus.service';
import { DOMAIN_EVENTS, DomainEvent } from '../../core/events/domain-events';

import { ListAuditLogsDto } from './dto/list-audit-logs.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: DomainEventBus,
  ) {
    this.registerEventSubscribers();
  }

  /**
   * Register event subscribers for all domain events
   * Creates audit log entries based on domain events
   */
  private registerEventSubscribers() {
    // Order Events
    this.eventBus.subscribe(DOMAIN_EVENTS.ORDER_CREATED, (event) =>
      this.handleOrderCreatedEvent(event),
    );

    this.eventBus.subscribe(DOMAIN_EVENTS.ORDER_RESERVED, (event) =>
      this.handleOrderReservedEvent(event),
    );

    this.eventBus.subscribe(DOMAIN_EVENTS.ORDER_PAYMENT_SUCCESS, (event) =>
      this.handleOrderPaymentSuccessEvent(event),
    );

    this.eventBus.subscribe(DOMAIN_EVENTS.ORDER_PAYMENT_FAILED, (event) =>
      this.handleOrderPaymentFailedEvent(event),
    );

    this.eventBus.subscribe(DOMAIN_EVENTS.ORDER_FULFILLMENT_STARTED, (event) =>
      this.handleOrderFulfillmentStartedEvent(event),
    );

    // SALES_ORDER_COMPLETED replaces legacy ORDER_COMPLETED name in this codebase.
    this.eventBus.subscribe(DOMAIN_EVENTS.SALES_ORDER_COMPLETED, (event) =>
      this.handleOrderCompletedEvent(event),
    );

    // Purchase Order Events
    this.eventBus.subscribe(DOMAIN_EVENTS.PURCHASE_ORDER_CREATED, (event) =>
      this.handlePurchaseOrderCreatedEvent(event),
    );

    this.eventBus.subscribe(DOMAIN_EVENTS.PURCHASE_ORDER_RECEIVED, (event) =>
      this.handlePurchaseOrderReceivedEvent(event),
    );

    // Business Registry Events
    this.eventBus.subscribe(DOMAIN_EVENTS.BUSINESS_CREATED, (event) =>
      this.handleBusinessCreatedEvent(event),
    );

    this.eventBus.subscribe(DOMAIN_EVENTS.BUSINESS_UPDATED, (event) =>
      this.handleBusinessUpdatedEvent(event),
    );

    this.eventBus.subscribe(DOMAIN_EVENTS.BUSINESS_ACTIVATED, (event) =>
      this.handleBusinessActivatedEvent(event),
    );

    this.eventBus.subscribe(DOMAIN_EVENTS.BUSINESS_SUSPENDED, (event) =>
      this.handleBusinessSuspendedEvent(event),
    );

    this.eventBus.subscribe(DOMAIN_EVENTS.BUSINESS_ARCHIVED, (event) =>
      this.handleBusinessArchivedEvent(event),
    );

    this.eventBus.subscribe(DOMAIN_EVENTS.BUSINESS_RESTORED, (event) =>
      this.handleBusinessRestoredEvent(event),
    );

    this.eventBus.subscribe(DOMAIN_EVENTS.BUSINESS_TYPE_CHANGED, (event) =>
      this.handleBusinessTypeChangedEvent(event),
    );
  }

  /**
   * Create audit log entry
   * Used internally by event subscribers
   */
  async createAuditLog(
    tenantId: string,
    data: {
      userId?: string | null;
      outletId?: string | null;
      entity: string;
      entityId: string;
      action: string;
      metadata?: Prisma.InputJsonValue;
    },
  ) {
    try {
      const auditLog = await this.prisma.auditLog.create({
        data: {
          tenantId,
          userId: data.userId ?? null,
          outletId: data.outletId ?? null,
          entity: data.entity,
          entityId: data.entityId,
          action: data.action,
          // Prisma JSON nullable typing does not accept `null`, so omit when absent.
          ...(data.metadata ? { metadata: data.metadata } : {}),
        },
      });

      return auditLog;
    } catch (error) {
      this.logger.error(`Failed to create audit log: ${error}`, error);
      // Don't throw - audit log failures should not break main operations
    }
  }

  /**
   * List audit logs with filtering and pagination
   */
  async listAuditLogs(
    tenantId: string,
    dto: ListAuditLogsDto,
    outletId?: string | null,
  ) {
    const page = dto.page || 1;
    const limit = dto.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {
      tenantId,
      ...(outletId && { outletId }),
      ...(dto.entity && {
        entity: { contains: dto.entity, mode: 'insensitive' },
      }),
      ...(dto.action && {
        action: { contains: dto.action, mode: 'insensitive' },
      }),
      ...(dto.userId && { userId: dto.userId }),
      ...(dto.search && {
        OR: [
          { entity: { contains: dto.search, mode: 'insensitive' } },
          { action: { contains: dto.search, mode: 'insensitive' } },
          { entityId: { contains: dto.search, mode: 'insensitive' } },
        ],
      }),
      deletedAt: null,
    };

    const [auditLogs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: {
          [dto.sortBy || 'createdAt']: dto.sort || 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: auditLogs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single audit log
   */
  async getAuditLog(id: string, tenantId: string) {
    return this.prisma.auditLog.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
    });
  }

  /**
   * Get audit logs by entity
   */
  async getAuditLogsByEntity(
    tenantId: string,
    entity: string,
    entityId: string,
    outletId?: string | null,
  ) {
    return this.prisma.auditLog.findMany({
      where: {
        tenantId,
        ...(outletId && { outletId }),
        entity,
        entityId,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // Event Handlers
  private async handleOrderCreatedEvent(event: DomainEvent) {
    if (event.type !== DOMAIN_EVENTS.ORDER_CREATED) return;

    const payload = event.payload as {
      tenantId: string;
      outletId?: string | null;
      orderId: string;
      paymentId?: string;
      reason?: string;
    };
    await this.createAuditLog(payload.tenantId, {
      outletId: payload.outletId,
      entity: 'Order',
      entityId: payload.orderId,
      action: 'CREATE',
      metadata: {
        eventType: 'ORDER_CREATED',
      },
    });
  }

  private async handleOrderReservedEvent(event: DomainEvent) {
    if (event.type !== DOMAIN_EVENTS.ORDER_RESERVED) return;

    const payload = event.payload as {
      tenantId: string;
      outletId?: string | null;
      orderId: string;
    };
    await this.createAuditLog(payload.tenantId, {
      entity: 'Order',
      entityId: payload.orderId,
      action: 'RESERVE_INVENTORY',
      metadata: {
        eventType: 'ORDER_RESERVED',
      },
    });
  }

  private async handleOrderPaymentSuccessEvent(event: DomainEvent) {
    if (event.type !== DOMAIN_EVENTS.ORDER_PAYMENT_SUCCESS) return;

    const payload = event.payload as {
      tenantId: string;
      outletId?: string | null;
      orderId: string;
      paymentId?: string;
    };

    await this.createAuditLog(payload.tenantId, {
      outletId: payload.outletId,
      entity: 'Order',
      entityId: payload.orderId,
      action: 'PAYMENT_SUCCESS',
      metadata: {
        eventType: 'ORDER_PAYMENT_SUCCESS',
        paymentId: payload.paymentId,
      },
    });
  }

  private async handleOrderPaymentFailedEvent(event: DomainEvent) {
    if (event.type !== DOMAIN_EVENTS.ORDER_PAYMENT_FAILED) return;

    const payload = event.payload as {
      tenantId: string;
      outletId?: string | null;
      orderId: string;
      paymentId?: string;
      reason?: string;
    };
    await this.createAuditLog(payload.tenantId, {
      entity: 'Order',
      entityId: payload.orderId,
      action: 'PAYMENT_FAILED',
      metadata: {
        eventType: 'ORDER_PAYMENT_FAILED',
        paymentId: payload.paymentId,
        reason: payload.reason,
      },
    });
  }

  private async handleOrderFulfillmentStartedEvent(event: DomainEvent) {
    if (event.type !== DOMAIN_EVENTS.ORDER_FULFILLMENT_STARTED) return;

    const payload = event.payload;

    await this.createAuditLog(payload.tenantId, {
      entity: 'Order',
      entityId: payload.orderId,
      action: 'FULFILLMENT_STARTED',
      metadata: {
        eventType: 'ORDER_FULFILLMENT_STARTED',
      },
    });
  }

  private async handleOrderCompletedEvent(event: DomainEvent) {
    if (event.type !== DOMAIN_EVENTS.SALES_ORDER_COMPLETED) return;

    const payload = event.payload;

    await this.createAuditLog(payload.tenantId, {
      entity: 'Order',
      entityId: payload.orderId,
      action: 'COMPLETE',
      metadata: {
        eventType: 'ORDER_COMPLETED',
      },
    });
  }

  private async handlePurchaseOrderCreatedEvent(event: DomainEvent) {
    if (event.type !== DOMAIN_EVENTS.PURCHASE_ORDER_CREATED) return;

    const payload = event.payload;

    await this.createAuditLog(payload.tenantId, {
      entity: 'PurchaseOrder',
      entityId: payload.purchaseOrderId,
      action: 'CREATE',
      metadata: {
        eventType: 'PURCHASE_ORDER_CREATED',
      },
    });
  }

  private async handlePurchaseOrderReceivedEvent(event: DomainEvent) {
    if (event.type !== DOMAIN_EVENTS.PURCHASE_ORDER_RECEIVED) return;

    const payload = event.payload;

    await this.createAuditLog(payload.tenantId, {
      entity: 'PurchaseOrder',
      entityId: payload.purchaseOrderId,
      action: 'RECEIVE',
      metadata: {
        eventType: 'PURCHASE_ORDER_RECEIVED',
      },
    });
  }

  // Business Registry Event Handlers
  private async handleBusinessCreatedEvent(event: DomainEvent) {
    if (event.type !== DOMAIN_EVENTS.BUSINESS_CREATED) return;

    const payload = event.payload as {
      tenantId: string;
      outletId?: string | null;
      businessId?: string;
      name?: string;
    };

    await this.createAuditLog(payload.tenantId, {
      outletId: payload.outletId,
      entity: 'Business',
      entityId: payload.businessId ?? payload.tenantId,
      action: 'CREATE',
      metadata: {
        eventType: 'BUSINESS_CREATED',
        name: payload.name,
      },
    });
  }

  private async handleBusinessUpdatedEvent(event: DomainEvent) {
    if (event.type !== DOMAIN_EVENTS.BUSINESS_UPDATED) return;

    const payload = event.payload as {
      tenantId: string;
      outletId?: string | null;
      businessId?: string;
      name?: string;
    };

    await this.createAuditLog(payload.tenantId, {
      outletId: payload.outletId,
      entity: 'Business',
      entityId: payload.businessId ?? payload.tenantId,
      action: 'UPDATE',
      metadata: {
        eventType: 'BUSINESS_UPDATED',
        name: payload.name,
      },
    });
  }

  private async handleBusinessActivatedEvent(event: DomainEvent) {
    if (event.type !== DOMAIN_EVENTS.BUSINESS_ACTIVATED) return;

    const payload = event.payload as {
      tenantId: string;
      outletId?: string | null;
      businessId?: string;
    };

    await this.createAuditLog(payload.tenantId, {
      outletId: payload.outletId,
      entity: 'Business',
      entityId: payload.businessId ?? payload.tenantId,
      action: 'ACTIVATE',
      metadata: {
        eventType: 'BUSINESS_ACTIVATED',
      },
    });
  }

  private async handleBusinessSuspendedEvent(event: DomainEvent) {
    if (event.type !== DOMAIN_EVENTS.BUSINESS_SUSPENDED) return;

    const payload = event.payload as {
      tenantId: string;
      outletId?: string | null;
      businessId?: string;
      reason?: string;
    };

    await this.createAuditLog(payload.tenantId, {
      outletId: payload.outletId,
      entity: 'Business',
      entityId: payload.businessId ?? payload.tenantId,
      action: 'SUSPEND',
      metadata: {
        eventType: 'BUSINESS_SUSPENDED',
        reason: payload.reason,
      },
    });
  }

  private async handleBusinessArchivedEvent(event: DomainEvent) {
    if (event.type !== DOMAIN_EVENTS.BUSINESS_ARCHIVED) return;

    const payload = event.payload as {
      tenantId: string;
      outletId?: string | null;
      businessId?: string;
    };

    await this.createAuditLog(payload.tenantId, {
      outletId: payload.outletId,
      entity: 'Business',
      entityId: payload.businessId ?? payload.tenantId,
      action: 'ARCHIVE',
      metadata: {
        eventType: 'BUSINESS_ARCHIVED',
      },
    });
  }

  private async handleBusinessRestoredEvent(event: DomainEvent) {
    if (event.type !== DOMAIN_EVENTS.BUSINESS_RESTORED) return;

    const payload = event.payload as {
      tenantId: string;
      outletId?: string | null;
      businessId?: string;
    };

    await this.createAuditLog(payload.tenantId, {
      outletId: payload.outletId,
      entity: 'Business',
      entityId: payload.businessId ?? payload.tenantId,
      action: 'RESTORE',
      metadata: {
        eventType: 'BUSINESS_RESTORED',
      },
    });
  }

  private async handleBusinessTypeChangedEvent(event: DomainEvent) {
    if (event.type !== DOMAIN_EVENTS.BUSINESS_TYPE_CHANGED) return;

    const payload = event.payload as {
      tenantId: string;
      outletId?: string | null;
      businessId?: string;
      previousType?: string;
      businessType?: string;
    };

    await this.createAuditLog(payload.tenantId, {
      outletId: payload.outletId,
      entity: 'Business',
      entityId: payload.businessId ?? payload.tenantId,
      action: 'CHANGE_BUSINESS_TYPE',
      metadata: {
        eventType: 'BUSINESS_TYPE_CHANGED',
        previousType: payload.previousType,
        businessType: payload.businessType,
      },
    });
  }
}
