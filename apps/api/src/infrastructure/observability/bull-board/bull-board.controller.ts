import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { createBullBoard } from '@bull-board/api';
import { All, Controller, Next, Req, Res, UseGuards } from '@nestjs/common';
import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';

import { QueueService } from '../../queue/queue.service';
import { QUEUE_NAMES } from '../../queue/queue.constants';
import { PlatformJwtAuthGuard } from '../../../modules/auth/platform-jwt-auth.guard';
import { PermissionGuard } from '../../../modules/rbac/permission.guard';
import { Permissions } from '../../../common/decorator/permissions.decorator';
import { PERMISSIONS } from '../../../modules/rbac/permissions';

@Controller('admin/queues')
@UseGuards(PlatformJwtAuthGuard, PermissionGuard)
export class BullBoardController {
  private readonly serverAdapter: ExpressAdapter;
  private readonly router: RequestHandler;

  constructor(queueService: QueueService) {
    this.serverAdapter = new ExpressAdapter().setBasePath('/admin/queues/ui');
    const router = Router();
    const bullBoardRouter = this.serverAdapter.getRouter() as RequestHandler;
    router.use('/admin/queues/ui', bullBoardRouter);
    this.router = router;
    const queues = Object.values(QUEUE_NAMES).map(
      (name) => new BullMQAdapter(queueService.getQueue(name)),
    );

    createBullBoard({
      queues,
      serverAdapter: this.serverAdapter,
    });
  }

  @All(['ui', 'ui/*path'])
  @Permissions(PERMISSIONS.SUPER_ADMIN_MANAGE_SYSTEM)
  ui(@Req() req: Request, @Res() res: Response, @Next() next: NextFunction) {
    this.router(req, res, next);
  }
}
