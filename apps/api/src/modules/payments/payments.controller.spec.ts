import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PrismaMockModule } from '../../test/prisma-mock.module';
import { FulfillmentService } from '../fulfillment/fulfillment.service';

import { OutboxPublisher } from '../../infrastructure/events/outbox.publisher';

describe('PaymentsController', () => {
  let controller: PaymentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [PrismaMockModule],
      controllers: [PaymentsController],
      providers: [
        PaymentsService,
        FulfillmentService,
        {
          provide: OutboxPublisher,
          useValue: { publish: async () => {} },
        },
      ],
    }).compile();

    controller = module.get<PaymentsController>(PaymentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
