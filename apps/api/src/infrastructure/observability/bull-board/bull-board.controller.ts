function isServerAdapter(obj: unknown): obj is ServerAdapterType {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as Record<string, unknown>).getRouter === 'function'
  );
}
import { Controller, Get, Next, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

import { QueueService } from '../../queue/queue.service';
import { QUEUE_NAMES, type QueueName } from '../../queue/queue.constants';
import { JwtAuthGuard } from '../../../modules/auth/jwt-auth.guard';
import { PermissionGuard } from '../../../modules/rbac/permission.guard';
import { Permissions } from '../../../common/decorator/permissions.decorator';
import { PERMISSIONS } from '../../../modules/rbac/permissions';

type ServerAdapterType = {
  getRouter(): (req: Request, res: Response, next: NextFunction) => void;
};

@Controller('admin/queues')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class BullBoardController {
  private readonly serverAdapter: ServerAdapterType;

  constructor(private readonly queueService: QueueService) {
    let serverAdapter: ServerAdapterType = {
      getRouter: () => (_req: Request, _res: Response) =>
        _res.status(404).send('Bull board unavailable'),
    };
    // Build adapters for existing queues
    const queues: unknown[] = [];

    // Perform dynamic imports asynchronously so constructor stays synchronous
    void (async () => {
      try {
        const expressPath = 'bull-board/express';
        const expressMod = (await import(expressPath).catch(
          () => undefined,
        )) as unknown;
        const expressRec = expressMod as Record<string, unknown> | undefined;
        if (expressRec) {
          const ExpressAdapterCtor =
            expressRec.ExpressAdapter ?? expressRec.default;
          if (typeof ExpressAdapterCtor === 'function') {
            const inst = new (ExpressAdapterCtor as new () => unknown)();
            if (isServerAdapter(inst)) {
              serverAdapter = inst;
            }
          }
        }
      } catch {
        // ignore
      }

      try {
        const adapterPaths = [
          'bull-board/bullMQ',
          'bull-board/bullmq',
          '@bull-board/api',
        ];
        let adapterMod: unknown = undefined;
        for (const p of adapterPaths) {
          adapterMod = (await import(p).catch(() => undefined)) || adapterMod;
        }
        const adapterRec = adapterMod as Record<string, unknown> | undefined;
        if (adapterRec) {
          const maybeCtor =
            adapterRec.BullMQAdapter ??
            adapterRec.BullMqAdapter ??
            adapterRec.default;
          if (typeof maybeCtor === 'function') {
            const names = Object.values(QUEUE_NAMES) as QueueName[];
            for (const qName of names) {
              try {
                const q = this.queueService.getQueue(qName);
                if (q) {
                  const instance = new (maybeCtor as unknown as new (opts: {
                    queue: unknown;
                  }) => unknown)({ queue: q });
                  queues.push(instance);
                }
              } catch {
                // ignore per non-blocking requirement
              }
            }
          }
        }
      } catch {
        // ignore
      }

      try {
        const bbPath = 'bull-board';
        const bb = (await import(bbPath).catch(() => undefined)) as unknown;
        const bbRec = bb as Record<string, unknown> | undefined;
        const createBullBoard = bbRec
          ? (bbRec.createBullBoard ?? bbRec.default)
          : undefined;
        if (typeof createBullBoard === 'function') {
          (
            createBullBoard as unknown as (opts: {
              queues: unknown[];
              serverAdapter: unknown;
            }) => void
          )({ queues, serverAdapter });
        }
      } catch {
        // ignore
      }
      this.serverAdapter = serverAdapter;
    })();
    this.serverAdapter = serverAdapter;
  }

  @Get('ui')
  @Permissions(PERMISSIONS.SUPER_ADMIN_MANAGE_SYSTEM)
  ui(@Req() req: Request, @Res() res: Response, @Next() next: NextFunction) {
    const maybeRouter = this.serverAdapter?.getRouter?.();
    if (typeof maybeRouter === 'function') {
      maybeRouter(req, res, next);
      return;
    }
    res.status(404).send('Bull board unavailable');
  }
}
