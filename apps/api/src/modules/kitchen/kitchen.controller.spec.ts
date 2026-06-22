import { Test, TestingModule } from '@nestjs/testing';
import { KitchenController } from './kitchen.controller';
import { KitchenService } from './kitchen.service';
import { PrismaMockModule } from '../../test/prisma-mock.module';

describe('KitchenController', () => {
  let controller: KitchenController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [PrismaMockModule],
      controllers: [KitchenController],
      providers: [KitchenService],
    }).compile();

    controller = module.get<KitchenController>(KitchenController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
