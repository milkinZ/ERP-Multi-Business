import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { PrismaMockModule } from '../../test/prisma-mock.module';
import { FulfillmentService } from '../fulfillment/fulfillment.service';
import { OutboxPublisher } from '../../infrastructure/events/outbox.publisher';

describe('PaymentsService', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [PrismaMockModule],
      providers: [
        PaymentsService,
        FulfillmentService,
        {
          provide: OutboxPublisher,
          useValue: { publish: async () => {} },
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
