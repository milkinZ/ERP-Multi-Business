import { createParamDecorator } from '@nestjs/common';
import { requestContext } from './request-context';

export const CurrentRequestContext = createParamDecorator(() =>
  requestContext.get(),
);
