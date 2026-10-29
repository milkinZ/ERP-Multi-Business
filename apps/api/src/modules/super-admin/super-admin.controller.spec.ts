import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { PERMISSIONS_KEY } from '../../common/decorator/permissions.decorator';
import { PlatformJwtAuthGuard } from '../auth/platform-jwt-auth.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { PlatformSettingsService } from './platform-settings.service';

// eslint-disable-next-line @typescript-eslint/unbound-method
const getBillingAggregate = SuperAdminController.prototype.getBillingAggregate;
// eslint-disable-next-line @typescript-eslint/unbound-method
const listJobExecutions = SuperAdminController.prototype.listJobExecutions;

function executionContext(
  user?: unknown,
  handler: (...args: never[]) => unknown = getBillingAggregate,
): ExecutionContext {
  return {
    getHandler: () => handler,
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

    expect(classGuards).toContain(PlatformJwtAuthGuard);
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
          scope: 'platform',
          userId: 'platform-user',
          platformIdentityId: 'platform-user',
          permissions: ['super-admin.read'],
        }),
      ),
    ).toBe(true);
  });

  describe('HTTP authorization', () => {
    let app: INestApplication;
    const aggregate = {
      tenants: { total: 0, byStatus: [] },
      users: { total: 0 },
      outlets: { total: 0 },
      platformAudit: { total: 0, last24Hours: 0 },
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
      listJobExecutions: jest.fn().mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
      }),
    };
    const platformSettings = {
      list: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    };
    const identities: Record<
      string,
      {
        scope: 'tenant' | 'platform';
        userId: string;
        tenantId?: string;
        platformIdentityId?: string;
        permissions: string[];
      }
    > = {
      tenant: {
        scope: 'tenant',
        userId: 'tenant-user',
        tenantId: 'tenant-a',
        permissions: ['invoice.read', 'billing.read'],
      },
      'tenant-admin': {
        scope: 'tenant',
        userId: 'tenant-admin',
        tenantId: 'tenant-a',
        permissions: ['invoice.read', 'billing.read', 'billing.execute'],
      },
      'platform-without-read': {
        scope: 'platform',
        userId: 'platform-user',
        platformIdentityId: 'platform-user',
        permissions: ['super-admin.manage.billing'],
      },
      platform: {
        scope: 'platform',
        userId: 'platform-reader',
        platformIdentityId: 'platform-reader',
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
        const authenticatedIdentity = identities[identity];
        if (authenticatedIdentity.scope !== 'platform') {
          throw new UnauthorizedException('Platform authentication required');
        }
        httpRequest.user = authenticatedIdentity;
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
          { provide: PlatformSettingsService, useValue: platformSettings },
        ],
      })
        .overrideGuard(PlatformJwtAuthGuard)
        .useValue(testJwtGuard);
      const module = await testingModule.compile();
      app = module.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await app.init();
    });

    afterAll(async () => {
      if (app) await app.close();
    });

    it.each(['tenant', 'tenant-admin'])(
      'rejects the non-platform %s identity',
      async (identity) => {
        await request(httpServer())
          .get('/super-admin/billing/aggregate')
          .set('x-test-identity', identity)
          .expect(401);
      },
    );

    it('forbids a platform identity without the read permission', async () => {
      await request(httpServer())
        .get('/super-admin/billing/aggregate')
        .set('x-test-identity', 'platform-without-read')
        .expect(403);
    });

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

    it.each(['tenant', 'tenant-admin'])(
      'rejects the non-platform %s identity from job history',
      async (identity) => {
        await request(httpServer())
          .get('/super-admin/job-executions')
          .set('x-test-identity', identity)
          .expect(401);
      },
    );

    it('forbids a platform identity without read permission from job history', async () => {
      await request(httpServer())
        .get('/super-admin/job-executions')
        .set('x-test-identity', 'platform-without-read')
        .expect(403);
    });

    it('serves bounded job execution metadata to an authorized platform reader', async () => {
      service.listJobExecutions.mockResolvedValueOnce({
        data: [],
        pagination: { page: 2, limit: 10, total: 0, totalPages: 0 },
      });
      await request(httpServer())
        .get(
          '/super-admin/job-executions?page=2&limit=10&queueName=billing&status=FAILED',
        )
        .set('x-test-identity', 'platform')
        .expect(200, {
          data: [],
          pagination: { page: 2, limit: 10, total: 0, totalPages: 0 },
        });
      expect(service.listJobExecutions).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
        queueName: 'billing',
        status: 'FAILED',
      });
    });

    it('rejects invalid job-history filters before querying execution records', async () => {
      service.listJobExecutions.mockClear();
      await request(httpServer())
        .get('/super-admin/job-executions?limit=101')
        .set('x-test-identity', 'platform')
        .expect(400);
      expect(service.listJobExecutions).not.toHaveBeenCalled();
    });
  });
});

describe('SuperAdminController job execution history authorization metadata', () => {
  const reflector = new Reflector();
  const guard = new PermissionGuard(reflector);

  it('requires the canonical super-admin read permission', () => {
    expect(reflector.get<string[]>(PERMISSIONS_KEY, listJobExecutions)).toEqual(
      ['super-admin.read'],
    );
    expect(
      guard.canActivate(
        executionContext(
          {
            userId: 'tenant-user',
            tenantId: 'tenant-a',
            permissions: ['billing.read'],
          },
          listJobExecutions,
        ),
      ),
    ).toBe(false);
  });
});
