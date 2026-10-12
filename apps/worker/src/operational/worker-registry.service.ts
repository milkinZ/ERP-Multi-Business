import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";

import { PrismaService } from "../shared/prisma.service";

export type WorkerStatus =
  | "STARTING"
  | "ACTIVE"
  | "DRAINING"
  | "STOPPED"
  | "STALE";

export type WorkerInstanceRecord = {
  id: string;
  workerKey: string;
  name: string;
  hostname?: string | null;
  instancePid?: number | null;
  version?: string | null;
  status: WorkerStatus;
  startedAt: Date;
  lastHeartbeatAt: Date;
  stoppedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class WorkerRegistryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerRegistryService.name);

  private readonly workerName: string;
  private readonly workerKey: string;
  private readonly heartbeatMs: number;
  private readonly staleThresholdMs: number;
  private heartbeatTimer?: NodeJS.Timeout;
  private registrationId?: string;

  constructor(
    private readonly prisma: PrismaService,
    options?: {
      workerName?: string;
      heartbeatMs?: number;
      staleThresholdMs?: number;
    },
  ) {
    this.workerName =
      options?.workerName ?? process.env.WORKER_NAME ?? "bullmq-worker";
    const hostname = process.env.HOSTNAME ?? "unknown-host";
    this.workerKey = `${this.workerName}:${hostname}:${process.pid}`;
    this.heartbeatMs =
      options?.heartbeatMs ?? Number(process.env.WORKER_HEARTBEAT_MS ?? 15_000);
    this.staleThresholdMs =
      options?.staleThresholdMs ??
      Number(process.env.WORKER_STALE_THRESHOLD_MS ?? 45_000);
  }

  deriveStatus(
    lastHeartbeatAt: Date | null | undefined,
    staleThresholdMs = this.staleThresholdMs,
  ): WorkerStatus {
    if (!lastHeartbeatAt) {
      return "STARTING";
    }

    const ageMs = Date.now() - lastHeartbeatAt.getTime();
    if (ageMs > staleThresholdMs) {
      return "STALE";
    }
    return "ACTIVE";
  }

  getCurrentWorkerId(): string | null {
    return this.registrationId ?? null;
  }

  async registerWorker(): Promise<WorkerInstanceRecord> {
    const now = new Date();
    const record = await this.prisma.workerInstance.upsert({
      where: { workerKey: this.workerKey },
      create: {
        workerKey: this.workerKey,
        name: this.workerName,
        hostname: process.env.HOSTNAME ?? "unknown-host",
        instancePid: process.pid,
        version: process.env.npm_package_version ?? null,
        status: "ACTIVE",
        startedAt: now,
        lastHeartbeatAt: now,
      },
      update: {
        name: this.workerName,
        hostname: process.env.HOSTNAME ?? "unknown-host",
        instancePid: process.pid,
        version: process.env.npm_package_version ?? null,
        status: "ACTIVE",
        lastHeartbeatAt: now,
        stoppedAt: null,
      },
    });

    this.registrationId = record.id;
    await this.markStaleWorkers();
    return record;
  }

  async heartbeat(): Promise<WorkerInstanceRecord | null> {
    const now = new Date();
    const query = this.registrationId
      ? { id: this.registrationId }
      : { workerKey: this.workerKey };

    const record = await this.prisma.workerInstance.update({
      where: query,
      data: {
        status: "ACTIVE",
        lastHeartbeatAt: now,
        stoppedAt: null,
      },
    });

    await this.markStaleWorkers();
    return record;
  }

  async markStaleWorkers(): Promise<number> {
    const staleBefore = new Date(Date.now() - this.staleThresholdMs);
    const result = await this.prisma.workerInstance.updateMany({
      where: {
        status: { in: ["ACTIVE", "STARTING"] },
        lastHeartbeatAt: { lt: staleBefore },
      },
      data: {
        status: "STALE",
      },
    });

    return result.count;
  }

  async onModuleInit() {
    await this.registerWorker();
    this.heartbeatTimer = setInterval(() => {
      void this.heartbeat().catch((error) => {
        this.logger.warn(
          `Worker heartbeat failed for ${this.workerKey}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, this.heartbeatMs);
  }

  async onModuleDestroy() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    await this.prisma.workerInstance.updateMany({
      where: { workerKey: this.workerKey },
      data: {
        status: "STOPPED",
        stoppedAt: new Date(),
        lastHeartbeatAt: new Date(),
      },
    });
  }

  async listWorkers(): Promise<WorkerInstanceRecord[]> {
    const rows = await this.prisma.workerInstance.findMany({
      orderBy: { lastHeartbeatAt: "desc" },
    });

    return rows.map((row) => ({
      ...row,
      status: this.deriveStatus(row.lastHeartbeatAt, this.staleThresholdMs),
    }));
  }
}
