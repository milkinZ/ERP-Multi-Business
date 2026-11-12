import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';

import { requestContext } from '../../core/request-context/request-context';
import { PrismaService } from '../../core/database/prisma.service';
import { EmailService } from '../../infrastructure/email/email.service';
import { PlatformAuditLogService } from '../audit-logs/platform-audit-log.service';
import { ensureDefaultTenantRoles } from '../rbac/services/roles.service';
import { BillingService } from '../billing/billing.service';
import type { CreatePlatformTenantDto } from './dto/create-platform-tenant.dto';
import type { SuperAdminActor } from './super-admin.service';

const OWNER_INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class TenantProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAuditLog: PlatformAuditLogService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    private readonly billing: BillingService,
  ) {}

  async createTenant(actor: SuperAdminActor, input: CreatePlatformTenantDto) {
    const ownerEmail = input.ownerEmail.trim().toLowerCase();
    const plan = await this.prisma.plan.findFirst({
      where: { id: input.planId, deletedAt: null },
      select: {
        id: true,
        type: true,
        name: true,
        priceCents: true,
        maxOutlets: true,
        maxUsers: true,
        maxMonthlyOrders: true,
        modules: {
          select: {
            moduleId: true,
            featureModule: {
              select: {
                id: true,
                key: true,
                name: true,
                description: true,
                monthlyPriceCents: true,
                isActive: true,
              },
            },
          },
        },
      },
    });
    if (!plan) {
      throw new NotFoundException('Active plan not found');
    }
    const requestedModuleIds = input.moduleIds ?? [];
    const selectedModules = requestedModuleIds.length
      ? await this.prisma.featureModule.findMany({
          where: {
            id: { in: requestedModuleIds },
            isActive: true,
          },
        })
      : [];
    if (selectedModules.length !== new Set(requestedModuleIds).size) {
      throw new NotFoundException(
        'One or more active feature modules not found',
      );
    }
    const includedModuleIds = new Set(
      plan.modules.map(({ moduleId }) => moduleId),
    );
    const addOnModules = selectedModules.filter(
      (module) => !includedModuleIds.has(module.id),
    );
    const recurringTotal =
      plan.priceCents +
      addOnModules.reduce(
        (total, module) => total + module.monthlyPriceCents,
        0,
      );
    if (recurringTotal <= 0) {
      throw new BadRequestException(
        'Tenant provisioning requires a paid plan or at least one paid add-on module',
      );
    }
    const tenantName = input.name.trim();
    if (!tenantName) {
      throw new BadRequestException('Tenant name is required');
    }
    const setupBaseUrl = this.config.getOrThrow<string>('WEB_BASE_URL');
    new URL(setupBaseUrl);

    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + OWNER_INVITATION_LIFETIME_MS);
    const currencyCode = input.currencyCode ?? 'IDR';
    const businessType = input.businessType ?? 'CAFE';

    const provisioned = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${ownerEmail}, 847362)) IS NULL
      `;
      const emailExists = await transaction.user.findFirst({
        where: { email: { equals: ownerEmail, mode: 'insensitive' } },
        select: { id: true },
      });
      if (emailExists) {
        throw new ConflictException(
          'An account already exists for the initial owner email',
        );
      }
      const activeInvitation = await transaction.userInvitation.findFirst({
        where: {
          email: { equals: ownerEmail, mode: 'insensitive' },
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (activeInvitation) {
        throw new ConflictException(
          'The initial owner email already has an active invitation',
        );
      }

      const tenant = await transaction.tenant.create({
        data: {
          name: tenantName,
          contactEmail: ownerEmail,
          businessType,
          currencyCode,
        },
        select: {
          id: true,
          name: true,
          businessType: true,
          currencyCode: true,
        },
      });
      const { ownerRoleId } = await ensureDefaultTenantRoles(
        transaction,
        tenant.id,
      );
      const subscription = await transaction.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: 'ACTIVE',
          startedAt: new Date(),
        },
        select: { id: true, tenantId: true, planId: true, status: true },
      });
      if (addOnModules.length) {
        await transaction.subscriptionFeatureModule.createMany({
          data: addOnModules.map((module) => ({
            subscriptionId: subscription.id,
            tenantId: tenant.id,
            moduleId: module.id,
            status: 'ACTIVE',
          })),
        });
      }
      const invitation = await transaction.userInvitation.create({
        data: {
          email: ownerEmail,
          tokenHash,
          expiresAt,
          Tenant: { connect: { id: tenant.id } },
          InvitedByPlatform: {
            connect: { id: actor.platformIdentityId },
          },
          Roles: {
            create: [
              {
                Role: { connect: { id: ownerRoleId } },
                Tenant: { connect: { id: tenant.id } },
              },
            ],
          },
        },
        select: { id: true, email: true, expiresAt: true },
      });

      await transaction.subscriptionHistory.create({
        data: {
          subscriptionId: subscription.id,
          tenantId: tenant.id,
          eventType: 'TENANT_PROVISIONED',
          actorPlatformIdentityId: actor.platformIdentityId,
          actorType: 'PLATFORM_IDENTITY',
          metadata: {
            planId: plan.id,
            planType: plan.type,
            moduleIds: addOnModules.map((module) => module.id),
            ownerInvitationId: invitation.id,
          },
        },
      });
      await this.platformAuditLog.create(
        {
          actor,
          action: 'super-admin.tenant.provisioned',
          resourceType: 'TENANT',
          resourceId: tenant.id,
          targetTenantId: tenant.id,
          metadata: {
            subscriptionId: subscription.id,
            planId: plan.id,
            planType: plan.type,
            moduleIds: addOnModules.map((module) => module.id),
            ownerInvitationId: invitation.id,
            businessType: tenant.businessType,
            currencyCode: tenant.currencyCode,
          },
        },
        transaction,
      );

      return { tenant, subscription, invitation };
    });

    const setupUrl = new URL('/register', setupBaseUrl);
    setupUrl.searchParams.set('token', token);
    try {
      await this.email.sendUserInvitation(ownerEmail, setupUrl.toString());
    } catch {
      await this.revokeUndeliveredInvitation(actor, provisioned);
      throw new InternalServerErrorException(
        `Tenant ${provisioned.tenant.id} was created, but the Owner invitation email could not be delivered. The invitation was canceled.`,
      );
    }

    try {
      await requestContext.run(
        {
          tenantId: provisioned.tenant.id,
          platformIdentityId: actor.platformIdentityId,
        },
        () => this.billing.executeBilling(provisioned.subscription.id),
      );
    } catch {
      throw new InternalServerErrorException(
        `Tenant ${provisioned.tenant.id} was created, but its initial invoice could not be generated. Retry billing for subscription ${provisioned.subscription.id}.`,
      );
    }

    const invoice = await this.prisma.invoice.findFirst({
      where: {
        tenantId: provisioned.tenant.id,
        subscriptionId: provisioned.subscription.id,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        invoiceNumber: true,
        amountCents: true,
        currency: true,
        status: true,
        dueAt: true,
      },
    });
    if (!invoice) {
      throw new InternalServerErrorException(
        `Tenant ${provisioned.tenant.id} was provisioned, but the initial invoice was not found.`,
      );
    }

    return {
      tenant: provisioned.tenant,
      subscription: { ...provisioned.subscription, plan },
      invoice,
      ownerInvitation: {
        id: provisioned.invitation.id,
        email: provisioned.invitation.email,
        expiresAt: provisioned.invitation.expiresAt,
        status: 'PENDING' as const,
      },
    };
  }

  private async revokeUndeliveredInvitation(
    actor: SuperAdminActor,
    provisioned: {
      tenant: { id: string };
      invitation: { id: string };
    },
  ) {
    await this.prisma.$transaction(async (transaction) => {
      const revoked = await transaction.userInvitation.updateMany({
        where: {
          id: provisioned.invitation.id,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) {
        throw new InternalServerErrorException(
          'Owner invitation delivery failed and its token could not be revoked',
        );
      }
      await this.platformAuditLog.create(
        {
          actor,
          action: 'super-admin.tenant.owner-invitation.delivery-failed',
          resourceType: 'TENANT',
          resourceId: provisioned.tenant.id,
          targetTenantId: provisioned.tenant.id,
          metadata: { invitationId: provisioned.invitation.id },
          outcome: 'FAILURE',
        },
        transaction,
      );
    });
  }
}
