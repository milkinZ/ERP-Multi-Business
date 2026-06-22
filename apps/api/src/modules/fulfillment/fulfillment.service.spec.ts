import { Test, TestingModule } from '@nestjs/testing';
import { FulfillmentService } from './fulfillment.service';
import { PrismaMockModule } from '../../test/prisma-mock.module';

describe('FulfillmentService', () => {
  let service: FulfillmentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [PrismaMockModule],
      providers: [FulfillmentService],
    }).compile();

    service = module.get<FulfillmentService>(FulfillmentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
