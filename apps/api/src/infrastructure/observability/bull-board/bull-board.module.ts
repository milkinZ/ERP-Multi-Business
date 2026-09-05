import { Module } from '@nestjs/common';
import { QueueModule } from '../../queue/queue.module';
import { BullBoardController } from './bull-board.controller';

@Module({
  imports: [QueueModule],
  controllers: [BullBoardController],
})
export class BullBoardModule {}
