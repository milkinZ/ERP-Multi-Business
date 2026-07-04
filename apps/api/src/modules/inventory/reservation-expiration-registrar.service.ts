import { Injectable, OnModuleInit } from '@nestjs/common';
import { QueueService } from '../../infrastructure/queue/queue.service';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue.constants';

const RESERVATION_EXPIRATION_JOB_ID = 'expire-reservations';
const RESERVATION_EXPIRATION_INTERVAL_MS = 1000 * 60 * 5; // 5 minutes

@Injectable()
export class ReservationExpirationRegistrar implements OnModuleInit {
  constructor(private readonly queueService: QueueService) {}

  async onModuleInit() {
    await this.queueService.add(
      QUEUE_NAMES.INVENTORY_QUEUE,
      { action: 'expire-reservations' },
      {
        jobId: RESERVATION_EXPIRATION_JOB_ID,
        repeat: {
          every: RESERVATION_EXPIRATION_INTERVAL_MS,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }
}
