import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { PERMISSIONS_KEY } from '../../common/decorator/permissions.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';

// eslint-disable-next-line @typescript-eslint/unbound-method
const getBillingAggregate = SuperAdminController.prototype.getBillingAggregate;

function executionContext(user?: unknown): ExecutionContext {
  return {
    getHandler: () => getBillingAggregate,
    getClass: () => SuperAdminController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('SuperAdminController platform billing aggregate authorization', () => {
  const reflector = new Reflector();
  const guard = new PermissionGuard(reflector);

  it('requires JWT authentication and the canonical super-admin read permission', () => {
    const classGuards = Reflect.getMetadata(
      '__guards__',
      SuperAdminController,
    ) as unknown[];

    const methodPermissions = reflector.get<string[]>(
      PERMISSIONS_KEY,

      getBillingAggregate,
    );

    expect(classGuards).toContain(JwtAuthGuard);
    expect(classGuards).toContain(PermissionGuard);
    expect(methodPermissions).toEqual(['super-admin.read']);
  });

  it.each([
    ['tenant user', ['invoice.read', 'billing.read']],
    [
      'tenant administrator',
      ['invoice.read', 'billing.read', 'billing.execute'],
    ],
    ['platform user without read permission', ['super-admin.manage.billing']],
  ])('blocks %s from the platform aggregate', (_identity, permissions) => {
    expect(
      guard.canActivate(executionContext({ userId: 'user-1', permissions })),
    ).toBe(false);
  });

  it('allows an authorized platform reader', () => {
    expect(
      guard.canActivate(
        executionContext({
          userId: 'platform-user',
          tenantId: 'platform-tenant',
          permissions: ['super-admin.read'],
        }),
      ),
    ).toBe(true);
  });

  describe('HTTP authorization', () => {
    let app: INestApplication;
    const aggregate = {
      tenants: { total: 0, byStatus: [] },
      subscriptions: { total: 0, byStatus: [], byPlan: [] },
      invoices: {
        total: 0,
        byStatusAndCurrency: [],
        byProviderStatus: [],
      },
      paymentRequests: { total: 0, byState: [] },
    };
    const service = {
      getBillingAggregate: jest.fn().mockResolvedValue(aggregate),
    };
    const identities: Record<
      string,
      { userId: string; tenantId: string; permissions: string[] }
    > = {
      tenant: {
        userId: 'tenant-user',
        tenantId: 'tenant-a',
        permissions: ['invoice.read', 'billing.read'],
      },
      'tenant-admin': {
        userId: 'tenant-admin',
        tenantId: 'tenant-a',
        permissions: ['invoice.read', 'billing.read', 'billing.execute'],
      },
      'platform-without-read': {
        userId: 'platform-user',
        tenantId: 'platform-tenant',
        permissions: ['super-admin.manage.billing'],
      },
      platform: {
        userId: 'platform-reader',
        tenantId: 'platform-tenant',
        permissions: ['super-admin.read'],
      },
    };
    const testJwtGuard = {
      canActivate(context: ExecutionContext) {
        const httpRequest = context.switchToHttp().getRequest<{
          headers: Record<string, string | undefined>;
          user?: unknown;
        }>();
        const identity = httpRequest.headers['x-test-identity'];
        if (!identity || !identities[identity]) {
          throw new UnauthorizedException();
        }
        httpRequest.user = identities[identity];
        return true;
      },
    };
    const httpServer = () => app.getHttpServer() as unknown as App;

    beforeAll(async () => {
      const testingModule = Test.createTestingModule({
        controllers: [SuperAdminController],
        providers: [
          PermissionGuard,
          { provide: SuperAdminService, useValue: service },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue(testJwtGuard);
      const module = await testingModule.compile();
      app = module.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      if (app) await app.close();
    });

    it.each(['tenant', 'tenant-admin', 'platform-without-read'])(
      'denies the %s identity',
      async (identity) => {
        await request(httpServer())
          .get('/super-admin/billing/aggregate')
          .set('x-test-identity', identity)
          .expect(403);
      },
    );

    it('serves the aggregate to an authorized platform reader', async () => {
      await request(httpServer())
        .get('/super-admin/billing/aggregate')
        .set('x-test-identity', 'platform')
        .expect(200, aggregate);
      expect(service.getBillingAggregate).toHaveBeenCalledTimes(1);
    });

    it('rejects a request without authentication', async () => {
      await request(httpServer())
        .get('/super-admin/billing/aggregate')
        .expect(401);
    });
  });
});
