import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Worker, type Job } from "bullmq";
import { PrismaService } from "../shared/prisma.service";

import { QueueService } from "../queue/queue.service";
import { QUEUE_NAMES, type QueueName } from "../queue/queue.constants";

const QUEUE_NAME: QueueName = QUEUE_NAMES.INVENTORY_QUEUE;

@Injectable()
export class ExpireReservationsProcessor implements OnModuleDestroy {
  private readonly logger = new Logger(ExpireReservationsProcessor.name);
  private readonly worker: Worker;
  constructor(
    private readonly queueService: QueueService,
    private readonly prismaService: PrismaService,
  ) {
    // Worker will fetch the job from the INVENTORY_QUEUE and run the processor
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { wrapProcessor } = require('../observability/worker-instrumentation');
    this.worker = new Worker(QUEUE_NAME, wrapProcessor('expire-reservations', async (job: Job) => {
      this.logger.log(`Expire reservations job started id=${job.id}`);

      const cutoffDate = new Date(Date.now() - 1000 * 60 * 60 * 24);

      // Dynamically import the compiled ReservationRepository from apps/api dist
      const imported =
        (await import("../../../api/dist/src/modules/inventory/reservation.repository.js")) as unknown as {
          ReservationRepository: new (prisma: any) => {
            expireReservations: (d: Date) => Promise<number>;
          };
        };

      const { ReservationRepository } = imported;

      const repo = new ReservationRepository(this.prismaService);

      try {
        const count = await repo.expireReservations(cutoffDate);
        this.logger.log(`Expire reservations job completed: expired=${count}`);
      } catch (err) {
        this.logger.error("Expire reservations job failed", err as any);
        throw err;
      }
    }));
  }

  async onModuleDestroy() {
    await this.worker.close();
  }
}
