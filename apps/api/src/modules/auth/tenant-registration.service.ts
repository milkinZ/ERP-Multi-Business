import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus, TenantStatus } from '@prisma/client';
import * as crypto from 'node:crypto';

import { PrismaService } from '../../core/database/prisma.service';
import { requestContext } from '../../core/request-context/request-context';
import { EmailService } from '../../infrastructure/email/email.service';
import { ensureDefaultTenantRoles } from '../rbac/services/roles.service';
import type { RegisterTenantDto } from './dto/register-tenant.dto';

const OWNER_VERIFICATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const GENERIC_REGISTRATION_MESSAGE =
  'If registration can proceed, a verification link will be sent to that email address.';

@Injectable()
export class TenantRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  async listPlans() {
    const plans = await this.prisma.plan.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        type: true,
        name: true,
        priceCents: true,
        maxOutlets: true,
        maxUsers: true,
        maxMonthlyOrders: true,
        modules: {
          where: { featureModule: { isActive: true } },
          select: {
            featureModule: {
              select: { key: true, name: true, description: true },
            },
          },
          orderBy: { featureModule: { name: 'asc' } },
        },
      },
      orderBy: [{ priceCents: 'asc' }, { name: 'asc' }],
    });

    return plans.map((plan) => ({
      ...plan,
      modules: plan.modules.map(({ featureModule }) => featureModule),
    }));
  }

  async register(input: RegisterTenantDto) {
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    if (!name) {
      throw new BadRequestException('Business name is required');
    }

    const plan = await this.prisma.plan.findFirst({
      where: { id: input.planId, deletedAt: null },
      select: {
        id: true,
        type: true,
        name: true,
        priceCents: true,
      },
    });
    if (!plan) {
      throw new NotFoundException('Selected plan is not available');
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + OWNER_VERIFICATION_LIFETIME_MS);

    const request = requestContext.get();
    const context = {
      requestId: request.requestId,
      correlationId: request.correlationId,
      allowPublicTenantRegistration: true,
    };
    const provisioned = await requestContext.run(context, () =>
      this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${email}, 847362)) IS NULL
        `;
        const [existingUser, activeInvitation] = await Promise.all([
          transaction.user.findFirst({
            where: { email: { equals: email, mode: 'insensitive' } },
            select: { id: true },
          }),
          transaction.userInvitation.findFirst({
            where: {
              email: { equals: email, mode: 'insensitive' },
              acceptedAt: null,
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
            select: { id: true },
          }),
        ]);
        if (existingUser || activeInvitation) return null;

        const tenant = await transaction.tenant.create({
          data: {
            name,
            contactEmail: email,
            businessType: input.businessType,
            currencyCode: input.currencyCode,
            status: TenantStatus.SUSPENDED,
          },
          select: { id: true, name: true },
        });
        const { ownerRoleId } = await ensureDefaultTenantRoles(
          transaction,
          tenant.id,
        );
        const subscription = await transaction.subscription.create({
          data: {
            tenantId: tenant.id,
            planId: plan.id,
            status: SubscriptionStatus.INACTIVE,
            startedAt: new Date(),
          },
          select: { id: true },
        });
        const invitation = await transaction.userInvitation.create({
          data: {
            email,
            isSelfRegistration: true,
            tokenHash,
            expiresAt,
            Tenant: { connect: { id: tenant.id } },
            Roles: {
              create: [
                {
                  Role: { connect: { id: ownerRoleId } },
                  Tenant: { connect: { id: tenant.id } },
                },
              ],
            },
          },
          select: { id: true },
        });

        await transaction.subscriptionHistory.create({
          data: {
            subscriptionId: subscription.id,
            tenantId: tenant.id,
            eventType: 'TENANT_SELF_REGISTRATION',
            actorType: 'SELF_SERVICE',
            metadata: {
              planId: plan.id,
              planType: plan.type,
              verificationInvitationId: invitation.id,
            },
          },
        });
        await transaction.platformAuditLog.create({
          data: {
            actorType: 'SELF_SERVICE',
            action: 'tenant.registration.requested',
            resourceType: 'TENANT',
            resourceId: tenant.id,
            targetTenantId: tenant.id,
            outcome: 'SUCCESS',
            metadata: {
              planId: plan.id,
              businessType: input.businessType,
              currencyCode: input.currencyCode,
            },
          },
        });

        return { tenant, subscription, invitation };
      }),
    );

    if (!provisioned) {
      return { message: GENERIC_REGISTRATION_MESSAGE };
    }

    const setupUrl = new URL(
      '/register',
      this.config.getOrThrow<string>('WEB_BASE_URL'),
    );
    setupUrl.searchParams.set('token', token);
    try {
      await this.email.sendTenantOwnerVerification(email, setupUrl.toString());
    } catch {
      await this.deactivateFailedRegistration(
        provisioned,
        'EMAIL_DELIVERY_FAILED',
      );
      throw new InternalServerErrorException(
        'Registration could not be completed because the verification email could not be delivered. Please try again later.',
      );
    }

    return { message: GENERIC_REGISTRATION_MESSAGE };
  }

  private async deactivateFailedRegistration(
    provisioned: {
      tenant: { id: string };
      subscription: { id: string };
      invitation: { id: string };
    },
    reason: 'EMAIL_DELIVERY_FAILED',
  ) {
    await requestContext.run(
      { ...requestContext.get(), tenantId: provisioned.tenant.id },
      () =>
        this.prisma.$transaction(async (transaction) => {
          await transaction.userInvitation.updateMany({
            where: {
              id: provisioned.invitation.id,
              tenantId: provisioned.tenant.id,
              acceptedAt: null,
              revokedAt: null,
            },
            data: { revokedAt: new Date() },
          });
          await transaction.subscription.updateMany({
            where: {
              id: provisioned.subscription.id,
              tenantId: provisioned.tenant.id,
              deletedAt: null,
            },
            data: { status: SubscriptionStatus.INACTIVE },
          });
          await transaction.tenant.updateMany({
            where: { id: provisioned.tenant.id, deletedAt: null },
            data: { status: TenantStatus.DEACTIVATED, deletedAt: new Date() },
          });
          await transaction.platformAuditLog.create({
            data: {
              actorType: 'SYSTEM',
              action: 'tenant.registration.failed',
              resourceType: 'TENANT',
              resourceId: provisioned.tenant.id,
              targetTenantId: provisioned.tenant.id,
              outcome: 'FAILURE',
              metadata: { reason },
            },
          });
        }),
    );
  }
}
