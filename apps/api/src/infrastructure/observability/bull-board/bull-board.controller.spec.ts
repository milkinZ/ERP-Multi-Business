import { Queue } from 'bullmq';
import express from 'express';
import request from 'supertest';

import { QueueService } from '../../queue/queue.service';
import { type QueueName } from '../../queue/queue.constants';
import { BullBoardController } from './bull-board.controller';

describe('BullBoardController', () => {
  let controller: BullBoardController;

  beforeAll(() => {
    const queueService = {
      getQueue: (name: QueueName) => {
        const queue = Object.create(Queue.prototype) as Queue;
        Object.defineProperty(queue, 'name', { value: name });
        Object.defineProperty(queue, 'opts', { value: {} });
        return queue;
      },
    } as unknown as QueueService;

    controller = new BullBoardController(queueService);
  });

  it('serves the board entry at its guarded Nest route path', async () => {
    const app = express();
    const handler: express.RequestHandler = (req, res, next) =>
      controller.ui(req, res, next);
    app.all('/admin/queues/ui', handler);
    app.all('/admin/queues/ui/*path', handler);

    await request(app)
      .get('/admin/queues/ui')
      .expect(200)
      .expect('Content-Type', /html/);
  });
});
