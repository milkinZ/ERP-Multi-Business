import { CallHandler, ExecutionContext, StreamableFile } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';

import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
  const interceptor = new ResponseInterceptor();
  const context = {} as ExecutionContext;

  it('preserves streamable file responses for CSV downloads', async () => {
    const file = new StreamableFile(Buffer.from('invoice'));
    const handler = { handle: () => of(file) } as CallHandler<StreamableFile>;

    await expect(
      firstValueFrom(interceptor.intercept(context, handler)),
    ).resolves.toBe(file);
  });

  it('wraps regular responses in the standard API envelope', async () => {
    const data = { id: 'invoice-a' };
    const handler = { handle: () => of(data) } as CallHandler<typeof data>;

    await expect(
      firstValueFrom(interceptor.intercept(context, handler)),
    ).resolves.toEqual({ success: true, message: 'OK', data });
  });
});
