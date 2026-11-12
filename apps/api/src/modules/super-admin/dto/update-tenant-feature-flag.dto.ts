import { IsBoolean } from 'class-validator';

export class UpdateTenantFeatureFlagDto {
  @IsBoolean()
  enabled!: boolean;
}
