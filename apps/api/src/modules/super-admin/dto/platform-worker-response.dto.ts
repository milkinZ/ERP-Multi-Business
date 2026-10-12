export type PlatformWorkerResponse = {
  id: string;
  workerKey: string;
  name: string;
  hostname: string | null;
  instancePid: number | null;
  version: string | null;
  status: 'STARTING' | 'ACTIVE' | 'DRAINING' | 'STOPPED' | 'STALE';
  startedAt: Date;
  lastHeartbeatAt: Date;
  stoppedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
