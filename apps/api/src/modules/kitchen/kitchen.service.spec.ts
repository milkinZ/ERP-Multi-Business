import { Test, TestingModule } from '@nestjs/testing';
import { KitchenService } from './kitchen.service';
import { PrismaMockModule } from '../../test/prisma-mock.module';

describe('KitchenService', () => {
  let service: KitchenService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [PrismaMockModule],
      providers: [KitchenService],
    }).compile();

    service = module.get<KitchenService>(KitchenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
