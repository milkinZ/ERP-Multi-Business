export function wrapProcessor<T extends { id?: string; data?: unknown }>(
  name: string,
  fn: (job: T) => Promise<void>,
) {
  return async (job: T) => {
    const tracerApi = (() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('@opentelemetry/api');
      } catch {
        return null;
      }
    })();

    let span: any = null;
    const start = Date.now();
    try {
      if (tracerApi) {
        try {
          const tracer = tracerApi.trace.getTracer('erp-worker');
          span = tracer.startSpan(name, {
            attributes: { 'job.id': String(job.id ?? ''), 'job.name': name },
          });
        } catch {
          span = null;
        }
      }

      await fn(job);

      const dur = (Date.now() - start) / 1000;
      try {
        // Best-effort logging for worker duration; metrics typically handled by central API
        // eslint-disable-next-line no-console
        console.debug(`worker.${name} duration=${dur}s job=${String(job.id ?? '')}`);
      } catch {
        // ignore
      }
    } catch (err) {
      try {
        span?.recordException?.(err);
        span?.setStatus?.({ code: 2 });
        span?.end?.();
      } catch {
        // ignore
      }
      throw err;
    } finally {
      try {
        span?.end?.();
      } catch {
        // ignore
      }
    }
  };
}

export default wrapProcessor;
