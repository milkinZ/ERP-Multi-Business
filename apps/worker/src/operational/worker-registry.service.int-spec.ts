import { WorkerRegistryService } from "./worker-registry.service";

describe("WorkerRegistryService", () => {
  it("registers a worker and keeps it ACTIVE while heartbeat is fresh", async () => {
    const prisma = {
      workerInstance: {
        upsert: jest.fn().mockResolvedValue({
          id: "worker-1",
          workerKey: "queue-worker:host:123",
          name: "queue-worker",
          status: "ACTIVE",
          hostname: "host",
          instancePid: 123,
          lastHeartbeatAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
        update: jest.fn().mockResolvedValue({
          id: "worker-1",
          status: "ACTIVE",
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const service = new WorkerRegistryService(
      prisma as any,
      {
        workerName: "queue-worker",
        repository: undefined,
      } as any,
    );

    const record = await service.registerWorker();

    expect(record.status).toBe("ACTIVE");
    expect(prisma.workerInstance.upsert).toHaveBeenCalled();
    expect(service.deriveStatus(new Date(Date.now() - 5_000))).toBe("ACTIVE");
  });

  it("marks a stale worker when the heartbeat is older than the threshold", () => {
    const service = new WorkerRegistryService(
      {} as any,
      {
        workerName: "queue-worker",
        repository: undefined,
      } as any,
    );

    const staleAt = new Date(Date.now() - 60_000);
    expect(service.deriveStatus(staleAt, 30_000)).toBe("STALE");
  });
});
