import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { RecipesController } from './recipes.controller';
import { RecipesService } from './recipes.service';
import { RecipesRepository } from './recipes.repository';
import { FeatureFlagsModule } from '../feature-flags/feature-flag.module';

@Module({
  imports: [PrismaModule, FeatureFlagsModule],
  controllers: [RecipesController],
  providers: [RecipesService, RecipesRepository],
})
export class RecipesModule {}
